// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/infofi/InfoFiMarketFactory.sol";
import "../src/infofi/InfoFiPriceOracle.sol";
import "../src/infofi/InfoFiMarket.sol";
import "../src/token/SOFToken.sol";
import "../src/lib/RaffleTypes.sol";

// Mock Raffle for testing
contract MockRaffle {
    mapping(uint256 => RaffleTypes.SeasonConfig) public seasonConfigs;
    mapping(uint256 => mapping(address => MockParticipantPosition)) public positions;
    mapping(uint256 => uint256) public totalTickets;
    
    struct MockParticipantPosition {
        uint256 ticketCount;
        uint256 entryBlock;
        uint256 lastUpdateBlock;
        bool isActive;
    }
    
    function setSeasonConfig(uint256 seasonId, address bondingCurve) external {
        seasonConfigs[seasonId] = RaffleTypes.SeasonConfig({
            name: "Test Season",
            startTime: block.timestamp,
            endTime: block.timestamp + 14 days,
            winnerCount: 1,
            grandPrizeBps: 6500,
            raffleToken: address(0),
            bondingCurve: bondingCurve,
            isActive: true,
            isCompleted: false
        });
    }
    
    function getSeasonDetails(uint256 seasonId) external view returns (
        RaffleTypes.SeasonConfig memory config,
        uint8 status,
        uint256 totalParticipants,
        uint256 totalTicketsCount,
        uint256 totalPrizePool
    ) {
        return (seasonConfigs[seasonId], 1, 0, totalTickets[seasonId], 0);
    }
    
    struct ParticipantPosition {
        uint256 ticketCount;
        uint256 entryBlock;
        uint256 lastUpdateBlock;
        bool isActive;
    }
    
    function getParticipantPosition(uint256 seasonId, address participant) external view returns (
        ParticipantPosition memory
    ) {
        MockParticipantPosition memory pos = positions[seasonId][participant];
        return ParticipantPosition({
            ticketCount: pos.ticketCount,
            entryBlock: pos.entryBlock,
            lastUpdateBlock: pos.lastUpdateBlock,
            isActive: pos.isActive
        });
    }
    
    function setParticipantPosition(uint256 seasonId, address participant, uint256 ticketCount) external {
        positions[seasonId][participant] = MockParticipantPosition({
            ticketCount: ticketCount,
            entryBlock: block.number,
            lastUpdateBlock: block.number,
            isActive: true
        });
    }
}

/**
 * @title InfoFiOracleUpdateTest
 * @notice Tests for InfoFi oracle update fixes
 * @dev Verifies that:
 *      1. Oracle updates only happen for valid marketId (> 0)
 *      2. Failed market creations don't corrupt oracle
 *      3. MarketCreationFailed events are emitted properly
 */
