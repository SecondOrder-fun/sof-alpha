// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../core/RaffleStorage.sol";

/**
 * @title RaffleLogic Library
 * @notice Contains internal helper functions for the Raffle contract to reduce its size.
 */
library RaffleLogic {
    function _selectWinnersAddressBased(
        RaffleStorage.SeasonState storage state,
        uint16 winnerCount,
        uint256[] memory randomWords
    ) internal view returns (address[] memory) {
        if (state.totalTickets == 0 || state.participants.length == 0 || winnerCount == 0) {
            return new address[](0);
        }
        
        // Special case: if there's only one participant, they must be the winner
        if (state.participants.length == 1) {
            address[] memory singleWinner = new address[](1);
            singleWinner[0] = state.participants[0];
            return singleWinner;
        }

        address[] memory temp = new address[](winnerCount);
        bool[] memory picked = new bool[](state.participants.length);
        uint256 selected = 0;

        for (uint256 i = 0; i < winnerCount && selected < winnerCount; i++) {
            uint256 ticketNumber = (randomWords[i % randomWords.length] % state.totalTickets) + 1;
            (uint256 idx, address addr) = _findParticipantByTicket(state, ticketNumber);
            if (addr != address(0) && !picked[idx]) {
                temp[selected] = addr;
                picked[idx] = true;
                selected++;
            }
        }

        address[] memory winners = new address[](selected);
        for (uint256 k = 0; k < selected; k++) {
            winners[k] = temp[k];
        }
        return winners;
    }

    function _findParticipantByTicket(
        RaffleStorage.SeasonState storage state,
        uint256 ticketNumber
    ) internal view returns (uint256 idx, address addr) {
        uint256 cur = 1;
        for (uint256 j = 0; j < state.participants.length; j++) {
            address p = state.participants[j];
            RaffleStorage.ParticipantPosition storage pos = state.participantPositions[p];
            uint256 end = cur + pos.ticketCount;
            if (ticketNumber >= cur && ticketNumber < end) {
                return (j, p);
            }
            cur = end;
        }
        return (type(uint256).max, address(0));
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
