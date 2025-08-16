// src/hooks/useAccessControl.js
// Access control helpers for role-gated UI. Uses viem read client (no wallet).

import { useMemo } from "react";
import { createPublicClient, http, getAddress } from "viem";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { getContractAddresses, RAFFLE_ABI } from "@/config/contracts";

/**
 * Roles can be provided as hex or computed in app. Placeholder until ABI wired.
 */
export function useAccessControl() {
  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const addr = getContractAddresses(netKey);

  const client = useMemo(
    () =>
      createPublicClient({
        chain: {
          id: net.id,
          name: net.name,
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [net.rpcUrl] } },
        },
        transport: http(net.rpcUrl),
      }),
    [net.id, net.name, net.rpcUrl]
  );

  /**
   * Check if `account` has `role` on the raffle contract.
   * Currently returns false until ABI + function are wired.
   */
  async function hasRole(roleHex, account) {
    try {
      if (!addr.RAFFLE) return false;
      const normalized = getAddress(account);
      const has = await client.readContract({
        address: addr.RAFFLE,
        abi: RAFFLE_ABI,
        functionName: "hasRole",
        args: [roleHex, normalized],
      });
      return Boolean(has);
    } catch {
      return false;
    }
  }

  return { hasRole };
}
