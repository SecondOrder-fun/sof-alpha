// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/core/Raffle.sol";
import "../src/infofi/InfoFiMarket.sol";
import "../src/token/SOFToken.sol";

contract DeployScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address vrfCoordinator = vm.envAddress("VRF_COORDINATOR");
        bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
        uint256 subscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy SOF token (for demo purposes; in prod pass existing SOF address)
        SOFToken sof = new SOFToken("SOF Token", "SOF", 0, msg.sender);

        // Deploy Raffle contract (new signature)
        Raffle raffle = new Raffle(address(sof), vrfCoordinator, subscriptionId, keyHash);
        
        // Deploy InfoFiMarket contract
        InfoFiMarket infoFiMarket = new InfoFiMarket();
        
        vm.stopBroadcast();
        
        // Output deployed addresses
        console2.log("SOF token deployed at:", address(sof));
        console2.log("Raffle contract deployed at:", address(raffle));
        console2.log("InfoFiMarket contract deployed at:", address(infoFiMarket));
    }
}