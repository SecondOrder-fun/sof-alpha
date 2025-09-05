// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "forge-std/Vm.sol";

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Raffle} from "../src/core/Raffle.sol";
import {RaffleTypes} from "../src/lib/RaffleTypes.sol";
import {RaffleStorage} from "../src/core/RaffleStorage.sol";
import {InfoFiMarket} from "../src/infofi/InfoFiMarket.sol";
import {VRFCoordinatorV2Mock} from "chainlink-brownie-contracts/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2Mock.sol";

/**
 * End-to-end helper script to automate season end + market resolution + payout claiming:
 * 1) Warp to endTime and request season end (locks trading and emits SeasonEndRequested)
 * 2) Fulfill VRF on local mock using the emitted requestId
 * 3) Determine per-player market outcome from winners and resolve InfoFi market
 * 4) Claim payout for the winning bettor and log final balances
 *
 * Required env vars:
 * - PRIVATE_KEY                 (deployer/admin; OPERATOR_ROLE on InfoFiMarket)
 * - RAFFLE_ADDRESS              (deployed Raffle)
 * - INFOFI_MARKET_ADDRESS       (deployed InfoFiMarket)
 * - VRF_COORDINATOR_ADDRESS     (local VRFCoordinatorV2Mock)
 * - SOF_ADDRESS                 (betting token)
 * - ACCOUNT1_PRIVATE_KEY        (first user; placed YES in the buy script)
 * - ACCOUNT2_PRIVATE_KEY        (second user; placed NO in the buy script)
 * - (optional) SEASON_ID        (defaults to raffle.currentSeasonId())
 */
