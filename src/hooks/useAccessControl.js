// src/hooks/useAccessControl.js
// Access control helpers for role-gated UI. Uses viem read client (no wallet).

import { getStoredNetworkKey } from "@/lib/wagmi";
import { getContractsByKey } from "@/config/contracts";

/**
 * Roles can be provided as hex or computed in app. Placeholder until ABI wired.
 */
export function useAccessControl() {
  const netKey = getStoredNetworkKey();
  const addr = getContractsByKey(netKey);

  // Placeholder for future onchain reads via viem createPublicClient
  // const client = useMemo(() => createPublicClient({
  //   chain: {
  //     id: net.id,
  //     name: net.name,
  //     nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  //     rpcUrls: { default: { http: [net.rpcUrl] } },
  //   },
  //   transport: http(net.rpcUrl),
  // }), [net.id, net.name, net.rpcUrl]);

  /**
   * Check if `account` has `role` on the raffle contract.
   * Currently returns false until ABI + function are wired.
   */
  async function hasRole(_roleHex, _account) {
    try {
      // Mark parameters as intentionally unused until implementation lands
      const __markUsed = _roleHex && _account;
      void __markUsed;
      // const normalized = getAddress(account);
      if (!addr.RAFFLE) return false;
      // TODO: replace with real readContract once ABI is added
      // const has = await client.readContract({ address: addr.RAFFLE, abi: RaffleAbi, functionName: 'hasRole', args: [roleHex, normalized]});
      return false;
    } catch {
      return false;
    }
  }

  return { hasRole };
}
