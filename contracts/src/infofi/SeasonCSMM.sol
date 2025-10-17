// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/**
 * @title SeasonCSMM
 * @notice Constant Sum Market Maker for pseudo-categorical prediction markets
 * @dev One instance per season, manages all player markets with YES + NO = 10 SOF invariant
 * 
 * Architecture:
 * - Pseudo-categorical: Each player is an outcome in the season
 * - Each outcome has YES/NO reserves with x + y = 10 SOF
 * - Shared liquidity pool across all player markets
 * - Trading in one market affects others through shared pool
 * 
 * Key formulas:
 * - Constant sum: x + y = 10 (per player market)
 * - Price: P(YES) = (10 - x) / 10 = y / 10
 * - Complete set: 1 YES + 1 NO = 10 SOF (redeemable)
 */
contract SeasonCSMM is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    
    // Constants
    uint256 public constant COMPLETE_SET_VALUE = 10e18; // 10 SOF
    uint256 public constant PRECISION = 1e18;
    
    // Season parameters
    uint256 public immutable seasonId;
    uint256 public totalLiquidity; // Total SOF in pool
    IERC20 public immutable collateralToken; // SOF token
    
    // Per-player market state
    struct PlayerMarket {
        uint256 yesReserve;  // YES token reserve (0 to 10 SOF)
        uint256 noReserve;   // NO token reserve (0 to 10 SOF)
        bool isActive;       // Market active flag
        bool isResolved;     // Market resolved flag
        bool outcome;        // Resolution outcome (true = YES won)
    }
    
    mapping(uint256 => PlayerMarket) public playerMarkets; // playerId => market
    uint256[] public activePlayerIds; // Track all active players
    
    // Position tracking (user => playerId => outcome => amount)
    mapping(address => mapping(uint256 => mapping(bool => uint256))) public positions;
    
    // Fee configuration
    address public treasury;
    uint256 public constant FEE_BASIS_POINTS = 200; // 2% on winnings
    
    event MarketCreated(uint256 indexed playerId, uint256 yesReserve, uint256 noReserve);
    event SharesPurchased(address indexed user, uint256 indexed playerId, bool isYes, uint256 amount, uint256 cost);
    event SharesSold(address indexed user, uint256 indexed playerId, bool isYes, uint256 amount, uint256 revenue);
    event MarketResolved(uint256 indexed playerId, bool outcome);
    event PayoutClaimed(address indexed user, uint256 indexed playerId, uint256 grossPayout, uint256 fee, uint256 netPayout);
    
    error MarketNotActive();
    error MarketAlreadyResolved();
    error InsufficientReserve();
    error SlippageExceeded();
    error InsufficientShares();
    error TransferFailed();
    error InvariantViolated();
    error ZeroAmount();
    error NoWinningShares();
    
    constructor(
        uint256 _seasonId,
        address _collateralToken,
        address _treasury,
        address _initialAdmin
    ) {
        seasonId = _seasonId;
        collateralToken = IERC20(_collateralToken);
        treasury = _treasury;
        
        _grantRole(ADMIN_ROLE, _initialAdmin);
        _grantRole(FACTORY_ROLE, msg.sender); // Factory can create markets
    }
    
    /**
     * @notice Create a new player market with 10 SOF liquidity (5 YES + 5 NO)
     * @param playerId Unique player identifier
     */
    function createPlayerMarket(uint256 playerId) 
        external 
        onlyRole(FACTORY_ROLE) 
    {
        if (playerMarkets[playerId].isActive) revert MarketNotActive();
        
        // Initialize with 5 YES + 5 NO = 10 SOF (50% price)
        uint256 halfSet = COMPLETE_SET_VALUE / 2;
        
        playerMarkets[playerId] = PlayerMarket({
            yesReserve: halfSet,
            noReserve: halfSet,
            isActive: true,
            isResolved: false,
            outcome: false
        });
        
        activePlayerIds.push(playerId);
        totalLiquidity += COMPLETE_SET_VALUE;
        
        emit MarketCreated(playerId, halfSet, halfSet);
    }
    
    /**
     * @notice Get current price for YES or NO outcome
     * @param playerId Player market identifier
     * @param isYes True for YES price, false for NO price
     * @return price Price in basis points (0-10000 = 0%-100%)
     */
    function getPrice(uint256 playerId, bool isYes) 
        public 
        view 
        returns (uint256 price) 
    {
        PlayerMarket memory market = playerMarkets[playerId];
        if (!market.isActive) revert MarketNotActive();
        
        // Price = reserve / COMPLETE_SET_VALUE
        // P(YES) = noReserve / 10, P(NO) = yesReserve / 10
        if (isYes) {
            price = (market.noReserve * 10000) / COMPLETE_SET_VALUE;
        } else {
            price = (market.yesReserve * 10000) / COMPLETE_SET_VALUE;
        }
    }
    
    /**
     * @notice Calculate cost to buy shares
     * @param playerId Player market identifier
     * @param isYes True to buy YES, false to buy NO
     * @param amount Number of shares to buy (in wei, 1e18 = 1 share)
     * @return cost Cost in collateral tokens
     */
    function calcBuyCost(uint256 playerId, bool isYes, uint256 amount) 
        public 
        view 
        returns (uint256 cost) 
    {
        PlayerMarket memory market = playerMarkets[playerId];
        if (!market.isActive) revert MarketNotActive();
        if (amount == 0) revert ZeroAmount();
        
        // In CSMM: cost = amount (linear pricing)
        // But we need to ensure reserves don't go negative
        if (isYes) {
            if (market.yesReserve < amount) revert InsufficientReserve();
        } else {
            if (market.noReserve < amount) revert InsufficientReserve();
        }
        
        cost = amount;
    }
    
    /**
     * @notice Buy outcome shares
     * @param playerId Player market identifier
     * @param isYes True to buy YES, false to buy NO
     * @param amount Number of shares to buy (in wei)
     * @param maxCost Maximum cost willing to pay (slippage protection)
     * @return cost Actual cost paid
     */
    function buyShares(
        uint256 playerId, 
        bool isYes, 
        uint256 amount,
        uint256 maxCost
    ) 
        external 
        nonReentrant 
        returns (uint256 cost) 
    {
        cost = calcBuyCost(playerId, isYes, amount);
        if (cost > maxCost) revert SlippageExceeded();
        
        // Transfer collateral from user
        if (!collateralToken.transferFrom(msg.sender, address(this), cost)) {
            revert TransferFailed();
        }
        
        // Update reserves (CSMM: x + y = 10)
        PlayerMarket storage market = playerMarkets[playerId];
        if (isYes) {
            market.yesReserve -= amount;
            market.noReserve += amount;
        } else {
            market.noReserve -= amount;
            market.yesReserve += amount;
        }
        
        // Verify invariant: x + y = 10 SOF
        if (market.yesReserve + market.noReserve != COMPLETE_SET_VALUE) {
            revert InvariantViolated();
        }
        
        // Update user position
        positions[msg.sender][playerId][isYes] += amount;
        
        emit SharesPurchased(msg.sender, playerId, isYes, amount, cost);
    }
    
    /**
     * @notice Calculate revenue from selling shares
     * @param playerId Player market identifier
     * @param isYes True to sell YES, false to sell NO
     * @param amount Number of shares to sell (in wei)
     * @return revenue Revenue in collateral tokens
     */
    function calcSellRevenue(uint256 playerId, bool isYes, uint256 amount) 
        public 
        view 
        returns (uint256 revenue) 
    {
        PlayerMarket memory market = playerMarkets[playerId];
        if (!market.isActive) revert MarketNotActive();
        if (amount == 0) revert ZeroAmount();
        
        // In CSMM: revenue = amount (linear pricing)
        // But we need to ensure reserves don't exceed 10 SOF
        if (isYes) {
            if (market.yesReserve + amount > COMPLETE_SET_VALUE) revert InsufficientReserve();
        } else {
            if (market.noReserve + amount > COMPLETE_SET_VALUE) revert InsufficientReserve();
        }
        
        revenue = amount;
    }
    
    /**
     * @notice Sell outcome shares
     * @param playerId Player market identifier
     * @param isYes True to sell YES, false to sell NO
     * @param amount Number of shares to sell (in wei)
     * @param minRevenue Minimum revenue to accept (slippage protection)
     * @return revenue Actual revenue received
     */
    function sellShares(
        uint256 playerId, 
        bool isYes, 
        uint256 amount,
        uint256 minRevenue
    ) 
        external 
        nonReentrant 
        returns (uint256 revenue) 
    {
        if (positions[msg.sender][playerId][isYes] < amount) revert InsufficientShares();
        
        revenue = calcSellRevenue(playerId, isYes, amount);
        if (revenue < minRevenue) revert SlippageExceeded();
        
        // Update reserves (CSMM: x + y = 10)
        PlayerMarket storage market = playerMarkets[playerId];
        if (isYes) {
            market.yesReserve += amount;
            market.noReserve -= amount;
        } else {
            market.noReserve += amount;
            market.yesReserve -= amount;
        }
        
        // Verify invariant
        if (market.yesReserve + market.noReserve != COMPLETE_SET_VALUE) {
            revert InvariantViolated();
        }
        
        // Update user position
        positions[msg.sender][playerId][isYes] -= amount;
        
        // Transfer revenue to user
        if (!collateralToken.transfer(msg.sender, revenue)) revert TransferFailed();
        
        emit SharesSold(msg.sender, playerId, isYes, amount, revenue);
    }
    
    /**
     * @notice Claim payout after market resolution
     * @param playerId Player market identifier
     */
    function claimPayout(uint256 playerId) 
        external 
        nonReentrant 
    {
        PlayerMarket storage market = playerMarkets[playerId];
        if (market.isActive) revert MarketNotActive();
        if (!market.isResolved) revert MarketNotActive();
        
        // Get user's winning shares
        uint256 winningShares = positions[msg.sender][playerId][market.outcome];
        if (winningShares == 0) revert NoWinningShares();
        
        // In CSMM with complete set value of 10 SOF:
        // 1 winning share = 10 SOF payout
        uint256 grossPayout = winningShares;
        
        // Apply 2% fee on winnings
        uint256 fee = (grossPayout * FEE_BASIS_POINTS) / 10000;
        uint256 netPayout = grossPayout - fee;
        
        // Clear position
        positions[msg.sender][playerId][market.outcome] = 0;
        
        // Transfer fee to treasury
        if (fee > 0) {
            if (!collateralToken.transfer(treasury, fee)) revert TransferFailed();
        }
        
        // Transfer net payout to user
        if (!collateralToken.transfer(msg.sender, netPayout)) revert TransferFailed();
        
        emit PayoutClaimed(msg.sender, playerId, grossPayout, fee, netPayout);
    }
    
    /**
     * @notice Resolve market (called by factory after raffle resolution)
     * @param playerId Player market identifier
     * @param outcome True if player won, false if player lost
     */
    function resolveMarket(uint256 playerId, bool outcome) 
        external 
        onlyRole(FACTORY_ROLE) 
    {
        PlayerMarket storage market = playerMarkets[playerId];
        if (!market.isActive) revert MarketNotActive();
        if (market.isResolved) revert MarketAlreadyResolved();
        
        market.isActive = false;
        market.isResolved = true;
        market.outcome = outcome;
        
        emit MarketResolved(playerId, outcome);
    }
    
    /**
     * @notice Get user's position in a market
     * @param user User address
     * @param playerId Player market identifier
     * @return yesShares Number of YES shares (in wei)
     * @return noShares Number of NO shares (in wei)
     */
    function getUserPosition(address user, uint256 playerId) 
        external 
        view 
        returns (uint256 yesShares, uint256 noShares) 
    {
        yesShares = positions[user][playerId][true];
        noShares = positions[user][playerId][false];
    }
    
    /**
     * @notice Get total number of active markets
     */
    function getActiveMarketCount() external view returns (uint256) {
        return activePlayerIds.length;
    }
    
    /**
     * @notice Get market state
     */
    function getMarketState(uint256 playerId) 
        external 
        view 
        returns (
            uint256 yesReserve,
            uint256 noReserve,
            bool isActive,
            bool isResolved,
            bool outcome
        ) 
    {
        PlayerMarket memory market = playerMarkets[playerId];
        return (
            market.yesReserve,
            market.noReserve,
            market.isActive,
            market.isResolved,
            market.outcome
        );
    }
}