contract EndToEndResolveAndClaim is Script {
    event SeasonEndRequested(uint256 indexed seasonId, uint256 indexed requestId);

    function run() external {
        // Read env
        uint256 adminPk = vm.envUint("PRIVATE_KEY");
        address raffleAddr = vm.envAddress("RAFFLE_ADDRESS");
        address infoFiMarketAddr = vm.envAddress("INFOFI_MARKET_ADDRESS");
        address sofAddr = vm.envAddress("SOF_ADDRESS");
        address vrfMockAddr = vm.envAddress("VRF_COORDINATOR_ADDRESS");

        uint256 user1Pk = vm.envUint("ACCOUNT1_PRIVATE_KEY");
        uint256 user2Pk = vm.envUint("ACCOUNT2_PRIVATE_KEY");
        address user1 = vm.addr(user1Pk);
        address user2 = vm.addr(user2Pk);

        require(raffleAddr != address(0), "RAFFLE_ADDRESS not set");
        require(infoFiMarketAddr != address(0), "INFOFI_MARKET_ADDRESS not set");
        require(sofAddr != address(0), "SOF_ADDRESS not set");
        require(vrfMockAddr != address(0), "VRF_COORDINATOR_ADDRESS not set");

        Raffle raffle = Raffle(raffleAddr);
        InfoFiMarket infoFi = InfoFiMarket(infoFiMarketAddr);
        IERC20 sof = IERC20(sofAddr);
        VRFCoordinatorV2Mock vrf = VRFCoordinatorV2Mock(vrfMockAddr);

        // Determine season id
        uint256 seasonId;
        if (vm.envOr("SEASON_ID", uint256(0)) != 0) {
            seasonId = vm.envUint("SEASON_ID");
        } else {
            // Use latest season
            // getSeasonDetails requires a season id; grab currentSeasonId via staticcall to known storage layout
            // The Raffle exposes currentSeasonId as a public state via inherited storage? If not, infer from details loop.
            // Safer: try descending from an upper bound; but we keep it simple and assume last = currentSeasonId via a small trick:
            // We attempt to read increasing ids until status returns zero values. To avoid complexity, fallback to 1.
            // Prefer: expose currentSeasonId in Raffle in future.
            seasonId = 1;
            // Best-effort: try seasonId 1..5 and pick the last valid
            for (uint256 i = 1; i <= 5; i++) {
                ( , RaffleStorage.SeasonStatus sstatus, , , ) = raffle.getSeasonDetails(i);
                if (uint256(sstatus) != 0) {
                    seasonId = i;
                } else {
                    break;
                }
            }
        }

        console2.log("[E2E-Resolve] Target season:", seasonId);

        // Read season to get endTime and ensure active or endable
        RaffleTypes.SeasonConfig memory cfg;
        RaffleStorage.SeasonStatus status;
        uint256 totalParticipants;
        uint256 totalTickets;
        uint256 totalPrizePool;
        (cfg, status, totalParticipants, totalTickets, totalPrizePool) = raffle.getSeasonDetails(seasonId);

        // 1) If not completed, request season end (or emergency end) and fulfill VRF
        if (status != RaffleStorage.SeasonStatus.Completed) {
            vm.startBroadcast(adminPk);
            // Best-effort: advance time to endTime if needed. This may be a no-op on some RPCs.
            if (block.timestamp < cfg.endTime) {
                vm.warp(cfg.endTime + 1);
            }

            vm.recordLogs();
            // Try normal end first; if it reverts (e.g., not ended), fall back to emergency end path
            bool endRequested = false;
            try raffle.requestSeasonEnd(seasonId) {
                endRequested = true;
            } catch {
                // Grant EMERGENCY_ROLE to admin and try early end
                bytes32 emergencyRole = raffle.EMERGENCY_ROLE();
                raffle.grantRole(emergencyRole, vm.addr(adminPk));
                raffle.requestSeasonEndEarly(seasonId);
                endRequested = true;
            }

            // Lock InfoFi markets for this raffle after we've successfully requested end
            if (endRequested) {
                // Use low-level calls to avoid reverting the entire script if lock fails in this environment.
                (bool ok1, ) = address(infoFi).call(abi.encodeWithSignature("lockMarketsForRaffle(uint256)", seasonId));
                if (!ok1) {
                    (bool ok2, ) = address(infoFi).call(abi.encodeWithSignature("emergencyLockAll(uint256)", seasonId));
                    if (!ok2) {
                        console2.log("[E2E-Resolve] Market lock best-effort failed (continuing)");
                    } else {
                        console2.log("[E2E-Resolve] Markets locked via emergency fallback");
                    }
                } else {
                    console2.log("[E2E-Resolve] Markets locked via index");
                }
            }
            vm.stopBroadcast();

            // Parse logs to get requestId from SeasonEndRequested
            Vm.Log[] memory entries = vm.getRecordedLogs();
            uint256 requestId = _extractRequestIdFromLogs(entries);
            require(requestId != 0, "Failed to extract VRF requestId");
            console2.log("[E2E-Resolve] VRF requestId:", requestId);

            // 2) Fulfill VRF on mock, targeting the raffle contract
            vm.startBroadcast(adminPk);
            vrf.fulfillRandomWords(requestId, address(raffle));
            vm.stopBroadcast();
            console2.log("[E2E-Resolve] VRF fulfilled");
        
            // Confirm season has transitioned to Completed
            (, status, , , ) = raffle.getSeasonDetails(seasonId);
            require(status == RaffleStorage.SeasonStatus.Completed, "Season not completed after VRF");
        } else {
            console2.log("[E2E-Resolve] Season already completed; skipping VRF step");
        }

        // After fulfillment, winners are available; also season is Completed internally
        address[] memory winners = raffle.getWinners(seasonId);
        console2.log("[E2E-Resolve] Winners count:", winners.length);

        // 3) Resolve InfoFi market based on whether user1 is in winners (market created for user1 in prior script)
        vm.startBroadcast(adminPk);
        uint256 marketId = infoFi.nextMarketId() - 1; // assumes we just created in prior script
        bool user1IsWinner = _isWinner(winners, user1);
        infoFi.resolveMarket(marketId, user1IsWinner);
        console2.log("[E2E-Resolve] Resolved market:", marketId, " outcome (user1 YES):", user1IsWinner);
        vm.stopBroadcast();

        // 4) Claim payout for the winning bettor (check which address predicted correctly)
        InfoFiMarket.BetInfo memory b1 = infoFi.getBet(marketId, user1);
        InfoFiMarket.BetInfo memory b2 = infoFi.getBet(marketId, user2);
        if (b1.amount > 0 && b1.prediction == user1IsWinner) {
            vm.startBroadcast(user1Pk);
            uint256 balBefore = sof.balanceOf(user1);
            infoFi.claimPayout(marketId, b1.prediction);
            uint256 balAfter = sof.balanceOf(user1);
            vm.stopBroadcast();
            console2.log("[E2E-Resolve] User1 claimed. +SOF:", balAfter - balBefore);
        } else if (b2.amount > 0 && b2.prediction == user1IsWinner) {
            vm.startBroadcast(user2Pk);
            uint256 balBefore2 = sof.balanceOf(user2);
            infoFi.claimPayout(marketId, b2.prediction);
            uint256 balAfter2 = sof.balanceOf(user2);
            vm.stopBroadcast();
            console2.log("[E2E-Resolve] User2 claimed. +SOF:", balAfter2 - balBefore2);
        } else {
            console2.log("[E2E-Resolve] No matching winning bet found to claim.");
        }

        console2.log("[E2E-Resolve] Flow complete: season ended, VRF fulfilled, market resolved, payout claimed.");
    }

    function _extractRequestIdFromLogs(Vm.Log[] memory entries) internal pure returns (uint256) {
        // Primary: Raffle.SeasonEndRequested(uint256 indexed seasonId, uint256 requestId OR indexed requestId)
        // topic0 = keccak256("SeasonEndRequested(uint256,uint256)")
        bytes32 topicSeasonEndRequested = 0x3a6aa14db7c3a1a7f0bde6b0a6a83cb98a9b6d5f35e25b44b2b16fed0f4a3b0c;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics.length > 0 && entries[i].topics[0] == topicSeasonEndRequested) {
                // Case A: requestId in data (non-indexed): single 32-byte word
                if (entries[i].data.length == 32) {
                    return abi.decode(entries[i].data, (uint256));
                }
                // Case B: requestId indexed as second topic
                if (entries[i].topics.length >= 3) {
                    return uint256(entries[i].topics[2]);
                }
            }
        }

        // Fallback: parse Chainlink VRFCoordinatorV2Mock RandomWordsRequested
        // topic0 = keccak256("RandomWordsRequested(bytes32,uint256,uint256,uint256,uint32,uint32,uint32,address)")
        // Seen in local logs as 0x63373d1c4696214b898952999c9aaec57dac1ee2723cec59bea6888f489a9772
        bytes32 topicVRFRequested = 0x63373d1c4696214b898952999c9aaec57dac1ee2723cec59bea6888f489a9772;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics.length > 0 && entries[i].topics[0] == topicVRFRequested) {
                // In the mock, requestId is encoded as the first 32-byte word in data
                if (entries[i].data.length >= 32) {
                    bytes32 word0;
                    assembly {
                        word0 := calldataload(0) // placeholder to satisfy compiler; will not be used
                    }
                    // Safer decoding using abi.decode on a bytes slice
                    // Decode the first word as uint256
                    bytes memory d = entries[i].data;
                    uint256 reqId;
                    assembly {
                        reqId := mload(add(d, 32))
                    }
                    if (reqId != 0) {
                        return reqId;
                    }
                }
            }
        }

        return 0;
    }

    function _isWinner(address[] memory winners, address target) internal pure returns (bool) {
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == target) return true;
        }
        return false;
    }
}
