// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import "../token/RaffleToken.sol";
import "../curve/SOFBondingCurve.sol";
import "./RaffleStorage.sol";
import "../lib/RaffleLogic.sol";
import "../lib/IInfoFiMarketFactory.sol";
import "../lib/ISeasonFactory.sol";
import "../lib/RaffleTypes.sol";
import {IRafflePrizeDistributor} from "../lib/IRafflePrizeDistributor.sol";
import {ITrackerACL} from "../lib/ITrackerACL.sol";

// ============================================================================
// CUSTOM ERRORS - Clear, gas-efficient error reporting
// ============================================================================

error SeasonNotFound(uint256 seasonId);
error SeasonNotActive(uint256 seasonId);
error SeasonNotEnded(uint256 seasonId, uint256 currentTime, uint256 endTime);
error SeasonAlreadyStarted(uint256 seasonId);
error SeasonAlreadyEnded(uint256 seasonId);
error InvalidSeasonStatus(uint256 seasonId, uint8 currentStatus, uint8 expectedStatus);
error FactoryNotSet();
error DistributorNotSet();
error VRFRequestNotFound(uint256 requestId);
error NoWinnersSelected();
error InvalidWinnerCount(uint256 count);
error InvalidBasisPoints(uint256 bps);
error InvalidSeasonName();
error InvalidStartTime(uint256 startTime, uint256 currentTime);
error InvalidEndTime(uint256 endTime, uint256 startTime);
error InvalidTreasuryAddress();

/**
 * @title Raffle Contract
 * @notice Manages seasons, deploys per-season RaffleToken and SOFBondingCurve, integrates VRF v2.5.
 */
