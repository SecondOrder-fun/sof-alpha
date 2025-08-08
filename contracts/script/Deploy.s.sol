// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/Raffle.sol";
import "../src/infofi/InfoFiMarket.sol";

contract DeployScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address vrfCoordinator = vm.envAddress("VRF_COORDINATOR");
        bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
        uint256 subscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy Raffle contract
        Raffle raffle = new Raffle(
            vrfCoordinator,
            keyHash,
            subscriptionId
        );
        
        // Deploy InfoFiMarket contract
        InfoFiMarket infoFiMarket = new InfoFiMarket();
        
        vm.stopBroadcast();
        
        // Output deployed addresses
        console.log("Raffle contract deployed at:", address(raffle));
        console.log("InfoFiMarket contract deployed at:", address(infoFiMarket));
    }
}