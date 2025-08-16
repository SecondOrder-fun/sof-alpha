// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library RaffleTypes {
    struct SeasonConfig {
        string name;
        uint256 startTime;
        uint256 endTime;
        uint16 winnerCount;
        uint16 prizePercentage; // In basis points
        uint16 consolationPercentage; // In basis points
        address raffleToken;
        address bondingCurve;
        bool isActive;
        bool isCompleted;
    }

    struct BondStep {
        uint128 rangeTo; // Token supply level where this step ends
        uint128 price; // Price in $SOF per token for this step
    }
}