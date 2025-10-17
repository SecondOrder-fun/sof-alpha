// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/infofi/SeasonCSMM.sol";
import "../src/token/SOFToken.sol";

contract SeasonCSMMTest is Test {
    SeasonCSMM public csmm;
    SOFToken public sof;
    
    address public admin = address(1);
    address public factory = address(2);
    address public treasury = address(3);
    address public user1 = address(4);
    address public user2 = address(5);
    
    uint256 public constant SEASON_ID = 1;
    uint256 public constant PLAYER_1 = 100;
    uint256 public constant PLAYER_2 = 200;
    
    event MarketCreated(uint256 indexed playerId, uint256 yesReserve, uint256 noReserve);
    event SharesPurchased(address indexed user, uint256 indexed playerId, bool isYes, uint256 amount, uint256 cost);
    event SharesSold(address indexed user, uint256 indexed playerId, bool isYes, uint256 amount, uint256 revenue);
    event MarketResolved(uint256 indexed playerId, bool outcome);
    event PayoutClaimed(address indexed user, uint256 indexed playerId, uint256 grossPayout, uint256 fee, uint256 netPayout);
    
    function setUp() public {
        // Deploy SOF token with initial supply (admin deploys, so admin gets initial supply)
        vm.prank(admin);
        sof = new SOFToken("SecondOrder", "SOF", 1000000e18, treasury);
        
        // Deploy CSMM (factory deploys, so factory is initial admin)
        vm.prank(factory);
        csmm = new SeasonCSMM(SEASON_ID, address(sof), treasury, factory);
        
        // Transfer SOF to users and contract
        vm.startPrank(admin);
        sof.transfer(user1, 10000e18);
        sof.transfer(user2, 10000e18);
        sof.transfer(address(csmm), 1000e18); // Fund CSMM for liquidity
        vm.stopPrank();
    }
    
    function testCreatePlayerMarket() public {
        vm.prank(factory);
        vm.expectEmit(true, false, false, true);
        emit MarketCreated(PLAYER_1, 5e18, 5e18);
        csmm.createPlayerMarket(PLAYER_1);
        
        (uint256 yesReserve, uint256 noReserve, bool isActive, bool isResolved, ) = csmm.getMarketState(PLAYER_1);
        
        assertEq(yesReserve, 5e18, "YES reserve should be 5 SOF");
        assertEq(noReserve, 5e18, "NO reserve should be 5 SOF");
        assertTrue(isActive, "Market should be active");
        assertFalse(isResolved, "Market should not be resolved");
        assertEq(csmm.totalLiquidity(), 10e18, "Total liquidity should be 10 SOF");
    }
    
    function testInitialPrice() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        uint256 yesPrice = csmm.getPrice(PLAYER_1, true);
        uint256 noPrice = csmm.getPrice(PLAYER_1, false);
        
        assertEq(yesPrice, 5000, "Initial YES price should be 50%");
        assertEq(noPrice, 5000, "Initial NO price should be 50%");
        assertEq(yesPrice + noPrice, 10000, "Prices should sum to 100%");
    }
    
    function testBuyYesShares() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // User1 buys 1 SOF worth of YES shares
        uint256 amount = 1e18;
        uint256 cost = csmm.calcBuyCost(PLAYER_1, true, amount);
        
        assertEq(cost, amount, "Cost should equal amount in CSMM");
        
        vm.startPrank(user1);
        sof.approve(address(csmm), cost);
        
        vm.expectEmit(true, true, false, true);
        emit SharesPurchased(user1, PLAYER_1, true, amount, cost);
        csmm.buyShares(PLAYER_1, true, amount, cost);
        vm.stopPrank();
        
        // Check reserves updated correctly
        (uint256 yesReserve, uint256 noReserve, , , ) = csmm.getMarketState(PLAYER_1);
        assertEq(yesReserve, 4e18, "YES reserve should decrease by 1");
        assertEq(noReserve, 6e18, "NO reserve should increase by 1");
        assertEq(yesReserve + noReserve, 10e18, "Invariant should hold");
        
        // Check user position
        (uint256 userYes, uint256 userNo) = csmm.getUserPosition(user1, PLAYER_1);
        assertEq(userYes, amount, "User should have 1 YES share");
        assertEq(userNo, 0, "User should have 0 NO shares");
        
        // Check price changed
        uint256 newYesPrice = csmm.getPrice(PLAYER_1, true);
        assertEq(newYesPrice, 6000, "YES price should be 60% after buy");
    }
    
    function testBuyNoShares() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        uint256 amount = 2e18;
        uint256 cost = csmm.calcBuyCost(PLAYER_1, false, amount);
        
        vm.startPrank(user1);
        sof.approve(address(csmm), cost);
        csmm.buyShares(PLAYER_1, false, amount, cost);
        vm.stopPrank();
        
        (uint256 yesReserve, uint256 noReserve, , , ) = csmm.getMarketState(PLAYER_1);
        assertEq(yesReserve, 7e18, "YES reserve should increase by 2");
        assertEq(noReserve, 3e18, "NO reserve should decrease by 2");
        
        uint256 noPrice = csmm.getPrice(PLAYER_1, false);
        assertEq(noPrice, 7000, "NO price should be 70%");
    }
    
    function testSellShares() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // User1 buys 2 YES shares
        uint256 buyAmount = 2e18;
        vm.startPrank(user1);
        sof.approve(address(csmm), buyAmount);
        csmm.buyShares(PLAYER_1, true, buyAmount, buyAmount);
        
        // User1 sells 1 YES share
        uint256 sellAmount = 1e18;
        uint256 expectedRevenue = csmm.calcSellRevenue(PLAYER_1, true, sellAmount);
        
        assertEq(expectedRevenue, sellAmount, "Revenue should equal amount in CSMM");
        
        uint256 balanceBefore = sof.balanceOf(user1);
        vm.expectEmit(true, true, false, true);
        emit SharesSold(user1, PLAYER_1, true, sellAmount, expectedRevenue);
        csmm.sellShares(PLAYER_1, true, sellAmount, expectedRevenue);
        vm.stopPrank();
        
        uint256 balanceAfter = sof.balanceOf(user1);
        assertEq(balanceAfter - balanceBefore, expectedRevenue, "User should receive revenue");
        
        (uint256 userYes, ) = csmm.getUserPosition(user1, PLAYER_1);
        assertEq(userYes, 1e18, "User should have 1 YES share left");
    }
    
    function testSlippageProtectionBuy() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        uint256 amount = 1e18;
        uint256 cost = csmm.calcBuyCost(PLAYER_1, true, amount);
        uint256 maxCost = cost - 1; // Set max cost too low
        
        vm.startPrank(user1);
        sof.approve(address(csmm), cost);
        
        vm.expectRevert(SeasonCSMM.SlippageExceeded.selector);
        csmm.buyShares(PLAYER_1, true, amount, maxCost);
        vm.stopPrank();
    }
    
    function testSlippageProtectionSell() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // Buy first
        uint256 amount = 1e18;
        vm.startPrank(user1);
        sof.approve(address(csmm), amount);
        csmm.buyShares(PLAYER_1, true, amount, amount);
        
        // Try to sell with too high min revenue
        uint256 revenue = csmm.calcSellRevenue(PLAYER_1, true, amount);
        uint256 minRevenue = revenue + 1;
        
        vm.expectRevert(SeasonCSMM.SlippageExceeded.selector);
        csmm.sellShares(PLAYER_1, true, amount, minRevenue);
        vm.stopPrank();
    }
    
    function testInvariantMaintained() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // Multiple buys and sells
        vm.startPrank(user1);
        sof.approve(address(csmm), 10e18);
        
        csmm.buyShares(PLAYER_1, true, 1e18, 1e18);
        (uint256 yes1, uint256 no1, , , ) = csmm.getMarketState(PLAYER_1);
        assertEq(yes1 + no1, 10e18, "Invariant after buy 1");
        
        csmm.buyShares(PLAYER_1, false, 2e18, 2e18);
        (uint256 yes2, uint256 no2, , , ) = csmm.getMarketState(PLAYER_1);
        assertEq(yes2 + no2, 10e18, "Invariant after buy 2");
        
        csmm.sellShares(PLAYER_1, true, 0.5e18, 0.5e18);
        (uint256 yes3, uint256 no3, , , ) = csmm.getMarketState(PLAYER_1);
        assertEq(yes3 + no3, 10e18, "Invariant after sell");
        
        vm.stopPrank();
    }
    
    function testResolveMarket() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // Resolve market with YES outcome
        vm.prank(factory);
        vm.expectEmit(true, false, false, true);
        emit MarketResolved(PLAYER_1, true);
        csmm.resolveMarket(PLAYER_1, true);
        
        (, , bool isActive, bool isResolved, bool outcome) = csmm.getMarketState(PLAYER_1);
        assertFalse(isActive, "Market should be inactive");
        assertTrue(isResolved, "Market should be resolved");
        assertTrue(outcome, "Outcome should be YES");
    }
    
    function testClaimPayout() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // User1 buys 3 YES shares
        uint256 amount = 3e18;
        vm.startPrank(user1);
        sof.approve(address(csmm), amount);
        csmm.buyShares(PLAYER_1, true, amount, amount);
        vm.stopPrank();
        
        // Resolve market with YES outcome
        vm.prank(factory);
        csmm.resolveMarket(PLAYER_1, true);
        
        // User1 claims payout
        uint256 balanceBefore = sof.balanceOf(user1);
        uint256 treasuryBefore = sof.balanceOf(treasury);
        
        vm.prank(user1);
        vm.expectEmit(true, true, false, true);
        emit PayoutClaimed(user1, PLAYER_1, 3e18, 0.06e18, 2.94e18);
        csmm.claimPayout(PLAYER_1);
        
        uint256 balanceAfter = sof.balanceOf(user1);
        uint256 treasuryAfter = sof.balanceOf(treasury);
        
        // Check 2% fee applied
        uint256 expectedFee = (3e18 * 200) / 10000; // 0.06 SOF
        uint256 expectedPayout = 3e18 - expectedFee; // 2.94 SOF
        
        assertEq(balanceAfter - balanceBefore, expectedPayout, "User should receive net payout");
        assertEq(treasuryAfter - treasuryBefore, expectedFee, "Treasury should receive fee");
        
        // Check position cleared
        (uint256 userYes, ) = csmm.getUserPosition(user1, PLAYER_1);
        assertEq(userYes, 0, "User position should be cleared");
    }
    
    function testCannotClaimLosingPosition() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // User1 buys NO shares
        vm.startPrank(user1);
        sof.approve(address(csmm), 2e18);
        csmm.buyShares(PLAYER_1, false, 2e18, 2e18);
        vm.stopPrank();
        
        // Resolve market with YES outcome (user1 loses)
        vm.prank(factory);
        csmm.resolveMarket(PLAYER_1, true);
        
        // User1 tries to claim payout
        vm.prank(user1);
        vm.expectRevert(SeasonCSMM.NoWinningShares.selector);
        csmm.claimPayout(PLAYER_1);
    }
    
    function testMultiplePlayersScaling() public {
        // Test with 50 players
        uint256 playerCount = 50;
        
        for (uint256 i = 0; i < playerCount; i++) {
            vm.prank(factory);
            csmm.createPlayerMarket(i);
        }
        
        assertEq(csmm.totalLiquidity(), playerCount * 10e18, "Total liquidity should scale linearly");
        assertEq(csmm.getActiveMarketCount(), playerCount, "Should have 50 active markets");
        
        // Check each market has correct reserves
        for (uint256 i = 0; i < playerCount; i++) {
            (uint256 yes, uint256 no, , , ) = csmm.getMarketState(i);
            assertEq(yes + no, 10e18, "Each market should have 10 SOF");
        }
    }
    
    function testCrossMarketTrading() public {
        // Create two player markets
        vm.startPrank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        csmm.createPlayerMarket(PLAYER_2);
        vm.stopPrank();
        
        // User1 buys YES on Player 1
        vm.startPrank(user1);
        sof.approve(address(csmm), 10e18);
        csmm.buyShares(PLAYER_1, true, 2e18, 2e18);
        vm.stopPrank();
        
        // User2 buys NO on Player 2
        vm.startPrank(user2);
        sof.approve(address(csmm), 10e18);
        csmm.buyShares(PLAYER_2, false, 3e18, 3e18);
        vm.stopPrank();
        
        // Check both markets maintain invariant
        (uint256 yes1, uint256 no1, , , ) = csmm.getMarketState(PLAYER_1);
        (uint256 yes2, uint256 no2, , , ) = csmm.getMarketState(PLAYER_2);
        
        assertEq(yes1 + no1, 10e18, "Player 1 market invariant");
        assertEq(yes2 + no2, 10e18, "Player 2 market invariant");
        
        // Total liquidity unchanged (CSMM doesn't add liquidity on trades)
        assertEq(csmm.totalLiquidity(), 20e18, "Total liquidity should be 20 SOF");
    }
    
    function testCannotBuyMoreThanReserve() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // Try to buy more YES than available (5 SOF available)
        uint256 amount = 6e18;
        
        vm.startPrank(user1);
        sof.approve(address(csmm), amount);
        
        vm.expectRevert(SeasonCSMM.InsufficientReserve.selector);
        csmm.buyShares(PLAYER_1, true, amount, amount);
        vm.stopPrank();
    }
    
    function testCannotSellMoreThanOwned() public {
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // User1 buys 1 YES share
        vm.startPrank(user1);
        sof.approve(address(csmm), 1e18);
        csmm.buyShares(PLAYER_1, true, 1e18, 1e18);
        
        // Try to sell 2 YES shares (only owns 1)
        vm.expectRevert(SeasonCSMM.InsufficientShares.selector);
        csmm.sellShares(PLAYER_1, true, 2e18, 2e18);
        vm.stopPrank();
    }
    
    function testAccessControl() public {
        // Non-factory cannot create market
        vm.prank(user1);
        vm.expectRevert();
        csmm.createPlayerMarket(PLAYER_1);
        
        // Create market as factory
        vm.prank(factory);
        csmm.createPlayerMarket(PLAYER_1);
        
        // Non-factory cannot resolve market
        vm.prank(user1);
        vm.expectRevert();
        csmm.resolveMarket(PLAYER_1, true);
    }
}
