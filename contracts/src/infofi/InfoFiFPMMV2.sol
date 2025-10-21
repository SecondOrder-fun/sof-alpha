// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IConditionalTokens.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SOLPToken
 * @notice SecondOrder Liquidity Provider token for FPMM markets
 */
contract SOLPToken is ERC20 {
    address public immutable market;
    
    constructor(
        uint256 seasonId,
        address player
    ) ERC20(
        string(abi.encodePacked("SOLP-S", _uint2str(seasonId), "-", _addressToString(player))),
        "SOLP"
    ) {
        market = msg.sender;
    }
    
    function mint(address to, uint256 amount) external {
        require(msg.sender == market, "Only market");
        _mint(to, amount);
    }
    
    function burn(address from, uint256 amount) external {
        require(msg.sender == market, "Only market");
        _burn(from, amount);
    }
    
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
    
    function _addressToString(address _addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(_addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(8);
        for (uint256 i = 0; i < 4; i++) {
            str[i*2] = alphabet[uint8(value[i] >> 4)];
            str[1+i*2] = alphabet[uint8(value[i] & 0x0f)];
        }
        return string(str);
    }
}

/**
 * @title SimpleFPMM
 * @notice Simplified Fixed Product Market Maker for binary outcomes
 * @dev Implements x * y = k invariant for YES/NO markets
 */
contract SimpleFPMM is ERC20, ReentrancyGuard {
    IERC20 public immutable collateralToken;
    IConditionalTokens public immutable conditionalTokens;
    bytes32 public immutable conditionId;
    
    uint256 public yesReserve;
    uint256 public noReserve;
    uint256 public constant FEE_BPS = 200; // 2%
    uint256 public feesCollected;
    
    address public treasury;
    
    event LiquidityAdded(address indexed provider, uint256 amount, uint256 lpTokens);
    event LiquidityRemoved(address indexed provider, uint256 lpTokens, uint256 amount);
    event Trade(address indexed trader, bool buyYes, uint256 amountIn, uint256 amountOut);
    
    constructor(
        address _collateralToken,
        address _conditionalTokens,
        bytes32 _conditionId,
        address _treasury,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        collateralToken = IERC20(_collateralToken);
        conditionalTokens = IConditionalTokens(_conditionalTokens);
        conditionId = _conditionId;
        treasury = _treasury;
    }
    
    /**
     * @notice Add liquidity to the pool
     * @param amount Amount of collateral to add
     * @return lpTokens Amount of LP tokens minted
     */
    function addLiquidity(uint256 amount) external nonReentrant returns (uint256 lpTokens) {
        require(amount > 0, "Zero amount");
        
        // Transfer collateral from user
        require(
            collateralToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        if (totalSupply() == 0) {
            // Initial liquidity: split 50/50
            yesReserve = amount / 2;
            noReserve = amount - yesReserve;
            lpTokens = amount;
        } else {
            // Proportional liquidity
            uint256 totalReserves = yesReserve + noReserve;
            lpTokens = (amount * totalSupply()) / totalReserves;
            
            uint256 yesAdd = (amount * yesReserve) / totalReserves;
            uint256 noAdd = amount - yesAdd;
            
            yesReserve += yesAdd;
            noReserve += noAdd;
        }
        
        _mint(msg.sender, lpTokens);
        
        emit LiquidityAdded(msg.sender, amount, lpTokens);
    }
    
    /**
     * @notice Remove liquidity from the pool
     * @param lpTokens Amount of LP tokens to burn
     * @return amount Amount of collateral returned
     */
    function removeLiquidity(uint256 lpTokens) external nonReentrant returns (uint256 amount) {
        require(lpTokens > 0, "Zero amount");
        require(balanceOf(msg.sender) >= lpTokens, "Insufficient balance");
        
        uint256 totalReserves = yesReserve + noReserve;
        amount = (lpTokens * totalReserves) / totalSupply();
        
        uint256 yesRemove = (lpTokens * yesReserve) / totalSupply();
        uint256 noRemove = (lpTokens * noReserve) / totalSupply();
        
        yesReserve -= yesRemove;
        noReserve -= noRemove;
        
        _burn(msg.sender, lpTokens);
        
        require(
            collateralToken.transfer(msg.sender, amount),
            "Transfer failed"
        );
        
        emit LiquidityRemoved(msg.sender, lpTokens, amount);
    }
    
    /**
     * @notice Buy YES or NO outcome tokens
     * @param buyYes True to buy YES, false to buy NO
     * @param amountIn Amount of collateral to spend
     * @param minAmountOut Minimum outcome tokens to receive (slippage protection)
     * @return amountOut Amount of outcome tokens received
     */
    function buy(
        bool buyYes,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Zero amount");
        
        // Calculate fee
        uint256 fee = (amountIn * FEE_BPS) / 10000;
        uint256 amountInAfterFee = amountIn - fee;
        feesCollected += fee;
        
        // Calculate output using x * y = k
        if (buyYes) {
            // Buying YES means selling NO reserve
            uint256 k = yesReserve * noReserve;
            uint256 newNoReserve = noReserve + amountInAfterFee;
            uint256 newYesReserve = k / newNoReserve;
            amountOut = yesReserve - newYesReserve;
            
            yesReserve = newYesReserve;
            noReserve = newNoReserve;
        } else {
            // Buying NO means selling YES reserve
            uint256 k = yesReserve * noReserve;
            uint256 newYesReserve = yesReserve + amountInAfterFee;
            uint256 newNoReserve = k / newYesReserve;
            amountOut = noReserve - newNoReserve;
            
            yesReserve = newYesReserve;
            noReserve = newNoReserve;
        }
        
        require(amountOut >= minAmountOut, "Slippage exceeded");
        
        // Transfer collateral from user
        require(
            collateralToken.transferFrom(msg.sender, address(this), amountIn),
            "Transfer failed"
        );
        
        emit Trade(msg.sender, buyYes, amountIn, amountOut);
    }
    
    /**
     * @notice Calculate buy amount for given input
     * @param buyYes True for YES, false for NO
     * @param amountIn Amount of collateral to spend
     * @return amountOut Amount of outcome tokens to receive
     */
    function calcBuyAmount(
        bool buyYes,
        uint256 amountIn
    ) external view returns (uint256 amountOut) {
        uint256 fee = (amountIn * FEE_BPS) / 10000;
        uint256 amountInAfterFee = amountIn - fee;
        
        if (buyYes) {
            uint256 k = yesReserve * noReserve;
            uint256 newNoReserve = noReserve + amountInAfterFee;
            uint256 newYesReserve = k / newNoReserve;
            amountOut = yesReserve - newYesReserve;
        } else {
            uint256 k = yesReserve * noReserve;
            uint256 newYesReserve = yesReserve + amountInAfterFee;
            uint256 newNoReserve = k / newYesReserve;
            amountOut = noReserve - newNoReserve;
        }
    }
    
    /**
     * @notice Get current prices
     * @return yesPrice Price of YES in basis points
     * @return noPrice Price of NO in basis points
     */
    function getPrices() external view returns (uint256 yesPrice, uint256 noPrice) {
        uint256 total = yesReserve + noReserve;
        if (total == 0) return (5000, 5000);
        
        // Price is inverse of reserve ratio
        yesPrice = (noReserve * 10000) / total;
        noPrice = (yesReserve * 10000) / total;
    }
    
    /**
     * @notice Withdraw collected fees to treasury
     */
    function withdrawFees() external {
        uint256 amount = feesCollected;
        feesCollected = 0;
        
        require(
            collateralToken.transfer(treasury, amount),
            "Transfer failed"
        );
    }
}

/**
 * @title InfoFiFPMMV2
 * @notice Manages FPMM markets for raffle predictions with SOLP tokens
 */
contract InfoFiFPMMV2 is AccessControl, ReentrancyGuard {
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    
    IConditionalTokens public immutable conditionalTokens;
    IERC20 public immutable collateralToken;
    address public treasury;
    
    mapping(uint256 => mapping(address => address)) public playerMarkets;
    mapping(uint256 => mapping(address => address)) public lpTokens;
    
    uint256 public constant INITIAL_FUNDING = 100e18;
    
    event MarketCreated(
        uint256 indexed seasonId,
        address indexed player,
        address indexed fpmm,
        bytes32 conditionId,
        address lpToken
    );
    
    error ZeroAddress();
    error MarketAlreadyExists();
    
    constructor(
        address _conditionalTokens,
        address _collateralToken,
        address _treasury,
        address _admin
    ) {
        if (_conditionalTokens == address(0)) revert ZeroAddress();
        if (_collateralToken == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        
        conditionalTokens = IConditionalTokens(_conditionalTokens);
        collateralToken = IERC20(_collateralToken);
        treasury = _treasury;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(FACTORY_ROLE, _admin);
    }
    
    function createMarket(
        uint256 seasonId,
        address player,
        bytes32 conditionId
    ) external onlyRole(FACTORY_ROLE) nonReentrant returns (address fpmm, address lpToken) {
        if (playerMarkets[seasonId][player] != address(0)) {
            revert MarketAlreadyExists();
        }
        
        // Deploy SOLP token
        SOLPToken solpToken = new SOLPToken(seasonId, player);
        lpToken = address(solpToken);
        
        // Deploy SimpleFPMM
        SimpleFPMM fpmmContract = new SimpleFPMM(
            address(collateralToken),
            address(conditionalTokens),
            conditionId,
            treasury,
            string(abi.encodePacked("FPMM-S", _uint2str(seasonId))),
            "FPMM"
        );
        
        fpmm = address(fpmmContract);
        playerMarkets[seasonId][player] = fpmm;
        lpTokens[seasonId][player] = lpToken;
        
        // Transfer initial funding from factory
        require(
            collateralToken.transferFrom(msg.sender, address(this), INITIAL_FUNDING),
            "Transfer failed"
        );
        
        // Approve FPMM
        collateralToken.approve(fpmm, INITIAL_FUNDING);
        
        // Add initial liquidity
        uint256 lpTokensMinted = fpmmContract.addLiquidity(INITIAL_FUNDING);
        
        // Mint SOLP tokens to factory (treasury)
        solpToken.mint(msg.sender, lpTokensMinted);
        
        emit MarketCreated(seasonId, player, fpmm, conditionId, lpToken);
    }
    
    function getMarket(
        uint256 seasonId,
        address player
    ) external view returns (address) {
        return playerMarkets[seasonId][player];
    }
    
    function getLpToken(
        uint256 seasonId,
        address player
    ) external view returns (address) {
        return lpTokens[seasonId][player];
    }
    
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
}
