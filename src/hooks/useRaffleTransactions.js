// src/hooks/useRaffleTransactions.js
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';

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
        return [];
      }

      try {
        // Get current block
        const currentBlock = await client.getBlockNumber();
        
        // Fetch PositionUpdate events from last ~33 hours (10,000 blocks at 12s/block)
        // Adjust block range based on your needs
        const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;
        
        const positionUpdateEvent = parseAbiItem(
          'event PositionUpdate(uint256 indexed seasonId, address indexed player, uint256 oldTickets, uint256 newTickets, uint256 totalTickets, uint256 probabilityBps)'
        );

        const logs = await client.getLogs({
          address: bondingCurveAddress,
          event: positionUpdateEvent,
          fromBlock,
          toBlock: 'latest',
        });

        // Filter by seasonId if provided
        const filteredLogs = seasonId 
          ? logs.filter(log => Number(log.args.seasonId) === Number(seasonId))
          : logs;

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

        // Sort by block number and log index (newest first)
        return transactions.sort((a, b) => {
          if (b.blockNumber !== a.blockNumber) {
            return b.blockNumber - a.blockNumber;
          }
          return b.logIndex - a.logIndex;
        });
      } catch (error) {
        console.error('Error fetching raffle transactions:', error);
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
