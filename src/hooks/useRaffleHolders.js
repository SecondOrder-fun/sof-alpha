// src/hooks/useRaffleHolders.js
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { parseAbiItem } from "viem";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { buildPublicClient } from "@/lib/viemClient";
import { queryLogsInChunks } from "@/utils/blockRangeQuery";

/**
 * Fetch current raffle token holders from on-chain data
 * Aggregates PositionUpdate events to build current holder list
 * @param {string} bondingCurveAddress - The bonding curve contract address
 * @param {number} seasonId - The season ID for filtering
 * @param {object} options - Query options (startBlock, startTime, enablePolling)
 * @returns {object} Query result with holders data
 */
export const useRaffleHolders = (
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
    queryKey: ["raffleHolders", bondingCurveAddress, seasonId],
    queryFn: async () => {
      if (!client || !bondingCurveAddress) {
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

        // Filter by seasonId if provided
        const filteredLogs = seasonId
          ? logs.filter((log) => Number(log.args.seasonId) === Number(seasonId))
          : logs;

        // Aggregate positions by player (keep only latest position per player)
        const playerPositions = new Map();

        for (const log of filteredLogs) {
          const player = log.args.player;
          const blockNumber = Number(log.blockNumber);
          const logIndex = log.logIndex;

          const existing = playerPositions.get(player);

          // Keep the latest position (highest block number and log index)
          if (
            !existing ||
            blockNumber > existing.blockNumber ||
            (blockNumber === existing.blockNumber &&
              logIndex > existing.logIndex)
          ) {
            playerPositions.set(player, {
              player,
              ticketCount: BigInt(log.args.newTickets || 0n),
              totalTicketsAtTime: BigInt(log.args.totalTickets || 0n),
              winProbabilityBps: 0,
              blockNumber,
              logIndex,
              lastUpdate: null,
            });
          }
        }

        // Fetch timestamps for last update
        const holders = await Promise.all(
          Array.from(playerPositions.values()).map(async (holder) => {
            try {
              const block = await client.getBlock({
                blockNumber: BigInt(holder.blockNumber),
              });
              return {
                ...holder,
                lastUpdate: Number(block.timestamp),
              };
            } catch {
              return holder;
            }
          }),
        );

        // Filter out holders with 0 tickets
        const activeHolders = holders.filter((h) => h.ticketCount > 0n);

        // Sort by ticket count (descending) and assign ranks
        const sortedHolders = activeHolders.sort((a, b) => {
          if (b.ticketCount !== a.ticketCount) {
            return Number(b.ticketCount - a.ticketCount);
          }
          // If same ticket count, sort by block number (earlier = higher rank)
          return a.blockNumber - b.blockNumber;
        });

        // Calculate ACTUAL current total by summing all holder tickets
        const currentTotalTickets = sortedHolders.reduce(
          (sum, holder) => sum + holder.ticketCount,
          0n,
        );

        // Recalculate ALL probabilities based on current total
        return sortedHolders.map((holder, index) => ({
          ...holder,
          rank: index + 1,
          winProbabilityBps:
            currentTotalTickets > 0n
              ? Math.floor(
                  (Number(holder.ticketCount) * 10000) /
                    Number(currentTotalTickets),
                )
              : 0,
        }));
      } catch (error) {
        throw error;
      }
    },
    enabled: !!client && !!bondingCurveAddress,
    staleTime: 60000, // 60 seconds (holders change less frequently)
    refetchInterval: options.enablePolling !== false ? 60000 : false,
    ...options,
  });

  /**
   * Manually refetch holders
   */
  const refetch = () => {
    queryClient.invalidateQueries({
      queryKey: ["raffleHolders", bondingCurveAddress, seasonId],
    });
  };

  /**
   * Get total holder count
   */
  const totalHolders = query.data?.length || 0;

  /**
   * Get total tickets across all holders
   */
  const totalTickets = useMemo(() => {
    if (!query.data || query.data.length === 0) return 0n;
    return query.data.reduce((sum, holder) => sum + holder.ticketCount, 0n);
  }, [query.data]);

  return {
    ...query,
    holders: query.data || [],
    totalHolders,
    totalTickets,
    refetch,
  };
};
