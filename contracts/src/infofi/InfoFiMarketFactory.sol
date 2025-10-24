// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "../lib/RaffleTypes.sol";
import "./RaffleOracleAdapter.sol";
import "./InfoFiFPMMV2.sol";

/**
 * @title InfoFiMarketFactory
 * @notice Auto-creates FPMM-based InfoFi markets when player crosses 1% threshold
 * @dev Integrates Gnosis CTF + FPMM for proper prediction market mechanics
 * 
 * V2 Changes (FPMM Migration):
 * - Replaced CSMM with SimpleFPMM (x * y = k invariant)
 * - Integrated Gnosis Conditional Token Framework via interfaces
 * - Added RaffleOracleAdapter for VRF-based resolution
 * - Automatic 100 SOF liquidity provision per market from treasury
 * - SOLP token rewards for liquidity providers
 * - 2% trading fee (100% to protocol treasury initially)
 */
contract InfoFiMarketFactory is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant BACKEND_ROLE = keccak256("BACKEND_ROLE");
    
    IRaffleRead public immutable raffle;
    IInfoFiPriceOracleMinimal public immutable oracle;
    RaffleOracleAdapter public immutable oracleAdapter;
    InfoFiFPMMV2 public immutable fpmmManager;
    IERC20 public immutable sofToken;
    
    address public treasury;
    
    uint256 public constant THRESHOLD_BPS = 100;
    uint256 public constant INITIAL_LIQUIDITY = 100e18;
    bytes32 public constant WINNER_PREDICTION = keccak256("WINNER_PREDICTION");
    
    mapping(uint256 => mapping(address => bool)) public marketCreated;
    mapping(uint256 => mapping(address => bytes32)) public playerConditions;
    mapping(uint256 => mapping(address => address)) public playerMarkets;
    mapping(uint256 => address[]) private _seasonPlayers;
    
    event MarketCreated(
        uint256 indexed seasonId,
        address indexed player,
        bytes32 indexed marketType,
        bytes32 conditionId,
        address fpmmAddress,
        uint256 probabilityBps
    );
    
    event ProbabilityUpdated(
        uint256 indexed seasonId,
        address indexed player,
        uint256 oldProbabilityBps,
        uint256 newProbabilityBps
    );
    
    event MarketCreationFailed(
        uint256 indexed seasonId,
        address indexed player,
        bytes32 indexed marketType,
        string reason
    );
    
    event SeasonMarketsResolved(
        uint256 indexed seasonId,
        address indexed winner,
        uint256 marketCount
    );
    
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    
    error InvalidAddress();
    error InsufficientTreasuryBalance();
    error MarketAlreadyCreated();
    error OnlyBackend();
    
    constructor(
        address _raffle,
        address _oracle,
        address _oracleAdapter,
        address _fpmmManager,
        address _sofToken,
        address _treasury,
        address _admin,
        address _backend
    ) {
        if (_raffle == address(0)) revert InvalidAddress();
        if (_oracle == address(0)) revert InvalidAddress();
        if (_oracleAdapter == address(0)) revert InvalidAddress();
        if (_fpmmManager == address(0)) revert InvalidAddress();
        if (_sofToken == address(0)) revert InvalidAddress();
        if (_treasury == address(0)) revert InvalidAddress();
        if (_admin == address(0)) revert InvalidAddress();
        if (_backend == address(0)) revert InvalidAddress();
        
        raffle = IRaffleRead(_raffle);
        oracle = IInfoFiPriceOracleMinimal(_oracle);
        oracleAdapter = RaffleOracleAdapter(_oracleAdapter);
        fpmmManager = InfoFiFPMMV2(_fpmmManager);
        sofToken = IERC20(_sofToken);
        treasury = _treasury;
        
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(TREASURY_ROLE, _treasury);
        _grantRole(BACKEND_ROLE, _backend);
    }
    
    function onPositionUpdate(
        uint256 seasonId,
        address player,
        uint256 oldTickets,
        uint256 newTickets,
        uint256 totalTickets
    ) external nonReentrant {
        // Only backend service can call this function
        if (!hasRole(BACKEND_ROLE, msg.sender)) {
            revert OnlyBackend();
        }
        
        if (player == address(0)) revert InvalidAddress();
        if (totalTickets == 0) return;
        
        uint256 oldBps = (oldTickets * 10000) / totalTickets;
        uint256 newBps = (newTickets * 10000) / totalTickets;
        
        emit ProbabilityUpdated(seasonId, player, oldBps, newBps);
        
        if (newBps >= THRESHOLD_BPS && oldBps < THRESHOLD_BPS && !marketCreated[seasonId][player]) {
            _createMarket(seasonId, player, newBps);
        }
    }
    
    function _createMarket(
        uint256 seasonId,
        address player,
        uint256 probabilityBps
    ) internal {
        if (sofToken.balanceOf(treasury) < INITIAL_LIQUIDITY) {
            emit MarketCreationFailed(
                seasonId,
                player,
                WINNER_PREDICTION,
                "Insufficient treasury balance"
            );
            return;
        }
        
        try this._createMarketInternal(seasonId, player, probabilityBps) {
            // Success
        } catch Error(string memory reason) {
            emit MarketCreationFailed(seasonId, player, WINNER_PREDICTION, reason);
        } catch {
            emit MarketCreationFailed(seasonId, player, WINNER_PREDICTION, "Unknown error");
        }
    }
    
    function _createMarketInternal(
        uint256 seasonId,
        address player,
        uint256 probabilityBps
    ) external {
        require(msg.sender == address(this), "Internal only");
        
        bytes32 conditionId = oracleAdapter.preparePlayerCondition(seasonId, player);
        
        require(
            sofToken.transferFrom(treasury, address(this), INITIAL_LIQUIDITY),
            "Treasury transfer failed"
        );
        
        sofToken.approve(address(fpmmManager), INITIAL_LIQUIDITY);
        
        (address fpmm, ) = fpmmManager.createMarket(seasonId, player, conditionId);
        
        marketCreated[seasonId][player] = true;
        playerConditions[seasonId][player] = conditionId;
        playerMarkets[seasonId][player] = fpmm;
        _seasonPlayers[seasonId].push(player);
        
        emit MarketCreated(
            seasonId,
            player,
            WINNER_PREDICTION,
            conditionId,
            fpmm,
            probabilityBps
        );
    }
    
    function resolveSeasonMarkets(
        uint256 seasonId,
        address winner
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(winner != address(0), "Winner zero address");
        
        address[] memory players = _seasonPlayers[seasonId];
        require(players.length > 0, "No markets to resolve");
        
        oracleAdapter.batchResolveSeasonMarkets(seasonId, players, winner);
        
        emit SeasonMarketsResolved(seasonId, winner, players.length);
    }
    
    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        if (newTreasury == address(0)) revert InvalidAddress();
        
        address oldTreasury = treasury;
        treasury = newTreasury;
        
        _revokeRole(TREASURY_ROLE, oldTreasury);
        _grantRole(TREASURY_ROLE, newTreasury);
        
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    function getSeasonPlayers(uint256 seasonId) external view returns (address[] memory) {
        return _seasonPlayers[seasonId];
    }
    
    function getPlayerMarket(
        uint256 seasonId,
        address player
    ) external view returns (
        bool created,
        bytes32 conditionId,
        address fpmmAddress
    ) {
        created = marketCreated[seasonId][player];
        conditionId = playerConditions[seasonId][player];
        fpmmAddress = playerMarkets[seasonId][player];
    }
    
    function getPlayerProbability(
        uint256 seasonId,
        address player
    ) external view returns (uint256 probabilityBps) {
        (, , , uint256 totalTickets, ) = raffle.getSeasonDetails(seasonId);
        
        if (totalTickets == 0) return 0;
        
        IRaffleRead.ParticipantPosition memory pos = raffle.getParticipantPosition(
            seasonId,
            player
        );
        
        probabilityBps = (pos.ticketCount * 10000) / totalTickets;
    }
}

interface IRaffleRead {
    enum SeasonStatus { NotStarted, Active, EndRequested, VRFPending, Distributing, Completed }

    struct ParticipantPosition {
        uint256 ticketCount;
        uint256 entryBlock;
        uint256 lastUpdateBlock;
        bool isActive;
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
        );

    function getParticipantPosition(uint256 seasonId, address participant)
        external
        view
        returns (ParticipantPosition memory position);
}

interface IInfoFiPriceOracleMinimal {
    function updateRaffleProbability(uint256 marketId, uint256 raffleProbabilityBps) external;
    function updateMarketSentiment(uint256 marketId, uint256 marketSentimentBps) external;
}
