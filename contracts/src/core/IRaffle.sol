// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRaffle {
    // Participant management (called by bonding curve)
    function recordParticipant(uint256 seasonId, address participant, uint256 ticketAmount) external;
    function removeParticipant(uint256 seasonId, address participant, uint256 ticketAmount) external;
}
