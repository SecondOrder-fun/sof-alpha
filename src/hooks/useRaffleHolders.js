// src/hooks/useRaffleHolders.js
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { queryLogsInChunks } from '@/utils/blockRangeQuery';

/**
 * Fetch current raffle token holders from on-chain data
 * Aggregates PositionUpdate events to build current holder list
 * @param {string} bondingCurveAddress - The bonding curve contract address
 * @param {number} seasonId - The season ID for filtering
 * @param {object} options - Query options
 * @returns {object} Query result with holders data
 */
export const useRaffleHolders = (bondingCurveAddress, seasonId, options = {}) => {
  const queryClient = useQueryClient();
  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);

  const client = useMemo(() => {
    if (!net?.rpcUrl) return null;
    return createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
  }, [net?.id, net?.name, net?.rpcUrl]);

  const query = useQuery({
    queryKey: ['raffleHolders', bondingCurveAddress, seasonId],
    queryFn: async () => {
      if (!client || !bondingCurveAddress) {
        console.log('[useRaffleHolders] Missing client or address:', { client: !!client, bondingCurveAddress });
        return [];
      }

      try {
        // Get current block
        const currentBlock = await client.getBlockNumber();
        console.log('[useRaffleHolders] Current block:', currentBlock);
        
        // For Base (2s block time): 100k blocks = ~55 hours, 500k blocks = ~11.5 days
        // Use a large lookback to capture full season history
        // TODO: Store season creation block in contract for precise queries
        const LOOKBACK_BLOCKS = 500000n; // ~11.5 days on Base
        const fromBlock = currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n;
        
        const positionUpdateEvent = parseAbiItem(
          'event PositionUpdate(uint256 indexed seasonId, address indexed player, uint256 oldTickets, uint256 newTickets, uint256 totalTickets, uint256 probabilityBps)'
        );

        // Use chunked query to handle RPC block range limits
        const logs = await queryLogsInChunks(client, {
          address: bondingCurveAddress,
          event: positionUpdateEvent,
          fromBlock,
          toBlock: 'latest',
        });
        
        console.log('[useRaffleHolders] Fetched logs:', {
          bondingCurveAddress,
          fromBlock: fromBlock.toString(),
          toBlock: 'latest',
          totalLogs: logs.length,
          seasonId
        });

        // Filter by seasonId if provided
        const filteredLogs = seasonId 
          ? logs.filter(log => Number(log.args.seasonId) === Number(seasonId))
          : logs;
        
        console.log('[useRaffleHolders] Filtered logs:', filteredLogs.length);

        // Aggregate positions by player (keep only latest position per player)
        const playerPositions = new Map();
        
        for (const log of filteredLogs) {
          const player = log.args.player;
          const blockNumber = Number(log.blockNumber);
          const logIndex = log.logIndex;
          
          const existing = playerPositions.get(player);
          
          // Keep the latest position (highest block number and log index)
          if (!existing || 
              blockNumber > existing.blockNumber || 
              (blockNumber === existing.blockNumber && logIndex > existing.logIndex)) {
            
            playerPositions.set(player, {
              player,
              ticketCount: BigInt(log.args.newTickets || 0n),
              totalTicketsAtTime: BigInt(log.args.totalTickets || 0n),
              winProbabilityBps: Number(log.args.probabilityBps || 0),
              blockNumber,
              logIndex,
              lastUpdate: null, // Will be filled with timestamp
            });
          }
        }

        // Fetch timestamps for last update
        const holders = await Promise.all(
          Array.from(playerPositions.values()).map(async (holder) => {
            try {
              const block = await client.getBlock({ blockNumber: BigInt(holder.blockNumber) });
              return {
                ...holder,
                lastUpdate: Number(block.timestamp),
              };
            } catch (error) {
              console.error('Error fetching block timestamp:', error);
              return holder;
            }
          })
        );

        // Filter out holders with 0 tickets
        const activeHolders = holders.filter(h => h.ticketCount > 0n);

        // Sort by ticket count (descending) and assign ranks
        const sortedHolders = activeHolders.sort((a, b) => {
          if (b.ticketCount !== a.ticketCount) {
            return Number(b.ticketCount - a.ticketCount);
          }
          // If same ticket count, sort by block number (earlier = higher rank)
          return a.blockNumber - b.blockNumber;
        });

        // Calculate ACTUAL current total by summing all holder tickets
        // This is more accurate than using totalTicketsAtTime from any single event
        const currentTotalTickets = sortedHolders.reduce(
          (sum, holder) => sum + holder.ticketCount, 
          0n
        );

        // Recalculate ALL probabilities based on current total
        // This ensures all players' odds update when anyone buys/sells
        return sortedHolders.map((holder, index) => ({
          ...holder,
          rank: index + 1,
          // Recalculate live probability for this holder
          winProbabilityBps: currentTotalTickets > 0n
            ? Math.floor((Number(holder.ticketCount) * 10000) / Number(currentTotalTickets))
            : 0
        }));
      } catch (error) {
        console.error('Error fetching raffle holders:', error);
        throw error;
      }
    },
    enabled: !!client && !!bondingCurveAddress,
    staleTime: 30000, // 30 seconds (holders change less frequently)
    refetchInterval: options.enablePolling !== false ? 30000 : false,
    ...options,
  });

  /**
   * Manually refetch holders
   */
  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['raffleHolders', bondingCurveAddress, seasonId] });
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
    // Sum all holder tickets for accurate total
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
