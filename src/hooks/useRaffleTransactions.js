// src/hooks/useRaffleTransactions.js
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { queryLogsInChunks } from '@/utils/blockRangeQuery';

/**
 * Fetch raffle transactions from on-chain PositionUpdate events
 * @param {string} bondingCurveAddress - The bonding curve contract address
 * @param {number} seasonId - The season ID for filtering
 * @param {object} options - Query options
 * @returns {object} Query result with transactions data
 */
export const useRaffleTransactions = (bondingCurveAddress, seasonId, options = {}) => {
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
    queryKey: ['raffleTransactions', bondingCurveAddress, seasonId],
    queryFn: async () => {
      if (!client || !bondingCurveAddress) {
        console.log('[useRaffleTransactions] Missing client or address:', { client: !!client, bondingCurveAddress });
        return [];
      }

      try {
        // Get current block
        const currentBlock = await client.getBlockNumber();
        console.log('[useRaffleTransactions] Current block:', currentBlock);
        
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
        
        console.log('[useRaffleTransactions] Fetched logs:', {
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
        
        console.log('[useRaffleTransactions] Filtered logs:', filteredLogs.length);

        // Fetch block timestamps for each transaction
        const transactions = await Promise.all(
          filteredLogs.map(async (log) => {
            try {
              const block = await client.getBlock({ blockNumber: log.blockNumber });
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
                probabilityBps: Number(log.args.probabilityBps || 0),
                type: ticketsDelta > 0n ? 'buy' : 'sell',
                logIndex: log.logIndex,
              };
            } catch (error) {
              console.error('Error fetching block for transaction:', error);
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
                probabilityBps: Number(log.args.probabilityBps || 0),
                type: ticketsDelta > 0n ? 'buy' : 'sell',
                logIndex: log.logIndex,
              };
            }
          })
        );

        // Sort by block number (descending) and return
        const sorted = transactions.sort((a, b) => b.blockNumber - a.blockNumber);
        console.log('[useRaffleTransactions] Returning transactions:', sorted.length);
        return sorted;
      } catch (error) {
        console.error('[useRaffleTransactions] Error fetching transactions:', error);
        throw error;
      }
    },
    enabled: !!client && !!bondingCurveAddress,
    staleTime: 15000, // 15 seconds
    refetchInterval: options.enablePolling !== false ? 15000 : false,
    ...options,
  });

  /**
   * Manually refetch transactions
   */
  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['raffleTransactions', bondingCurveAddress, seasonId] });
  };

  return {
    ...query,
    transactions: query.data || [],
    refetch,
  };
};
