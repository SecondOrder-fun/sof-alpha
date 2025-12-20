/**
 * useAllowlist Hook
 * Check if the connected wallet is on the allowlist
 */

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

const API_BASE = import.meta.env.VITE_API_BASE_URL + "/allowlist";

/**
 * Check if a wallet address is allowlisted
 * @param {string} wallet - Wallet address to check
 * @returns {Promise<{isAllowlisted: boolean, entry: object|null}>}
 */
async function checkWalletAllowlist(wallet) {
  if (!wallet) return { isAllowlisted: false, entry: null };

  const res = await fetch(`${API_BASE}/check?wallet=${wallet}`);
  if (!res.ok) {
    throw new Error("Failed to check allowlist");
  }
  return res.json();
}

/**
 * Hook to check if the connected wallet is allowlisted
 * @returns {{
 *   isAllowlisted: boolean,
 *   isLoading: boolean,
 *   isError: boolean,
 *   entry: object|null,
 *   refetch: function
 * }}
 */
export function useAllowlist() {
  const { address, isConnected } = useAccount();

  const query = useQuery({
    queryKey: ["allowlist-check", address],
    queryFn: () => checkWalletAllowlist(address),
    enabled: isConnected && !!address,
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  return {
    isAllowlisted: query.data?.isAllowlisted ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    entry: query.data?.entry ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook to check allowlist window status
 * @returns {{
 *   isOpen: boolean,
 *   config: object|null,
 *   reason: string|null,
 *   isLoading: boolean
 * }}
 */
export function useAllowlistWindow() {
  const query = useQuery({
    queryKey: ["allowlist-window"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/window-status`);
      if (!res.ok) throw new Error("Failed to check window status");
      return res.json();
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  return {
    isOpen: query.data?.isOpen ?? false,
    config: query.data?.config ?? null,
    reason: query.data?.reason ?? null,
    isLoading: query.isLoading,
  };
}

export default useAllowlist;
