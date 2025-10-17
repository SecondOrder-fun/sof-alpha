// src/hooks/useSofDecimals.js
import { useEffect, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import { ERC20Abi } from '@/utils/abis';

/**
 * useSofDecimals
 * Reads the SOF token decimals once for the current network, with 18 fallback.
 */
export function useSofDecimals() {
  const [decimals, setDecimals] = useState(18);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const netKey = getStoredNetworkKey();
        const net = getNetworkByKey(netKey);
        const { SOF } = getContractAddresses(netKey);
        if (!SOF || !net?.rpcUrl) return; // Guard: no token or missing RPC
        const client = createPublicClient({
          chain: { id: net.id, name: net.name, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [net.rpcUrl] } } },
          transport: http(net.rpcUrl),
        });
        const d = await client.readContract({ address: SOF, abi: ERC20Abi, functionName: 'decimals', args: [] });
        if (mounted) setDecimals(Number(d || 18));
      } catch (_) {
        if (mounted) setDecimals(18);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return decimals;
}
