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
import "../src/infofi/RaffleOracleAdapter.sol";
import "../src/infofi/InfoFiFPMMV2.sol";
import "../src/infofi/ConditionalTokenSOF.sol";
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

        // Grant SeasonFactory admin role on tracker so it can grant MARKET_ROLE to bonding curves
        tracker.grantRole(bytes32(0), address(seasonFactory));
        console2.log("Granted DEFAULT_ADMIN_ROLE on Tracker to SeasonFactory");

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

        // Deploy InfoFiPriceOracle with default weights 70/30, admin = deployer
        console2.log("Deploying InfoFiPriceOracle (weights 70/30) with deployer as admin...");
        InfoFiPriceOracle infoFiOracle = new InfoFiPriceOracle(deployerAddr, 7000, 3000);
        console2.log("InfoFiPriceOracle deployed at:", address(infoFiOracle));

        // Deploy ConditionalTokenSOF (SecondOrder.fun CTF implementation)
        // Production-ready implementation optimized for binary outcome markets
        // Compatible with Solidity 0.8.20, implements complete Gnosis CTF interface
        console2.log("Deploying ConditionalTokenSOF...");
        ConditionalTokenSOF conditionalTokens = new ConditionalTokenSOF();
        console2.log("ConditionalTokenSOF deployed at:", address(conditionalTokens));

        // Deploy RaffleOracleAdapter
        console2.log("Deploying RaffleOracleAdapter...");
        RaffleOracleAdapter oracleAdapter = new RaffleOracleAdapter(
            address(conditionalTokens),
            deployerAddr // Admin & resolver
        );
        console2.log("RaffleOracleAdapter deployed at:", address(oracleAdapter));

        // Deploy InfoFiFPMMV2
        console2.log("Deploying InfoFiFPMMV2...");
        InfoFiFPMMV2 fpmmManager = new InfoFiFPMMV2(
            address(conditionalTokens),
            address(sof), // Collateral token
            deployerAddr, // Treasury
            deployerAddr // Admin
        );
        console2.log("InfoFiFPMMV2 deployed at:", address(fpmmManager));

        // Deploy InfoFiMarketFactory (V2 with FPMM)
        console2.log("Deploying InfoFiMarketFactory (V2 with FPMM)...");
        
        // Use account[0] as backend wallet for local development
        address backendWallet = deployerAddr; // In production, this would be a dedicated backend service wallet
        
        InfoFiMarketFactory infoFiFactory = new InfoFiMarketFactory(
            address(raffle),
            address(infoFiOracle),
            address(oracleAdapter),
            address(fpmmManager),
            address(sof),
            deployerAddr, // Treasury
            deployerAddr, // Admin
            backendWallet // Backend service wallet (account[0] for local dev)
        );
        console2.log("InfoFiMarketFactory deployed at:", address(infoFiFactory));
        console2.log("Backend wallet (BACKEND_ROLE):", backendWallet);

        // Grant RESOLVER_ROLE on oracleAdapter to factory
        try oracleAdapter.grantRole(oracleAdapter.RESOLVER_ROLE(), address(infoFiFactory)) {
            console2.log("Granted RESOLVER_ROLE to factory on RaffleOracleAdapter");
        } catch {
            console2.log("Skipping RESOLVER_ROLE grant (not admin or already granted)");
        }

        // Grant FACTORY_ROLE on fpmmManager to factory
        try fpmmManager.grantRole(fpmmManager.FACTORY_ROLE(), address(infoFiFactory)) {
            console2.log("Granted FACTORY_ROLE to factory on InfoFiFPMMV2");
        } catch {
            console2.log("Skipping FACTORY_ROLE grant (not admin or already granted)");
        }

        // Approve factory to spend SOF from treasury for initial liquidity
        // For testing, deployer is treasury, so approve infinite SOF for market creation
        // This prevents approval exhaustion after multiple market creations
        sof.approve(address(infoFiFactory), type(uint256).max);
        console2.log("Approved InfoFiMarketFactory to spend unlimited SOF from treasury");

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

        // Note: SeasonFactory no longer wires InfoFi factory to curves
        // Backend service will handle market creation by listening to PositionUpdate events

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

        // Deploy SOF Faucet
        console2.log("Deploying SOF Faucet...");
        uint256 amountPerRequest = 10_000 * 10 ** 18; // 10,000 SOF tokens
        uint256 cooldownPeriod = 6 * 60 * 60; // 6 hours

        // Allowed chain IDs: Anvil (31337) and Sepolia (11155111)
        uint256[] memory allowedChainIds = new uint256[](2);
        allowedChainIds[0] = 31337;
        allowedChainIds[1] = 11155111;

        SOFFaucet faucet = new SOFFaucet(address(sof), amountPerRequest, cooldownPeriod, allowedChainIds);

        // Keep 1,000,000 SOF for the deployer and transfer the rest to the faucet
        uint256 deployerKeeps = 1_000_000 ether; // 1 million SOF
        uint256 faucetAmount = initialSupply - deployerKeeps; // 99 million SOF
        sof.transfer(address(faucet), faucetAmount);
        console2.log("SOF Faucet deployed at:", address(faucet));
        console2.log("Deployer keeps", deployerKeeps / 1 ether, "SOF tokens");
        console2.log("Faucet funded with", faucetAmount / 1 ether, "SOF tokens");

        // Grant FEE_COLLECTOR_ROLE to deployer/admin for manual fee collection
        sof.grantRole(sof.FEE_COLLECTOR_ROLE(), deployerAddr);
        console2.log("Granted FEE_COLLECTOR_ROLE to admin/deployer:", deployerAddr);

        vm.stopBroadcast();

        // Output deployed addresses
        console2.log("SOF token deployed at:", address(sof));
        console2.log("SeasonFactory contract deployed at:", address(seasonFactory));
        console2.log("Raffle contract deployed at:", address(raffle));
        console2.log("InfoFiMarketFactory contract deployed at:", address(infoFiFactory));
        console2.log("InfoFiPriceOracle contract deployed at:", address(infoFiOracle));
        console2.log("InfoFiFPMMV2 deployed at:", address(fpmmManager));
        console2.log("InfoFiSettlement deployed at:", address(infoFiSettlement));
        console2.log("SOF Faucet deployed at:", address(faucet));
        console2.log("VRFCoordinatorV2Mock deployed at:", address(vrfCoordinator));
    }
}
