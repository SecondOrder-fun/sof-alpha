// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/infofi/InfoFiMarket.sol";

contract InfoFiMarketTest is Test {
    InfoFiMarket public market;
    address public admin = address(1);
    address public operator = address(2);
    address public better1 = address(3);
    address public better2 = address(4);
    
    // Mock ERC20 token
    MockERC20 public token;
    
    function setUp() public {
        // Deploy mock token
        token = new MockERC20("Test Token", "TEST", 18);
        
        // Mint tokens to betters
        token.mint(better1, 10000 * 10**18);
        token.mint(better2, 10000 * 10**18);
        
        // Deploy market contract
        market = new InfoFiMarket();
        
        // Grant roles
        market.grantRole(market.ADMIN_ROLE(), admin);
        market.grantRole(market.OPERATOR_ROLE(), operator);
    }
    
    function testCreateMarket() public {
        vm.startPrank(operator);
        
        market.createMarket(
            1, // raffleId
            "Will the price of ETH be above $3000 at the end of the month?",
            address(token)
        );
        
        InfoFiMarket.MarketInfo memory marketInfo = market.getMarket(0);
        
        assertEq(marketInfo.raffleId, 1);
        assertEq(marketInfo.question, "Will the price of ETH be above $3000 at the end of the month?");
        assertEq(marketInfo.tokenAddress, address(token));
        assertEq(marketInfo.resolved, false);
        
        vm.stopPrank();
    }
    
    function testPlaceBet() public {
        // Create market first
        vm.startPrank(operator);
        market.createMarket(
            1, // raffleId
            "Will the price of ETH be above $3000 at the end of the month?",
            address(token)
        );
        vm.stopPrank();
        
        // Place bet
        uint256 betAmount = 100 * 10**18;
        
        vm.startPrank(better1);
        token.approve(address(market), betAmount);
        market.placeBet(0, true, betAmount);
        vm.stopPrank();
        
        // Check bet info
        InfoFiMarket.BetInfo memory betInfo = market.getBet(0, better1);
        assertEq(betInfo.prediction, true);
        assertEq(betInfo.amount, betAmount);
        assertEq(betInfo.claimed, false);
        
        // Check market info
        InfoFiMarket.MarketInfo memory marketInfo = market.getMarket(0);
        assertEq(marketInfo.totalYesPool, betAmount);
        assertEq(marketInfo.totalNoPool, 0);
        assertEq(marketInfo.totalPool, betAmount);
    }
    
    function testResolveMarketAndClaimPayout() public {
        // Create market first
        vm.startPrank(operator);
        market.createMarket(
            1, // raffleId
            "Will the price of ETH be above $3000 at the end of the month?",
            address(token)
        );
        vm.stopPrank();
        
        // Place bets
        uint256 betAmount1 = 100 * 10**18;
        uint256 betAmount2 = 200 * 10**18;
        
        // Better1 bets YES
        vm.startPrank(better1);
        token.approve(address(market), betAmount1);
        market.placeBet(0, true, betAmount1);
        vm.stopPrank();
        
        // Better2 bets NO
        vm.startPrank(better2);
        token.approve(address(market), betAmount2);
        market.placeBet(0, false, betAmount2);
        vm.stopPrank();
        
        // Resolve market (YES wins)
        vm.startPrank(operator);
        market.resolveMarket(0, true);
        vm.stopPrank();
        
        // Check market is resolved
        InfoFiMarket.MarketInfo memory marketInfo = market.getMarket(0);
        assertEq(marketInfo.resolved, true);
        assertEq(marketInfo.outcome, true);
        
        // Better1 claims payout
        uint256 expectedPayout = (betAmount1 * (betAmount1 + betAmount2)) / betAmount1;
        
        vm.startPrank(better1);
        market.claimPayout(0);
        vm.stopPrank();
        
        // Check payout
        assertEq(token.balanceOf(better1), 10000 * 10**18 + expectedPayout - betAmount1);
    }
    
    function testFailPlaceBetInvalidMarket() public {
        vm.startPrank(better1);
        market.placeBet(999, true, 100 * 10**18);
        vm.stopPrank();
    }
    
    function testFailClaimPayoutNotWinner() public {
        // Create market first
        vm.startPrank(operator);
        market.createMarket(
            1, // raffleId
            "Will the price of ETH be above $3000 at the end of the month?",
            address(token)
        );
        vm.stopPrank();
        
        // Place bet
        uint256 betAmount = 100 * 10**18;
        
        vm.startPrank(better1);
        token.approve(address(market), betAmount);
        market.placeBet(0, true, betAmount);
        vm.stopPrank();
        
        // Resolve market (NO wins)
        vm.startPrank(operator);
        market.resolveMarket(0, false);
        vm.stopPrank();
        
        // Better1 tries to claim (but lost)
        vm.startPrank(better1);
        market.claimPayout(0);
        vm.stopPrank();
    }
}

// Mock ERC20 token for testing (same as in Raffle.t.sol)
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }
    
    function mint(address to, uint256 amount) public {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    
    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount);
        return true;
    }
}