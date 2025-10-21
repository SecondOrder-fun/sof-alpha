// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/infofi/InfoFiMarketFactory.sol";
import "../../src/infofi/SeasonCSMM.sol";
import "../../src/token/SOFToken.sol";

contract InfoFiCSMMIntegrationTest is Test {
    InfoFiMarketFactory public factory;
    SeasonCSMM public csmm;
    SOFToken public sof;
    
    address public admin = address(1);
    address public raffle = address(2);
    address public oracle = address(3);
    address public infoFiMarket = address(4);
    address public user1 = address(5);
    address public user2 = address(6);
    address public player1 = address(100);
    address public player2 = address(200);
    address public player3 = address(300);
    
    uint256 public constant SEASON_ID = 1;
    
    function setUp() public {
        // Deploy SOF token
        vm.prank(admin);
        sof = new SOFToken("SecondOrder", "SOF", 10000000e18, admin);
        
        // Deploy factory
        vm.prank(admin);
        factory = new InfoFiMarketFactory(
            raffle,
            oracle,
            infoFiMarket,
            address(sof),
            admin
        );
        
        // Grant test contract ADMIN_ROLE and fund contracts
        vm.startPrank(admin);
        factory.grantRole(factory.ADMIN_ROLE(), address(this));
        sof.transfer(address(factory), 1000e18);
        sof.transfer(user1, 1000e18);
        sof.transfer(user2, 1000e18);
        vm.stopPrank();
    }
    
    function testCreateSeasonCSMM() public {
        // Test contract creates first market, which should create SeasonCSMM
        factory.createMarket(SEASON_ID, player1, factory.WINNER_PREDICTION());
        
        // Check SeasonCSMM was created
        address csmmAddr = factory.getSeasonCSMM(SEASON_ID);
        assertTrue(csmmAddr != address(0), "CSMM should be created");
        
        csmm = SeasonCSMM(csmmAddr);
        assertEq(csmm.seasonId(), SEASON_ID, "Season ID should match");
        assertEq(csmm.totalLiquidity(), 10e18, "Should have 10 SOF liquidity");
    }
    
    function testMultiplePlayersCreateMarkets() public {
        // Create markets for 3 players
        factory.createMarket(SEASON_ID, player1, factory.WINNER_PREDICTION());
        factory.createMarket(SEASON_ID, player2, factory.WINNER_PREDICTION());
        factory.createMarket(SEASON_ID, player3, factory.WINNER_PREDICTION());
        
        // Check all markets created
        assertTrue(factory.hasWinnerMarket(SEASON_ID, player1), "Player 1 market exists");
        assertTrue(factory.hasWinnerMarket(SEASON_ID, player2), "Player 2 market exists");
        assertTrue(factory.hasWinnerMarket(SEASON_ID, player3), "Player 3 market exists");
        
        // Check CSMM has correct liquidity
        address csmmAddr = factory.getSeasonCSMM(SEASON_ID);
        csmm = SeasonCSMM(csmmAddr);
        assertEq(csmm.totalLiquidity(), 30e18, "Should have 30 SOF total");
        assertEq(csmm.getActiveMarketCount(), 3, "Should have 3 markets");
    }
    
    function testUsersBuyShares() public {
        // Create markets
        factory.createMarket(SEASON_ID, player1, factory.WINNER_PREDICTION());
        factory.createMarket(SEASON_ID, player2, factory.WINNER_PREDICTION());
        
        address csmmAddr = factory.getSeasonCSMM(SEASON_ID);
        csmm = SeasonCSMM(csmmAddr);
        
        uint256 playerId1 = uint256(uint160(player1));
        uint256 playerId2 = uint256(uint160(player2));
        
        // User1 buys YES on player1
        vm.startPrank(user1);
        sof.approve(address(csmm), 2e18);
        csmm.buyShares(playerId1, true, 2e18, 2e18);
        
        
        // User2 buys NO on player1
        vm.startPrank(user2);
        sof.approve(address(csmm), 1e18);
        csmm.buyShares(playerId1, false, 1e18, 1e18);
        
        
        // Check positions
        (uint256 user1Yes, uint256 user1No) = csmm.getUserPosition(user1, playerId1);
        assertEq(user1Yes, 2e18, "User1 should have 2 YES");
        assertEq(user1No, 0, "User1 should have 0 NO");
        
        (uint256 user2Yes, uint256 user2No) = csmm.getUserPosition(user2, playerId1);
        assertEq(user2Yes, 0, "User2 should have 0 YES");
        assertEq(user2No, 1e18, "User2 should have 1 NO");
    }
    
    function testResolveSeasonMarkets() public {
        // Create markets
        
        factory.createMarket(SEASON_ID, player1, factory.WINNER_PREDICTION());
        factory.createMarket(SEASON_ID, player2, factory.WINNER_PREDICTION());
        factory.createMarket(SEASON_ID, player3, factory.WINNER_PREDICTION());
        
        
        address csmmAddr = factory.getSeasonCSMM(SEASON_ID);
        csmm = SeasonCSMM(csmmAddr);
        
        uint256 playerId1 = uint256(uint160(player1));
        uint256 playerId2 = uint256(uint160(player2));
        
        // Users buy shares
        vm.startPrank(user1);
        sof.approve(address(csmm), 10e18);
        csmm.buyShares(playerId1, true, 2e18, 2e18); // Bet on player1 winning
        vm.stopPrank();
        
        vm.startPrank(user2);
        sof.approve(address(csmm), 10e18);
        csmm.buyShares(playerId2, true, 1e18, 1e18); // Bet on player2 winning
        vm.stopPrank();
        
        // Raffle resolves with player1 as winner
        vm.prank(raffle);
        factory.resolveSeasonMarkets(SEASON_ID, player1);
        
        // Check markets resolved
        (, , bool isActive1, bool isResolved1, bool outcome1) = csmm.getMarketState(playerId1);
        assertFalse(isActive1, "Player1 market should be inactive");
        assertTrue(isResolved1, "Player1 market should be resolved");
        assertTrue(outcome1, "Player1 should have won");
        
        (, , bool isActive2, bool isResolved2, bool outcome2) = csmm.getMarketState(playerId2);
        assertFalse(isActive2, "Player2 market should be inactive");
        assertTrue(isResolved2, "Player2 market should be resolved");
        assertFalse(outcome2, "Player2 should have lost");
    }
    
    function testClaimPayoutsAfterResolution() public {
        // Create markets
        
        factory.createMarket(SEASON_ID, player1, factory.WINNER_PREDICTION());
        factory.createMarket(SEASON_ID, player2, factory.WINNER_PREDICTION());
        
        
        address csmmAddr = factory.getSeasonCSMM(SEASON_ID);
        csmm = SeasonCSMM(csmmAddr);
        
        uint256 playerId1 = uint256(uint160(player1));
        
        // User1 buys YES on player1
        vm.startPrank(user1);
        sof.approve(address(csmm), 3e18);
        csmm.buyShares(playerId1, true, 3e18, 3e18);
        vm.stopPrank();
        
        // Raffle resolves with player1 as winner
        vm.prank(raffle);
        factory.resolveSeasonMarkets(SEASON_ID, player1);
        
        // User1 claims payout
        uint256 balanceBefore = sof.balanceOf(user1);
        
        vm.prank(user1);
        csmm.claimPayout(playerId1);
        
        uint256 balanceAfter = sof.balanceOf(user1);
        
        // Check payout (3 SOF - 2% fee = 2.94 SOF)
        uint256 expectedPayout = 3e18 - (3e18 * 200 / 10000);
        assertEq(balanceAfter - balanceBefore, expectedPayout, "User1 should receive net payout");
    }
    
    function testScalingTo50Players() public {
        // Create markets for 50 players
        
        for (uint256 i = 0; i < 50; i++) {
            address player = address(uint160(1000 + i));
            factory.createMarket(SEASON_ID, player, factory.WINNER_PREDICTION());
        }
        
        
        // Check CSMM has correct liquidity (50 * 10 = 500 SOF)
        address csmmAddr = factory.getSeasonCSMM(SEASON_ID);
        csmm = SeasonCSMM(csmmAddr);
        assertEq(csmm.totalLiquidity(), 500e18, "Should have 500 SOF for 50 players");
        assertEq(csmm.getActiveMarketCount(), 50, "Should have 50 markets");
        
        // Check season players count
        address[] memory players = factory.getSeasonPlayers(SEASON_ID);
        assertEq(players.length, 50, "Should have 50 players");
    }
    
    function testLiquidityConfiguration() public {
        // Check default liquidity
        assertEq(factory.liquidityPerSeason(), 500e18, "Default should be 500 SOF");
        
        // Admin updates liquidity for future seasons
        vm.prank(admin);
        factory.setLiquidityPerSeason(1000e18);
        
        assertEq(factory.liquidityPerSeason(), 1000e18, "Should be updated to 1000 SOF");
    }
    
    function testOnlyRaffleCanResolve() public {
        // Create market (test contract has ADMIN_ROLE)
        factory.createMarket(SEASON_ID, player1, factory.WINNER_PREDICTION());
        
        // Non-raffle tries to resolve
        vm.prank(user1);
        vm.expectRevert("Factory: only raffle");
        factory.resolveSeasonMarkets(SEASON_ID, player1);
        
        // Raffle can resolve
        vm.prank(raffle);
        factory.resolveSeasonMarkets(SEASON_ID, player1);
    }
    
    function testCrossMarketPricing() public {
        // Create 2 markets
        
        factory.createMarket(SEASON_ID, player1, factory.WINNER_PREDICTION());
        factory.createMarket(SEASON_ID, player2, factory.WINNER_PREDICTION());
        
        
        address csmmAddr = factory.getSeasonCSMM(SEASON_ID);
        csmm = SeasonCSMM(csmmAddr);
        
        uint256 playerId1 = uint256(uint160(player1));
        uint256 playerId2 = uint256(uint160(player2));
        
        // Check initial prices (both 50%)
        uint256 price1Before = csmm.getPrice(playerId1, true);
        uint256 price2Before = csmm.getPrice(playerId2, true);
        assertEq(price1Before, 5000, "Player1 initial price should be 50%");
        assertEq(price2Before, 5000, "Player2 initial price should be 50%");
        
        // User1 buys YES on player1
        vm.startPrank(user1);
        sof.approve(address(csmm), 2e18);
        csmm.buyShares(playerId1, true, 2e18, 2e18);
        vm.stopPrank();
        
        // Check prices changed
        uint256 price1After = csmm.getPrice(playerId1, true);
        assertTrue(price1After > price1Before, "Player1 price should increase");
        
        // Player2 price unaffected (independent markets in CSMM)
        uint256 price2After = csmm.getPrice(playerId2, true);
        assertEq(price2After, price2Before, "Player2 price should be unchanged");
    }
}
