// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/core/Raffle.sol";
import "../src/infofi/InfoFiMarket.sol";
import "../src/token/SOFToken.sol";
import "../src/core/SeasonFactory.sol";

contract DeployScript is Script {
    function run() external {
        // Load environment variables
        address vrfCoordinator = vm.envAddress("VRF_COORDINATOR");
        bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
        uint64 subscriptionId = uint64(vm.envUint("VRF_SUBSCRIPTION_ID"));

        if (vm.envExists("PRIVATE_KEY")) {
            uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }
        
        // Deploy SOF token with a 10,000,000 SOF premint to the deployer (18 decimals)
        uint256 initialSupply = 10_000_000 ether; // 10,000,000 * 1e18
        SOFToken sof = new SOFToken("SOF Token", "SOF", initialSupply, msg.sender);
        console2.log("SOF initial supply minted to deployer:", initialSupply);

        // Deploy Raffle contract first
        Raffle raffle = new Raffle(address(sof), vrfCoordinator, subscriptionId, keyHash);

        // Deploy SeasonFactory, passing the Raffle contract's address
        SeasonFactory seasonFactory = new SeasonFactory(address(raffle));

        // Set the season factory address in the Raffle contract
        raffle.setSeasonFactory(address(seasonFactory));

        // Grant the RAFFLE_ADMIN_ROLE on the factory to the Raffle contract
        bytes32 raffleAdminRole = seasonFactory.RAFFLE_ADMIN_ROLE();
        seasonFactory.grantRole(raffleAdminRole, address(raffle));
        
        // Deploy InfoFiMarket contract
        InfoFiMarket infoFiMarket = new InfoFiMarket();
        
        vm.stopBroadcast();
        
        // Output deployed addresses
        console2.log("SOF token deployed at:", address(sof));
        console2.log("SeasonFactory contract deployed at:", address(seasonFactory));
        console2.log("Raffle contract deployed at:", address(raffle));
        console2.log("InfoFiMarket contract deployed at:", address(infoFiMarket));
    }
}