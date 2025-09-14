// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/core/Raffle.sol";
import "../src/lib/RaffleTypes.sol";

contract CreateSeason is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address raffleAddr = vm.envAddress("RAFFLE_ADDRESS");
        Raffle raffle = Raffle(raffleAddr);

        vm.startBroadcast(deployerPrivateKey);

        uint256 startTs = block.timestamp + 1 days;
        uint256 endTs = startTs + 14 days;

        RaffleTypes.SeasonConfig memory config = RaffleTypes.SeasonConfig({
            name: "Season 1",
            startTime: startTs,
            endTime: endTs,
            winnerCount: 3,
            prizePercentage: 5000, // 50%
            consolationPercentage: 4000, // 40%
            grandPrizeBps: 6500, // 65% of total pool to grand winner (rest to consolation)
            raffleToken: address(0), // Will be set by the factory
            bondingCurve: address(0), // Will be set by the factory
            isActive: false,
            isCompleted: false
        });

        RaffleTypes.BondStep[] memory bondSteps = new RaffleTypes.BondStep[](10);
        bondSteps[0] = RaffleTypes.BondStep({rangeTo: 100_000, price: 0.1 ether});
        bondSteps[1] = RaffleTypes.BondStep({rangeTo: 200_000, price: 0.2 ether});
        bondSteps[2] = RaffleTypes.BondStep({rangeTo: 300_000, price: 0.3 ether});
        bondSteps[3] = RaffleTypes.BondStep({rangeTo: 400_000, price: 0.4 ether});
        bondSteps[4] = RaffleTypes.BondStep({rangeTo: 500_000, price: 0.5 ether});
        bondSteps[5] = RaffleTypes.BondStep({rangeTo: 600_000, price: 0.6 ether});
        bondSteps[6] = RaffleTypes.BondStep({rangeTo: 700_000, price: 0.7 ether});
        bondSteps[7] = RaffleTypes.BondStep({rangeTo: 800_000, price: 0.8 ether});
        bondSteps[8] = RaffleTypes.BondStep({rangeTo: 900_000, price: 0.9 ether});
        bondSteps[9] = RaffleTypes.BondStep({rangeTo: 1_000_000, price: 1.0 ether});

        uint16 buyFeeBps = 10; // 0.1%
        uint16 sellFeeBps = 70; // 0.7%

        uint256 seasonId = raffle.createSeason(config, bondSteps, buyFeeBps, sellFeeBps);
        console2.log("Season created with ID:", seasonId);

        vm.stopBroadcast();
    }
}
