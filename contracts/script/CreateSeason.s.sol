// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import {Raffle} from "../src/core/Raffle.sol";
import {RaffleTypes} from "../src/lib/RaffleTypes.sol";

/**
 * @title CreateSeasonScript
 * @notice Creates a season with 100 steps (rangeTo +1000 per step) up to 100,000 tickets.
 *         Start price = 1 SOF, increment = 0.1 SOF per step. Starts ~15s in the future, lasts ~3 minutes.
 */
contract CreateSeasonScript is Script {
    function run() external {
        address raffleAddr = vm.envAddress("RAFFLE_ADDRESS");
        require(raffleAddr != address(0), "RAFFLE_ADDRESS not set");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address sender = vm.addr(pk);
        vm.startBroadcast(pk);

        Raffle raffle = Raffle(raffleAddr);

        // Season config
        // IMPORTANT: Raffle.createSeason requires startTime > block.timestamp
        // We set startTime ~15s in the future and recommend starting the season after that; it ends ~3 minutes later
        uint256 startTs = block.timestamp + 60; // start ~60s in the future
        uint256 endTs = startTs + 3 minutes;

        RaffleTypes.SeasonConfig memory config = RaffleTypes.SeasonConfig({
            name: "Season-100k-1000steps",
            startTime: startTs,
            endTime: endTs,
            winnerCount: 3,
            prizePercentage: 5000, // 50%
            consolationPercentage: 4000, // 40%
            grandPrizeBps: 6500, // 65% of total pool to grand winner (rest to consolation)
            raffleToken: address(0),
            bondingCurve: address(0),
            isActive: false,
            isCompleted: false
        });

        // Build 100 steps to total 100,000 tickets.
        // Each step size = 1,000 tokens. rangeTo increments by 1,000.
        // Price starts at 1 SOF (1e18) and increases by 0.1 SOF (1e17) per step.
        uint256 STEPS = 100;
        RaffleTypes.BondStep[] memory steps = new RaffleTypes.BondStep[](STEPS);
        uint128 basePrice = 1e18; // 1 SOF (18 decimals)
        uint128 increment = 1e17; // 0.1 SOF per step

        for (uint256 i = 0; i < STEPS; i++) {
            uint32 rangeTo = uint32((i + 1) * 1000); // 1000, 2000, ..., 100000
            uint128 price = basePrice + uint128(i) * increment; // 1.0, 1.1, ..., 100.9 SOF
            steps[i] = RaffleTypes.BondStep({rangeTo: rangeTo, price: price});
        }

        uint16 buyFeeBps = 10;  // 0.10%
        uint16 sellFeeBps = 70; // 0.70%

        // Create season
        uint256 seasonId = raffle.createSeason(config, steps, buyFeeBps, sellFeeBps);
        console2.log("Season created:", seasonId);

        // Fetch details to print the curve address
        (
            RaffleTypes.SeasonConfig memory cfg,
            ,
            ,
            ,
            
        ) = raffle.getSeasonDetails(seasonId);
        console2.log("Curve:", cfg.bondingCurve);
        console2.log("Token:", cfg.raffleToken);
        console2.log("StartTime:", cfg.startTime);
        console2.log("EndTime:", cfg.endTime);
        console2.log("NOTE:", "Call startSeason(seasonId) after ~15s; season ends ~3 minutes later");
        console2.log("Admin/Sender:", sender);

        vm.stopBroadcast();
    }
}
