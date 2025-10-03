// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";
import "openzeppelin-contracts/contracts/token/ERC721/utils/ERC721Holder.sol";
import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol";
import {IRafflePrizeDistributor} from "../lib/IRafflePrizeDistributor.sol";

/**
 * @title RafflePrizeDistributor
 * @notice Holds SOF funds for each season and enables claims for the grand winner and
 *         consolation recipients via a Merkle root (index, account, amount).
 *         Also manages sponsored ERC-20 and ERC-721 prizes.
 */
contract RafflePrizeDistributor is IRafflePrizeDistributor, AccessControl, ReentrancyGuard, ERC721Holder {
    using SafeERC20 for IERC20;

    bytes32 public constant RAFFLE_ROLE = keccak256("RAFFLE_ROLE");

    struct SponsoredERC20 {
        address token;
        uint256 amount;
        address sponsor;
    }

    struct SponsoredERC721 {
        address token;
        uint256 tokenId;
        address sponsor;
    }

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
        bool sponsorshipsLocked;      // whether sponsorships are locked (season ended)
    }

    // seasonId => season
    mapping(uint256 => Season) private _seasons;

    // seasonId => bitmap (wordIndex => bits) to track leaf claims
    mapping(uint256 => mapping(uint256 => uint256)) private _claimedBitMap;

    // seasonId => array of sponsored ERC-20 tokens
    mapping(uint256 => SponsoredERC20[]) private _sponsoredERC20;

    // seasonId => array of sponsored ERC-721 tokens
    mapping(uint256 => SponsoredERC721[]) private _sponsoredERC721;

    // seasonId => token => total amount (for ERC-20)
    mapping(uint256 => mapping(address => uint256)) private _erc20TotalByToken;

    event AdminGranted(address indexed account);
    event AdminRevoked(address indexed account);

    event ERC20Sponsored(
        uint256 indexed seasonId,
        address indexed sponsor,
        address indexed token,
        uint256 amount
    );

    event ERC721Sponsored(
        uint256 indexed seasonId,
        address indexed sponsor,
        address indexed token,
        uint256 tokenId
    );

    event SponsorshipsLocked(uint256 indexed seasonId);

    event SponsoredERC20Claimed(
        uint256 indexed seasonId,
        address indexed winner,
        address indexed token,
        uint256 amount
    );

    event SponsoredERC721Claimed(
        uint256 indexed seasonId,
        address indexed winner,
        address indexed token,
        uint256 tokenId
    );

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

    // ----------------------- Sponsorship functions --------------------

    /**
     * @notice Sponsor ERC-20 tokens to a season's prize pool
     * @param seasonId The season to sponsor
     * @param token The ERC-20 token address
     * @param amount The amount to sponsor
     */
    function sponsorERC20(
        uint256 seasonId,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(seasonId > 0, "Distributor: invalid season");
        require(token != address(0), "Distributor: zero address");
        require(amount > 0, "Distributor: zero amount");
        Season storage s = _seasons[seasonId];
        require(!s.sponsorshipsLocked, "Distributor: sponsorships locked");

        // Transfer tokens from sponsor to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Record sponsorship
        _sponsoredERC20[seasonId].push(SponsoredERC20({
            token: token,
            amount: amount,
            sponsor: msg.sender
        }));

        // Update total for this token
        _erc20TotalByToken[seasonId][token] += amount;

        emit ERC20Sponsored(seasonId, msg.sender, token, amount);
    }

    /**
     * @notice Sponsor an ERC-721 NFT to a season's prize pool
     * @param seasonId The season to sponsor
     * @param token The ERC-721 token address
     * @param tokenId The NFT token ID
     */
    function sponsorERC721(
        uint256 seasonId,
        address token,
        uint256 tokenId
    ) external nonReentrant {
        require(seasonId > 0, "Distributor: invalid season");
        require(token != address(0), "Distributor: zero address");
        Season storage s = _seasons[seasonId];
        require(!s.sponsorshipsLocked, "Distributor: sponsorships locked");

        // Transfer NFT from sponsor to this contract
        IERC721(token).safeTransferFrom(msg.sender, address(this), tokenId);

        // Record sponsorship
        _sponsoredERC721[seasonId].push(SponsoredERC721({
            token: token,
            tokenId: tokenId,
            sponsor: msg.sender
        }));

        emit ERC721Sponsored(seasonId, msg.sender, token, tokenId);
    }

    /**
     * @notice Lock sponsorships for a season (called when season ends)
     * @param seasonId The season to lock
     */
    function lockSponsorships(uint256 seasonId) external onlyRole(RAFFLE_ROLE) {
        Season storage s = _seasons[seasonId];
        require(!s.sponsorshipsLocked, "Distributor: already locked");
        s.sponsorshipsLocked = true;
        emit SponsorshipsLocked(seasonId);
    }

    /**
     * @notice Claim all sponsored ERC-20 tokens for a season (winner only)
     * @param seasonId The season to claim from
     */
    function claimSponsoredERC20(uint256 seasonId) external nonReentrant {
        Season storage s = _seasons[seasonId];
        require(s.funded, "Distributor: not funded");
        require(msg.sender == s.grandWinner, "Distributor: not winner");
        require(s.sponsorshipsLocked, "Distributor: not locked");

        SponsoredERC20[] memory sponsored = _sponsoredERC20[seasonId];
        for (uint256 i = 0; i < sponsored.length; i++) {
            IERC20(sponsored[i].token).safeTransfer(msg.sender, sponsored[i].amount);
            emit SponsoredERC20Claimed(seasonId, msg.sender, sponsored[i].token, sponsored[i].amount);
        }

        // Clear the array to prevent double claims
        delete _sponsoredERC20[seasonId];
    }

    /**
     * @notice Claim all sponsored ERC-721 tokens for a season (winner only)
     * @param seasonId The season to claim from
     */
    function claimSponsoredERC721(uint256 seasonId) external nonReentrant {
        Season storage s = _seasons[seasonId];
        require(s.funded, "Distributor: not funded");
        require(msg.sender == s.grandWinner, "Distributor: not winner");
        require(s.sponsorshipsLocked, "Distributor: not locked");

        SponsoredERC721[] memory sponsored = _sponsoredERC721[seasonId];
        for (uint256 i = 0; i < sponsored.length; i++) {
            IERC721(sponsored[i].token).safeTransferFrom(
                address(this),
                msg.sender,
                sponsored[i].tokenId
            );
            emit SponsoredERC721Claimed(seasonId, msg.sender, sponsored[i].token, sponsored[i].tokenId);
        }

        // Clear the array to prevent double claims
        delete _sponsoredERC721[seasonId];
    }

    /**
     * @notice Get all sponsored ERC-20 tokens for a season
     * @param seasonId The season to query
     * @return Array of SponsoredERC20 structs
     */
    function getSponsoredERC20(uint256 seasonId)
        external
        view
        returns (SponsoredERC20[] memory)
    {
        return _sponsoredERC20[seasonId];
    }

    /**
     * @notice Get all sponsored ERC-721 tokens for a season
     * @param seasonId The season to query
     * @return Array of SponsoredERC721 structs
     */
    function getSponsoredERC721(uint256 seasonId)
        external
        view
        returns (SponsoredERC721[] memory)
    {
        return _sponsoredERC721[seasonId];
    }

    /**
     * @notice Get total amount of a specific ERC-20 token sponsored for a season
     * @param seasonId The season to query
     * @param token The token address
     * @return Total amount sponsored
     */
    function getERC20TotalByToken(uint256 seasonId, address token)
        external
        view
        returns (uint256)
    {
        return _erc20TotalByToken[seasonId][token];
    }
}
