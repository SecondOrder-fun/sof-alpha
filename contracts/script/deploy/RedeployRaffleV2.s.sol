// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../../src/core/Raffle.sol";

/**
 * @title RedeployRaffleV2
 * @notice Deploys new Raffle contract with Hats Protocol support and configures it
 * 
 * Usage:
 *   forge script script/deploy/RedeployRaffleV2.s.sol:RedeployRaffleV2 \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast -vvvv
 */
contract RedeployRaffleV2 is Script {
    // ═══════════════════════════════════════════════════════════════════════
    // BASE SEPOLIA ADDRESSES (Current Deployment)
    // ═══════════════════════════════════════════════════════════════════════
    address constant SOF_TOKEN = 0x5146Dd2a3Af7Bd4D247e34A3F7322daDF7ee5B0c;
    address constant VRF_COORDINATOR = 0xd88C5567562d8aAc5F7e0B29D28a19bCc476F89A;
    bytes32 constant VRF_KEY_HASH = 0x4e5acf960b4e5bb0fb6b4ba4ed1d3c5082bf7a77be61a38ee3f9b33b0ef55f78;
    uint256 constant VRF_SUBSCRIPTION_ID = 73792378781135252127008189335888841627689978583155781596351805658895418466761;
    
    // Existing infrastructure to connect
    address constant SEASON_FACTORY = 0xe2B70C759540EE54E758c4e5eb8Adc30B1aFABc3;
    address constant PRIZE_DISTRIBUTOR = 0xf7B7A8A28C5C8f42E0A20668E3FD01c20aB1A92d;
    
    // Hats Protocol (deployed earlier)
    address constant HATS_PROTOCOL = 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137;
    uint256 constant SPONSOR_HAT_ID = 4906710704797555772930907284579868421939586530586350599955822902509568;
    
    // Backend wallet for RAFFLE_MANAGER_ROLE
    address constant BACKEND_WALLET = 0x1eD4aC856D7a072C3a336C0971a47dB86A808Ff4;

    function run() public {
        address deployer = msg.sender;
        console2.log(unicode"🎰 Deploying Raffle V2 with Hats Integration");
        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);
        
        vm.startBroadcast();
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 1: Deploy new Raffle contract
        // ═══════════════════════════════════════════════════════════════════
        console2.log(unicode"\n📦 Deploying Raffle...");
        Raffle raffle = new Raffle(
            SOF_TOKEN,
            VRF_COORDINATOR,
            VRF_SUBSCRIPTION_ID,
            VRF_KEY_HASH
        );
        console2.log(unicode"✅ Raffle deployed:", address(raffle));
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 2: Configure SeasonFactory
        // ═══════════════════════════════════════════════════════════════════
        console2.log(unicode"\n⚙️  Setting SeasonFactory...");
        raffle.setSeasonFactory(SEASON_FACTORY);
        console2.log(unicode"✅ SeasonFactory set");
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 3: Configure PrizeDistributor
        // ═══════════════════════════════════════════════════════════════════
        console2.log(unicode"\n⚙️  Setting PrizeDistributor...");
        raffle.setPrizeDistributor(PRIZE_DISTRIBUTOR);
        console2.log(unicode"✅ PrizeDistributor set");
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 4: Configure Hats Protocol
        // ═══════════════════════════════════════════════════════════════════
        console2.log(unicode"\n🎩 Configuring Hats Protocol...");
        raffle.setHatsProtocol(HATS_PROTOCOL);
        console2.log(unicode"✅ Hats Protocol set:", HATS_PROTOCOL);
        
        raffle.setSponsorHat(SPONSOR_HAT_ID);
        console2.log(unicode"✅ Sponsor Hat ID set:", SPONSOR_HAT_ID);
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 5: Grant SEASON_CREATOR_ROLE to backend wallet
        // ═══════════════════════════════════════════════════════════════════
        console2.log(unicode"\n🔑 Granting roles...");
        bytes32 SEASON_CREATOR_ROLE = keccak256("SEASON_CREATOR_ROLE");
        raffle.grantRole(SEASON_CREATOR_ROLE, BACKEND_WALLET);
        console2.log(unicode"✅ SEASON_CREATOR_ROLE granted to backend:", BACKEND_WALLET);
        
        vm.stopBroadcast();
        
        // ═══════════════════════════════════════════════════════════════════
        // OUTPUT SUMMARY
        // ═══════════════════════════════════════════════════════════════════
        console2.log(unicode"\n═══════════════════════════════════════════════════════");
        console2.log(unicode"🎰 RAFFLE V2 DEPLOYMENT COMPLETE");
        console2.log(unicode"═══════════════════════════════════════════════════════");
        console2.log("Raffle V2 Address:   ", address(raffle));
        console2.log("SOF Token:           ", SOF_TOKEN);
        console2.log("VRF Coordinator:     ", VRF_COORDINATOR);
        console2.log("Season Factory:      ", SEASON_FACTORY);
        console2.log("Prize Distributor:   ", PRIZE_DISTRIBUTOR);
        console2.log("Hats Protocol:       ", HATS_PROTOCOL);
        console2.log("Sponsor Hat ID:      ", SPONSOR_HAT_ID);
        console2.log(unicode"═══════════════════════════════════════════════════════");
        console2.log(unicode"\n🔧 REMAINING MANUAL STEPS:");
        console2.log("1. Add Raffle as VRF consumer:");
        console2.log("   - Go to https://vrf.chain.link/base-sepolia/", VRF_SUBSCRIPTION_ID);
        console2.log("   - Add consumer:", address(raffle));
        console2.log("");
        console2.log("2. Update SeasonFactory to use new Raffle:");
        console2.log("   cast send", SEASON_FACTORY);
        console2.log('     "setRaffle(address)"', address(raffle));
        console2.log("");
        console2.log("3. Update env vars in Vercel + Railway");
        console2.log("4. Update ABIs");
        console2.log(unicode"═══════════════════════════════════════════════════════\n");
    }
}