contract Raffle is RaffleStorage, AccessControl, ReentrancyGuard, VRFConsumerBaseV2Plus {
    using SafeERC20 for IERC20;

    // VRF v2.5
    IVRFCoordinatorV2Plus private COORDINATOR;
    bytes32 public vrfKeyHash;
    uint256 public vrfSubscriptionId;
    uint32 public vrfCallbackGasLimit = 500000;

    // Public getter for the VRF coordinator address
    function getCoordinatorAddress() external view returns (address) {
        return address(COORDINATOR);
    }

    uint16 public constant VRF_REQUEST_CONFIRMATIONS = 3;

    // Core
    IERC20 public immutable sofToken;
    ISeasonFactory public seasonFactory;
    // Prize Distributor integration
    address public prizeDistributor;
    // Default grand prize split in BPS (e.g., 6500 = 65%). If seasonConfig.grandPrizeBps == 0, use this default.
    uint16 public defaultGrandPrizeBps = 6500;

    /// @dev Emitted on every position change (buy/sell) with post-change totals
    /// @dev Backend listens to this event and triggers InfoFi market creation via Paymaster
    event PositionUpdate(
        uint256 indexed seasonId, address indexed player, uint256 oldTickets, uint256 newTickets, uint256 totalTickets
    );

    constructor(address _sofToken, address _vrfCoordinator, uint256 _vrfSubscriptionId, bytes32 _vrfKeyHash)
        VRFConsumerBaseV2Plus(_vrfCoordinator)
    {
        if (_sofToken == address(0)) revert InvalidAddress();
        sofToken = IERC20(_sofToken);
        COORDINATOR = IVRFCoordinatorV2Plus(_vrfCoordinator);
        vrfSubscriptionId = _vrfSubscriptionId;
        vrfKeyHash = _vrfKeyHash;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SEASON_CREATOR_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
    }

    function setSeasonFactory(address _seasonFactoryAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(seasonFactory) != address(0)) revert FactoryNotSet();
        if (_seasonFactoryAddress == address(0)) revert InvalidAddress();
        seasonFactory = ISeasonFactory(_seasonFactoryAddress);
    }

    /**
     * @notice Set the raffle prize distributor contract
     */
    function setPrizeDistributor(address distributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (distributor == address(0)) revert InvalidAddress();
        prizeDistributor = distributor;
    }

    /**
     * @notice Update the default grand prize split (in basis points)
     */
    function setDefaultGrandPrizeBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > 10000) revert InvalidBasisPoints(bps);
        defaultGrandPrizeBps = bps;
    }

    /**
     * @notice Create a new season: deploy RaffleToken and SOFBondingCurve, grant roles, init curve.
     */
    function createSeason(
        RaffleTypes.SeasonConfig memory config,
        RaffleTypes.BondStep[] memory bondSteps,
        uint16 buyFeeBps,
        uint16 sellFeeBps
    ) external onlyRole(SEASON_CREATOR_ROLE) nonReentrant returns (uint256 seasonId) {
        if (address(seasonFactory) == address(0)) revert FactoryNotSet();
        if (bytes(config.name).length == 0) revert InvalidSeasonName();
        if (config.startTime <= block.timestamp) revert InvalidStartTime(config.startTime, block.timestamp);
        if (config.endTime <= config.startTime) revert InvalidEndTime(config.endTime, config.startTime);
        if (config.winnerCount == 0) revert InvalidWinnerCount(0);
        if (config.grandPrizeBps > 10000) revert InvalidBasisPoints(config.grandPrizeBps);
        if (config.treasuryAddress == address(0)) revert InvalidTreasuryAddress();
        if (bondSteps.length == 0) revert InvalidBondSteps();

        seasonId = ++currentSeasonId;

        (address raffleTokenAddr, address curveAddr) =
            seasonFactory.createSeasonContracts(seasonId, config, bondSteps, buyFeeBps, sellFeeBps);

        // Persist config
        config.raffleToken = raffleTokenAddr;
        config.bondingCurve = curveAddr;
        config.isActive = false;
        config.isCompleted = false;
        seasons[seasonId] = config;
        seasonStates[seasonId].status = SeasonStatus.NotStarted;

        // Allow the curve to call participant hooks
        _grantRole(BONDING_CURVE_ROLE, curveAddr);

        emit SeasonCreated(seasonId, config.name, config.startTime, config.endTime, raffleTokenAddr, curveAddr);
    }

    function startSeason(uint256 seasonId) external onlyRole(SEASON_CREATOR_ROLE) {
        if (seasonId == 0 || seasonId > currentSeasonId) revert SeasonNotFound(seasonId);
        if (seasons[seasonId].isActive) revert SeasonAlreadyStarted(seasonId);
        if (block.timestamp < seasons[seasonId].startTime) {
            revert SeasonNotEnded(seasonId, block.timestamp, seasons[seasonId].startTime);
        }
        if (block.timestamp >= seasons[seasonId].endTime) revert SeasonAlreadyEnded(seasonId);
        if (seasonStates[seasonId].status != SeasonStatus.NotStarted) {
            revert InvalidSeasonStatus(seasonId, uint8(seasonStates[seasonId].status), uint8(SeasonStatus.NotStarted));
        }

        seasons[seasonId].isActive = true;
        seasonStates[seasonId].status = SeasonStatus.Active;
        emit SeasonStarted(seasonId);
    }

    function requestSeasonEnd(uint256 seasonId) external onlyRole(SEASON_CREATOR_ROLE) {
        if (seasonId == 0 || seasonId > currentSeasonId) revert SeasonNotFound(seasonId);
        if (!seasons[seasonId].isActive) revert SeasonNotActive(seasonId);
        if (block.timestamp < seasons[seasonId].endTime) {
            revert SeasonNotEnded(seasonId, block.timestamp, seasons[seasonId].endTime);
        }
        if (seasonStates[seasonId].status != SeasonStatus.Active) {
            revert InvalidSeasonStatus(seasonId, uint8(seasonStates[seasonId].status), uint8(SeasonStatus.Active));
        }

        // Lock trading on curve
        SOFBondingCurve curve = SOFBondingCurve(seasons[seasonId].bondingCurve);
        curve.lockTrading();
        seasonStates[seasonId].totalPrizePool = curve.getSofReserves();
        seasons[seasonId].isActive = false;
        seasonStates[seasonId].status = SeasonStatus.EndRequested;
        emit SeasonLocked(seasonId);

        // VRF v2.5 request for winner selection (numWords == winnerCount)
        uint256 requestId = COORDINATOR.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit: vrfCallbackGasLimit,
                numWords: seasons[seasonId].winnerCount,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
                )
            })
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
        if (seasonId == 0 || seasonId > currentSeasonId) revert SeasonNotFound(seasonId);
        if (!seasons[seasonId].isActive) revert SeasonNotActive(seasonId);
        if (seasonStates[seasonId].status != SeasonStatus.Active) {
            revert InvalidSeasonStatus(seasonId, uint8(seasonStates[seasonId].status), uint8(SeasonStatus.Active));
        }

        // Lock trading on curve
        SOFBondingCurve curve = SOFBondingCurve(seasons[seasonId].bondingCurve);
        curve.lockTrading();
        seasonStates[seasonId].totalPrizePool = curve.getSofReserves();
        seasons[seasonId].isActive = false;
        seasonStates[seasonId].status = SeasonStatus.EndRequested;
        emit SeasonLocked(seasonId);

        // VRF v2.5 request for winner selection (numWords == winnerCount)
        uint256 requestId = COORDINATOR.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit: vrfCallbackGasLimit,
                numWords: seasons[seasonId].winnerCount,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
                )
            })
        );
        seasonStates[seasonId].vrfRequestId = requestId;
        seasonStates[seasonId].status = SeasonStatus.VRFPending;
        vrfRequestToSeason[requestId] = seasonId;
        emit SeasonEndRequested(seasonId, requestId);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        uint256 seasonId = vrfRequestToSeason[requestId];
        require(seasonId != 0, "Raffle: bad req");
        require(seasonStates[seasonId].status == SeasonStatus.VRFPending, "Raffle: bad status");

        SeasonState storage state = seasonStates[seasonId];
        delete state.vrfRandomWords;
        for (uint256 i = 0; i < randomWords.length; i++) {
            state.vrfRandomWords.push(randomWords[i]);
        }

        state.status = SeasonStatus.Distributing;
    }

    // Called by curve
    function recordParticipant(uint256 seasonId, address participant, uint256 ticketAmount)
        external
        onlyRole(BONDING_CURVE_ROLE)
    {
        require(seasons[seasonId].isActive, "Raffle: season inactive");
        
        SeasonState storage state = seasonStates[seasonId];
        ParticipantPosition storage pos = state.participantPositions[participant];
        uint256 oldTickets = pos.ticketCount;
        uint256 newTicketsLocal = oldTickets + ticketAmount;
        uint256 newTotalTickets = state.totalTickets + ticketAmount;
        
        // Update state
        if (!pos.isActive) {
            state.participants.push(participant);
            state.totalParticipants++;
            pos.entryBlock = block.number;
            pos.isActive = true;
            emit ParticipantAdded(seasonId, participant, ticketAmount, newTotalTickets);
        } else {
            emit ParticipantUpdated(seasonId, participant, newTicketsLocal, newTotalTickets);
        }
        pos.ticketCount = newTicketsLocal;
        pos.lastUpdateBlock = block.number;
        state.totalTickets = newTotalTickets;

        // Emit position update for backend listeners
        // Backend will listen to this event and trigger InfoFi market creation via Paymaster
        emit PositionUpdate(seasonId, participant, oldTickets, newTicketsLocal, state.totalTickets);
    }

    function removeParticipant(uint256 seasonId, address participant, uint256 ticketAmount)
        external
        onlyRole(BONDING_CURVE_ROLE)
    {
        require(seasons[seasonId].isActive, "Raffle: season inactive");
        SeasonState storage state = seasonStates[seasonId];
        ParticipantPosition storage pos = state.participantPositions[participant];
        require(pos.isActive, "Raffle: not active");
        require(pos.ticketCount >= ticketAmount, "Raffle: too much");
        
        // Calculate new values before state updates
        uint256 oldTickets = pos.ticketCount;
        uint256 newTickets = oldTickets - ticketAmount;
        uint256 newTotalTickets = state.totalTickets - ticketAmount;
        
        // Update state
        pos.ticketCount = newTickets;
        pos.lastUpdateBlock = block.number;
        state.totalTickets = newTotalTickets;

        if (newTickets == 0) {
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
        emit ParticipantRemoved(seasonId, participant, newTotalTickets);

        // Emit InfoFi position update for backend listeners
        emit PositionUpdate(seasonId, participant, oldTickets, newTickets, newTotalTickets);
    }

    // Views
    function getParticipants(uint256 seasonId) external view returns (address[] memory) {
        return seasonStates[seasonId].participants;
    }

    function getParticipantPosition(uint256 seasonId, address participant)
        external
        view
        returns (ParticipantPosition memory position)
    {
        return seasonStates[seasonId].participantPositions[participant];
    }

    function getParticipantNumberRange(uint256 seasonId, address participant)
        external
        view
        returns (uint256 start, uint256 end)
    {
        SeasonState storage state = seasonStates[seasonId];
        ParticipantPosition storage p = state.participantPositions[participant];
        if (!p.isActive) return (0, 0);
        uint256 cur = 1;
        for (uint256 i = 0; i < state.participants.length; i++) {
            address addr = state.participants[i];
            ParticipantPosition storage pos = state.participantPositions[addr];
            if (addr == participant) return (cur, cur + pos.ticketCount - 1);
            cur += pos.ticketCount;
        }
        return (0, 0);
    }

    function getSeasonDetails(uint256 seasonId)
        external
        view
        returns (
            RaffleTypes.SeasonConfig memory config,
            SeasonStatus status,
            uint256 totalParticipants,
            uint256 totalTickets,
            uint256 totalPrizePool
        )
    {
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

    /**
     * @notice Get the current active season ID
     * @return uint256 The current active season ID or 0 if no active season
     */
    function getCurrentSeason() external view returns (uint256) {
        for (uint256 i = currentSeasonId; i > 0; i--) {
            if (seasons[i].isActive) {
                return i;
            }
        }
        return 0; // No active season
    }

    /**
     * @notice Check if a season is active
     * @param seasonId The season ID to check
     * @return bool True if the season is active
     */
    function isSeasonActive(uint256 seasonId) external view returns (bool) {
        return seasons[seasonId].isActive;
    }

    /**
     * @notice Get the total tickets for a season
     * @param seasonId The season ID
     * @return uint256 The total tickets
     */
    function getTotalTickets(uint256 seasonId) external view returns (uint256) {
        return seasonStates[seasonId].totalTickets;
    }

    /**
     * @notice Get the player list for a season
     * @param seasonId The season ID
     * @return address[] The list of players
     */
    function getPlayerList(uint256 seasonId) external view returns (address[] memory) {
        return seasonStates[seasonId].participants;
    }

    /**
     * @notice Get the number range for a player in a season
     * @param seasonId The season ID
     * @param player The player address
     * @return startRange The start of the player's number range
     * @return endRange The end of the player's number range
     */
    function getNumberRange(uint256 seasonId, address player)
        external
        view
        returns (uint256 startRange, uint256 endRange)
    {
        // Calculate the player's number range based on their position in the participants array
        uint256 rangeStart = 0;
        address[] memory participants = seasonStates[seasonId].participants;

        for (uint256 i = 0; i < participants.length; i++) {
            if (participants[i] == player) {
                break;
            }
            ParticipantPosition memory prevPos = seasonStates[seasonId].participantPositions[participants[i]];
            rangeStart += prevPos.ticketCount;
        }

        ParticipantPosition memory pos = seasonStates[seasonId].participantPositions[player];
        startRange = rangeStart;
        endRange = rangeStart + pos.ticketCount;
        return (startRange, endRange);
    }

    /**
     * @notice Get the season winner
     * @param seasonId The season ID
     * @return address The winner address or address(0) if not determined yet
     */
    function getSeasonWinner(uint256 seasonId) external view returns (address) {
        if (seasonStates[seasonId].winners.length > 0) {
            return seasonStates[seasonId].winners[0];
        }
        return address(0);
    }

    /**
     * @notice Get the final player position after season completion
     * @param seasonId The season ID
     * @param player The player address
     * @return uint256 The final ticket count
     */
    function getFinalPlayerPosition(uint256 seasonId, address player) external view returns (uint256) {
        require(seasons[seasonId].isCompleted, "Raffle: season not completed");
        return seasonStates[seasonId].participantPositions[player].ticketCount;
    }

    function getVrfRequestForSeason(uint256 seasonId) external view returns (uint256) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        return seasonStates[seasonId].vrfRequestId;
    }

    // Admin
    function pauseSeason(uint256 seasonId) external onlyRole(EMERGENCY_ROLE) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        seasons[seasonId].isActive = false;
    }

    function updateVRFConfig(uint64 subscriptionId, bytes32 keyHash, uint32 callbackGasLimit)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        vrfSubscriptionId = subscriptionId;
        vrfKeyHash = keyHash;
        vrfCallbackGasLimit = callbackGasLimit;
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
    function setupPrizeDistributionManually(uint256 seasonId) external view onlyRole(DEFAULT_ADMIN_ROLE) {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        require(seasonStates[seasonId].status == SeasonStatus.Distributing, "Raffle: not distributing");

        // Deprecated: manual setup flow has been replaced by finalizeSeason
        revert("Raffle: use finalizeSeason");
    }

    function finalizeSeason(uint256 seasonId) external nonReentrant {
        require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season");
        SeasonState storage state = seasonStates[seasonId];
        RaffleTypes.SeasonConfig storage cfg = seasons[seasonId];
        require(state.status == SeasonStatus.Distributing, "Raffle: not ready");
        require(state.vrfRandomWords.length > 0, "Raffle: no vrf words");

        uint256 totalPrizePool = state.totalPrizePool;

        address[] memory winners = RaffleLogic._selectWinnersAddressBased(
            state,
            cfg.winnerCount,
            state.vrfRandomWords
        );
        state.winners = winners;

        emit WinnersSelected(seasonId, winners);

        // Compute pool splits
        require(prizeDistributor != address(0), "Raffle: distributor not set");

        // If there are no participants or no winners, we can still complete the
        // season but skip prize distribution logic that assumes a non-zero winner.
        if (state.totalParticipants == 0 || winners.length == 0 || totalPrizePool == 0) {
            cfg.isCompleted = true;
            state.status = SeasonStatus.Completed;
            emit PrizeDistributionSetup(seasonId, prizeDistributor);
            return;
        }

        uint16 grandBps = cfg.grandPrizeBps == 0 ? defaultGrandPrizeBps : cfg.grandPrizeBps;
        require(grandBps <= 10000, "Raffle: bad grand bps");
        uint256 grandAmount = (totalPrizePool * uint256(grandBps)) / 10000;
        uint256 consolationAmount = totalPrizePool - grandAmount;

        address grandWinner = winners.length > 0 ? winners[0] : address(0);
        require(grandWinner != address(0), "Raffle: winner zero");

        uint256 totalParticipants = state.totalParticipants;

        address curveAddr = cfg.bondingCurve;
        require(curveAddr != address(0), "Raffle: curve zero");

        IRafflePrizeDistributor(prizeDistributor).configureSeason(
            seasonId,
            address(sofToken),
            grandWinner,
            grandAmount,
            consolationAmount,
            totalParticipants
        );

        SOFBondingCurve(curveAddr).extractSof(prizeDistributor, totalPrizePool);

        IRafflePrizeDistributor(prizeDistributor).fundSeason(seasonId, totalPrizePool);

        cfg.isCompleted = true;
        state.status = SeasonStatus.Completed;
        emit PrizeDistributionSetup(seasonId, prizeDistributor);
    }

    // Merkle root function removed - consolation now uses direct claim

    function fundPrizeDistributor(uint256 seasonId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(prizeDistributor != address(0), "Raffle: distributor not set");
        SeasonState storage state = seasonStates[seasonId];
        uint256 totalPrizePool = state.totalPrizePool;
        IRafflePrizeDistributor(prizeDistributor).fundSeason(seasonId, totalPrizePool);
    }
}
