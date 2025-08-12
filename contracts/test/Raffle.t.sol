// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/Raffle.sol";
import "../src/curve/SOFBondingCurve.sol";

contract RaffleTest is Test {
    Raffle public raffle;
    address public player1 = address(3);
    address public player2 = address(4);

    // Mock SOF token
    MockERC20 public sof;

    function setUp() public {
        // Deploy mock SOF token and mint to players
        sof = new MockERC20("SOF Token", "SOF", 18);
        sof.mint(player1, 10000 ether);
        sof.mint(player2, 10000 ether);

        // Deploy Raffle with mock VRF coordinator (non-zero address)
        address mockCoordinator = address(0x1);
        raffle = new Raffle(address(sof), mockCoordinator, 0, bytes32(0));
    }

    function _defaultBondSteps() internal pure returns (SOFBondingCurve.BondStep[] memory steps) {
        steps = new SOFBondingCurve.BondStep[](2);
        steps[0] = SOFBondingCurve.BondStep({rangeTo: uint128(1000), price: uint128(1 ether)});
        steps[1] = SOFBondingCurve.BondStep({rangeTo: uint128(5000), price: uint128(2 ether)});
    }

    function _createSeasonBasic(string memory name, uint256 start, uint256 end) internal returns (uint256 seasonId) {
        Raffle.SeasonConfig memory cfg;
        cfg.name = name;
        cfg.startTime = start;
        cfg.endTime = end;
        cfg.maxParticipants = 0; // not enforced in contract currently
        cfg.winnerCount = 2;
        cfg.prizePercentage = 9000; // 90%
        cfg.consolationPercentage = 0;
        SOFBondingCurve.BondStep[] memory steps = _defaultBondSteps();
        seasonId = raffle.createSeason(cfg, steps, 50, 70); // 0.5% buy, 0.7% sell
    }

    function testCreateSeason() public {
        uint256 nowTs = block.timestamp;
        uint256 seasonId = _createSeasonBasic("S1", nowTs + 1, nowTs + 3 days);
        (
            Raffle.SeasonConfig memory config,
            Raffle.SeasonStatus status,
            uint256 totalParticipants,
            uint256 totalTickets,
            uint256 totalPrizePool
        ) = raffle.getSeasonDetails(seasonId);

        assertEq(config.name, "S1");
        assertEq(config.startTime, nowTs + 1);
        assertEq(config.endTime, nowTs + 3 days);
        assertEq(config.winnerCount, 2);
        assertTrue(config.raffleToken != address(0));
        assertTrue(config.bondingCurve != address(0));
        assertEq(uint8(status), uint8(Raffle.SeasonStatus.NotStarted));
        assertEq(totalParticipants, 0);
        assertEq(totalTickets, 0);
        assertEq(totalPrizePool, 0);
    }

    function testBuyViaCurveTracksParticipants() public {
        uint256 nowTs = block.timestamp;
        uint256 seasonId = _createSeasonBasic("S1", nowTs + 1, nowTs + 3 days);

        // Move to start and start season
        vm.warp(nowTs + 1);
        raffle.startSeason(seasonId);

        // Get curve address
        (Raffle.SeasonConfig memory config,, , ,) = raffle.getSeasonDetails(seasonId);
        SOFBondingCurve curve = SOFBondingCurve(config.bondingCurve);

        // player1 buys 10 tickets on step 0 (1 ether each => 10 ether + fee)
        vm.startPrank(player1);
        sof.approve(address(curve), type(uint256).max);
        curve.buyTokens(10, 20 ether);
        vm.stopPrank();

        // Validate participant tracked
        address[] memory parts = raffle.getParticipants(seasonId);
        assertEq(parts.length, 1);
        assertEq(parts[0], player1);

        (uint256 startNum, uint256 endNum) = raffle.getParticipantNumberRange(seasonId, player1);
        assertEq(startNum, 1);
        assertEq(endNum, 10);

        Raffle.ParticipantPosition memory pos = raffle.getParticipantPosition(seasonId, player1);
        assertEq(pos.ticketCount, 10);

        // player2 buys 3 tickets
        vm.startPrank(player2);
        sof.approve(address(curve), type(uint256).max);
        curve.buyTokens(3, 5 ether);
        vm.stopPrank();

        parts = raffle.getParticipants(seasonId);
        assertEq(parts.length, 2);
        (startNum, endNum) = raffle.getParticipantNumberRange(seasonId, player2);
        assertEq(startNum, 11);
        assertEq(endNum, 13);

        // player1 sells 4 tickets -> updates tracking
        vm.prank(player1);
        curve.sellTokens(4, 0);

        pos = raffle.getParticipantPosition(seasonId, player1);
        assertEq(pos.ticketCount, 6);
    }
}

// Minimal mock ERC20 for tests
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