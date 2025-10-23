// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {RaffleTypes} from "../lib/RaffleTypes.sol";

/**
 * @title RafflePositionTracker
 * @notice Tracks real-time player positions (ticket counts) and derived win probabilities
 *         and exposes snapshots for use by off-chain services and prediction markets.
 *         Emits lightweight events for real-time backends. Designed to be called by
 *         trusted updaters (e.g., curve/raffle contracts or backend indexers granted MARKET_ROLE).
 */
// --- External raffle interface (aligns with existing Raffle.sol) ---
interface IRaffleContract {
    function currentSeasonId() external view returns (uint256);
    
    function getSeasonDetails(uint256 seasonId)
        external
        view
        returns (
            RaffleTypes.SeasonConfig memory /*config*/,
            uint8 /*status*/,
            uint256 totalParticipants,
            uint256 totalTickets,
            uint256 totalPrizePool
        );

    function getParticipants(uint256 seasonId) external view returns (address[] memory);

    // Mirror Raffle.getParticipantPosition ABI by defining a compatible struct locally
    struct ParticipantPosition {
        uint256 ticketCount;
        uint256 entryBlock;
        uint256 lastUpdateBlock;
        bool isActive;
    }

    function getParticipantPosition(uint256 seasonId, address participant)
        external
        view
        returns (ParticipantPosition memory position);
}

contract RafflePositionTracker is AccessControl {
    // --- Roles ---
    bytes32 public constant MARKET_ROLE = keccak256("MARKET_ROLE");
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    // --- Constants ---
    uint256 public constant MAX_PLAYERS_PER_UPDATE = 250;

    // --- Types ---
    struct PlayerSnapshot {
        uint256 ticketCount;
        uint256 timestamp;
        uint256 blockNumber;
        uint256 totalTicketsAtTime;
        uint256 winProbabilityBps; // 1% = 100; 100% = 10000
    }

    // --- Storage ---
    IRaffleContract public immutable raffle;

    // Per-player time series and current snapshot
    mapping(address => PlayerSnapshot[]) public playerHistory;
    mapping(address => PlayerSnapshot) public currentPositions;

    // Optional: per-season last updated snapshot block (for analytics)
    mapping(uint256 => uint256) public seasonLastUpdateBlock;

    // --- Events ---
    event PositionSnapshot(
        address indexed player,
        uint256 ticketCount,
        uint256 totalTickets,
        uint256 winProbabilityBps,
        uint256 seasonId
    );

    event BatchPositionsUpdated(address[] players, uint256[] newPositions, uint256 seasonId);

    constructor(address raffleAddress, address initialAdmin) {
        require(raffleAddress != address(0), "raffle addr=0");
        require(initialAdmin != address(0), "admin addr=0");
        raffle = IRaffleContract(raffleAddress);
        _grantRole(ADMIN_ROLE, initialAdmin);
        _grantRole(MARKET_ROLE, initialAdmin);
    }

    /**
     * @notice Update a player's snapshot by reading from the raffle.
     * @dev Caller must have MARKET_ROLE. Safe to call frequently; stores a new snapshot each time.
     */
    function updatePlayerPosition(address player) external onlyRole(MARKET_ROLE) {
        _updatePlayerInternal(player);
    }

    /**
     * @notice Update ALL players in the current season after any position change.
     * @dev Called by bonding curve after buy/sell to ensure all probabilities are current.
     *      Limited to MAX_PLAYERS_PER_UPDATE for gas safety.
     */
    function updateAllPlayersInSeason() external onlyRole(MARKET_ROLE) {
        uint256 seasonId = raffle.currentSeasonId();
        address[] memory players = raffle.getParticipants(seasonId);
        
        if (players.length == 0) return;
        
        // Get total tickets once to save gas
        (, , , uint256 totalTickets, ) = raffle.getSeasonDetails(seasonId);
        
        // Limit to MAX_PLAYERS_PER_UPDATE for gas safety
        uint256 updateCount = players.length > MAX_PLAYERS_PER_UPDATE 
            ? MAX_PLAYERS_PER_UPDATE 
            : players.length;
        
        // Update each player with pre-fetched totalTickets
        for (uint256 i = 0; i < updateCount; i++) {
            _updatePlayerInternalWithTotal(players[i], seasonId, totalTickets);
        }
        
        seasonLastUpdateBlock[seasonId] = block.number;
    }

    /**
     * @notice Batch update multiple players. Gas-optimized loop with minimal state writes.
     */
    function batchUpdatePositions(address[] calldata players) external onlyRole(MARKET_ROLE) {
        require(players.length > 0, "empty players");
        uint256 seasonId = raffle.currentSeasonId();

        for (uint256 i = 0; i < players.length; i++) {
            _updatePlayerInternal(players[i]);
        }

        seasonLastUpdateBlock[seasonId] = block.number;
        emit BatchPositionsUpdated(players, _noopArray(players.length), seasonId);
    }

    /**
     * @notice Helper view to get the latest snapshot for a player.
     */
    function getCurrentSnapshot(address player) external view returns (PlayerSnapshot memory) {
        return currentPositions[player];
    }

    /**
     * @notice Helper view to get a player snapshot at an index (reverts if out of bounds).
     */
    function getSnapshotAt(address player, uint256 index) external view returns (PlayerSnapshot memory) {
        return playerHistory[player][index];
    }

    // --- Internal ---
    function _updatePlayerInternal(address player) internal {
        uint256 seasonId = raffle.currentSeasonId();
        // Pull totals via getSeasonDetails; we only need totalTickets
        (
            , // config
            , // status
            , // totalParticipants
            uint256 totalTickets,
            
        ) = raffle.getSeasonDetails(seasonId);

        _updatePlayerInternalWithTotal(player, seasonId, totalTickets);
    }

    /**
     * @notice Internal helper that accepts pre-fetched totalTickets to save gas in batch operations.
     */
    function _updatePlayerInternalWithTotal(
        address player,
        uint256 seasonId,
        uint256 totalTickets
    ) internal {
        IRaffleContract.ParticipantPosition memory pos = raffle.getParticipantPosition(seasonId, player);
        uint256 newTicketCount = pos.ticketCount;
        bool isActive = pos.isActive;

        uint256 bps = 0;
        if (isActive && totalTickets > 0 && newTicketCount > 0) {
            bps = (newTicketCount * 10000) / totalTickets;
        }

        PlayerSnapshot memory snap = PlayerSnapshot({
            ticketCount: newTicketCount,
            timestamp: block.timestamp,
            blockNumber: block.number,
            totalTicketsAtTime: totalTickets,
            winProbabilityBps: bps
        });

        playerHistory[player].push(snap);
        currentPositions[player] = snap;

        emit PositionSnapshot(player, newTicketCount, totalTickets, bps, seasonId);
    }

    // Minimal helper to emit array length without passing the heavy data again (keeps event signature stable)
    function _noopArray(uint256 len) private pure returns (uint256[] memory out) {
        out = new uint256[](len);
    }
}
