// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol";
import {IRafflePrizeDistributor} from "../lib/IRafflePrizeDistributor.sol";

/**
 * @title RafflePrizeDistributor
 * @notice Holds SOF funds for each season and enables claims for the grand winner and
 *         consolation recipients via a Merkle root (index, account, amount).
 */
contract RafflePrizeDistributor is IRafflePrizeDistributor, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RAFFLE_ROLE = keccak256("RAFFLE_ROLE");

    struct Season {
        address token;                // SOF token
        address grandWinner;          // grand prize winner
        uint256 grandAmount;          // SOF allocated to grand winner
        uint256 consolationAmount;    // SOF allocated to consolation receivers
        uint256 totalTicketsSnapshot; // snapshot of total tickets at end
        uint256 grandWinnerTickets;   // tickets of grand winner (excluded from consolation denominator off-chain)
        bytes32 merkleRoot;           // Merkle root over (index, account, amount)
        bool funded;                  // whether `expected = grand + consolation` has been funded
        bool grandClaimed;            // whether grand was claimed
    }

    // seasonId => season
    mapping(uint256 => Season) private _seasons;

    // seasonId => bitmap (wordIndex => bits) to track leaf claims
    mapping(uint256 => mapping(uint256 => uint256)) private _claimedBitMap;

    event AdminGranted(address indexed account);
    event AdminRevoked(address indexed account);

    constructor(address initialAdmin) {
        address admin = initialAdmin == address(0) ? msg.sender : initialAdmin;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ----------------------- Admin helpers -----------------------

    function grantAdmin(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(DEFAULT_ADMIN_ROLE, account);
        emit AdminGranted(account);
    }

    function revokeAdmin(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(DEFAULT_ADMIN_ROLE, account);
        emit AdminRevoked(account);
    }

    // ---------------- IRafflePrizeDistributor --------------------

    function configureSeason(
        uint256 seasonId,
        address token,
        address grandWinner,
        uint256 grandAmount,
        uint256 consolationAmount,
        uint256 totalTicketsSnapshot,
        uint256 grandWinnerTickets
    ) external override onlyRole(RAFFLE_ROLE) {
        require(token != address(0), "Distributor: token zero");
        require(grandWinner != address(0), "Distributor: winner zero");
        require(grandAmount > 0, "Distributor: grand 0");
        require(totalTicketsSnapshot > 0, "Distributor: snapshot 0");
        Season storage s = _seasons[seasonId];
        // require(!s.funded, "Distributor: funded"); // Allow root to be set after funding // freeze after funding

        s.token = token;
        s.grandWinner = grandWinner;
        s.grandAmount = grandAmount;
        s.consolationAmount = consolationAmount;
        s.totalTicketsSnapshot = totalTicketsSnapshot;
        s.grandWinnerTickets = grandWinnerTickets;
        // keep existing root/funded/grandClaimed as-is

        emit SeasonConfigured(
            seasonId,
            token,
            grandWinner,
            grandAmount,
            consolationAmount,
            totalTicketsSnapshot,
            grandWinnerTickets
        );
    }

    function setMerkleRoot(uint256 seasonId, bytes32 merkleRoot) external override onlyRole(RAFFLE_ROLE) {
        Season storage s = _seasons[seasonId];
        // require(!s.funded, "Distributor: funded"); // Allow setting root after funding
        s.merkleRoot = merkleRoot;
        emit MerkleRootUpdated(seasonId, merkleRoot);
    }

    function fundSeason(uint256 seasonId, uint256 amount) external override onlyRole(RAFFLE_ROLE) {
        Season storage s = _seasons[seasonId];
        require(!s.funded, "Distributor: already funded");
        require(s.token != address(0), "Distributor: not configured");
        uint256 expected = s.grandAmount + s.consolationAmount;
        require(amount == expected, "Distributor: amount mismatch");
        require(IERC20(s.token).balanceOf(address(this)) >= expected, "Distributor: insufficient balance");
        s.funded = true;
        emit SeasonFunded(seasonId, amount);
    }

    function claimGrand(uint256 seasonId) external override nonReentrant {
        Season storage s = _seasons[seasonId];
        require(s.funded, "Distributor: not funded");
        require(!s.grandClaimed, "Distributor: grand claimed");
        require(msg.sender == s.grandWinner, "Distributor: not winner");

        s.grandClaimed = true;
        IERC20(s.token).safeTransfer(msg.sender, s.grandAmount);
        emit GrandClaimed(seasonId, msg.sender, s.grandAmount);
    }

    function claimConsolation(
        uint256 seasonId,
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external override nonReentrant {
        Season storage s = _seasons[seasonId];
        require(s.funded, "Distributor: not funded");
        require(s.merkleRoot != bytes32(0), "Distributor: root unset");
        require(!_isClaimed(seasonId, index), "Distributor: already claimed");
        require(account == msg.sender, "Distributor: only self");

        // Verify proof: leaf = keccak256(abi.encodePacked(index, account, amount))
        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(MerkleProof.verify(merkleProof, s.merkleRoot, node), "Distributor: bad proof");

        _setClaimed(seasonId, index);
        IERC20(s.token).safeTransfer(account, amount);
        emit ConsolationClaimed(seasonId, account, amount);
    }

    function isClaimed(uint256 seasonId, uint256 index) external view override returns (bool) {
        return _isClaimed(seasonId, index);
    }

    function getSeason(uint256 seasonId) external view override returns (SeasonPayouts memory) {
        Season storage s = _seasons[seasonId];
        return SeasonPayouts({
            token: s.token,
            grandWinner: s.grandWinner,
            grandAmount: s.grandAmount,
            consolationAmount: s.consolationAmount,
            totalTicketsSnapshot: s.totalTicketsSnapshot,
            grandWinnerTickets: s.grandWinnerTickets,
            merkleRoot: s.merkleRoot,
            funded: s.funded,
            grandClaimed: s.grandClaimed
        });
    }

    // ----------------------- internal helpers --------------------

    function _isClaimed(uint256 seasonId, uint256 index) internal view returns (bool) {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        uint256 word = _claimedBitMap[seasonId][wordIndex];
        uint256 mask = (1 << bitIndex);
        return word & mask == mask;
    }

    function _setClaimed(uint256 seasonId, uint256 index) internal {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        _claimedBitMap[seasonId][wordIndex] = _claimedBitMap[seasonId][wordIndex] | (1 << bitIndex);
    }
}
