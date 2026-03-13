// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../token/SOFToken.sol";

/// @title SOFAirdrop
/// @notice One-time beta airdrop + daily SOF drip with Farcaster anti-sybil verification
/// @dev Uses EIP-712 signatures from a backend attestor to verify Farcaster FID ownership
contract SOFAirdrop is AccessControl, ReentrancyGuard, EIP712 {
    // ============ Errors ============

    error AlreadyClaimed();
    error CooldownNotElapsed(uint256 nextClaimAt);
    error AttestationExpired();
    error InvalidAttestor();
    error ZeroAddress();

    // ============ Events ============

    event InitialClaimed(address indexed user, uint256 amount);
    event DailyClaimed(address indexed user, uint256 amount);

    // ============ Constants ============

    bytes32 private constant FARCASTER_ATTESTATION_TYPEHASH =
        keccak256("FarcasterAttestation(address wallet,uint256 fid,uint256 deadline)");

    // ============ State ============

    SOFToken public immutable sofToken;
    uint256 public initialAmount;
    uint256 public dailyAmount;
    uint256 public cooldown;
    address public attestor;

    mapping(address => bool) public hasClaimed;
    mapping(address => uint256) public lastDailyClaim;

    // ============ Constructor ============

    /// @param _sofToken Address of the SOFToken contract
    /// @param _attestor Backend signer for FID attestation
    /// @param _initialAmount One-time claim amount
    /// @param _dailyAmount Daily drip amount
    /// @param _cooldown Seconds between daily claims
    constructor(
        address _sofToken,
        address _attestor,
        uint256 _initialAmount,
        uint256 _dailyAmount,
        uint256 _cooldown
    ) EIP712("SecondOrder.fun SOFAirdrop", "1") {
        if (_sofToken == address(0)) revert ZeroAddress();
        if (_attestor == address(0)) revert ZeroAddress();

        sofToken = SOFToken(_sofToken);
        attestor = _attestor;
        initialAmount = _initialAmount;
        dailyAmount = _dailyAmount;
        cooldown = _cooldown;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ============ Claim Functions ============

    /// @notice One-time initial claim with Farcaster FID attestation
    /// @param fid The Farcaster user ID
    /// @param deadline Signature expiration timestamp
    /// @param v ECDSA recovery id
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
    function claimInitial(
        uint256 fid,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (block.timestamp > deadline) revert AttestationExpired();

        bytes32 structHash = keccak256(
            abi.encode(FARCASTER_ATTESTATION_TYPEHASH, msg.sender, fid, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(digest, v, r, s);

        if (recoveredSigner != attestor) revert InvalidAttestor();

        hasClaimed[msg.sender] = true;
        sofToken.mint(msg.sender, initialAmount);

        emit InitialClaimed(msg.sender, initialAmount);
    }

    /// @notice Daily refill claim (must have completed initial claim)
    function claimDaily() external nonReentrant {
        if (!hasClaimed[msg.sender]) revert AlreadyClaimed();

        uint256 lastClaim = lastDailyClaim[msg.sender];
        if (lastClaim != 0) {
            uint256 nextClaimAt = lastClaim + cooldown;
            if (block.timestamp < nextClaimAt) revert CooldownNotElapsed(nextClaimAt);
        }

        lastDailyClaim[msg.sender] = block.timestamp;
        sofToken.mint(msg.sender, dailyAmount);

        emit DailyClaimed(msg.sender, dailyAmount);
    }

    // ============ Admin Functions ============

    /// @notice Set initial and daily claim amounts
    function setAmounts(uint256 _initial, uint256 _daily) external onlyRole(DEFAULT_ADMIN_ROLE) {
        initialAmount = _initial;
        dailyAmount = _daily;
    }

    /// @notice Set cooldown between daily claims
    function setCooldown(uint256 _cooldown) external onlyRole(DEFAULT_ADMIN_ROLE) {
        cooldown = _cooldown;
    }

    /// @notice Set the attestor address for FID verification
    function setAttestor(address _attestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_attestor == address(0)) revert ZeroAddress();
        attestor = _attestor;
    }
}
