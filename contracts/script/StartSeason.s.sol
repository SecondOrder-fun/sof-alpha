// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import {Raffle} from "../src/core/Raffle.sol";
import {RaffleTypes} from "../src/lib/RaffleTypes.sol";

contract StartSeasonScript is Script {
    function run() external {
        address raffleAddr = vm.envAddress("RAFFLE_ADDRESS");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        // Default to season 1 unless overridden by setting SEASON_ID in env
        uint256 seasonId = 1;

        Raffle raffle = Raffle(raffleAddr);
        (
            RaffleTypes.SeasonConfig memory cfg,
            , , ,
        ) = raffle.getSeasonDetails(seasonId);

        vm.startBroadcast(pk);
        if (block.timestamp < cfg.startTime + 1) {
            vm.warp(cfg.startTime + 1);
        }
        raffle.startSeason(seasonId);
        vm.stopBroadcast();

        console2.log("Season started:", seasonId);
    }
}
