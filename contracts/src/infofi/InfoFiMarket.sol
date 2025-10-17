// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/utils/Pausable.sol";

/// @dev Oracle surface for pushing sentiment and reading hybrid pricing for a given marketId
interface IInfoFiPriceOracle {
    function updateMarketSentiment(uint256 marketId, uint256 marketSentimentBps) external;
    /// Returns (raffleProbabilityBps, marketSentimentBps, hybridPriceBps, lastUpdate, active)
    function getPrice(uint256 marketId)
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
    event MarketLocked(uint256 indexed marketId, uint256 indexed raffleId);
    event PayoutClaimed(address indexed better, uint256 indexed marketId, bool prediction, uint256 amount);
    event OracleUpdated(uint256 indexed marketId, uint256 sentimentBps);

    // Structs
    struct MarketInfo {
        uint256 id;
        uint256 raffleId;
        string question;
        uint256 createdAt;
        uint256 resolvedAt;
        bool locked; // when true, no further bets can be placed
        uint256 totalYesPool;
        uint256 totalNoPool;
        uint256 totalPool;
        bool resolved;
        bool outcome; // true = YES wins, false = NO wins
        address tokenAddress; // ERC20 used for betting
        address player;      // for per-player markets
    }

    struct BetInfo {
        bool prediction;
        uint256 amount;
        bool claimed;
        uint256 payout;
    }

    /**
     * @dev Struct for batch claim requests
     */
    struct ClaimRequest {
        uint256 marketId;
        bool prediction;
    }

    // State variables
    uint256 public nextMarketId;
    mapping(uint256 => MarketInfo) public markets;
    // Index markets by raffle for bulk locking at season end
    mapping(uint256 => uint256[]) public marketsByRaffle;
    // Allow hedging: a bettor can hold independent YES and NO positions per market
    mapping(uint256 => mapping(address => mapping(bool => BetInfo))) public bets;
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
     * @param token Address of the ERC20 token used for betting
     */
    function createMarket(
        uint256 raffleId,
        address player,
        string calldata question,
        address token
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused returns (uint256 marketId) {
        require(bytes(question).length > 0, "InfoFiMarket: question cannot be empty");
        require(token != address(0), "InfoFiMarket: invalid token address");
        require(player != address(0), "InfoFiMarket: player zero");

        marketId = nextMarketId++;
        
        markets[marketId] = MarketInfo({
            id: marketId,
            raffleId: raffleId,
            question: question,
            createdAt: block.timestamp,
            resolvedAt: 0,
            locked: false,
            totalYesPool: 0,
            totalNoPool: 0,
            totalPool: 0,
            resolved: false,
            outcome: false,
            tokenAddress: token,
            player: player
        });

        marketsByRaffle[raffleId].push(marketId);

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
        require(!market.resolved, "InfoFiMarket: market resolved");
        require(!market.locked, "InfoFiMarket: market locked");
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

        // Update bet info per outcome (hedging supported)
        BetInfo storage bet = bets[marketId][msg.sender][prediction];
        if (bet.amount == 0) {
            // Only push marketId once per bettor (first-ever position across both outcomes)
            BetInfo storage other = bets[marketId][msg.sender][!prediction];
            if (other.amount == 0) {
                betterMarkets[msg.sender].push(marketId);
            }
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
        require(!market.resolved, "InfoFiMarket: already resolved");
        market.resolved = true;
        market.outcome = outcome;
        market.resolvedAt = block.timestamp;

        emit MarketResolved(marketId, outcome, market.totalYesPool, market.totalNoPool);
    }

    /**
     * @dev Lock all markets for a raffle (season end). Prevents new bets while allowing claims post-resolution.
     */
    function lockMarketsForRaffle(uint256 raffleId) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        uint256[] storage ids = marketsByRaffle[raffleId];
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 mid = ids[i];
            MarketInfo storage m = markets[mid];
            if (!m.locked) {
                m.locked = true;
                emit MarketLocked(mid, raffleId);
            }
        }
    }

