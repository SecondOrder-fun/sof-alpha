// src/hooks/useRaffleRead.js
// Read helpers for raffle contract. Wire ABI & function names when available.

import { useMemo } from "react";
import { createPublicClient, http } from "viem";
import { useQuery } from "@tanstack/react-query";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { getContractsByKey } from "@/config/contracts";

export function useRaffleRead() {
  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const addr = getContractsByKey(netKey);

  const client = useMemo(() => {
    return createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
  }, [net.id, net.name, net.rpcUrl]);

  // Placeholder fetchers until ABI is wired
  const fetchCurrentSeasonId = async () => {
    if (!addr.RAFFLE) return null;
    // return await client.readContract({ address: addr.RAFFLE, abi: RaffleAbi, functionName: 'currentSeasonId' });
    return null;
  };

  const currentSeasonQuery = useQuery({
    queryKey: ["raffle", netKey, "currentSeasonId", addr.RAFFLE],
    queryFn: fetchCurrentSeasonId,
    enabled: Boolean(addr.RAFFLE),
    staleTime: 15_000,
  });

  return {
    client,
    currentSeasonQuery,
  };
}

/**
 * useSeasonDetailsQuery
 * Custom React hook that reads season details for a given seasonId.
 * Ensures Hooks are called from a proper hook function per React Rules of Hooks.
 * @param {number|string|null} seasonId
 */
export function useSeasonDetailsQuery(seasonId) {
  const netKey = getStoredNetworkKey();
  const addr = getContractsByKey(netKey);

  const fetchSeasonDetails = async () => {
    if (!addr.RAFFLE || seasonId == null) return null;
    // return await client.readContract({ address: addr.RAFFLE, abi: RaffleAbi, functionName: 'getSeasonDetails', args: [seasonId] });
    return null;
  };

  return useQuery({
    queryKey: ["raffle", netKey, "season", seasonId, addr.RAFFLE],
    queryFn: fetchSeasonDetails,
    enabled: Boolean(addr.RAFFLE && seasonId != null),
    staleTime: 10_000,
  });
}
