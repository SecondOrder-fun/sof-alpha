// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/core/Raffle.sol";
import "../src/core/RafflePrizeDistributor.sol";
import "../src/lib/RaffleTypes.sol";
import "../src/core/RaffleStorage.sol";

contract ConfigureDistributorSimple is Script {
    function run() external {
        uint256 deployerPrivateKey;
        try vm.envUint("PRIVATE_KEY") returns (uint256 value) {
            deployerPrivateKey = value;
        } catch {
            deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        }

        address raffleAddr;
        try vm.envAddress("RAFFLE_ADDRESS") returns (address value) {
            raffleAddr = value;
        } catch {
            raffleAddr = 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9;
        }

        address distributorAddr;
        try vm.envAddress("PRIZE_DISTRIBUTOR_ADDRESS") returns (address value) {
            distributorAddr = value;
        } catch {
            distributorAddr = 0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1;
        }

        uint256 seasonId;
        try vm.envUint("SEASON_ID") returns (uint256 value) {
            seasonId = value;
        } catch {
            seasonId = 4;
        }

        console2.log("Configuring distributor for season:", seasonId);
        console2.log("Raffle address:", raffleAddr);
        console2.log("Distributor address:", distributorAddr);

        Raffle raffle = Raffle(raffleAddr);
        RafflePrizeDistributor distributor = RafflePrizeDistributor(distributorAddr);

        // Start broadcast
        vm.startBroadcast(deployerPrivateKey);

        // 1. Make sure the distributor has the RAFFLE_ROLE
        bytes32 raffleRole = distributor.RAFFLE_ROLE();
        if (!distributor.hasRole(raffleRole, raffleAddr)) {
            console2.log("Granting RAFFLE_ROLE to raffle contract on distributor");
            distributor.grantRole(raffleRole, raffleAddr);
        } else {
            console2.log("Raffle already has RAFFLE_ROLE on distributor");
        }

        // 2. Make sure the raffle has the distributor set
        try raffle.prizeDistributor() returns (address currentDist) {
            if (currentDist == address(0)) {
                console2.log("Setting distributor on raffle");
                raffle.setPrizeDistributor(distributorAddr);
            } else if (currentDist != distributorAddr) {
                console2.log("Warning: Raffle has a different distributor set:", currentDist);
                console2.log("Updating to new distributor");
                raffle.setPrizeDistributor(distributorAddr);
            } else {
                console2.log("Distributor already set correctly on raffle");
            }
        } catch {
            console2.log("Error checking distributor on raffle, attempting to set anyway");
            raffle.setPrizeDistributor(distributorAddr);
        }

        // 3. Get season details to configure the distributor
        try raffle.getSeasonDetails(seasonId) returns (
            RaffleTypes.SeasonConfig memory config,
            RaffleStorage.SeasonStatus status,
            uint256, /* totalParticipants */
            uint256 totalTickets,
            uint256 totalPrizePool
        ) {
            console2.log("Season details retrieved:");
            console2.log("- Status:", uint8(status));
            console2.log("- Total tickets:", totalTickets);

            // Get the winner address
            address winner;
            try raffle.getWinners(seasonId) returns (address[] memory winners) {
                if (winners.length > 0) {
                    winner = winners[0];
                    console2.log("- Winner:", winner);
                } else {
                    console2.log("- No winners found");
                    winner = address(0);
                }
            } catch {
                console2.log("- Failed to get winners");
                winner = address(0);
            }

            // Get the SOF token address
            address sofToken = config.raffleToken;
            console2.log("- SOF token:", sofToken);

            // Calculate prize amounts based on grandPrizeBps and actual prize pool
            uint256 totalValue = totalPrizePool;
            uint256 grandPrizeAmount = (totalValue * config.grandPrizeBps) / 10000; // grandPrizeBps is in basis points (100% = 10000)
            uint256 consolationAmount = totalValue - grandPrizeAmount; // Remainder goes to consolation

            console2.log("Configuring distributor with:");
            console2.log("- Grand prize amount:", grandPrizeAmount);
            console2.log("- Consolation amount:", consolationAmount);

            // Get total participants from raffle
            (,, uint256 totalParticipants,,) = raffle.getSeasonDetails(seasonId);

            // Configure the distributor
            try distributor.configureSeason(
                seasonId, sofToken, winner, grandPrizeAmount, consolationAmount, totalParticipants
            ) {
                console2.log("Successfully configured distributor for season", seasonId);
                console2.log("Total participants:", totalParticipants);

                // 4. Try to fund the distributor for this season
                try raffle.fundPrizeDistributor(seasonId) {
                    console2.log("Successfully funded prize distributor for season", seasonId);
                } catch Error(string memory reason) {
                    console2.log("Failed to fund prize distributor:", reason);
                } catch {
                    console2.log("Failed to fund prize distributor (unknown error)");
                }
            } catch Error(string memory reason) {
                console2.log("Failed to configure distributor:", reason);
            } catch {
                console2.log("Failed to configure distributor (unknown error)");
            }
        } catch {
            console2.log("Failed to get season details");
        }

        vm.stopBroadcast();
    }
}
