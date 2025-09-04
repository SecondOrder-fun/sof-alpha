// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "../lib/RaffleTypes.sol";

interface IInfoFiPriceOracleMinimal {
    function updateRaffleProbability(bytes32 marketId, uint256 raffleProbabilityBps) external;
}

/// @dev Minimal interface to the InfoFiMarket for creating markets and reading roles
interface IInfoFiMarketOps {
    function OPERATOR_ROLE() external view returns (bytes32);
    function createMarket(uint256 raffleId, address player, string calldata question, address tokenAddress) external;
}

/// @dev Minimal read-only interface to Raffle for on-chain validation
interface IRaffleRead {
    // Mirror types from RaffleStorage
    enum SeasonStatus { NotStarted, Active, EndRequested, VRFPending, Distributing, Completed }

    struct ParticipantPosition {
        uint256 ticketCount;
        uint256 entryBlock;
        uint256 lastUpdateBlock;
        bool isActive;
    }

    // Matches: getSeasonDetails(uint256) returns (SeasonConfig, SeasonStatus, uint256, uint256, uint256)
    function getSeasonDetails(uint256 seasonId)
        external
        view
        returns (
            RaffleTypes.SeasonConfig memory config,
            SeasonStatus status,
            uint256 totalParticipants,
            uint256 totalTickets,
            uint256 totalPrizePool
        );

    // Matches: getParticipantPosition(uint256,address) returns (ParticipantPosition)
    function getParticipantPosition(uint256 seasonId, address participant)
        external
        view
        returns (ParticipantPosition memory position);
}

/**
 * @title InfoFiMarketFactory
 * @notice Auto-creates InfoFi markets when a player's share crosses the 1% (100 bps) threshold
 * @dev Minimal MVP: records creation intent and emits events. Deployment of actual markets can be added later.
 */
contract InfoFiMarketFactory is AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    // Read-only raffle address for state reads
    IRaffleRead private immutable iRaffle;
    // Oracle to push hybrid price updates
    IInfoFiPriceOracleMinimal public immutable oracle;

    // Deployed InfoFiMarket used to host per-player markets
    IInfoFiMarketOps public immutable infoFiMarket;

    // ERC20 token used for wagering in markets (SOF in our MVP)
    address public immutable betToken;

    // marketType constants (keccak256("WINNER_PREDICTION")) kept as bytes32 for gas efficiency
    bytes32 public constant WINNER_PREDICTION = keccak256("WINNER_PREDICTION");

    // seasonId => player => market address (or sentinel non-zero value for created)
    mapping(uint256 => mapping(address => address)) public winnerPredictionMarkets;

    // seasonId => player => created flag (idempotency without requiring address)
    mapping(uint256 => mapping(address => bool)) public winnerPredictionCreated;

    // Simple enumeration support: seasonId => players[] that have markets
    mapping(uint256 => address[]) private _seasonPlayers;

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

    constructor(address _raffleRead, address _oracle, address _infoFiMarket, address _betToken, address _admin) {
        require(_raffleRead != address(0), "Factory: raffleRead zero");
        require(_oracle != address(0), "Factory: oracle zero");
        require(_infoFiMarket != address(0), "Factory: market zero");
        require(_betToken != address(0), "Factory: token zero");
        iRaffle = IRaffleRead(_raffleRead);
        oracle = IInfoFiPriceOracleMinimal(_oracle);
        infoFiMarket = IInfoFiMarketOps(_infoFiMarket);
        betToken = _betToken;
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
        // Validate caller equals the active bonding curve recorded in raffle for this season
        (RaffleTypes.SeasonConfig memory cfg, , , , ) = iRaffle.getSeasonDetails(seasonId);
        require(cfg.bondingCurve != address(0), "Factory: no curve");
        // Accept updates from either the season's bonding curve (direct threshold callback)
        // or the Raffle contract (forwarded participant updates)
        require(
            msg.sender == cfg.bondingCurve || msg.sender == address(iRaffle),
            "Factory: only curve or raffle"
        );
        require(player != address(0), "Factory: player zero");
        require(totalTickets > 0, "Factory: total 0");

        uint256 oldBps = (oldTickets * 10000) / totalTickets;
        uint256 newBps = (newTickets * 10000) / totalTickets;
        emit ProbabilityUpdated(seasonId, player, oldBps, newBps);

        // Push probability to oracle for the corresponding marketId (seasonId, player, type)
        // marketId = keccak256(seasonId, player, WINNER_PREDICTION)
        bytes32 marketId = keccak256(abi.encodePacked(seasonId, player, WINNER_PREDICTION));
        // Note: Factory must hold PRICE_UPDATER_ROLE in the oracle.
        oracle.updateRaffleProbability(marketId, newBps);

        // Upward crossing of 1% threshold and not created yet
        if (newBps >= 100 && oldBps < 100 && !winnerPredictionCreated[seasonId][player]) {
            winnerPredictionCreated[seasonId][player] = true;

            // Create a per-player prediction market on the shared InfoFiMarket
            // Requires OPERATOR_ROLE to be granted to this factory
            string memory q = "Will this player win the raffle season?";
            address marketAddr = address(infoFiMarket);
            try infoFiMarket.createMarket(seasonId, player, q, betToken) {
                // store reference to the shared market host (not a unique market per player address)
                winnerPredictionMarkets[seasonId][player] = marketAddr;
            } catch {
                // If creation fails, still mark as created to avoid spamming, but leave address zero
                winnerPredictionMarkets[seasonId][player] = address(0);
            }
            _seasonPlayers[seasonId].push(player);

            emit MarketCreated(seasonId, player, WINNER_PREDICTION, newBps, marketAddr);
        }
    }

    /**
     * @notice Permissionless market creation for WINNER_PREDICTION when a player >= 1% bps
     * @dev Reads totals and position from the Raffle contract to compute bps on-chain.
     *      Reverts if below threshold or already created.
     */
    function createWinnerPredictionMarket(uint256 seasonId, address player) external {
        require(player != address(0), "Factory: player zero");

        // Read on-chain season totals and player position
        (RaffleTypes.SeasonConfig memory cfg, , , uint256 totalTickets, ) = iRaffle.getSeasonDetails(seasonId);
        IRaffleRead.ParticipantPosition memory pos = iRaffle.getParticipantPosition(seasonId, player);

        require(cfg.isActive && pos.isActive, "Factory: season/player inactive");
        require(totalTickets > 0, "Factory: total 0");
        require(pos.ticketCount > 0, "Factory: no tickets");

        uint256 bps = (pos.ticketCount * 10000) / totalTickets;
        require(bps >= 100, "Factory: below 1% threshold");
        require(!winnerPredictionCreated[seasonId][player], "Factory: market exists");

        winnerPredictionCreated[seasonId][player] = true;
        address marketAddr = address(0);
        winnerPredictionMarkets[seasonId][player] = marketAddr;
        _seasonPlayers[seasonId].push(player);

        emit MarketCreated(seasonId, player, WINNER_PREDICTION, bps, marketAddr);
    }

    // Views
    function hasWinnerMarket(uint256 seasonId, address player) external view returns (bool) {
        return winnerPredictionCreated[seasonId][player];
    }

    function getSeasonPlayers(uint256 seasonId) external view returns (address[] memory) {
        return _seasonPlayers[seasonId];
    }
}
