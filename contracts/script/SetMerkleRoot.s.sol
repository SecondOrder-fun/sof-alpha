// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/Raffle.sol";

contract SetMerkleRoot is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address raffleAddr = vm.envAddress("RAFFLE_ADDRESS");
        uint256 seasonId = vm.envUint("SEASON_ID");
        bytes32 root = vm.envBytes32("ROOT");

        Raffle raffle = Raffle(raffleAddr);

        vm.startBroadcast(deployerPrivateKey);
        raffle.setSeasonMerkleRoot(seasonId, root);
        vm.stopBroadcast();
    }
}