    /**
     * @dev Emergency fallback to lock all markets for a raffle by scanning all created markets.
     * Use this if marketsByRaffle indexing is unavailable in a given environment.
     */
    function emergencyLockAll(uint256 raffleId) external onlyRole(ADMIN_ROLE) whenNotPaused {
        uint256 maxId = nextMarketId;
        for (uint256 mid = 0; mid < maxId; mid++) {
            MarketInfo storage m = markets[mid];
            if (m.raffleId == raffleId && !m.locked) {
                m.locked = true;
                emit MarketLocked(mid, raffleId);
            }
        }
    }

    /**
     * @dev Claim payout for a winning bet
     * @param marketId ID of the market
     */
    function claimPayout(uint256 marketId, bool prediction) external nonReentrant whenNotPaused {
        MarketInfo storage market = markets[marketId];
        BetInfo storage bet = bets[marketId][msg.sender][prediction];
        
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
        
        emit PayoutClaimed(msg.sender, marketId, prediction, payout);
    }

    /**
     * @dev Backward-compatible wrapper: claims winning-side payout if bettor participated on that side
     */
    function claimPayout(uint256 marketId) external nonReentrant whenNotPaused {
        MarketInfo storage market = markets[marketId];
        require(market.resolved, "InfoFiMarket: market not resolved");
        bool winning = market.outcome;
        BetInfo storage bet = bets[marketId][msg.sender][winning];
        require(bet.amount > 0, "InfoFiMarket: no winning-side bet");
        require(!bet.claimed, "InfoFiMarket: payout already claimed");
        
        // Calculate payout
        uint256 winningPool = winning ? market.totalYesPool : market.totalNoPool;
        uint256 payout = (bet.amount * market.totalPool) / winningPool;
        bet.payout = payout;
        bet.claimed = true;
        
        IERC20 token = IERC20(market.tokenAddress);
        require(token.transfer(msg.sender, payout), "InfoFiMarket: payout transfer failed");
        
        emit PayoutClaimed(msg.sender, marketId, winning, payout);
    }

    /**
     * @dev Calculate potential payout for a bet without claiming
     * @param marketId ID of the market
     * @param better Address of the better
     * @param prediction Which side (true=YES, false=NO)
     * @return payout Potential payout amount (0 if not winning or already claimed)
     */
    function calculatePayout(
        uint256 marketId,
        address better,
        bool prediction
    ) external view returns (uint256 payout) {
        MarketInfo storage market = markets[marketId];
        BetInfo storage bet = bets[marketId][better][prediction];
        
        // Return 0 if market not resolved, no bet, already claimed, or wrong side
        if (!market.resolved || bet.amount == 0 || bet.claimed || bet.prediction != market.outcome) {
            return 0;
        }
        
        // Zero-division protection
        uint256 winningPool = market.outcome ? market.totalYesPool : market.totalNoPool;
        if (winningPool == 0) return 0;
        
        // Calculate payout using same formula as claimPayout
        payout = (bet.amount * market.totalPool) / winningPool;
        
        // Cap at total pool (sanity check)
        if (payout > market.totalPool) {
            payout = market.totalPool;
        }
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
        if (address(oracle) == address(0)) {
            // Fallback to current sentiment ratio if oracle not configured
            return sentimentBps(marketId);
        }
        ( , , uint256 hybridPriceBps, , bool active) = oracle.getPrice(marketId);
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
            (raffleBps, oracleSentimentBps, hybridBps, ts, isActive) = oracle.getPrice(marketId);
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
        uint256 sBps = sentimentBps(marketId);
        oracle.updateMarketSentiment(marketId, sBps);
        emit OracleUpdated(marketId, sBps);
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
    // Backward compatible aggregate view: returns the winning-side bet if market is resolved,
    // otherwise returns the YES-side bet (or NO-side if YES empty). Prefer using the 3-arg getter.
    function getBet(uint256 marketId, address better) external view returns (BetInfo memory) {
        MarketInfo storage market = markets[marketId];
        BetInfo storage yesBet = bets[marketId][better][true];
        BetInfo storage noBet = bets[marketId][better][false];
        if (market.resolved) {
            return market.outcome ? yesBet : noBet;
        }
        return yesBet.amount > 0 ? yesBet : noBet;
    }

    function getBet(
        uint256 marketId,
        address better,
        bool prediction
    ) external view returns (BetInfo memory) {
        return bets[marketId][better][prediction];
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