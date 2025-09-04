// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/utils/Pausable.sol";

/// @dev Oracle surface for pushing sentiment and reading hybrid pricing for a given marketId
interface IInfoFiPriceOracle {
    function updateMarketSentiment(bytes32 marketId, uint256 marketSentimentBps) external;
    /// Returns (raffleProbabilityBps, marketSentimentBps, hybridPriceBps, lastUpdate, active)
    function getPrice(bytes32 marketId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            bool
        );
}

contract InfoFiMarket is AccessControl, ReentrancyGuard, Pausable {
    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Constants
    uint256 public constant MIN_BET_AMOUNT = 1000000000000000; // 0.001 tokens
    uint256 public constant MAX_BET_AMOUNT = 1000000000000000000000; // 1000 tokens
    bytes32 public constant WINNER_PREDICTION = keccak256("WINNER_PREDICTION");

    // Events
    event MarketCreated(uint256 indexed marketId, uint256 raffleId, string question);
    event BetPlaced(address indexed better, uint256 indexed marketId, bool prediction, uint256 amount);
    event MarketResolved(uint256 indexed marketId, bool outcome, uint256 totalYesPool, uint256 totalNoPool);
    event PayoutClaimed(address indexed better, uint256 amount);
    event OracleUpdated(bytes32 indexed marketKey, uint256 sentimentBps);

    // Structs
    struct MarketInfo {
        uint256 id;
        uint256 raffleId;
        string question;
        uint256 createdAt;
        uint256 resolvedAt;
        uint256 totalYesPool;
        uint256 totalNoPool;
        uint256 totalPool;
        bool resolved;
        bool outcome;
        address tokenAddress;
        address player;      // for per-player markets
        bytes32 marketKey;   // keccak256(raffleId, player, WINNER_PREDICTION)
    }

    struct BetInfo {
        bool prediction;
        uint256 amount;
        bool claimed;
        uint256 payout;
    }

    // State variables
    uint256 public nextMarketId;
    mapping(uint256 => MarketInfo) public markets;
    mapping(uint256 => mapping(address => BetInfo)) public bets;
    mapping(address => uint256[]) public betterMarkets;

    // Optional oracle (set by admin). When set, we will push sentiment to oracle on bets and read hybrid price
    IInfoFiPriceOracle public oracle;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    /**
     * @dev Create a new InfoFi market
     * @param raffleId ID of the associated raffle
     * @param player The primary player this market tracks (per-player market)
     * @param question The yes/no question for the market
     * @param tokenAddress Address of the ERC20 token used for betting
     */
    function createMarket(
        uint256 raffleId,
        address player,
        string memory question,
        address tokenAddress
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(bytes(question).length > 0, "InfoFiMarket: question cannot be empty");
        require(tokenAddress != address(0), "InfoFiMarket: invalid token address");
        require(player != address(0), "InfoFiMarket: player zero");

        uint256 marketId = nextMarketId++;
        bytes32 marketKey = keccak256(abi.encodePacked(raffleId, player, WINNER_PREDICTION));
        
        markets[marketId] = MarketInfo({
            id: marketId,
            raffleId: raffleId,
            question: question,
            createdAt: block.timestamp,
            resolvedAt: 0,
            totalYesPool: 0,
            totalNoPool: 0,
            totalPool: 0,
            resolved: false,
            outcome: false,
            tokenAddress: tokenAddress,
            player: player,
            marketKey: marketKey
        });

        emit MarketCreated(marketId, raffleId, question);
    }

    /**
     * @dev Place a bet on a market
     * @param marketId ID of the market
     * @param prediction True for yes, false for no
     * @param amount Amount to bet
     */
    function placeBet(
        uint256 marketId,
        bool prediction,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        MarketInfo storage market = markets[marketId];
        require(!market.resolved, "InfoFiMarket: market already resolved");
        require(amount >= MIN_BET_AMOUNT && amount <= MAX_BET_AMOUNT, "InfoFiMarket: invalid bet amount");

        IERC20 token = IERC20(market.tokenAddress);
        
        // Transfer tokens from better to contract
        require(token.transferFrom(msg.sender, address(this), amount), "InfoFiMarket: token transfer failed");

        // Update market pools
        if (prediction) {
            market.totalYesPool += amount;
        } else {
            market.totalNoPool += amount;
        }
        market.totalPool += amount;

        // Update bet info
        BetInfo storage bet = bets[marketId][msg.sender];
        if (bet.amount == 0) {
            // New bet
            betterMarkets[msg.sender].push(marketId);
        }
        
        bet.prediction = prediction;
        bet.amount += amount;

        emit BetPlaced(msg.sender, marketId, prediction, amount);

        // Push on-chain sentiment to oracle (if configured)
        _updateOracle(marketId);
    }

    /**
     * @dev Resolve a market with the outcome
     * @param marketId ID of the market
     * @param outcome True if yes, false if no
     */
    function resolveMarket(uint256 marketId, bool outcome) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        MarketInfo storage market = markets[marketId];
        require(!market.resolved, "InfoFiMarket: market already resolved");

        market.resolved = true;
        market.outcome = outcome;
        market.resolvedAt = block.timestamp;

        emit MarketResolved(marketId, outcome, market.totalYesPool, market.totalNoPool);
    }

    /**
     * @dev Claim payout for a winning bet
     * @param marketId ID of the market
     */
    function claimPayout(uint256 marketId) external nonReentrant whenNotPaused {
        MarketInfo storage market = markets[marketId];
        BetInfo storage bet = bets[marketId][msg.sender];
        
        require(market.resolved, "InfoFiMarket: market not resolved");
        require(bet.amount > 0, "InfoFiMarket: no bet placed");
        require(!bet.claimed, "InfoFiMarket: payout already claimed");
        require(bet.prediction == market.outcome, "InfoFiMarket: incorrect prediction");
        
        // Calculate payout
        uint256 winningPool = market.outcome ? market.totalYesPool : market.totalNoPool;
        uint256 payout = (bet.amount * market.totalPool) / winningPool;
        bet.payout = payout;
        bet.claimed = true;
        
        IERC20 token = IERC20(market.tokenAddress);
        require(token.transfer(msg.sender, payout), "InfoFiMarket: payout transfer failed");
        
        emit PayoutClaimed(msg.sender, payout);
    }

    /**
     * @dev Admin-only: set or update the oracle address used to publish sentiment
     */
    function setOracle(address oracleAddr) external onlyRole(ADMIN_ROLE) {
        oracle = IInfoFiPriceOracle(oracleAddr);
    }

    /**
     * @dev Compute and return market sentiment in basis points: yesPool / totalPool * 10000
     */
    function sentimentBps(uint256 marketId) public view returns (uint256) {
        MarketInfo storage market = markets[marketId];
        if (market.totalPool == 0) return 0;
        return (market.totalYesPool * 10000) / market.totalPool;
    }

    /**
     * @dev View: return the current YES price in bps as the oracle's hybrid price for this market.
     * Falls back to local sentiment if oracle is unset.
     */
    function getYesPriceBps(uint256 marketId) public view returns (uint256) {
        MarketInfo storage market = markets[marketId];
        if (address(oracle) == address(0)) {
            // Fallback to current sentiment ratio if oracle not configured
            return sentimentBps(marketId);
        }
        ( , , uint256 hybridPriceBps, , bool active) = oracle.getPrice(market.marketKey);
        // If oracle hasn't marked this market active yet, expose 0 to signal unavailable
        return active ? hybridPriceBps : 0;
    }

    /**
     * @dev View: reference real on-chain data (oracle + local pools) for a quote-like snapshot.
     * No simulation or pricing math here.
     */
    function quote(uint256 marketId)
        external
        view
        returns (
            uint256 yesPriceBps,
            uint256 raffleProbabilityBps,
            uint256 marketSentimentOracleBps,
            uint256 lastUpdate,
            uint256 totalYesPool,
            uint256 totalNoPool,
            uint256 totalPool,
            bool active
        )
    {
        MarketInfo storage market = markets[marketId];
        uint256 raffleBps;
        uint256 oracleSentimentBps;
        uint256 hybridBps;
        uint256 ts;
        bool isActive;

        if (address(oracle) != address(0)) {
            (raffleBps, oracleSentimentBps, hybridBps, ts, isActive) = oracle.getPrice(market.marketKey);
        }

        return (
            isActive ? hybridBps : 0,
            raffleBps,
            oracleSentimentBps,
            ts,
            market.totalYesPool,
            market.totalNoPool,
            market.totalPool,
            isActive
        );
    }

    /**
     * @dev Internal helper to push latest sentiment to oracle for this market
     */
    function _updateOracle(uint256 marketId) internal {
        if (address(oracle) == address(0)) return; // optional wiring
        MarketInfo storage market = markets[marketId];
        uint256 sBps = sentimentBps(marketId);
        oracle.updateMarketSentiment(market.marketKey, sBps);
        emit OracleUpdated(market.marketKey, sBps);
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Get market information
     * @param marketId ID of the market
     * @return MarketInfo
     */
    function getMarket(uint256 marketId) external view returns (MarketInfo memory) {
        return markets[marketId];
    }

    /**
     * @dev Get bet information
     * @param marketId ID of the market
     * @param better Address of the better
     * @return BetInfo
     */
    function getBet(uint256 marketId, address better) external view returns (BetInfo memory) {
        return bets[marketId][better];
    }

    /**
     * @dev Get markets a better has participated in
     * @param better Address of the better
     * @return Array of market IDs
     */
    function getBetterMarkets(address better) external view returns (uint256[] memory) {
        return betterMarkets[better];
    }
}