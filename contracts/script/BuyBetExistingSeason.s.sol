// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Raffle} from "../src/core/Raffle.sol";
import {RaffleTypes} from "../src/lib/RaffleTypes.sol";
import {SOFBondingCurve} from "../src/curve/SOFBondingCurve.sol";
import {InfoFiMarket} from "../src/infofi/InfoFiMarket.sol";

/**
 * @title BuyBetExistingSeason
 * @notice Performs the buy-and-bet flow against an ALREADY CREATED AND STARTED season.
 *         It DOES NOT create or start a season.
 *
 * Required env vars:
 * - PRIVATE_KEY                (admin/operator; has SOF balance)
 * - RAFFLE_ADDRESS             (deployed Raffle)
 * - SOF_ADDRESS                (deployed SOF token)
 * - INFOFI_MARKET_ADDRESS      (deployed InfoFiMarket)
 * - SEASON_ID                  (the existing, started season ID to act on)
 * - ACCOUNT1_PRIVATE_KEY       (first user)
 * - ACCOUNT2_PRIVATE_KEY       (second user)
 */
contract BuyBetExistingSeason is Script {
    function run() external {
        // Read env
        uint256 adminPk = vm.envUint("PRIVATE_KEY");
        address raffleAddr = vm.envAddress("RAFFLE_ADDRESS");
        address sofAddr = vm.envAddress("SOF_ADDRESS");
        address infoFiMarketAddr = vm.envAddress("INFOFI_MARKET_ADDRESS");
        uint256 seasonId = vm.envUint("SEASON_ID");

        uint256 user1Pk = vm.envUint("ACCOUNT1_PRIVATE_KEY");
        uint256 user2Pk = vm.envUint("ACCOUNT2_PRIVATE_KEY");
        address user1 = vm.addr(user1Pk);
        address user2 = vm.addr(user2Pk);

        require(raffleAddr != address(0), "RAFFLE_ADDRESS not set");
        require(sofAddr != address(0), "SOF_ADDRESS not set");
        require(infoFiMarketAddr != address(0), "INFOFI_MARKET_ADDRESS not set");
        require(seasonId > 0, "SEASON_ID must be > 0");

        Raffle raffle = Raffle(raffleAddr);
        IERC20 sof = IERC20(sofAddr);
        InfoFiMarket infoFi = InfoFiMarket(infoFiMarketAddr);

        // Read existing season details and assert it is active
        (
            RaffleTypes.SeasonConfig memory cfg,
            , , ,
        ) = raffle.getSeasonDetails(seasonId);
        console2.log("[Existing] Season:", seasonId);
        console2.log("[Existing] Name:", cfg.name);
        console2.log("[Existing] Active:", cfg.isActive);
        require(cfg.isActive, "Season is not active (start it first)");

        // 1) Fund two users with SOF from admin/operator
        vm.startBroadcast(adminPk);
        uint256 fundAmt = 10_000 ether;
        require(sof.transfer(user1, fundAmt), "SOF transfer to user1 failed");
        require(sof.transfer(user2, fundAmt), "SOF transfer to user2 failed");
        console2.log("[Flow] Funded users with SOF:", fundAmt);
        vm.stopBroadcast();

        // 2) Both users approve curve and buy tokens
        SOFBondingCurve curve = SOFBondingCurve(cfg.bondingCurve);
        console2.log("[Existing] Curve:", address(curve));
        console2.log("[Existing] RaffleToken:", cfg.raffleToken);

        // User1: approve and buy
        vm.startBroadcast(user1Pk);
        require(sof.approve(address(curve), type(uint256).max), "approve u1->curve failed");
        uint256 buyTokensU1 = 1000; // tokens
        uint256 baseCostU1 = curve.calculateBuyPrice(buyTokensU1);
        // add 5% headroom for fee + rounding
        uint256 maxCostU1 = (baseCostU1 * 105) / 100;
        curve.buyTokens(buyTokensU1, maxCostU1);
        console2.log("[Flow] User1 bought tokens:", buyTokensU1, "baseCost:", baseCostU1);
        vm.stopBroadcast();

        // User2: approve and buy
        vm.startBroadcast(user2Pk);
        require(sof.approve(address(curve), type(uint256).max), "approve u2->curve failed");
        uint256 buyTokensU2 = 500; // tokens
        uint256 baseCostU2 = curve.calculateBuyPrice(buyTokensU2);
        uint256 maxCostU2 = (baseCostU2 * 105) / 100;
        curve.buyTokens(buyTokensU2, maxCostU2);
        console2.log("[Flow] User2 bought tokens:", buyTokensU2, "baseCost:", baseCostU2);
        vm.stopBroadcast();

        // 3) Create InfoFi market for user1 (operator action)
        vm.startBroadcast(adminPk);
        string memory question = string(abi.encodePacked("Will ", _toHexString(user1), " win this raffle?"));
        infoFi.createMarket(seasonId, user1, question, address(sof));
        // The created market will have ID = nextMarketId-1; query it
        uint256 marketId = infoFi.nextMarketId() - 1;
        console2.log("[Flow] Created InfoFi market:", marketId);
        vm.stopBroadcast();

        // 4) Approve SOF and place bets
        // user1 YES
        vm.startBroadcast(user1Pk);
        require(sof.approve(address(infoFi), type(uint256).max), "approve u1->infofi failed");
        uint256 yesBet = 1 ether;
        infoFi.placeBet(marketId, true, yesBet);
        console2.log("[Flow] User1 YES bet:", yesBet);
        vm.stopBroadcast();

        // user2 NO
        vm.startBroadcast(user2Pk);
        require(sof.approve(address(infoFi), type(uint256).max), "approve u2->infofi failed");
        uint256 noBet = 1.5 ether;
        infoFi.placeBet(marketId, false, noBet);
        console2.log("[Flow] User2 NO bet:", noBet);
        vm.stopBroadcast();

        // Log final market pools
        ( , , , , uint256 yesPool, uint256 noPool, uint256 totalPool, ) = infoFi.quote(marketId);
        console2.log("[Flow] Market pools:");
        console2.log("  YES:");
        console2.logUint(yesPool);
        console2.log("  NO:");
        console2.logUint(noPool);
        console2.log("  TOTAL:");
        console2.logUint(totalPool);

        console2.log("[Flow] Complete: buys executed, market created, bets placed on existing season.");
    }

    // Helper: address -> hex string 0x...
    function _toHexString(address account) internal pure returns (string memory) {
        bytes20 data = bytes20(account);
        bytes16 hexSymbols = 0x30313233343536373839616263646566; // 0-9 a-f
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(data[i]);
            str[2 + i * 2] = bytes1(hexSymbols[b >> 4]);
            str[3 + i * 2] = bytes1(hexSymbols[b & 0x0f]);
        }
        return string(str);
    }
}
