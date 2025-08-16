// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/core/Raffle.sol";
import "../src/infofi/InfoFiMarket.sol";
import "../src/token/SOFToken.sol";
import "../src/core/SeasonFactory.sol";
import "../src/lib/RaffleTypes.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2Mock.sol";

contract DeployScript is Script {
    function run() external {
        if (vm.envExists("PRIVATE_KEY")) {
            uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }

        // Deploy VRF Mock for local development
        console2.log("Deploying VRFCoordinatorV2Mock...");
        VRFCoordinatorV2Mock vrfCoordinator = new VRFCoordinatorV2Mock(1e17, 1e9);
        uint64 subscriptionId = vrfCoordinator.createSubscription();
        vrfCoordinator.fundSubscription(subscriptionId, 100 ether);
        bytes32 keyHash = 0x0000000000000000000000000000000000000000000000000000000000000001;
        console2.log("VRF Mock deployed at:", address(vrfCoordinator));
        console2.log("VRF Subscription created with ID:", subscriptionId);
        
        // Deploy SOF token with a 10,000,000 SOF premint to the deployer (18 decimals)
        uint256 initialSupply = 10_000_000 ether; // 10,000,000 * 1e18
        SOFToken sof = new SOFToken("SOF Token", "SOF", initialSupply, msg.sender);
        console2.log("SOF initial supply minted to deployer:", initialSupply);

        // Deploy Raffle contract first
        Raffle raffle = new Raffle(address(sof), address(vrfCoordinator), subscriptionId, keyHash);

        // Add Raffle contract as a consumer to the VRF mock
        vrfCoordinator.addConsumer(subscriptionId, address(raffle));
        console2.log("Raffle contract added as VRF consumer.");

        // Deploy SeasonFactory, passing the Raffle contract's address
        SeasonFactory seasonFactory = new SeasonFactory(address(raffle));

        // Set the season factory address in the Raffle contract
        raffle.setSeasonFactory(address(seasonFactory));

        // Grant the RAFFLE_ADMIN_ROLE on the factory to the Raffle contract
        bytes32 raffleAdminRole = seasonFactory.RAFFLE_ADMIN_ROLE();
        seasonFactory.grantRole(raffleAdminRole, address(raffle));

        // Grant the SEASON_CREATOR_ROLE on the Raffle contract to the SeasonFactory
        bytes32 seasonCreatorRole = raffle.SEASON_CREATOR_ROLE();
        raffle.grantRole(seasonCreatorRole, address(seasonFactory));
        
        // Deploy InfoFiMarket contract
        InfoFiMarket infoFiMarket = new InfoFiMarket();

        // Optional: Create a default Season 0 (disabled by default)
        // Control via env var CREATE_SEASON=true to enable.
        bool createSeason;
        try vm.envBool("CREATE_SEASON") returns (bool vCreate) {
            createSeason = vCreate;
        } catch {
            createSeason = false; // default: do NOT create a season during deployment
        }

        if (createSeason) {
            // For local/dev testing, allow immediate start via FAST_START env (defaults true)
            bool fastStart;
            try vm.envBool("FAST_START") returns (bool v) {
                fastStart = v;
            } catch {
                fastStart = true; // default to fast start when not set
            }

            uint256 startTs = fastStart ? block.timestamp - 1 hours : block.timestamp + 1 days;
            uint256 endTs = startTs + 14 days;

            RaffleTypes.SeasonConfig memory config = RaffleTypes.SeasonConfig({
                name: "Season 0",
                startTime: startTs,
                endTime: endTs,
                winnerCount: 3,
                prizePercentage: 5000, // 50%
                consolationPercentage: 4000, // 40%
                raffleToken: address(0), // Will be set by the factory
                bondingCurve: address(0), // Will be set by the factory
                isActive: false,
                isCompleted: false
            });

            RaffleTypes.BondStep[] memory bondSteps = new RaffleTypes.BondStep[](3);
            bondSteps[0] = RaffleTypes.BondStep({rangeTo: 1000, price: 10 ether});
            bondSteps[1] = RaffleTypes.BondStep({rangeTo: 5000, price: 20 ether});
            bondSteps[2] = RaffleTypes.BondStep({rangeTo: 10000, price: 30 ether});

            uint16 buyFeeBps = 10; // 0.1%
            uint16 sellFeeBps = 70; // 0.7%

            raffle.createSeason(config, bondSteps, buyFeeBps, sellFeeBps);
            console2.log("Default Season 0 created.");
        } else {
            console2.log("Skipping season creation (CREATE_SEASON not set to true).");
        }
        
        vm.stopBroadcast();
        
        // Output deployed addresses
        console2.log("SOF token deployed at:", address(sof));
        console2.log("SeasonFactory contract deployed at:", address(seasonFactory));
        console2.log("Raffle contract deployed at:", address(raffle));
        console2.log("InfoFiMarket contract deployed at:", address(infoFiMarket));
        console2.log("VRFCoordinatorV2Mock deployed at:", address(vrfCoordinator));
    }
}