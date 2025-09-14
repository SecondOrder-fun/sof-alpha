// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRafflePrizeDistributor {
    struct SeasonPayouts {
        address token;
        address grandWinner;
        uint256 grandAmount;
        uint256 consolationAmount;
        uint256 totalTicketsSnapshot;
        uint256 grandWinnerTickets;
        bytes32 merkleRoot;
        bool funded;
        bool grandClaimed;
    }

    event SeasonConfigured(
        uint256 indexed seasonId,
        address indexed token,
        address indexed grandWinner,
        uint256 grandAmount,
        uint256 consolationAmount,
        uint256 totalTicketsSnapshot,
        uint256 grandWinnerTickets
    );

    event SeasonFunded(uint256 indexed seasonId, uint256 amount);
    event MerkleRootUpdated(uint256 indexed seasonId, bytes32 merkleRoot);
    event GrandClaimed(uint256 indexed seasonId, address indexed winner, uint256 amount);
    event ConsolationClaimed(uint256 indexed seasonId, address indexed account, uint256 amount);

    function configureSeason(
        uint256 seasonId,
        address token,
        address grandWinner,
        uint256 grandAmount,
        uint256 consolationAmount,
        uint256 totalTicketsSnapshot,
        uint256 grandWinnerTickets
    ) external;

    function setMerkleRoot(uint256 seasonId, bytes32 merkleRoot) external;

    function fundSeason(uint256 seasonId, uint256 amount) external;

    function claimGrand(uint256 seasonId) external;

    function claimConsolation(
        uint256 seasonId,
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external;

    function isClaimed(uint256 seasonId, uint256 index) external view returns (bool);

    function getSeason(uint256 seasonId) external view returns (SeasonPayouts memory);
}
