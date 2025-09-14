// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import "forge-std/StdJson.sol";
import {SOFToken} from "../src/token/SOFToken.sol";
import {Raffle} from "../src/core/Raffle.sol";
import {RafflePrizeDistributor} from "../src/core/RafflePrizeDistributor.sol";

contract ClaimPrizes is Script {
    using stdJson for string;

    uint256 constant NUM_USERS = 10;

    function run() external {
        SOFToken sof = SOFToken(vm.envAddress("SOF_ADDRESS"));
        Raffle raffle = Raffle(vm.envAddress("RAFFLE_ADDRESS"));
        RafflePrizeDistributor distributor = RafflePrizeDistributor(vm.envAddress("PRIZE_DISTRIBUTOR_ADDRESS"));
        uint256 seasonId = vm.envOr("SEASON_ID", uint256(1));

        address[] memory winners = raffle.getWinners(seasonId);
        address winner = winners[0];
        console2.log("Winner is:", winner);

        // Claim grand prize for the winner
        uint256 winnerPk = vm.envUint("WINNER_PK");
        vm.startBroadcast(winnerPk);
        console2.log("Winner claiming grand prize...");
        distributor.claimGrand(seasonId);
        vm.stopBroadcast();

        // Claim one consolation prize for a designated loser
        uint256 loserPk = vm.envUint("LOSER_PK");
        address loserAccount = vm.addr(loserPk);
        uint256 claimIndex = vm.envUint("CLAIM_INDEX");
        uint256 claimAmount = vm.envUint("CLAIM_AMOUNT");
        bytes32[] memory proof = new bytes32[](4);
        proof[0] = vm.envBytes32("PROOF_0");
        proof[1] = vm.envBytes32("PROOF_1");
        proof[2] = vm.envBytes32("PROOF_2");
        proof[3] = vm.envBytes32("PROOF_3");

        vm.startBroadcast(loserPk);
        console2.log("Loser claiming consolation prize...");
        distributor.claimConsolation(seasonId, claimIndex, loserAccount, claimAmount, proof);
        vm.stopBroadcast();

        console2.log("Prizes claimed.");
    }

    function toChecksumString(address a) internal pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = '0';
        s[1] = 'x';
        bytes memory addrBytes = abi.encodePacked(a);
        bytes32 hashed = keccak256(addrBytes);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = addrBytes[i];
            uint8 val = uint8(b);
            bytes1 char = bytes1(val >> 4);
            s[2 + i * 2] = _toHexChar(char, uint8(hashed[i] >> 4) >= 8);
            char = bytes1(val & 0x0f);
            s[3 + i * 2] = _toHexChar(char, uint8(hashed[i] & 0x0f) >= 8);
        }
        return string(s);
    }

    function _toHexChar(bytes1 b, bool uppercase) internal pure returns (bytes1) {
        uint8 val = uint8(b);
        if (val < 10) {
            return bytes1(uint8(bytes1('0')) + val);
        } else {
            if (uppercase) {
                return bytes1(uint8(bytes1('A')) + val - 10);
            } else {
                return bytes1(uint8(bytes1('a')) + val - 10);
            }
        }
    }
}