// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";

/**
 * @title InfoFiMarketFactory
 * @notice Auto-creates InfoFi markets when a player's share crosses the 1% (100 bps) threshold
 * @dev Minimal MVP: records creation intent and emits events. Deployment of actual markets can be added later.
 */
contract InfoFiMarketFactory is AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    // Authorized raffle that calls onPositionUpdate
    address public immutable raffle;

    // marketType constants (keccak256("WINNER_PREDICTION")) kept as bytes32 for gas efficiency
    bytes32 public constant WINNER_PREDICTION = keccak256("WINNER_PREDICTION");

    // seasonId => player => market address (or sentinel non-zero value for created)
    mapping(uint256 => mapping(address => address)) public winnerPredictionMarkets;

    // seasonId => player => created flag (idempotency without requiring address)
    mapping(uint256 => mapping(address => bool)) public winnerPredictionCreated;

    event MarketCreated(
        uint256 indexed seasonId,
        address indexed player,
        bytes32 indexed marketType,
        uint256 probabilityBps,
        address marketAddress
    );

    event ProbabilityUpdated(
        uint256 indexed seasonId,
        address indexed player,
        uint256 oldProbabilityBps,
        uint256 newProbabilityBps
    );

    constructor(address _raffle, address _admin) {
        require(_raffle != address(0), "Factory: raffle zero");
        raffle = _raffle;
        _grantRole(ADMIN_ROLE, _admin == address(0) ? msg.sender : _admin);
    }

    /**
     * @notice Raffle hook on every position update
     * @dev Requires msg.sender == raffle. Creates a market on upward crossing of 1% threshold.
     */
    function onPositionUpdate(
        uint256 seasonId,
        address player,
        uint256 oldTickets,
        uint256 newTickets,
        uint256 totalTickets
    ) external {
        require(msg.sender == raffle, "Factory: only raffle");
        require(player != address(0), "Factory: player zero");
        require(totalTickets > 0, "Factory: total 0");

        uint256 oldBps = (oldTickets * 10000) / totalTickets;
        uint256 newBps = (newTickets * 10000) / totalTickets;
        emit ProbabilityUpdated(seasonId, player, oldBps, newBps);

        // Upward crossing of 1% threshold and not created yet
        if (newBps >= 100 && oldBps < 100 && !winnerPredictionCreated[seasonId][player]) {
            winnerPredictionCreated[seasonId][player] = true;

            // For MVP, we do not deploy a real market contract yet; store a sentinel non-zero address if desired
            address marketAddr = address(0);
            winnerPredictionMarkets[seasonId][player] = marketAddr;

            emit MarketCreated(seasonId, player, WINNER_PREDICTION, newBps, marketAddr);
        }
    }

    // Views
    function hasWinnerMarket(uint256 seasonId, address player) external view returns (bool) {
        return winnerPredictionCreated[seasonId][player];
    }
}
