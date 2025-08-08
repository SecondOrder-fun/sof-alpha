// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/Raffle.sol";

contract RaffleTest is Test {
    Raffle public raffle;
    address public admin = address(1);
    address public operator = address(2);
    address public player1 = address(3);
    address public player2 = address(4);
    
    // Mock ERC20 token
    MockERC20 public token;
    
    function setUp() public {
        // Deploy mock token
        token = new MockERC20("Test Token", "TEST", 18);
        
        // Mint tokens to players
        token.mint(player1, 10000 * 10**18);
        token.mint(player2, 10000 * 10**18);
        
        // Deploy raffle contract
        // Note: For testing, we'll use a mock VRF coordinator
        address mockCoordinator = address(0x1);
        raffle = new Raffle(mockCoordinator, bytes32(0), 0);
        
        // Grant roles
        raffle.grantRole(raffle.ADMIN_ROLE(), admin);
        raffle.grantRole(raffle.OPERATOR_ROLE(), operator);
    }
    
    function testCreateRaffle() public {
        vm.startPrank(operator);
        
        uint256 duration = 1 days;
        uint256 ticketPrice = 100 * 10**18;
        uint256 winnerCount = 1;
        
        raffle.createRaffle(
            "Test Raffle",
            "A test raffle",
            duration,
            ticketPrice,
            winnerCount,
            address(token)
        );
        
        Raffle.RaffleInfo memory raffleInfo = raffle.getRaffle(0);
        
        assertEq(raffleInfo.name, "Test Raffle");
        assertEq(raffleInfo.description, "A test raffle");
        assertEq(raffleInfo.endTime - raffleInfo.startTime, duration);
        assertEq(raffleInfo.ticketPrice, ticketPrice);
        assertEq(raffleInfo.winnerCount, winnerCount);
        assertEq(raffleInfo.tokenAddress, address(token));
        assertEq(uint8(raffleInfo.status), uint8(Raffle.RaffleStatus.Active));
        
        vm.stopPrank();
    }
    
    function testBuyTickets() public {
        // Create raffle first
        vm.startPrank(operator);
        raffle.createRaffle(
            "Test Raffle",
            "A test raffle",
            1 days,
            100 * 10**18,
            1,
            address(token)
        );
        vm.stopPrank();
        
        // Buy tickets
        uint256 ticketCount = 5;
        uint256 totalCost = 500 * 10**18;
        
        vm.startPrank(player1);
        token.approve(address(raffle), totalCost);
        raffle.buyTickets(0, ticketCount);
        vm.stopPrank();
        
        // Check player info
        Raffle.PlayerInfo memory playerInfo = raffle.getPlayerInfo(0, player1);
        assertEq(playerInfo.ticketCount, ticketCount);
        assertEq(playerInfo.firstTicketId, 0);
        assertEq(playerInfo.lastTicketId, ticketCount - 1);
        
        // Check raffle info
        Raffle.RaffleInfo memory raffleInfo = raffle.getRaffle(0);
        assertEq(raffleInfo.totalTickets, ticketCount);
        assertEq(raffleInfo.totalPrize, totalCost);
    }
    
    function testFailBuyTicketsInvalidRaffle() public {
        vm.startPrank(player1);
        raffle.buyTickets(999, 1);
        vm.stopPrank();
    }
    
    function testFailBuyTicketsNotActive() public {
        // Create raffle first
        vm.startPrank(operator);
        raffle.createRaffle(
            "Test Raffle",
            "A test raffle",
            1 days,
            100 * 10**18,
            1,
            address(token)
        );
        vm.stopPrank();
        
        // End raffle
        vm.startPrank(operator);
        raffle.endRaffle(0);
        vm.stopPrank();
        
        // Try to buy tickets
        vm.startPrank(player1);
        raffle.buyTickets(0, 1);
        vm.stopPrank();
    }
}

// Mock ERC20 token for testing
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