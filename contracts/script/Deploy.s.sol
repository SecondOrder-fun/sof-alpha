// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/core/Raffle.sol";
import "../src/core/RafflePositionTracker.sol";
import "../src/infofi/InfoFiMarket.sol";
import "../src/infofi/InfoFiMarketFactory.sol";
import "../src/infofi/InfoFiPriceOracle.sol";
import "../src/infofi/InfoFiSettlement.sol";
import "../src/token/SOFToken.sol";
import "../src/core/SeasonFactory.sol";
import "../src/lib/RaffleTypes.sol";
import "../src/core/RafflePrizeDistributor.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2Mock.sol";

contract DeployScript is Script {
    function run() external {
        address deployerAddr;
        if (vm.envExists("PRIVATE_KEY")) {
            uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
            deployerAddr = vm.addr(deployerPrivateKey);
            vm.startBroadcast(deployerPrivateKey);
        } else {
            // When no key is provided, Foundry uses DefaultSender (0x1804...). Use that as admin.
            vm.startBroadcast();
            // Align admin with the script sender in this branch
            deployerAddr = msg.sender;
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

        // Set the season factory address in the Raffle contract (idempotent via try/catch)
        try raffle.setSeasonFactory(address(seasonFactory)) {
            console2.log("SeasonFactory set on Raffle:", address(seasonFactory));
        } catch {
            console2.log("SeasonFactory already configured on Raffle (skipping)");
        }

        // Grant the RAFFLE_ADMIN_ROLE on the factory to the Raffle contract
        bytes32 raffleAdminRole = seasonFactory.RAFFLE_ADMIN_ROLE();
        seasonFactory.grantRole(raffleAdminRole, address(raffle));

        // Grant the SEASON_CREATOR_ROLE on the Raffle contract to the SeasonFactory
        bytes32 seasonCreatorRole = raffle.SEASON_CREATOR_ROLE();
        raffle.grantRole(seasonCreatorRole, address(seasonFactory));
        
        // Deploy InfoFiMarket contract
        InfoFiMarket infoFiMarket = new InfoFiMarket();

        // Deploy RafflePositionTracker and wire roles
        console2.log("Deploying RafflePositionTracker...");
        RafflePositionTracker tracker = new RafflePositionTracker(address(raffle), deployerAddr);
        // Grant MARKET_ROLE to raffle and seasonFactory so they can push updates if needed
        bytes32 marketRole = tracker.MARKET_ROLE();
        // These may fail if the deployer is not the admin; don't block deployment.
        try tracker.grantRole(marketRole, address(raffle)) {
            console2.log("Granted MARKET_ROLE to Raffle on Tracker");
        } catch {
            console2.log("Skipping grantRole to Raffle on Tracker (not admin)");
        }
        try tracker.grantRole(marketRole, address(seasonFactory)) {
            console2.log("Granted MARKET_ROLE to SeasonFactory on Tracker");
        } catch {
            console2.log("Skipping grantRole to SeasonFactory on Tracker (not admin)");
        }
        console2.log("RafflePositionTracker deployed at:", address(tracker));

        // Deploy InfoFiPriceOracle with default weights 70/30, admin = deployer
        console2.log("Deploying InfoFiPriceOracle (weights 70/30) with deployer as admin...");
        InfoFiPriceOracle infoFiOracle = new InfoFiPriceOracle(deployerAddr, 7000, 3000);
        console2.log("InfoFiPriceOracle deployed at:", address(infoFiOracle));

        // Wire market to oracle and grant updater role so market can push sentiment
        try infoFiMarket.setOracle(address(infoFiOracle)) {
            console2.log("InfoFiMarket oracle set:", address(infoFiOracle));
        } catch {
            console2.log("InfoFiMarket oracle was already set or method failed (skipping)");
        }
        // Grant oracle PRICE_UPDATER_ROLE to InfoFiMarket so placeBet can update sentiment
        try infoFiOracle.grantRole(infoFiOracle.PRICE_UPDATER_ROLE(), address(infoFiMarket)) {
            console2.log("Granted PRICE_UPDATER_ROLE to InfoFiMarket on InfoFiPriceOracle");
        } catch {
            console2.log("Skipping PRICE_UPDATER_ROLE grant to InfoFiMarket (not admin or already granted)");
        }

        // Deploy InfoFiMarketFactory with raffle read addr, oracle, shared market, and SOF bet token; admin = deployer
        console2.log("Deploying InfoFiMarketFactory...");
        InfoFiMarketFactory infoFiFactory = new InfoFiMarketFactory(
            address(raffle),
            address(infoFiOracle),
            address(infoFiMarket),
            address(sof),
            deployerAddr
        );
        console2.log("InfoFiMarketFactory deployed at:", address(infoFiFactory));

        // Grant OPERATOR_ROLE on InfoFiMarket to the factory so it can create markets
        try infoFiMarket.grantRole(infoFiMarket.OPERATOR_ROLE(), address(infoFiFactory)) {
            console2.log("Granted OPERATOR_ROLE to factory on InfoFiMarket");
        } catch {
            console2.log("Skipping OPERATOR_ROLE grant (not admin or already granted)");
        }

        // Grant PRICE_UPDATER_ROLE on oracle to factory so it can push probability updates
        try infoFiOracle.grantRole(infoFiOracle.PRICE_UPDATER_ROLE(), address(infoFiFactory)) {
            console2.log("Granted PRICE_UPDATER_ROLE to factory on InfoFiPriceOracle");
        } catch {
            console2.log("Skipping PRICE_UPDATER_ROLE grant (not admin or already granted)");
        }

        // Wire factory into Raffle so curve callbacks can reach factory
        try raffle.setInfoFiFactory(address(infoFiFactory)) {
            console2.log("Raffle setInfoFiFactory:", address(infoFiFactory));
        } catch {
            console2.log("Raffle.setInfoFiFactory failed or already set (skipping)");
        }

        // Deploy InfoFiSettlement and grant SETTLER_ROLE to Raffle (so raffle can settle markets on VRF callback)
        console2.log("Deploying InfoFiSettlement...");
        InfoFiSettlement infoFiSettlement = new InfoFiSettlement(deployerAddr, address(raffle));
        console2.log("InfoFiSettlement deployed at:", address(infoFiSettlement));

        // Deploy RafflePrizeDistributor and wire to Raffle
        console2.log("Deploying RafflePrizeDistributor...");
        RafflePrizeDistributor distributor = new RafflePrizeDistributor(deployerAddr);
        // Grant RAFFLE_ROLE to Raffle so it can configure seasons and fund them
        try distributor.grantRole(distributor.RAFFLE_ROLE(), address(raffle)) {
            console2.log("Granted RAFFLE_ROLE to Raffle on Distributor");
        } catch {
            console2.log("Skipping RAFFLE_ROLE grant (not admin or already granted)");
        }
        // Set distributor on Raffle
        try raffle.setPrizeDistributor(address(distributor)) {
            console2.log("Raffle prize distributor set:", address(distributor));
        } catch {
            console2.log("Raffle.setPrizeDistributor failed or already set (skipping)");
        }

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
                grandPrizeBps: 6500, // 65% of total pool to grand winner (rest to consolation)
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
        console2.log("InfoFiMarketFactory contract deployed at:", address(infoFiFactory));
        console2.log("InfoFiPriceOracle contract deployed at:", address(infoFiOracle));
        console2.log("InfoFiSettlement deployed at:", address(infoFiSettlement));
        console2.log("VRFCoordinatorV2Mock deployed at:", address(vrfCoordinator));
        console2.log("RafflePositionTracker deployed at:", address(tracker));
    }
}