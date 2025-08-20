// src/hooks/useCurveEvents.js
// Listen to SOFBondingCurve PositionUpdate events and invoke a callback.

import { useEffect } from 'react';
import { createPublicClient, http } from 'viem';
import { getNetworkByKey } from '@/config/networks';
import { getStoredNetworkKey } from '@/lib/wagmi';

/**
 * Subscribes to PositionUpdate events on a bonding curve and calls the handler.
 * @param {string} bondingCurveAddress
 * @param {{ onPositionUpdate?: (log: any) => void }} opts
 */
export function useCurveEvents(bondingCurveAddress, { onPositionUpdate } = {}) {
  useEffect(() => {
    if (!bondingCurveAddress) return;

    let unwatch = null;
    const netKey = getStoredNetworkKey();
    const net = getNetworkByKey(netKey);
    const client = createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });

    let mounted = true;
    (async () => {
      try {
        const SOFBondingCurveJson = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
        const SOFBondingCurveAbi = SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;
        // watch for PositionUpdate(seasonId, player, oldTickets, newTickets, totalTickets, probabilityBps)
        unwatch = client.watchContractEvent({
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          eventName: 'PositionUpdate',
          onLogs: (logs) => {
            if (!mounted || !logs?.length) return;
            for (const log of logs) {
              try { onPositionUpdate && onPositionUpdate(log); } catch (_) { /* swallow */ }
            }
          },
        });
      } catch (_e) {
        // non-fatal
      }
    })();

    return () => {
      mounted = false;
      try { unwatch && unwatch(); } catch (_) { /* noop */ }
    };
  }, [bondingCurveAddress, onPositionUpdate]);
}
