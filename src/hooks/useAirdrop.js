// src/hooks/useAirdrop.js
import { useState, useEffect, useCallback, useContext } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getContractAddresses } from "@/config/contracts";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { SOFAirdropAbi } from "@/utils/abis";
import FarcasterContext from "@/context/farcasterContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Format a seconds-remaining value into "Xh Ym" countdown string.
 * @param {number} remaining - seconds until next claim
 * @returns {string}
 */
function formatCountdown(remaining) {
  if (remaining <= 0) return "";
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  const seconds = remaining % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Hook for interacting with the SOFAirdrop contract.
 *
 * Reads:
 *  - hasClaimed(address) → boolean
 *  - lastDailyClaim(address) → uint256 (timestamp)
 *  - cooldown() → uint256 (seconds)
 *  - initialAmount() → uint256
 *  - dailyAmount() → uint256
 *
 * Writes:
 *  - claimInitial(fid, deadline, v, r, s) — fetches EIP-712 sig from backend first
 *  - claimDaily() — no args
 *
 * Computes:
 *  - canClaimDaily — boolean, true when cooldown has elapsed
 *  - nextClaimAt — unix timestamp (ms) of next eligible claim
 *  - timeUntilClaim — formatted countdown string ("Xh Ym")
 */
export function useAirdrop() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const farcasterAuth = useContext(FarcasterContext);
  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);
  const airdropAddress = contracts.SOF_AIRDROP;

  const isEnabled = Boolean(address && isConnected && airdropAddress);

  // ── Contract reads ──────────────────────────────────────────────────────────

  const { data: hasClaimed, refetch: refetchHasClaimed } = useReadContract({
    address: airdropAddress,
    abi: SOFAirdropAbi,
    functionName: "hasClaimed",
    args: [address],
    query: { enabled: isEnabled },
  });

  const { data: lastDailyClaim, refetch: refetchLastDaily } = useReadContract({
    address: airdropAddress,
    abi: SOFAirdropAbi,
    functionName: "lastDailyClaim",
    args: [address],
    query: { enabled: isEnabled },
  });

  const { data: cooldownSeconds } = useReadContract({
    address: airdropAddress,
    abi: SOFAirdropAbi,
    functionName: "cooldown",
    query: { enabled: Boolean(airdropAddress) },
  });

  const { data: initialAmountRaw } = useReadContract({
    address: airdropAddress,
    abi: SOFAirdropAbi,
    functionName: "initialAmount",
    query: { enabled: Boolean(airdropAddress) },
  });

  const { data: basicAmountRaw } = useReadContract({
    address: airdropAddress,
    abi: SOFAirdropAbi,
    functionName: "basicAmount",
    query: { enabled: Boolean(airdropAddress) },
  });

  const { data: dailyAmountRaw } = useReadContract({
    address: airdropAddress,
    abi: SOFAirdropAbi,
    functionName: "dailyAmount",
    query: { enabled: Boolean(airdropAddress) },
  });

  // ── Derived values ──────────────────────────────────────────────────────────

  const cooldown = cooldownSeconds ? Number(cooldownSeconds) : 0;
  const lastClaimTs = lastDailyClaim ? Number(lastDailyClaim) : 0;
  const nowSecs = Math.floor(Date.now() / 1000);

  const nextClaimAtSecs = lastClaimTs > 0 ? lastClaimTs + cooldown : 0;
  const canClaimDaily =
    Boolean(hasClaimed) &&
    (lastClaimTs === 0 || nowSecs >= nextClaimAtSecs);

  const nextClaimAt = nextClaimAtSecs > 0 ? nextClaimAtSecs * 1000 : null;

  // ── Live countdown ticker ────────────────────────────────────────────────────

  const [timeUntilClaim, setTimeUntilClaim] = useState("");

  useEffect(() => {
    const update = () => {
      if (canClaimDaily || nextClaimAtSecs === 0) {
        setTimeUntilClaim("");
        return;
      }
      const remaining = nextClaimAtSecs - Math.floor(Date.now() / 1000);
      setTimeUntilClaim(formatCountdown(remaining));
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [canClaimDaily, nextClaimAtSecs]);

  // ── Write: claimInitial ──────────────────────────────────────────────────────

  const {
    writeContractAsync: writeContractAsync,
    isPending: isWritePending,
    isSuccess: isWriteSuccess,
    isError: isWriteError,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const [claimInitialState, setClaimInitialState] = useState({
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  });

  const claimInitial = useCallback(
    async (fid) => {
      if (!address || !airdropAddress || !fid) return;

      setClaimInitialState({ isPending: true, isSuccess: false, isError: false, error: null });

      try {
        // Fetch EIP-712 attestation from backend
        const authHeaders = farcasterAuth?.getAuthHeaders?.() ?? {};
        const res = await fetch(`${API_BASE}/api/airdrop/attestation`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ fid, address }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Attestation request failed: ${res.status}`);
        }

        const { deadline, v, r, s } = await res.json();

        await writeContractAsync({
          address: airdropAddress,
          abi: SOFAirdropAbi,
          functionName: "claimInitial",
          args: [BigInt(fid), BigInt(deadline), v, r, s],
        });

        setClaimInitialState({ isPending: false, isSuccess: true, isError: false, error: null });

        // Refresh reads after success
        queryClient.invalidateQueries({ queryKey: ["sofBalance"] });
        refetchHasClaimed();
        refetchLastDaily();
      } catch (err) {
        setClaimInitialState({
          isPending: false,
          isSuccess: false,
          isError: true,
          error: err.message || "Claim failed",
        });
      }
    },
    [address, airdropAddress, farcasterAuth, writeContractAsync, queryClient, refetchHasClaimed, refetchLastDaily]
  );

  // ── Write: claimInitialBasic (no Farcaster) ─────────────────────────────────

  const claimInitialBasic = useCallback(async () => {
    if (!address || !airdropAddress) return;

    setClaimInitialState({ isPending: true, isSuccess: false, isError: false, error: null });

    try {
      await writeContractAsync({
        address: airdropAddress,
        abi: SOFAirdropAbi,
        functionName: "claimInitialBasic",
        args: [],
      });

      setClaimInitialState({ isPending: false, isSuccess: true, isError: false, error: null });

      queryClient.invalidateQueries({ queryKey: ["sofBalance"] });
      refetchHasClaimed();
      refetchLastDaily();
    } catch (err) {
      setClaimInitialState({
        isPending: false,
        isSuccess: false,
        isError: true,
        error: err.message || "Claim failed",
      });
    }
  }, [address, airdropAddress, writeContractAsync, queryClient, refetchHasClaimed, refetchLastDaily]);

  // ── Write: claimDaily ────────────────────────────────────────────────────────

  const [claimDailyState, setClaimDailyState] = useState({
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  });

  const claimDaily = useCallback(async () => {
    if (!address || !airdropAddress || !canClaimDaily) return;

    setClaimDailyState({ isPending: true, isSuccess: false, isError: false, error: null });

    try {
      await writeContractAsync({
        address: airdropAddress,
        abi: SOFAirdropAbi,
        functionName: "claimDaily",
        args: [],
      });

      setClaimDailyState({ isPending: false, isSuccess: true, isError: false, error: null });

      queryClient.invalidateQueries({ queryKey: ["sofBalance"] });
      refetchLastDaily();
    } catch (err) {
      setClaimDailyState({
        isPending: false,
        isSuccess: false,
        isError: true,
        error: err.message || "Daily claim failed",
      });
    }
  }, [address, airdropAddress, canClaimDaily, writeContractAsync, queryClient, refetchLastDaily]);

  const resetDailyState = useCallback(() => {
    setClaimDailyState({ isPending: false, isSuccess: false, isError: false, error: null });
  }, []);

  const resetInitialState = useCallback(() => {
    setClaimInitialState({ isPending: false, isSuccess: false, isError: false, error: null });
    resetWrite();
  }, [resetWrite]);

  // ── Formatted amounts ────────────────────────────────────────────────────────

  const initialAmount = initialAmountRaw
    ? parseFloat(formatUnits(initialAmountRaw, 18))
    : 0;

  const basicAmount = basicAmountRaw
    ? parseFloat(formatUnits(basicAmountRaw, 18))
    : 0;

  const dailyAmount = dailyAmountRaw
    ? parseFloat(formatUnits(dailyAmountRaw, 18))
    : 0;

  return {
    // Contract state
    hasClaimed: hasClaimed ?? false,
    lastDailyClaim: lastClaimTs,
    cooldown,
    initialAmount,
    basicAmount,
    dailyAmount,
    // Derived
    canClaimDaily,
    nextClaimAt,
    timeUntilClaim,
    // Actions
    claimInitial,
    claimInitialBasic,
    claimInitialState,
    resetInitialState,
    claimDaily,
    claimDailyState,
    resetDailyState,
    // General
    isWritePending,
    isWriteSuccess,
    isWriteError,
    writeError,
    airdropAddress,
  };
}

export default useAirdrop;
