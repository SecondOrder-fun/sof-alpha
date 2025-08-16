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
import "../lib/ISeasonFactory.sol";
import "../lib/RaffleTypes.sol";

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
    uint32 public vrfCallbackGasLimit = 100000;
    uint16 public constant VRF_REQUEST_CONFIRMATIONS = 3;

    // Core
    IERC20 public immutable sofToken;
    ISeasonFactory public seasonFactory;

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
        SOFBondingCurve(seasons[seasonId].bondingCurve).lockTrading();
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
        SOFBondingCurve(seasons[seasonId].bondingCurve).lockTrading();
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

        // Prize pool from curve reserves
        uint256 totalPrizePool = SOFBondingCurve(seasons[seasonId].bondingCurve).getSofReserves();
        seasonStates[seasonId].totalPrizePool = totalPrizePool;

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
        if (!pos.isActive) {
            state.participants.push(participant);
            state.totalParticipants++;
            pos.entryBlock = block.number;
            pos.isActive = true;
            emit ParticipantAdded(seasonId, participant, ticketAmount, state.totalTickets + ticketAmount);
        } else {
            emit ParticipantUpdated(seasonId, participant, pos.ticketCount + ticketAmount, state.totalTickets + ticketAmount);
        }
        pos.ticketCount += ticketAmount;
        pos.lastUpdateBlock = block.number;
        state.totalTickets += ticketAmount;
    }

    function removeParticipant(uint256 seasonId, address participant, uint256 ticketAmount) external onlyRole(BONDING_CURVE_ROLE) {
        require(seasons[seasonId].isActive, "Raffle: season inactive");
        SeasonState storage state = seasonStates[seasonId];
        ParticipantPosition storage pos = state.participantPositions[participant];
        require(pos.isActive, "Raffle: not active");
        require(pos.ticketCount >= ticketAmount, "Raffle: too much");

        pos.ticketCount -= ticketAmount;
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

    // Admin
    function pauseSeason(uint256 seasonId) external onlyRole(EMERGENCY_ROLE) { require(seasonId != 0 && seasonId <= currentSeasonId, "Raffle: no season"); seasons[seasonId].isActive = false; }

    function updateVRFConfig(uint64 subscriptionId, bytes32 keyHash, uint32 callbackGasLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        vrfSubscriptionId = subscriptionId; vrfKeyHash = keyHash; vrfCallbackGasLimit = callbackGasLimit;
    }

    // Internals
    function _setupPrizeDistribution(uint256 seasonId, address[] memory /*winners*/, uint256 /*totalPrizePool*/) internal {
        seasons[seasonId].isCompleted = true; seasonStates[seasonId].status = SeasonStatus.Completed; emit PrizeDistributionSetup(seasonId, address(0));
    }
}