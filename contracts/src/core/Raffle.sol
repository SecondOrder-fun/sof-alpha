// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";
import "../token/RaffleToken.sol";
import "../curve/SOFBondingCurve.sol";
import "./RaffleStorage.sol";
import "../lib/RaffleLogic.sol";
import "../lib/IInfoFiMarketFactory.sol";
import "../lib/ISeasonFactory.sol";
import "../lib/RaffleTypes.sol";
import {IRafflePrizeDistributor} from "../lib/IRafflePrizeDistributor.sol";


// Minimal ACL interface for granting MARKET_ROLE on the tracker
interface ITrackerACL {
    function grantRole(bytes32 role, address account) external;
}

/**
 * @title Raffle Contract
 * @notice Manages seasons, deploys per-season RaffleToken and SOFBondingCurve, integrates VRF v2.
 */
contract Raffle is RaffleStorage, AccessControl, ReentrancyGuard, VRFConsumerBaseV2 {
    using SafeERC20 for IERC20;

    // VRF v2
    VRFCoordinatorV2Interface private COORDINATOR;
    bytes32 public vrfKeyHash;
    uint64 public vrfSubscriptionId;
    uint32 public vrfCallbackGasLimit = 500000;
    uint16 public constant VRF_REQUEST_CONFIRMATIONS = 3;

    // Core
    IERC20 public immutable sofToken;
    ISeasonFactory public seasonFactory;
    // InfoFi integration
    address public infoFiFactory;
    // Prize Distributor integration
    address public prizeDistributor;
    // Default grand prize split in BPS (e.g., 6500 = 65%). If seasonConfig.grandPrizeBps == 0, use this default.
    uint16 public defaultGrandPrizeBps = 6500;

    // Role hash used by RafflePositionTracker for updater permissions
    bytes32 private constant TRACKER_MARKET_ROLE = keccak256("MARKET_ROLE");

    /// @dev Emitted on every position change (buy/sell) with post-change totals
    event PositionUpdate(
        uint256 indexed seasonId,
        address indexed player,
        uint256 oldTickets,
        uint256 newTickets,
        uint256 totalTickets
    );

    constructor(
        address _sofToken,
        address _vrfCoordinator,
        uint64 _vrfSubscriptionId,
        bytes32 _vrfKeyHash
    ) VRFConsumerBaseV2(_vrfCoordinator) {
        require(_sofToken != address(0), "Raffle: SOF zero");
        sofToken = IERC20(_sofToken);
        COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
        vrfSubscriptionId = _vrfSubscriptionId;
        vrfKeyHash = _vrfKeyHash;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SEASON_CREATOR_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
    }

    function setSeasonFactory(address _seasonFactoryAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(seasonFactory) == address(0), "Raffle: factory already set");
        require(_seasonFactoryAddress != address(0), "Raffle: factory zero");
        seasonFactory = ISeasonFactory(_seasonFactoryAddress);
    }

    /**
     * @notice Set InfoFi factory used to react to position updates
     */
    function setInfoFiFactory(address _factory) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_factory != address(0), "Raffle: infofi zero");
        infoFiFactory = _factory;
    }

    /**
     * @notice Set the raffle prize distributor contract
     */
    function setPrizeDistributor(address distributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(distributor != address(0), "Raffle: distributor zero");
        prizeDistributor = distributor;
    }

    /**
     * @notice Update the default grand prize split (in basis points)
     */
    function setDefaultGrandPrizeBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 10000, "Raffle: bps > 100%");
        defaultGrandPrizeBps = bps;
    }

    /**
     * @notice Wire the on-chain position tracker for a season and authorize the curve as updater
     * @dev Calls curve.setPositionTracker(tracker) and tracker.grantRole(MARKET_ROLE, curve)
     */
    function setPositionTrackerForSeason(uint256 seasonId, address tracker) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        require(tracker != address(0), "Raffle: tracker zero");
        address curveAddr = seasons[seasonId].bondingCurve;
        require(curveAddr != address(0), "Raffle: curve not set");

        // Set tracker on curve (Raffle has RAFFLE_MANAGER_ROLE on curve via SeasonFactory)
        SOFBondingCurve(curveAddr).setPositionTracker(tracker);
        // Grant MARKET_ROLE on tracker to the curve so it can push snapshots
        ITrackerACL(tracker).grantRole(TRACKER_MARKET_ROLE, curveAddr);

        emit PositionTrackerWired(seasonId, tracker, curveAddr);
    }

    event PositionTrackerWired(uint256 indexed seasonId, address indexed tracker, address indexed curve);

    /**
     * @notice Create a new season: deploy RaffleToken and SOFBondingCurve, grant roles, init curve.
     */
    function createSeason(
        RaffleTypes.SeasonConfig memory config,
        RaffleTypes.BondStep[] calldata bondSteps,
        uint16 buyFeeBps,
        uint16 sellFeeBps
    ) external onlyRole(SEASON_CREATOR_ROLE) nonReentrant returns (uint256 seasonId) {
        require(address(seasonFactory) != address(0), "Raffle: factory not set");
        require(config.startTime > block.timestamp, "Raffle: start in future");
        require(config.endTime > config.startTime, "Raffle: bad end");
        require(config.winnerCount > 0, "Raffle: winners 0");
        require(config.prizePercentage + config.consolationPercentage <= 10000, "Raffle: pct > 100%");
        require(bondSteps.length > 0, "Raffle: steps 0");

        seasonId = ++currentSeasonId;

        (address raffleTokenAddr, address curveAddr) = seasonFactory.createSeasonContracts(
            seasonId,
            config,
            bondSteps,
            buyFeeBps,
            sellFeeBps
        );

        // Persist config
        config.raffleToken = raffleTokenAddr;
        config.bondingCurve = curveAddr;
        config.isActive = false;
        config.isCompleted = false;
        seasons[seasonId] = config;
        seasonStates[seasonId].status = SeasonStatus.NotStarted;

        // Allow the curve to call participant hooks
        _grantRole(BONDING_CURVE_ROLE, curveAddr);

        // If InfoFi factory is configured, wire it into the curve for threshold callbacks
        if (infoFiFactory != address(0)) {
            // Raffle has RAFFLE_MANAGER_ROLE on the curve (granted by SeasonFactory)
            SOFBondingCurve(curveAddr).setInfoFiFactory(infoFiFactory);
        }

        emit SeasonCreated(seasonId, config.name, config.startTime, config.endTime, raffleTokenAddr, curveAddr);
    }

    function startSeason(uint256 seasonId) external onlyRole(SEASON_CREATOR_ROLE) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        require(!seasons[seasonId].isActive, "Raffle: active");
        require(block.timestamp >= seasons[seasonId].startTime, "Raffle: not started");
        require(block.timestamp < seasons[seasonId].endTime, "Raffle: expired");
        require(seasonStates[seasonId].status == SeasonStatus.NotStarted, "Raffle: bad status");

        seasons[seasonId].isActive = true;
        seasonStates[seasonId].status = SeasonStatus.Active;
        emit SeasonStarted(seasonId);
    }

    function requestSeasonEnd(uint256 seasonId) external onlyRole(SEASON_CREATOR_ROLE) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        require(seasons[seasonId].isActive, "Raffle: not active");
        require(block.timestamp >= seasons[seasonId].endTime, "Raffle: not ended");
        require(seasonStates[seasonId].status == SeasonStatus.Active, "Raffle: bad status");

        // Lock trading on curve
        SOFBondingCurve curve = SOFBondingCurve(seasons[seasonId].bondingCurve);
        curve.lockTrading();
        seasonStates[seasonId].totalPrizePool = curve.getSofReserves();
        seasons[seasonId].isActive = false;
        seasonStates[seasonId].status = SeasonStatus.EndRequested;
        emit SeasonLocked(seasonId);

        // VRF v2 request for winner selection (numWords == winnerCount)
        uint256 requestId = COORDINATOR.requestRandomWords(
            vrfKeyHash,
            vrfSubscriptionId,
            VRF_REQUEST_CONFIRMATIONS,
            vrfCallbackGasLimit,
            seasons[seasonId].winnerCount
        );
        seasonStates[seasonId].vrfRequestId = requestId;
        seasonStates[seasonId].status = SeasonStatus.VRFPending;
        vrfRequestToSeason[requestId] = seasonId;
        emit SeasonEndRequested(seasonId, requestId);
    }

    /**
     * @notice Emergency-only early end. Skips endTime check but requires Active status.
     * @dev Locks trading, marks EndRequested -> VRFPending, and triggers VRF like normal end.
     */
    function requestSeasonEndEarly(uint256 seasonId) external onlyRole(EMERGENCY_ROLE) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        require(seasons[seasonId].isActive, "Raffle: not active");
        require(seasonStates[seasonId].status == SeasonStatus.Active, "Raffle: bad status");

        // Lock trading on curve
        SOFBondingCurve curve = SOFBondingCurve(seasons[seasonId].bondingCurve);
        curve.lockTrading();
        seasonStates[seasonId].totalPrizePool = curve.getSofReserves();
        seasons[seasonId].isActive = false;
        seasonStates[seasonId].status = SeasonStatus.EndRequested;
        emit SeasonLocked(seasonId);

        // VRF v2 request for winner selection (numWords == winnerCount)
        uint256 requestId = COORDINATOR.requestRandomWords(
            vrfKeyHash,
            vrfSubscriptionId,
            VRF_REQUEST_CONFIRMATIONS,
            vrfCallbackGasLimit,
            seasons[seasonId].winnerCount
        );
        seasonStates[seasonId].vrfRequestId = requestId;
        seasonStates[seasonId].status = SeasonStatus.VRFPending;
        vrfRequestToSeason[requestId] = seasonId;
        emit SeasonEndRequested(seasonId, requestId);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        uint256 seasonId = vrfRequestToSeason[requestId];
        require(seasonId != 0, "Raffle: bad req");
        require(seasonStates[seasonId].status == SeasonStatus.VRFPending, "Raffle: bad status");

        uint256 totalPrizePool = seasonStates[seasonId].totalPrizePool;

        // Select winners address-based
        address[] memory winners = RaffleLogic._selectWinnersAddressBased(seasonStates[seasonId], seasons[seasonId].winnerCount, randomWords);
        seasonStates[seasonId].winners = winners;

        seasonStates[seasonId].status = SeasonStatus.Distributing;
        emit WinnersSelected(seasonId, winners);

        _setupPrizeDistribution(seasonId, winners, totalPrizePool);
    }

    // Called by curve
    function recordParticipant(uint256 seasonId, address participant, uint256 ticketAmount) external onlyRole(BONDING_CURVE_ROLE) {
        require(seasons[seasonId].isActive, "Raffle: season inactive");
        SeasonState storage state = seasonStates[seasonId];
        ParticipantPosition storage pos = state.participantPositions[participant];
        uint256 oldTickets = pos.ticketCount;
        uint256 newTicketsLocal = oldTickets + ticketAmount;
        if (!pos.isActive) {
            state.participants.push(participant);
            state.totalParticipants++;
            pos.entryBlock = block.number;
            pos.isActive = true;
            emit ParticipantAdded(seasonId, participant, ticketAmount, state.totalTickets + ticketAmount);
        } else {
            emit ParticipantUpdated(seasonId, participant, pos.ticketCount + ticketAmount, state.totalTickets + ticketAmount);
        }
        pos.ticketCount = newTicketsLocal;
        pos.lastUpdateBlock = block.number;
        state.totalTickets += ticketAmount;

        // Emit InfoFi position update and call factory
        emit PositionUpdate(seasonId, participant, oldTickets, newTicketsLocal, state.totalTickets);
        if (infoFiFactory != address(0)) {
            IInfoFiMarketFactory(infoFiFactory).onPositionUpdate(
                seasonId,
                participant,
                oldTickets,
                newTicketsLocal,
                state.totalTickets
            );
        }
    }

    function removeParticipant(uint256 seasonId, address participant, uint256 ticketAmount) external onlyRole(BONDING_CURVE_ROLE) {
        require(seasons[seasonId].isActive, "Raffle: season inactive");
        SeasonState storage state = seasonStates[seasonId];
        ParticipantPosition storage pos = state.participantPositions[participant];
        require(pos.isActive, "Raffle: not active");
        require(pos.ticketCount >= ticketAmount, "Raffle: too much");
        uint256 oldTickets = pos.ticketCount;
        pos.ticketCount = oldTickets - ticketAmount;
        pos.lastUpdateBlock = block.number;
        state.totalTickets -= ticketAmount;

        if (pos.ticketCount == 0) {
            pos.isActive = false;
            state.totalParticipants--;
            // remove from array (swap and pop)
            for (uint256 i = 0; i < state.participants.length; i++) {
                if (state.participants[i] == participant) {
                    state.participants[i] = state.participants[state.participants.length - 1];
                    state.participants.pop();
                    break;
                }
            }
        }
        emit ParticipantRemoved(seasonId, participant, state.totalTickets);

        // Emit InfoFi position update and call factory
        emit PositionUpdate(seasonId, participant, oldTickets, pos.ticketCount, state.totalTickets);
        if (infoFiFactory != address(0)) {
            IInfoFiMarketFactory(infoFiFactory).onPositionUpdate(
                seasonId,
                participant,
                oldTickets,
                pos.ticketCount,
                state.totalTickets
            );
        }
    }

    // Views
    function getParticipants(uint256 seasonId) external view returns (address[] memory) { return seasonStates[seasonId].participants; }

    function getParticipantPosition(uint256 seasonId, address participant) external view returns (ParticipantPosition memory position) {
        return seasonStates[seasonId].participantPositions[participant];
    }

    function getParticipantNumberRange(uint256 seasonId, address participant) external view returns (uint256 start, uint256 end) {
        SeasonState storage state = seasonStates[seasonId];
        ParticipantPosition storage p = state.participantPositions[participant];
        if (!p.isActive) return (0, 0);
        uint256 cur = 1;
        for (uint256 i = 0; i < state.participants.length; i++) {
            address addr = state.participants[i];
            ParticipantPosition storage pos = state.participantPositions[addr];
            if (addr == participant) { return (cur, cur + pos.ticketCount - 1); }
            cur += pos.ticketCount;
        }
        return (0, 0);
    }

    function getSeasonDetails(uint256 seasonId) external view returns (
        RaffleTypes.SeasonConfig memory config,
        SeasonStatus status,
        uint256 totalParticipants,
        uint256 totalTickets,
        uint256 totalPrizePool
    ) {
        config = seasons[seasonId];
        SeasonState storage state = seasonStates[seasonId];
        status = state.status;
        totalParticipants = state.totalParticipants;
        totalTickets = state.totalTickets;
        totalPrizePool = state.totalPrizePool;
    }

    function getWinners(uint256 seasonId) external view returns (address[] memory) {
        require(seasonStates[seasonId].status == SeasonStatus.Completed, "Raffle: not completed");
        return seasonStates[seasonId].winners;
    }

    function getVrfRequestForSeason(uint256 seasonId) external view returns (uint256) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        return seasonStates[seasonId].vrfRequestId;
    }

    // Admin
    function pauseSeason(uint256 seasonId) external onlyRole(EMERGENCY_ROLE) { require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season"); seasons[seasonId].isActive = false; }

    function updateVRFConfig(uint64 subscriptionId, bytes32 keyHash, uint32 callbackGasLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        vrfSubscriptionId = subscriptionId; vrfKeyHash = keyHash; vrfCallbackGasLimit = callbackGasLimit;
    }

    /**
     * @notice Manually complete a season that is stuck in Distributing state
     * @dev Only for emergency use when automatic completion fails
     */
    function completeSeasonManually(uint256 seasonId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        require(seasonStates[seasonId].status == SeasonStatus.Distributing, "Raffle: not distributing");
        
        // Mark complete
        seasons[seasonId].isCompleted = true;
        seasonStates[seasonId].status = SeasonStatus.Completed;
        emit SeasonCompleted(seasonId);
    }

    /**
     * @notice Manually trigger prize distribution setup for a season that is stuck in Distributing state
     * @dev Only for emergency use when automatic prize distribution setup fails
     */
    function setupPrizeDistributionManually(uint256 seasonId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        require(seasonStates[seasonId].status == SeasonStatus.Distributing, "Raffle: not distributing");
        
        // Get the required parameters
        SeasonState storage state = seasonStates[seasonId];
        RaffleTypes.SeasonConfig storage cfg = seasons[seasonId];
        address curveAddr = cfg.bondingCurve;
        require(curveAddr != address(0), "Raffle: curve zero");
        uint256 totalPrizePool = SOFBondingCurve(curveAddr).getSofReserves();
        address[] memory winners = state.winners;
        
        // Call the internal function
        _setupPrizeDistribution(seasonId, winners, totalPrizePool);
        
        emit PrizeDistributionSetup(seasonId, prizeDistributor);
    }

    // Internals
    function _setupPrizeDistribution(uint256 seasonId, address[] memory /*winners*/, uint256 /*totalPrizePool*/) internal {
        // Compute pool splits
        require(prizeDistributor != address(0), "Raffle: distributor not set");
        SeasonState storage state = seasonStates[seasonId];
        RaffleTypes.SeasonConfig storage cfg = seasons[seasonId];
        uint256 totalPrizePool = state.totalPrizePool;
        
        // If there's no prize pool, we can still complete the season but skip distribution
        if (totalPrizePool == 0) {
            cfg.isCompleted = true;
            state.status = SeasonStatus.Completed;
            emit PrizeDistributionSetup(seasonId, prizeDistributor);
            return;
        }

        // Determine BPS (season override or default)
        uint16 grandBps = cfg.grandPrizeBps == 0 ? defaultGrandPrizeBps : cfg.grandPrizeBps;
        require(grandBps <= 10000, "Raffle: bad grand bps");
        uint256 grandAmount = (totalPrizePool * uint256(grandBps)) / 10000;
        uint256 consolationAmount = totalPrizePool - grandAmount;

        // For MVP: single grand winner winners[0]
        address grandWinner = state.winners.length > 0 ? state.winners[0] : address(0);
        require(grandWinner != address(0), "Raffle: winner zero");

        // Snapshot tickets
        uint256 totalTicketsSnapshot = state.totalTickets;
        uint256 grandWinnerTickets = state.participantPositions[grandWinner].ticketCount;

        // Move funds from curve to distributor
        address curveAddr = cfg.bondingCurve;
        require(curveAddr != address(0), "Raffle: curve zero");
        
        // 1. Configure the prize distributor with amounts and winner info
        IRafflePrizeDistributor(prizeDistributor).configureSeason(
            seasonId,
            address(sofToken),
            grandWinner,
            grandAmount,
            consolationAmount,
            totalTicketsSnapshot,
            grandWinnerTickets
        );

        // 2. Extract funds from the curve directly to the prize distributor
        SOFBondingCurve(curveAddr).extractSof(prizeDistributor, totalPrizePool);

        // 3. Call fundSeason on the distributor to finalize
        IRafflePrizeDistributor(prizeDistributor).fundSeason(seasonId, totalPrizePool);

        // 4. Mark season as completed
        cfg.isCompleted = true;
        state.status = SeasonStatus.Completed;
        emit PrizeDistributionSetup(seasonId, prizeDistributor);
    }

    /**
     * @notice Set the Merkle root for consolation claims for a season (admin only)
     */
    function setSeasonMerkleRoot(uint256 seasonId, bytes32 merkleRoot) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(prizeDistributor != address(0), "Raffle: distributor not set");
        IRafflePrizeDistributor(prizeDistributor).setMerkleRoot(seasonId, merkleRoot);
    }

    function fundPrizeDistributor(uint256 seasonId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(prizeDistributor != address(0), "Raffle: distributor not set");
        SeasonState storage state = seasonStates[seasonId];
        uint256 totalPrizePool = state.totalPrizePool;
        IRafflePrizeDistributor(prizeDistributor).fundSeason(seasonId, totalPrizePool);
    }
}