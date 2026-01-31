// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-contracts/contracts/access/AccessControl.sol";

/**
 * @title SOF Protocol Token
 * @notice Simple ERC20 token for SecondOrder.fun platform
 * @dev No governance, locking, or buyback mechanisms - those are handled by veSOF NFT
 *      Fee collection is handled directly by bonding curves (direct transfer to treasury)
 */
contract SOFToken is ERC20, AccessControl {
    constructor(string memory name, string memory symbol, uint256 initialSupply)
        ERC20(name, symbol)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Mint initial supply to deployer
        _mint(msg.sender, initialSupply);
    }
}
