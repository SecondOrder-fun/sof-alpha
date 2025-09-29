// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/Raffle.sol";
import "../src/core/SeasonFactory.sol";
import "../src/curve/SOFBondingCurve.sol";
import "../src/infofi/InfoFiMarketFactory.sol";
import "../src/infofi/InfoFiPriceOracle.sol";
import "../src/token/SOFToken.sol";
import "../src/core/RafflePositionTracker.sol";

// Mock InfoFi market for testing
contract InfoFiMarketMock {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    function createMarket(uint256 raffleId, address player, string calldata question, address tokenAddress) external {
        // Mock implementation that does nothing
    }
}

contract InfoFiThresholdTest is Test {
    // Core contracts
    Raffle public raffle;
    SeasonFactory public seasonFactory;
    SOFToken public sofToken;
    RafflePositionTracker public tracker;

    // InfoFi contracts
    InfoFiMarketFactory public marketFactory;
    InfoFiPriceOracle public oracle;

    // Test accounts
    address public admin = address(1);
    address public player1 = address(2);
    address public player2 = address(3);
    address public player3 = address(4);

    // Threshold constants
    uint256 public constant THRESHOLD_BPS = 100; // 1% threshold in basis points

    // Season parameters
    uint256 public seasonId;
    SOFBondingCurve public curve;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy core contracts
        sofToken = new SOFToken("SecondOrder Token", "SOF", 100000000 ether, admin);

        // Deploy VRF mock coordinator
        address vrfCoordinator = address(0x1); // Mock address
        uint64 vrfSubscriptionId = 1;
        bytes32 vrfKeyHash = bytes32(uint256(1));

        // Deploy Raffle with VRF
        raffle = new Raffle(address(sofToken), vrfCoordinator, vrfSubscriptionId, vrfKeyHash);

        // Deploy tracker
        tracker = new RafflePositionTracker(address(raffle), admin);

        // Deploy season factory
        seasonFactory = new SeasonFactory(address(raffle), address(tracker));

        // Wire raffle to factory
        raffle.setSeasonFactory(address(seasonFactory));

        // Deploy InfoFi market contract (simplified mock for testing)
        InfoFiMarketMock infoFiMarket = new InfoFiMarketMock();

        // Deploy InfoFi contracts
        oracle = new InfoFiPriceOracle(admin, 7000, 3000); // 70/30 weighting
        marketFactory = new InfoFiMarketFactory(
            address(raffle), // raffle read interface
            address(oracle), // price oracle
            address(infoFiMarket), // market contract
            address(sofToken), // bet token
            admin // admin
        );

        // Setup roles
        tracker.grantRole(tracker.MARKET_ROLE(), address(raffle));
        oracle.grantRole(oracle.PRICE_UPDATER_ROLE(), address(marketFactory));
        raffle.setInfoFiFactory(address(marketFactory));

        // No need to configure market factory in this test
        // The threshold is hardcoded in the contract at 100 basis points (1%)

        // Create a season
        RaffleTypes.SeasonConfig memory config = RaffleTypes.SeasonConfig({
            name: "Test Season",
            startTime: block.timestamp + 60,
            endTime: block.timestamp + 3600,
            winnerCount: 1,
            grandPrizeBps: 6500, // 65% grand prize
            raffleToken: address(0), // Will be set by factory
            bondingCurve: address(0), // Will be set by factory
            isActive: false,
            isCompleted: false
        });

        // Create bond steps for a 100-step linear curve
        RaffleTypes.BondStep[] memory bondSteps = new RaffleTypes.BondStep[](100);
        for (uint256 i = 0; i < 100; i++) {
            bondSteps[i] = RaffleTypes.BondStep({
                rangeTo: uint128((i + 1) * 1000), // 1000 tokens per step
                price: uint128(10 ether + i * 1 ether) // Start at 10 SOF, increase by 1 SOF per step
            });
        }

        // Buy/sell fees in basis points (0.1% buy, 0.7% sell)
        uint16 buyFeeBps = 10; // 0.1%
        uint16 sellFeeBps = 70; // 0.7%

        seasonId = raffle.createSeason(config, bondSteps, buyFeeBps, sellFeeBps);

        // Start the season
        vm.warp(block.timestamp + 61);
        raffle.startSeason(seasonId);

        // Get the curve address from the season config
        (RaffleTypes.SeasonConfig memory seasonConfig, , , , ) = raffle.getSeasonDetails(seasonId);
        curve = SOFBondingCurve(seasonConfig.bondingCurve);

        // Transfer SOF tokens to players (can't mint directly)
        sofToken.transfer(player1, 10000 ether);
        sofToken.transfer(player2, 10000 ether);
        sofToken.transfer(player3, 10000 ether);

        vm.stopPrank();
    }

    function testThresholdCrossing() public {
        // Setup: Player1 approves SOF for curve
        vm.startPrank(player1);
        sofToken.approve(address(curve), type(uint256).max);
        vm.stopPrank();

        // Initial state: No markets should exist
        assertEq(marketFactory.getMarketCount(seasonId), 0);

        // Buy enough tickets to cross the 1% threshold
        // For a 100-step curve with 1000 tokens per step, 1% is 1,000 tokens
        // But since we're the first buyer, even 50 tickets is already 100% of supply
        vm.startPrank(player1);

        // Buy 50 tickets (already above threshold since we're the first buyer)
        curve.buyTokens(50, 1000 ether);

        // Verify market was created (since we're the first buyer, we're already above threshold)
        assertEq(marketFactory.getMarketCount(seasonId), 1);

        // Buy 50 more tickets (already crossed threshold)
        curve.buyTokens(50, 1000 ether);

        // Verify market count still 1 (no duplicates)
        assertEq(marketFactory.getMarketCount(seasonId), 1);

        // Verify market details
        (address player, bytes32 marketTypeCode, address marketAddr) = marketFactory.getMarketInfo(seasonId, 0);
        assertEq(player, player1);
        assertEq(marketTypeCode, keccak256("WINNER_PREDICTION"));
        assertTrue(marketAddr != address(0));

        vm.stopPrank();
    }

    function testDuplicateMarketPrevention() public {
        // Setup: Player1 approves SOF for curve
        vm.startPrank(player1);
        sofToken.approve(address(curve), type(uint256).max);
        vm.stopPrank();

        // Buy enough tickets to cross the 1% threshold
        vm.startPrank(player1);
        curve.buyTokens(100, 2000 ether);
        vm.stopPrank();

        // Verify market was created
        assertEq(marketFactory.getMarketCount(seasonId), 1);

        // Try to create the same market again (should fail or be idempotent)
        vm.startPrank(admin);
        bytes32 winnerPredictionType = keccak256("WINNER_PREDICTION");

        // Check if market already exists
        bool marketExists = marketFactory.hasMarket(seasonId, player1, winnerPredictionType);
        assertTrue(marketExists);

        // Try to create it again - should not increase count
        marketFactory.createMarket(seasonId, player1, winnerPredictionType);

        // Verify still only one market exists
        assertEq(marketFactory.getMarketCount(seasonId), 1);

        vm.stopPrank();
    }

    function testOracleUpdatesOnPositionChange() public {
        // Setup: Player1 approves SOF for curve
        vm.startPrank(player1);
        sofToken.approve(address(curve), type(uint256).max);
        vm.stopPrank();

        // Buy enough tickets to cross the 1% threshold
        vm.startPrank(player1);
        curve.buyTokens(100, 2000 ether);
        vm.stopPrank();

        // Verify market was created
        assertEq(marketFactory.getMarketCount(seasonId), 1);
        // We only need the marketTypeCode for the getMarketId call
        (, bytes32 marketTypeCode,) = marketFactory.getMarketInfo(seasonId, 0);

        // Get the market ID
        bytes32 marketId = marketFactory.getMarketId(seasonId, player1, marketTypeCode);

        // Check initial oracle price
        InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(marketId);
        uint256 raffleProbability = priceData.raffleProbabilityBps;
        // These variables are used in assertions below
        uint256 lastUpdate = priceData.lastUpdate;
        bool active = priceData.active;

        // Initial probability should be around 100% since we're the first buyer
        assertApproxEqRel(raffleProbability, 10000, 5); // Within 5% of 10000 basis points (100%)
        assertTrue(active);

        // Buy more tickets to update position
        vm.startPrank(player1);
        curve.buyTokens(100, 2000 ether);
        vm.stopPrank();

        // Check updated oracle price
        InfoFiPriceOracle.PriceData memory newPriceData = oracle.getPrice(marketId);
        uint256 newRaffleProbability = newPriceData.raffleProbabilityBps;
        uint256 newLastUpdate = newPriceData.lastUpdate;
        bool stillActive = newPriceData.active;

        // New probability should still be high since we're still the dominant buyer
        assertApproxEqRel(newRaffleProbability, 10000, 5); // Within 5% of 10000 basis points
        assertTrue(stillActive);
        // The lastUpdate might be the same in the test environment
        assertTrue(newLastUpdate >= lastUpdate);
    }

    function testMultiplePlayerThresholds() public {
        // Setup: Both players approve SOF for curve
        vm.startPrank(player1);
        sofToken.approve(address(curve), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(player2);
        sofToken.approve(address(curve), type(uint256).max);
        vm.stopPrank();

        // Player1 buys enough tickets to cross threshold
        vm.startPrank(player1);
        curve.buyTokens(100, 2000 ether);
        vm.stopPrank();

        // Verify Player1's market was created
        assertEq(marketFactory.getMarketCount(seasonId), 1);

        // Player2 buys enough tickets to cross threshold
        vm.startPrank(player2);
        curve.buyTokens(100, 2000 ether);
        vm.stopPrank();

        // Verify Player2's market was also created
        assertEq(marketFactory.getMarketCount(seasonId), 2);

        // Verify both markets have correct player associations
        (address player1Market,,) = marketFactory.getMarketInfo(seasonId, 0);
        (address player2Market,,) = marketFactory.getMarketInfo(seasonId, 1);

        assertTrue(player1Market == player1 || player2Market == player1);
        assertTrue(player1Market == player2 || player2Market == player2);
        assertFalse(player1Market == player2Market);
    }
}
