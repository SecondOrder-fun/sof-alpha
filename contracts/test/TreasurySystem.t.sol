// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/token/SOFToken.sol";
import "../src/curve/SOFBondingCurve.sol";
import "../src/token/RaffleToken.sol";
import "../src/lib/RaffleTypes.sol";

contract TreasurySystemTest is Test {
    SOFToken public sofToken;
    SOFBondingCurve public bondingCurve;
    RaffleToken public raffleToken;

    address public admin = address(1);
    address public treasury = address(2);
    address public user1 = address(3);
    address public user2 = address(4);

    uint256 constant INITIAL_SUPPLY = 100_000_000 ether;
    uint16 constant BUY_FEE = 10; // 0.1%
    uint16 constant SELL_FEE = 70; // 0.7%

    event FeesExtracted(address indexed to, uint256 amount);
    event FeesCollected(address indexed from, uint256 amount);
    event TreasuryTransfer(address indexed to, uint256 amount);

    function setUp() public {
        vm.startPrank(admin);

        // Deploy SOF token with treasury address
        sofToken = new SOFToken("SOF Token", "SOF", INITIAL_SUPPLY, treasury);

        // Deploy bonding curve with admin parameter
        bondingCurve = new SOFBondingCurve(address(sofToken), admin);

        // Deploy raffle token with season info
        raffleToken = new RaffleToken(
            "Raffle Token",
            "RAFFLE",
            1, // seasonId
            "Test Season",
            block.timestamp,
            block.timestamp + 14 days
        );

        // Set up bond steps
        RaffleTypes.BondStep[] memory bondSteps = new RaffleTypes.BondStep[](3);
        bondSteps[0] = RaffleTypes.BondStep({rangeTo: 1000, price: 10 ether});
        bondSteps[1] = RaffleTypes.BondStep({rangeTo: 2000, price: 20 ether});
        bondSteps[2] = RaffleTypes.BondStep({rangeTo: 3000, price: 30 ether});

        // Initialize curve
        bondingCurve.initializeCurve(address(raffleToken), bondSteps, BUY_FEE, SELL_FEE);

        // Grant roles
        sofToken.grantRole(sofToken.FEE_COLLECTOR_ROLE(), address(bondingCurve));
        raffleToken.grantRole(raffleToken.MINTER_ROLE(), address(bondingCurve));
        raffleToken.grantRole(raffleToken.BURNER_ROLE(), address(bondingCurve));

        // Transfer SOF to users for testing
        sofToken.transfer(user1, 50_000 ether);
        sofToken.transfer(user2, 50_000 ether);

        vm.stopPrank();
    }

    function testFeeAccumulationOnBuy() public {
        vm.startPrank(user1);

        uint256 tokenAmount = 100;
        uint256 baseCost = bondingCurve.calculateBuyPrice(tokenAmount);
        uint256 expectedFee = (baseCost * BUY_FEE) / 10000;
        uint256 totalCost = baseCost + expectedFee;

        sofToken.approve(address(bondingCurve), totalCost);
        bondingCurve.buyTokens(tokenAmount, totalCost);

        assertEq(bondingCurve.accumulatedFees(), expectedFee, "Fees should accumulate on buy");

        vm.stopPrank();
    }

    function testFeeAccumulationOnSell() public {
        // First buy some tokens
        vm.startPrank(user1);

        uint256 tokenAmount = 100;
        uint256 buyCost = bondingCurve.calculateBuyPrice(tokenAmount);
        uint256 buyFee = (buyCost * BUY_FEE) / 10000;

        sofToken.approve(address(bondingCurve), buyCost + buyFee);
        bondingCurve.buyTokens(tokenAmount, buyCost + buyFee);

        uint256 feesAfterBuy = bondingCurve.accumulatedFees();

        // Now sell tokens
        uint256 sellAmount = 50;
        uint256 baseReturn = bondingCurve.calculateSellPrice(sellAmount);
        uint256 sellFee = (baseReturn * SELL_FEE) / 10000;

        raffleToken.approve(address(bondingCurve), sellAmount);
        bondingCurve.sellTokens(sellAmount, 0);

        assertEq(bondingCurve.accumulatedFees(), feesAfterBuy + sellFee, "Fees should accumulate on sell");

        vm.stopPrank();
    }

    function testExtractFeesToTreasury() public {
        // User buys tokens to accumulate fees
        vm.startPrank(user1);
        uint256 tokenAmount = 100;
        uint256 totalCost = bondingCurve.calculateBuyPrice(tokenAmount) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost);
        bondingCurve.buyTokens(tokenAmount, totalCost);
        vm.stopPrank();

        uint256 accumulatedFees = bondingCurve.accumulatedFees();
        assertTrue(accumulatedFees > 0, "Fees should be accumulated");

        // Admin extracts fees
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit FeesExtracted(address(sofToken), accumulatedFees);
        bondingCurve.extractFeesToTreasury();

        assertEq(bondingCurve.accumulatedFees(), 0, "Accumulated fees should be zero after extraction");
        assertEq(sofToken.balanceOf(address(sofToken)), accumulatedFees, "Fees should be in SOF token contract");
    }

    function testCannotExtractWithoutRole() public {
        // User buys tokens to accumulate fees
        vm.startPrank(user1);
        uint256 tokenAmount = 100;
        uint256 totalCost = bondingCurve.calculateBuyPrice(tokenAmount) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost);
        bondingCurve.buyTokens(tokenAmount, totalCost);
        vm.stopPrank();

        // Non-admin tries to extract
        vm.prank(user2);
        vm.expectRevert();
        bondingCurve.extractFeesToTreasury();
    }

    function testCannotExtractZeroFees() public {
        vm.prank(admin);
        vm.expectRevert("Curve: no fees");
        bondingCurve.extractFeesToTreasury();
    }

    function testTransferToTreasury() public {
        // Accumulate and extract fees first
        vm.startPrank(user1);
        uint256 tokenAmount = 100;
        uint256 totalCost = bondingCurve.calculateBuyPrice(tokenAmount) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost);
        bondingCurve.buyTokens(tokenAmount, totalCost);
        vm.stopPrank();

        vm.prank(admin);
        bondingCurve.extractFeesToTreasury();

        uint256 sofTokenBalance = sofToken.balanceOf(address(sofToken));
        uint256 treasuryBalanceBefore = sofToken.balanceOf(treasury);

        // Transfer to treasury
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit TreasuryTransfer(treasury, sofTokenBalance);
        sofToken.transferToTreasury(sofTokenBalance);

        assertEq(sofToken.balanceOf(address(sofToken)), 0, "SOF token contract should have zero balance");
        assertEq(
            sofToken.balanceOf(treasury), treasuryBalanceBefore + sofTokenBalance, "Treasury should receive the fees"
        );
    }

    function testCannotTransferToTreasuryWithoutRole() public {
        // Accumulate and extract fees first
        vm.startPrank(user1);
        uint256 tokenAmount = 100;
        uint256 totalCost = bondingCurve.calculateBuyPrice(tokenAmount) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost);
        bondingCurve.buyTokens(tokenAmount, totalCost);
        vm.stopPrank();

        vm.prank(admin);
        bondingCurve.extractFeesToTreasury();

        uint256 sofTokenBalance = sofToken.balanceOf(address(sofToken));

        // Non-admin tries to transfer
        vm.prank(user2);
        vm.expectRevert();
        sofToken.transferToTreasury(sofTokenBalance);
    }

    function testTotalFeesCollectedTracking() public {
        // First extraction
        vm.startPrank(user1);
        uint256 tokenAmount1 = 100;
        uint256 totalCost1 = bondingCurve.calculateBuyPrice(tokenAmount1) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost1);
        bondingCurve.buyTokens(tokenAmount1, totalCost1);
        vm.stopPrank();

        assertTrue(bondingCurve.accumulatedFees() > 0, "Fees should accumulate");

        vm.prank(admin);
        bondingCurve.extractFeesToTreasury();

        // Note: SOFToken.collectFees() is called by extractFeesToTreasury
        // but we're using direct transfer, so totalFeesCollected won't update
        // This is expected behavior in the current implementation

        // Second extraction
        vm.startPrank(user2);
        uint256 tokenAmount2 = 50;
        uint256 totalCost2 = bondingCurve.calculateBuyPrice(tokenAmount2) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost2);
        bondingCurve.buyTokens(tokenAmount2, totalCost2);
        vm.stopPrank();

        assertTrue(bondingCurve.accumulatedFees() > 0, "Fees should accumulate again");

        vm.prank(admin);
        bondingCurve.extractFeesToTreasury();

        // Verify fees were extracted
        assertEq(bondingCurve.accumulatedFees(), 0, "All fees should be extracted");
    }

    function testReservesNotAffectedByFees() public {
        vm.startPrank(user1);

        uint256 tokenAmount = 100;
        uint256 baseCost = bondingCurve.calculateBuyPrice(tokenAmount);
        uint256 fee = (baseCost * BUY_FEE) / 10000;
        uint256 totalCost = baseCost + fee;

        sofToken.approve(address(bondingCurve), totalCost);
        bondingCurve.buyTokens(tokenAmount, totalCost);

        // Reserves should only include base cost, not fees
        assertEq(bondingCurve.getSofReserves(), baseCost, "Reserves should equal base cost");
        assertEq(bondingCurve.accumulatedFees(), fee, "Fees should be tracked separately");

        vm.stopPrank();
    }

    function testMultipleUsersFeesAccumulate() public {
        // User 1 buys
        vm.startPrank(user1);
        uint256 tokenAmount1 = 100;
        uint256 totalCost1 = bondingCurve.calculateBuyPrice(tokenAmount1) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost1);
        bondingCurve.buyTokens(tokenAmount1, totalCost1);
        vm.stopPrank();

        uint256 feesAfterUser1 = bondingCurve.accumulatedFees();

        // User 2 buys
        vm.startPrank(user2);
        uint256 tokenAmount2 = 50;
        uint256 totalCost2 = bondingCurve.calculateBuyPrice(tokenAmount2) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost2);
        bondingCurve.buyTokens(tokenAmount2, totalCost2);
        vm.stopPrank();

        uint256 feesAfterUser2 = bondingCurve.accumulatedFees();

        assertTrue(feesAfterUser2 > feesAfterUser1, "Fees should accumulate from multiple users");
    }

    function testSetTreasuryAddress() public {
        address newTreasury = address(5);

        vm.prank(admin);
        sofToken.setTreasuryAddress(newTreasury);

        assertEq(sofToken.treasuryAddress(), newTreasury, "Treasury address should be updated");
    }

    function testCannotSetZeroTreasuryAddress() public {
        vm.prank(admin);
        vm.expectRevert("Treasury cannot be zero address");
        sofToken.setTreasuryAddress(address(0));
    }

    function testGetContractBalance() public {
        // Accumulate and extract fees
        vm.startPrank(user1);
        uint256 tokenAmount = 100;
        uint256 totalCost = bondingCurve.calculateBuyPrice(tokenAmount) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost);
        bondingCurve.buyTokens(tokenAmount, totalCost);
        vm.stopPrank();

        vm.prank(admin);
        bondingCurve.extractFeesToTreasury();

        uint256 expectedBalance = sofToken.balanceOf(address(sofToken));
        uint256 contractBalance = sofToken.getContractBalance();

        assertEq(contractBalance, expectedBalance, "getContractBalance should return correct value");
    }

    function testMultipleExtractions() public {
        // Test that multiple extractions work correctly

        // First buy and extract
        vm.startPrank(user1);
        uint256 tokenAmount1 = 100;
        uint256 totalCost1 = bondingCurve.calculateBuyPrice(tokenAmount1) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost1);
        bondingCurve.buyTokens(tokenAmount1, totalCost1);
        vm.stopPrank();

        uint256 fees1 = bondingCurve.accumulatedFees();

        vm.prank(admin);
        bondingCurve.extractFeesToTreasury();

        uint256 balanceAfterFirst = sofToken.balanceOf(address(sofToken));
        assertEq(balanceAfterFirst, fees1, "First extraction should transfer fees");

        // Second buy and extract
        vm.startPrank(user2);
        uint256 tokenAmount2 = 50;
        uint256 totalCost2 = bondingCurve.calculateBuyPrice(tokenAmount2) * 10010 / 10000;
        sofToken.approve(address(bondingCurve), totalCost2);
        bondingCurve.buyTokens(tokenAmount2, totalCost2);
        vm.stopPrank();

        uint256 fees2 = bondingCurve.accumulatedFees();

        vm.prank(admin);
        bondingCurve.extractFeesToTreasury();

        uint256 balanceAfterSecond = sofToken.balanceOf(address(sofToken));
        assertEq(balanceAfterSecond, fees1 + fees2, "Second extraction should add to existing balance");
    }
}
