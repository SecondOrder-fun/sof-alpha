// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SOFToken} from "../src/token/SOFToken.sol";
import {Raffle} from "../src/core/Raffle.sol";
import {RaffleTypes} from "../src/lib/RaffleTypes.sol";
import {SOFBondingCurve} from "../src/curve/SOFBondingCurve.sol";

contract BuyTickets is Script {
    uint256 constant NUM_USERS = 10;
    uint256 constant SOF_FUND_AMOUNT = 10_000_000 * 1e18;
    uint256 constant TICKETS_TO_BUY = 100_000;

    function run() external {
        // Load contracts
        SOFToken sof = SOFToken(vm.envAddress("SOF_ADDRESS"));
        Raffle raffle = Raffle(vm.envAddress("RAFFLE_ADDRESS"));
        uint256 seasonId = vm.envOr("SEASON_ID", uint256(1));

        (,,,,,,,,address bondingCurveAddress,,) = raffle.seasons(seasonId);
        SOFBondingCurve bondingCurve = SOFBondingCurve(bondingCurveAddress);

        uint256[] memory pks = new uint256[](NUM_USERS);
        pks[0] = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        pks[1] = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        pks[2] = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
        pks[3] = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
        pks[4] = 0x47e179ec197488593b187f803b4750ac53b17c7d3a9bb2864537d7e623258b99;
        pks[5] = 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba;
        pks[6] = 0x921b31e16af0336d8f615e23de146b31d4932ade2476944c43e424bf611be7a3;
        pks[7] = 0xda61b4a8a7606b1d86b60224b86b630a9af5df846c2b7b4b99d97bd45f9e8589;
        pks[8] = 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6;
        pks[9] = 0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897;

        // Fund accounts 1-9
        vm.startBroadcast(pks[0]);
        for (uint256 i = 1; i < NUM_USERS; i++) {
            address user = vm.addr(pks[i]);
            sof.transfer(user, SOF_FUND_AMOUNT);
            payable(user).transfer(1 ether);
            console2.log("Funded account", user, "with 10M SOF and 1 ETH");
        }
        vm.stopBroadcast();

        // Each user buys 10% of the tickets
        for (uint256 i = 0; i < NUM_USERS; i++) {
            uint256 userPk = pks[i];
            address user = vm.addr(userPk);
            
            vm.startBroadcast(userPk);

            uint256 balBefore = sof.balanceOf(user);
            console2.log("User", i, "balance before:", balBefore);

            sof.approve(address(bondingCurve), type(uint256).max);

            uint256 maxCost = bondingCurve.calculateBuyPrice(TICKETS_TO_BUY) * 110 / 100; // 10% slippage
            bondingCurve.buyTokens(TICKETS_TO_BUY, maxCost);

            uint256 balAfter = sof.balanceOf(user);
            console2.log("User", i, "balance after:", balAfter);
            console2.log("User", i, "spent:", balBefore - balAfter);

            vm.stopBroadcast();
        }
    }
}