contract InfoFiOracleUpdateTest is Test {
    InfoFiMarketFactory factory;
    InfoFiPriceOracle oracle;
    InfoFiMarket market;
    SOFToken sof;
    MockRaffle raffle;
    
    address admin = address(this);
    address player1 = address(0x1);
    address player2 = address(0x2);
    address mockCurve = address(0x999);
    
    uint256 constant SEASON_ID = 1;
    
    event PriceUpdated(uint256 indexed marketId, uint256 raffleBps, uint256 marketBps, uint256 hybridBps, uint256 timestamp);
    event MarketCreationFailed(uint256 indexed seasonId, address indexed player, bytes32 indexed marketType, string reason);
    event MarketCreated(uint256 indexed seasonId, address indexed player, bytes32 indexed marketType, uint256 marketId, uint256 probabilityBps, address marketAddress);
    
    function setUp() public {
        // Deploy SOF token
        sof = new SOFToken("SOF Token", "SOF", 100_000_000 ether, admin);
        
        // Deploy Mock Raffle
        raffle = new MockRaffle();
        raffle.setSeasonConfig(SEASON_ID, mockCurve);
        
        // Deploy InfoFi contracts
        oracle = new InfoFiPriceOracle(admin, 7000, 3000);
        market = new InfoFiMarket();
        factory = new InfoFiMarketFactory(
            address(raffle),
            address(oracle),
            address(market),
            address(sof),
            admin
        );
        
        // Grant roles
        oracle.grantRole(oracle.PRICE_UPDATER_ROLE(), address(factory));
        market.grantRole(market.OPERATOR_ROLE(), address(factory));
    }
    
    function testOracleUpdateWithValidMarketId() public {
        // Trigger market creation by calling onPositionUpdate (from mockCurve)
        // 1000 tickets out of 10000 = 10% = 1000 bps
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player1, 0, 1000, 10000);
        
        // Verify oracle was updated
        InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(0);
        assertEq(priceData.raffleProbabilityBps, 1000, "Raffle probability should be 1000 bps (10%)");
        assertEq(priceData.marketSentimentBps, 0, "Market sentiment should be 0");
        assertEq(priceData.hybridPriceBps, 700, "Hybrid price should be 700 (70% of 1000)");
        assertTrue(priceData.active, "Oracle entry should be active");
    }
    
    function testOracleNotUpdatedWhenMarketIdZero() public {
        // Revoke OPERATOR_ROLE to force market creation to fail
        market.revokeRole(market.OPERATOR_ROLE(), address(factory));
        
        // Expect MarketCreationFailed event
        vm.expectEmit(true, true, true, false);
        emit MarketCreationFailed(SEASON_ID, player1, factory.WINNER_PREDICTION(), "");
        
        // Should NOT emit PriceUpdated event (no oracle update)
        vm.recordLogs();
        
        // Trigger market creation attempt (from mockCurve)
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player1, 0, 1000, 10000);
        
        // Verify no PriceUpdated events were emitted
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint i = 0; i < logs.length; i++) {
            // PriceUpdated event signature
            bytes32 priceUpdatedSig = keccak256("PriceUpdated(uint256,uint256,uint256,uint256,uint256)");
            assertFalse(logs[i].topics[0] == priceUpdatedSig, "PriceUpdated should not be emitted");
        }
        
        // Verify oracle slot 0 was NOT corrupted
        InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(0);
        assertFalse(priceData.active, "Oracle slot 0 should remain inactive");
    }
    
    function testPositionUpdateAfterSuccessfulCreation() public {
        // First update: create market (10%)
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player1, 0, 1000, 10000);
        
        // Second update: increase position to 20%
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player1, 1000, 2000, 10000);
        
        // Verify oracle was updated with new probability
        InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(0);
        assertEq(priceData.raffleProbabilityBps, 2000, "Raffle probability should be 2000 bps (20%)");
        assertEq(priceData.hybridPriceBps, 1400, "Hybrid price should be 1400 (70% of 2000)");
    }
    
    function testMultiplePlayersGetDifferentMarketIds() public {
        // Player 1 crosses threshold
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player1, 0, 1000, 10000);
        
        // Player 2 crosses threshold
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player2, 0, 1500, 10000);
        
        // Verify both have different market IDs
        uint256 market1 = factory.winnerPredictionMarketIds(SEASON_ID, player1);
        uint256 market2 = factory.winnerPredictionMarketIds(SEASON_ID, player2);
        
        assertTrue(market1 != market2, "Players should have different market IDs");
        
        // Verify both markets are active in oracle
        InfoFiPriceOracle.PriceData memory priceData1 = oracle.getPrice(market1);
        InfoFiPriceOracle.PriceData memory priceData2 = oracle.getPrice(market2);
        
        assertTrue(priceData1.active, "Player 1 oracle entry should be active");
        assertTrue(priceData2.active, "Player 2 oracle entry should be active");
    }
    
    function testAllPlayersOracleUpdatedWhenTotalChanges() public {
        // Player 1 crosses threshold with 1000 tickets out of 10000 (10%)
        raffle.setParticipantPosition(SEASON_ID, player1, 1000);
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player1, 0, 1000, 10000);
        
        uint256 market1 = factory.winnerPredictionMarketIds(SEASON_ID, player1);
        InfoFiPriceOracle.PriceData memory priceData1 = oracle.getPrice(market1);
        assertEq(priceData1.raffleProbabilityBps, 1000, "Player 1 should start at 10%");
        
        // Player 2 crosses threshold with 1500 tickets, total now 11500
        // Player 1's probability should update to 1000/11500 = 869 bps (8.69%)
        raffle.setParticipantPosition(SEASON_ID, player2, 1500);
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player2, 0, 1500, 11500);
        
        // Verify Player 1's oracle was updated even though Player 2 bought
        priceData1 = oracle.getPrice(market1);
        assertEq(priceData1.raffleProbabilityBps, 869, "Player 1 oracle should update when total changes");
        
        // Verify Player 2's oracle is correct
        uint256 market2 = factory.winnerPredictionMarketIds(SEASON_ID, player2);
        InfoFiPriceOracle.PriceData memory priceData2 = oracle.getPrice(market2);
        assertEq(priceData2.raffleProbabilityBps, 1304, "Player 2 should be at 13.04%");
    }
    
    function testMarketCreationFailureEmitsEvent() public {
        // Revoke OPERATOR_ROLE to force failure
        market.revokeRole(market.OPERATOR_ROLE(), address(factory));
        
        // Expect MarketCreationFailed event with reason
        vm.expectEmit(true, true, true, false);
        emit MarketCreationFailed(SEASON_ID, player1, factory.WINNER_PREDICTION(), "");
        
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player1, 0, 1000, 10000);
        
        // Verify market was marked as created (to prevent spam)
        assertTrue(factory.winnerPredictionCreated(SEASON_ID, player1), "Market should be marked as created");
        
        // But marketId should be 0
        uint256 marketId = factory.winnerPredictionMarketIds(SEASON_ID, player1);
        assertEq(marketId, 0, "Market ID should be 0 for failed creation");
    }
    
    function testNoOracleUpdateBelowThreshold() public {
        vm.recordLogs();
        
        // Position below 1% threshold (99 bps)
        vm.prank(mockCurve);
        factory.onPositionUpdate(SEASON_ID, player1, 0, 99, 10000);
        
        // Verify no PriceUpdated events
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint i = 0; i < logs.length; i++) {
            bytes32 priceUpdatedSig = keccak256("PriceUpdated(uint256,uint256,uint256,uint256,uint256)");
            assertFalse(logs[i].topics[0] == priceUpdatedSig, "PriceUpdated should not be emitted below threshold");
        }
        
        // Verify market was not created
        assertFalse(factory.winnerPredictionCreated(SEASON_ID, player1), "Market should not be created below threshold");
    }
}
