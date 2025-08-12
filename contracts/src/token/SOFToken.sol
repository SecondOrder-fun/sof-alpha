// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SOF Protocol Token
 * @notice Simple ERC20 token for SecondOrder.fun platform
 * @dev No governance, locking, or buyback mechanisms - those are handled by veSOF NFT
 */
contract SOFToken is ERC20, AccessControl, ReentrancyGuard {
    bytes32 public constant FEE_COLLECTOR_ROLE = keccak256("FEE_COLLECTOR_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    
    // Events
    event FeesCollected(address indexed from, uint256 amount);
    event TreasuryTransfer(address indexed to, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    
    // Fee collection tracking
    uint256 public totalFeesCollected;
    address public treasuryAddress;
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address treasury
    ) ERC20(name, symbol) {
        require(treasury != address(0), "Treasury cannot be zero address");
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(TREASURY_ROLE, msg.sender);
        
        treasuryAddress = treasury;
        
        // Mint initial supply to deployer
        _mint(msg.sender, initialSupply);
    }
    
    /**
     * @notice Collect fees from platform operations
     * @param amount Amount of fees to collect
     * @dev Called by authorized platform contracts
     */
    function collectFees(uint256 amount) 
        external 
        onlyRole(FEE_COLLECTOR_ROLE) 
        nonReentrant 
    {
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        _transfer(msg.sender, address(this), amount);
        totalFeesCollected += amount;
        
        emit FeesCollected(msg.sender, amount);
    }
    
    /**
     * @notice Transfer accumulated fees to treasury
     * @param amount Amount to transfer to treasury
     */
    function transferToTreasury(uint256 amount) 
        external 
        onlyRole(TREASURY_ROLE) 
        nonReentrant 
    {
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(address(this)) >= amount, "Insufficient contract balance");
        
        _transfer(address(this), treasuryAddress, amount);
        
        emit TreasuryTransfer(treasuryAddress, amount);
    }
    
    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function setTreasuryAddress(address newTreasury) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(newTreasury != address(0), "Treasury cannot be zero address");
        address old = treasuryAddress;
        treasuryAddress = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }
    
    /**
     * @notice Get contract's SOF balance (accumulated fees)
     */
    function getContractBalance() external view returns (uint256) {
        return balanceOf(address(this));
    }
}
