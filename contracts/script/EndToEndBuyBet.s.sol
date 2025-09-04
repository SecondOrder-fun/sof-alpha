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
 * End-to-end helper script to automate:
 * 1) Create a season
 * 2) Start season (time-warp locally)
 * 3) Transfer SOF to two user accounts
 * 4) Buy raffle tickets from both accounts on the curve
 * 5) Create an InfoFi market (operator)
 * 6) Approve SOF and place YES/NO bets from two accounts
 *
 * Required env vars:
 * - PRIVATE_KEY                (deployer/admin; has SOF balance)
 * - RAFFLE_ADDRESS             (deployed Raffle)
 * - SOF_ADDRESS                (deployed SOF token)
 * - INFOFI_MARKET_ADDRESS      (deployed InfoFiMarket)
 * - ACCOUNT1_PRIVATE_KEY       (first user)
 * - ACCOUNT2_PRIVATE_KEY       (second user)
 *
 * Usage (example against Anvil):
 * forge script script/EndToEndBuyBet.s.sol \
 *   --rpc-url http://127.0.0.1:8545 \
 *   --broadcast -vvvv
 */
contract EndToEndBuyBet is Script {
    function run() external {
        // Read env
        uint256 adminPk = vm.envUint("PRIVATE_KEY");
        address raffleAddr = vm.envAddress("RAFFLE_ADDRESS");
        address sofAddr = vm.envAddress("SOF_ADDRESS");
        address infoFiMarketAddr = vm.envAddress("INFOFI_MARKET_ADDRESS");

        uint256 user1Pk = vm.envUint("ACCOUNT1_PRIVATE_KEY");
        uint256 user2Pk = vm.envUint("ACCOUNT2_PRIVATE_KEY");
        address user1 = vm.addr(user1Pk);
        address user2 = vm.addr(user2Pk);

        require(raffleAddr != address(0), "RAFFLE_ADDRESS not set");
        require(sofAddr != address(0), "SOF_ADDRESS not set");
        require(infoFiMarketAddr != address(0), "INFOFI_MARKET_ADDRESS not set");

        Raffle raffle = Raffle(raffleAddr);
        IERC20 sof = IERC20(sofAddr);
        InfoFiMarket infoFi = InfoFiMarket(infoFiMarketAddr);

        // 1) Create a season (admin)
        vm.startBroadcast(adminPk);
        uint256 startTs = block.timestamp + 30; // start 30s in the future
        uint256 endTs = startTs + 1 days;

        RaffleTypes.SeasonConfig memory config = RaffleTypes.SeasonConfig({
            name: "E2E-Season",
            startTime: startTs,
            endTime: endTs,
            winnerCount: 3,
            prizePercentage: 5000, // 50%
            consolationPercentage: 4000, // 40%
            raffleToken: address(0),
            bondingCurve: address(0),
            isActive: false,
            isCompleted: false
        });

        // Build a small curve: 10 steps x 1,000
        uint256 STEPS = 10;
        RaffleTypes.BondStep[] memory steps = new RaffleTypes.BondStep[](STEPS);
        uint128 basePrice = 1e18; // 1 SOF
        uint128 increment = 1e17; // +0.1 SOF/step
        for (uint256 i = 0; i < STEPS; i++) {
            uint32 rangeTo = uint32((i + 1) * 1000);
            uint128 price = basePrice + uint128(i) * increment;
            steps[i] = RaffleTypes.BondStep({rangeTo: rangeTo, price: price});
        }

        uint16 buyFeeBps = 10;  // 0.1%
        uint16 sellFeeBps = 70; // 0.7%

        uint256 seasonId = raffle.createSeason(config, steps, buyFeeBps, sellFeeBps);
        console2.log("[E2E] Season created:", seasonId);

        // Read curve + token addresses
        (
            RaffleTypes.SeasonConfig memory cfg,
            , , ,
        ) = raffle.getSeasonDetails(seasonId);
        console2.log("[E2E] Curve:", cfg.bondingCurve);
        console2.log("[E2E] Token:", cfg.raffleToken);

        // 2) Warp and start season
        vm.warp(startTs + 1);
        raffle.startSeason(seasonId);
        console2.log("[E2E] Season started");

        // 3) Fund two users with SOF
        uint256 fundAmt = 10_000 ether;
        require(sof.transfer(user1, fundAmt), "SOF transfer to user1 failed");
        require(sof.transfer(user2, fundAmt), "SOF transfer to user2 failed");
        console2.log("[E2E] Funded users with SOF:", fundAmt);
        vm.stopBroadcast();

        // 4) Both users approve curve and buy tokens
        SOFBondingCurve curve = SOFBondingCurve(cfg.bondingCurve);

        // User1: approve and buy
        vm.startBroadcast(user1Pk);
        require(sof.approve(address(curve), type(uint256).max), "approve u1->curve failed");
        uint256 buyTokensU1 = 1000; // tokens
        uint256 baseCostU1 = curve.calculateBuyPrice(buyTokensU1);
        // add 5% headroom for fee + rounding
        uint256 maxCostU1 = (baseCostU1 * 105) / 100;
        curve.buyTokens(buyTokensU1, maxCostU1);
        console2.log("[E2E] User1 bought tokens:", buyTokensU1, "baseCost:", baseCostU1);
        vm.stopBroadcast();

        // User2: approve and buy
        vm.startBroadcast(user2Pk);
        require(sof.approve(address(curve), type(uint256).max), "approve u2->curve failed");
        uint256 buyTokensU2 = 500; // tokens
        uint256 baseCostU2 = curve.calculateBuyPrice(buyTokensU2);
        uint256 maxCostU2 = (baseCostU2 * 105) / 100;
        curve.buyTokens(buyTokensU2, maxCostU2);
        console2.log("[E2E] User2 bought tokens:", buyTokensU2, "baseCost:", baseCostU2);
        vm.stopBroadcast();

        // 5) Create InfoFi market for user1 (operator action)
        vm.startBroadcast(adminPk);
        string memory question = string(abi.encodePacked("Will ", _toHexString(user1), " win this raffle?"));
        infoFi.createMarket(seasonId, user1, question, address(sof));
        // The created market will have ID = nextMarketId-1; query it
        uint256 marketId = infoFi.nextMarketId() - 1;
        console2.log("[E2E] Created InfoFi market:", marketId);
        vm.stopBroadcast();

        // 6) Approve SOF and place bets
        // user1 YES
        vm.startBroadcast(user1Pk);
        require(sof.approve(address(infoFi), type(uint256).max), "approve u1->infofi failed");
        uint256 yesBet = 1 ether;
        infoFi.placeBet(marketId, true, yesBet);
        console2.log("[E2E] User1 YES bet:", yesBet);
        vm.stopBroadcast();

        // user2 NO
        vm.startBroadcast(user2Pk);
        require(sof.approve(address(infoFi), type(uint256).max), "approve u2->infofi failed");
        uint256 noBet = 1.5 ether;
        infoFi.placeBet(marketId, false, noBet);
        console2.log("[E2E] User2 NO bet:", noBet);
        vm.stopBroadcast();

        // Log final market pools
        ( , , , , uint256 yesPool, uint256 noPool, uint256 totalPool, ) = infoFi.quote(marketId);
        console2.log("[E2E] Market pools:");
        console2.log("  YES:");
        console2.logUint(yesPool);
        console2.log("  NO:");
        console2.logUint(noPool);
        console2.log("  TOTAL:");
        console2.logUint(totalPool);

        console2.log("[E2E] Flow complete: season created+started, buys executed, market created, bets placed.");
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
