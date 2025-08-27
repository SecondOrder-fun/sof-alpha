// src/hooks/useRaffleTracker.js
// Read helpers for RafflePositionTracker contract

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPublicClient, http } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses, RAFFLE_TRACKER_ABI } from '@/config/contracts';

/**
 * useRaffleTracker
 * Provides helpers to read player snapshots from RafflePositionTracker.
 */
/**
 * Provides helpers to read player snapshots from `RafflePositionTracker` and
 * auto-refresh on `PositionSnapshot` events.
 */
export function useRaffleTracker() {
  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const addr = getContractAddresses(netKey);

  const client = useMemo(() => {
    return createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
  }, [net.id, net.name, net.rpcUrl]);

  /**
   * Query for the latest snapshot of a given player address.
   * @param {string | undefined | null} playerAddr EVM address
   */
  const usePlayerSnapshot = (playerAddr) => {
    const fetchSnapshot = async () => {
      if (!addr.RAFFLE_TRACKER || !playerAddr) return null;
      const res = await client.readContract({
        address: addr.RAFFLE_TRACKER,
        abi: RAFFLE_TRACKER_ABI,
        functionName: 'getCurrentSnapshot',
        args: [playerAddr],
      });

      // viem may return a struct as an object or array depending on ABI formatting.
      // Normalize to a standard shape.
      if (!res) return null;
      if (Array.isArray(res)) {
        // [ticketCount, timestamp, blockNumber, totalTicketsAtTime, winProbabilityBps]
        const [ticketCount, timestamp, blockNumber, totalTicketsAtTime, winProbabilityBps] = res;
        return {
          ticketCount,
          timestamp,
          blockNumber,
          totalTicketsAtTime,
          winProbabilityBps,
        };
      }
      return res;
    };

    return useQuery({
      queryKey: ['raffle-tracker', netKey, 'snapshot', addr.RAFFLE_TRACKER, playerAddr],
      queryFn: fetchSnapshot,
      enabled: Boolean(addr.RAFFLE_TRACKER && playerAddr),
      // Disable retries so errors surface immediately (improves determinism in tests)
      retry: false,
      staleTime: 10_000,
      refetchInterval: 15_000,
    });
  };

  // Subscribe to on-chain PositionSnapshot for the specific player and invalidate cache
  // Consumer pattern: call inside component to mount the subscription alongside the query
  const usePlayerSnapshotLive = (playerAddr) => {
    const key = ['raffle-tracker', netKey, 'snapshot', addr.RAFFLE_TRACKER, playerAddr];
    const qc = useQueryClient();
    useEffect(() => {
      if (!addr.RAFFLE_TRACKER || !playerAddr) return () => {};
      // watchContractEvent: viem will return an unwatch function
      const unwatch = client.watchContractEvent({
        address: addr.RAFFLE_TRACKER,
        abi: RAFFLE_TRACKER_ABI,
        eventName: 'PositionSnapshot',
        onLogs: (logs) => {
          try {
            for (const log of logs || []) {
              const evPlayer = log?.args?.player;
              if (!evPlayer) continue;
              if (String(evPlayer).toLowerCase() === String(playerAddr).toLowerCase()) {
                // Invalidate to refetch latest snapshot
                qc.invalidateQueries({ queryKey: key });
              }
            }
          } catch (_) {
            // ignore malformed
          }
        },
      });
      return () => { try { unwatch?.(); } catch { /* noop */ } };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addr.RAFFLE_TRACKER, playerAddr, netKey]);
  };

  return { client, usePlayerSnapshot, usePlayerSnapshotLive };
}
