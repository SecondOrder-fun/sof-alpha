// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IInfoFiMarketFactory {
    /**
     * @notice Called by Raffle when a participant's position changes
     * @param seasonId The season identifier
     * @param player The participant address
     * @param oldTickets Tickets held before the change
     * @param newTickets Tickets held after the change
     * @param totalTickets Total tickets after the change
     */
    function onPositionUpdate(
        uint256 seasonId,
        address player,
        uint256 oldTickets,
        uint256 newTickets,
        uint256 totalTickets
    ) external;
}
