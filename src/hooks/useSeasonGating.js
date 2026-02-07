// src/hooks/useSeasonGating.js
// Hook for reading season gating status and verifying passwords.
//
// Event-Driven Verification:
// This hook uses an event-driven approach for password verification rather than
// arbitrary delays. After submitting a verification transaction, it waits for
// the transaction receipt and checks for the UserVerified event emission from
// the SeasonGating contract. This ensures:
// 
// - Faster response: No artificial 3-second delay; proceeds as soon as event is emitted
// - More reliable: Waits for actual on-chain confirmation via contract events
// - Cleaner architecture: Event-driven rather than polling or time-based

import { useMemo, useCallback } from "react";
import { createPublicClient, http, keccak256, toHex } from "viem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useWriteContract } from "wagmi";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { getContractAddresses, SEASON_GATING_ABI } from "@/config/contracts";

/**
 * Gate type enum matching ISeasonGating.GateType
 */
export const GateType = {
  NONE: 0,
  PASSWORD: 1,
  ALLOWLIST: 2,
  TOKEN_GATE: 3,
  SIGNATURE: 4,
};

/**
 * Hash a password the same way the contract does:
 * keccak256(abi.encodePacked(password))
 * @param {string} password
 * @returns {`0x${string}`}
 */
export function hashPassword(password) {
  return keccak256(toHex(password));
}

/**
 * @notice Hook for reading gating status and submitting password verification.
 * @param {number|string|null} seasonId
 * @param {object} [options]
 * @param {boolean} [options.isGated] - Hint from season config (avoids an extra read)
 * @returns {{
 *   isGated: boolean,
 *   isVerified: boolean | null,
 *   gateCount: number,
 *   gates: Array,
 *   isLoading: boolean,
 *   verifyPassword: (password: string) => Promise<string>,
 *   refetch: () => void,
 * }}
 */
export function useSeasonGating(seasonId, options = {}) {
  const { isGated: isGatedHint } = options;
  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const addr = getContractAddresses(netKey);
  const { address: connectedAddress } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const client = useMemo(() => {
    if (!net?.rpcUrl) return null;
    return createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
  }, [net?.id, net?.name, net?.rpcUrl]);

  const gatingAddress = addr.SEASON_GATING;
  const sid = seasonId != null ? BigInt(seasonId) : null;

  // ── Read gate count + gates ──
  const gatesQuery = useQuery({
    queryKey: ["seasonGating", netKey, "gates", String(seasonId), gatingAddress],
    queryFn: async () => {
      if (!client || !gatingAddress || sid == null) return null;
      const [count, gates] = await Promise.all([
        client.readContract({
          address: gatingAddress,
          abi: SEASON_GATING_ABI,
          functionName: "getGateCount",
          args: [sid],
        }),
        client.readContract({
          address: gatingAddress,
          abi: SEASON_GATING_ABI,
          functionName: "getSeasonGates",
          args: [sid],
        }),
      ]);
      return { count: Number(count), gates };
    },
    enabled: Boolean(client && gatingAddress && sid != null && isGatedHint),
    staleTime: 30_000,
    retry: false,
  });

  // ── Read user verification status ──
  const verifiedQuery = useQuery({
    queryKey: [
      "seasonGating",
      netKey,
      "isVerified",
      String(seasonId),
      connectedAddress,
      gatingAddress,
    ],
    queryFn: async () => {
      if (!client || !gatingAddress || sid == null || !connectedAddress)
        return null;
      const result = await client.readContract({
        address: gatingAddress,
        abi: SEASON_GATING_ABI,
        functionName: "isUserVerified",
        args: [sid, connectedAddress],
      });
      return Boolean(result);
    },
    enabled: Boolean(
      client && gatingAddress && sid != null && connectedAddress && isGatedHint,
    ),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });

  // ── verifyPassword write ──
  const verifyPassword = useCallback(
    async (password) => {
      if (!gatingAddress || sid == null) {
        throw new Error("Gating contract or season not available");
      }
      if (!connectedAddress) {
        throw new Error("Wallet not connected");
      }

      const hash = await writeContractAsync({
        address: gatingAddress,
        abi: SEASON_GATING_ABI,
        functionName: "verifyPassword",
        args: [sid, 0n, password],
      });

      // Wait for tx confirmation and verify UserVerified event was emitted
      if (client && hash) {
        const receipt = await client.waitForTransactionReceipt({ 
          hash, 
          confirmations: 1 
        });
        
        // Verify that the UserVerified event was emitted in this transaction
        // Event signature: UserVerified(uint256 indexed seasonId, uint256 indexed gateIndex, address indexed user, GateType gateType)
        const userVerifiedEvent = receipt.logs.find(log => {
          // Check if this log is from the SeasonGating contract
          if (log.address.toLowerCase() !== gatingAddress.toLowerCase()) {
            return false;
          }
          
          // Check topics: [eventSignature, seasonId, gateIndex, user]
          // UserVerified has 3 indexed parameters (seasonId, gateIndex, user)
          if (log.topics.length !== 4) {
            return false;
          }
          
          // Verify this is for the correct user (topic[3] is the indexed user address)
          const eventUser = `0x${log.topics[3].slice(26)}`.toLowerCase();
          return eventUser === connectedAddress.toLowerCase();
        });

        if (!userVerifiedEvent) {
          console.warn("UserVerified event not found in transaction receipt");
          // Event-driven approach: if event wasn't emitted, verification may have failed
          // or user was already verified. Either way, we should still update the cache.
        }
      }

      // Invalidate and refetch verification query to ensure UI has latest state
      await queryClient.invalidateQueries({
        queryKey: [
          "seasonGating",
          netKey,
          "isVerified",
          String(seasonId),
          connectedAddress,
          gatingAddress,
        ],
      });
      
      // Force an immediate refetch to ensure cache is updated
      await queryClient.refetchQueries({
        queryKey: [
          "seasonGating",
          netKey,
          "isVerified",
          String(seasonId),
          connectedAddress,
          gatingAddress,
        ],
      });

      return hash;
    },
    [
      gatingAddress,
      sid,
      writeContractAsync,
      client,
      queryClient,
      netKey,
      seasonId,
      connectedAddress,
    ],
  );

  const refetch = useCallback(async () => {
    await Promise.all([
      verifiedQuery.refetch(),
      gatesQuery.refetch(),
    ]);
  }, [verifiedQuery, gatesQuery]);

  return {
    isGated: Boolean(isGatedHint),
    isVerified: verifiedQuery.data ?? null,
    gateCount: gatesQuery.data?.count ?? 0,
    gates: gatesQuery.data?.gates ?? [],
    isLoading: verifiedQuery.isLoading || gatesQuery.isLoading,
    verifyPassword,
    refetch,
  };
}
