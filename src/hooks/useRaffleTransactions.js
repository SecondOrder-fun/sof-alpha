// src/hooks/useRaffleTransactions.js
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { parseAbiItem } from "viem";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { buildPublicClient } from "@/lib/viemClient";
import { queryLogsInChunks } from "@/utils/blockRangeQuery";

/**
 * Fetch raffle transactions from on-chain PositionUpdate events
 * @param {string} bondingCurveAddress - The bonding curve contract address
 * @param {number} seasonId - The season ID for filtering
 * @param {object} options - Query options
 * @returns {object} Query result with transactions data
 */
export const useRaffleTransactions = (
  bondingCurveAddress,
  seasonId,
  options = {},
) => {
  const queryClient = useQueryClient();
  const netKey = getStoredNetworkKey();
  const client = useMemo(() => {
    return buildPublicClient(netKey);
  }, [netKey]);

  const query = useQuery({
    queryKey: ["raffleTransactions", bondingCurveAddress, seasonId],
    queryFn: async () => {
      if (!client || !bondingCurveAddress) {
          client: !!client,
          bondingCurveAddress,
        });
        return [];
      }

      try {
        // Get current block
        const currentBlock = await client.getBlockNumber();

        // Use startBlock (exact) if available, otherwise estimate from startTime
        let fromBlock = 0n;
        if (options.startBlock) {
          // Exact block from database - most efficient
          fromBlock = BigInt(options.startBlock);
        } else if (options.startTime) {
          // Estimate from startTime (trading starts at startTime)
          // Base has ~2s blocks, so: blocksAgo = secondsAgo / 2
          const nowSec = Math.floor(Date.now() / 1000);
          const secondsAgo = nowSec - Number(options.startTime);
          const blocksAgo = BigInt(Math.ceil(secondsAgo / 2)) + 1000n; // +1000 buffer
          fromBlock = currentBlock > blocksAgo ? currentBlock - blocksAgo : 0n;
        } else {
          // Fallback: 50k blocks (~1 day) if no timing info provided
          const FALLBACK_LOOKBACK = 50000n;
          fromBlock = currentBlock > FALLBACK_LOOKBACK ? currentBlock - FALLBACK_LOOKBACK : 0n;
        }

        const positionUpdateEvent = parseAbiItem(
          "event PositionUpdate(uint256 indexed seasonId, address indexed player, uint256 oldTickets, uint256 newTickets, uint256 totalTickets)",
        );

        // Use chunked query to handle RPC block range limits
        const logs = await queryLogsInChunks(client, {
          address: bondingCurveAddress,
          event: positionUpdateEvent,
          fromBlock,
          toBlock: "latest",
        });

          bondingCurveAddress,
          fromBlock: fromBlock.toString(),
          toBlock: "latest",
          totalLogs: logs.length,
          seasonId,
        });

        // Filter by seasonId if provided
        const filteredLogs = seasonId
          ? logs.filter((log) => Number(log.args.seasonId) === Number(seasonId))
          : logs;

        console.log(
          "[useRaffleTransactions] Filtered logs:",
          filteredLogs.length,
        );

        // Fetch block timestamps for each transaction
        const transactions = await Promise.all(
          filteredLogs.map(async (log) => {
            try {
              const block = await client.getBlock({
                blockNumber: log.blockNumber,
              });
              const oldTickets = BigInt(log.args.oldTickets || 0n);
              const newTickets = BigInt(log.args.newTickets || 0n);
              const ticketsDelta = newTickets - oldTickets;

              return {
                txHash: log.transactionHash,
                blockNumber: Number(log.blockNumber),
                timestamp: Number(block.timestamp),
                player: log.args.player,
                oldTickets,
                newTickets,
                ticketsDelta,
                totalTickets: BigInt(log.args.totalTickets || 0n),
                // Calculate probability from position/total (probabilityBps not in event)
                probabilityBps: 0,
                type: ticketsDelta > 0n ? "buy" : "sell",
                logIndex: log.logIndex,
              };
            } catch (error) {
              console.error("Error fetching block for transaction:", error);
              // Return transaction without timestamp if block fetch fails
              const oldTickets = BigInt(log.args.oldTickets || 0n);
              const newTickets = BigInt(log.args.newTickets || 0n);
              const ticketsDelta = newTickets - oldTickets;

              return {
                txHash: log.transactionHash,
                blockNumber: Number(log.blockNumber),
                timestamp: null,
                player: log.args.player,
                oldTickets,
                newTickets,
                ticketsDelta,
                totalTickets: BigInt(log.args.totalTickets || 0n),
                probabilityBps: 0,
                type: ticketsDelta > 0n ? "buy" : "sell",
                logIndex: log.logIndex,
              };
            }
          }),
        );

        // Sort by block number (descending) and return
        const sorted = transactions.sort(
          (a, b) => b.blockNumber - a.blockNumber,
        );
        console.log(
          "[useRaffleTransactions] Returning transactions:",
          sorted.length,
        );
        return sorted;
      } catch (error) {
        console.error(
          "[useRaffleTransactions] Error fetching transactions:",
          error,
        );
        throw error;
      }
    },
    enabled: !!client && !!bondingCurveAddress,
    staleTime: 30000, // 30 seconds
    refetchInterval: options.enablePolling !== false ? 30000 : false,
    ...options,
  });

  /**
   * Manually refetch transactions
   */
  const refetch = () => {
    queryClient.invalidateQueries({
      queryKey: ["raffleTransactions", bondingCurveAddress, seasonId],
    });
  };

  return {
    ...query,
    transactions: query.data || [],
    refetch,
  };
};
