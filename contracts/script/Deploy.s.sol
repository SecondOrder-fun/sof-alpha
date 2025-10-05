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
import "../src/faucet/SOFFaucet.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2Mock.sol";

contract DeployScript is Script {
    function run() external {
        address deployerAddr;
        if (vm.envExists("PRIVATE_KEY")) {
            uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
            deployerAddr = vm.addr(deployerPrivateKey);
            vm.startBroadcast(deployerPrivateKey);
        } else {
            // When using mnemonics, get the actual broadcaster address
            vm.startBroadcast();
            // The actual broadcaster when using mnemonics is tx.origin
            deployerAddr = tx.origin;
        }

        // Deploy VRF Mock for local development
        console2.log("Deploying VRFCoordinatorV2Mock...");
        VRFCoordinatorV2Mock vrfCoordinator = new VRFCoordinatorV2Mock(1e17, 1e9);
        uint64 subscriptionId = vrfCoordinator.createSubscription();
        vrfCoordinator.fundSubscription(subscriptionId, 100 ether);
        bytes32 keyHash = 0x0000000000000000000000000000000000000000000000000000000000000001;
        console2.log("VRF Mock deployed at:", address(vrfCoordinator));
        console2.log("VRF Subscription created with ID:", subscriptionId);
        
        // Deploy SOF token with a 100,000,000 SOF premint to the deployer (18 decimals)
        // Treasury address set to deployer (account[0]) for testing; change to multisig for production
        uint256 initialSupply = 100_000_000 ether; // 100,000,000 * 1e18
        SOFToken sof = new SOFToken("SOF Token", "SOF", initialSupply, deployerAddr);
        console2.log("SOF initial supply minted to deployer:", initialSupply);
        console2.log("SOF treasury address set to:", deployerAddr);

        // Deploy Raffle contract first
        Raffle raffle = new Raffle(address(sof), address(vrfCoordinator), subscriptionId, keyHash);

        // Add Raffle contract as a consumer to the VRF mock
        vrfCoordinator.addConsumer(subscriptionId, address(raffle));
        console2.log("Raffle contract added as VRF consumer.");

        // Deploy RafflePositionTracker with deployerAddr as admin
        RafflePositionTracker tracker = new RafflePositionTracker(address(raffle), deployerAddr);
        console2.log("RafflePositionTracker deployed at:", address(tracker));

        // Grant the Raffle contract admin role on the tracker so it can manage roles
        tracker.grantRole(bytes32(0), address(raffle));
        console2.log("Granted DEFAULT_ADMIN_ROLE on Tracker to Raffle contract");

        // Deploy SeasonFactory, passing the Raffle and Tracker contract addresses
        SeasonFactory seasonFactory = new SeasonFactory(address(raffle), address(tracker));

        // Set the season factory address in the Raffle contract (idempotent via try/catch)
        try raffle.setSeasonFactory(address(seasonFactory)) {
            console2.log("SeasonFactory set on Raffle:", address(seasonFactory));
        } catch {
            console2.log("SeasonFactory already configured on Raffle (skipping)");
        }

        // Grant the RAFFLE_ADMIN_ROLE on the factory to the Raffle contract
        bytes32 raffleAdminRole = seasonFactory.RAFFLE_ADMIN_ROLE();
        seasonFactory.grantRole(raffleAdminRole, address(raffle));

        // Grant the SEASON_CREATOR_ROLE on the Raffle contract to the SeasonFactory and the deployer
        bytes32 seasonCreatorRole = raffle.SEASON_CREATOR_ROLE();
        raffle.grantRole(seasonCreatorRole, address(seasonFactory));
        raffle.grantRole(seasonCreatorRole, deployerAddr);


        
        // Deploy InfoFiMarket contract
        InfoFiMarket infoFiMarket = new InfoFiMarket();



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

        // Deploy SOF Faucet
        console2.log("Deploying SOF Faucet...");
        uint256 amountPerRequest = 10_000 * 10**18; // 10,000 SOF tokens
        uint256 cooldownPeriod = 6 * 60 * 60; // 6 hours
        
        // Allowed chain IDs: Anvil (31337) and Sepolia (11155111)
        uint256[] memory allowedChainIds = new uint256[](2);
        allowedChainIds[0] = 31337;
        allowedChainIds[1] = 11155111;
        
        SOFFaucet faucet = new SOFFaucet(
            address(sof),
            amountPerRequest,
            cooldownPeriod,
            allowedChainIds
        );
        
        // Keep 1,000,000 SOF for the deployer and transfer the rest to the faucet
        uint256 deployerKeeps = 1_000_000 ether; // 1 million SOF
        uint256 faucetAmount = initialSupply - deployerKeeps; // 99 million SOF
        sof.transfer(address(faucet), faucetAmount);
        console2.log("SOF Faucet deployed at:", address(faucet));
        console2.log("Deployer keeps", deployerKeeps / 1 ether, "SOF tokens");
        console2.log("Faucet funded with", faucetAmount / 1 ether, "SOF tokens");
        
        // Create a default Season 1 for testing (always create for E2E testing)
        console2.log("Creating default season for testing...");

        uint256 startTime = block.timestamp + 60 seconds;
        uint256 endTime = startTime + 14 days;

        RaffleTypes.SeasonConfig memory config = RaffleTypes.SeasonConfig({
            name: "Season 1",
            startTime: startTime,
            endTime: endTime,
            winnerCount: 3,
            grandPrizeBps: 6500, // 65% of total pool to grand winner
            raffleToken: address(0), // Will be set by factory
            bondingCurve: address(0), // Will be set by factory
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

        // Wire position tracker to the new season's curve
        try raffle.setPositionTrackerForSeason(seasonId, address(tracker)) {
            console2.log("Wired position tracker for season", seasonId);
        } catch {
            console2.log("Failed to wire position tracker (may not be needed)");
        }

        // Grant FEE_COLLECTOR_ROLE to the Raffle contract for treasury system
        try sof.grantRole(sof.FEE_COLLECTOR_ROLE(), address(raffle)) {
            console2.log("Granted FEE_COLLECTOR_ROLE to Raffle contract");
        } catch {
            console2.log("Failed to grant FEE_COLLECTOR_ROLE (may not be admin or already granted)");
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
        console2.log("SOF Faucet deployed at:", address(faucet));
        console2.log("VRFCoordinatorV2Mock deployed at:", address(vrfCoordinator));
    }
}