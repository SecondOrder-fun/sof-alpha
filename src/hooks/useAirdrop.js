// src/hooks/useAirdrop.js
import { useState, useEffect, useCallback, useContext } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits, encodeFunctionData } from "viem";
import { getContractAddresses } from "@/config/contracts";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { SOFAirdropAbi } from "@/utils/abis";
import { useSmartTransactions } from "@/hooks/useSmartTransactions";
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
 * Uses the same ERC-5792 batch + paymaster flow as buy/sell:
 *   Tier 1: executeBatch (gasless via paymaster)
 *   Tier 2: writeContractAsync (direct tx, user pays gas)
 */
export function useAirdrop() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const farcasterAuth = useContext(FarcasterContext);
  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);
  const airdropAddress = contracts.SOF_AIRDROP;

  const { executeBatch } = useSmartTransactions();
  const { writeContractAsync } = useWriteContract();

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

  // ── Write state ────────────────────────────────────────────────────────────

  const [claimInitialState, setClaimInitialState] = useState({
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  });

  const [claimDailyState, setClaimDailyState] = useState({
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  });

  // ── Shared success handler (mirrors buy/sell pattern) ─────────────────────

  const onClaimSuccess = useCallback((type) => {
    queryClient.invalidateQueries({ queryKey: ["sofBalance"] });
    void refetchHasClaimed();
    void refetchLastDaily();

    if (type === "daily") {
      setClaimDailyState({ isPending: false, isSuccess: true, isError: false, error: null });
    } else {
      setClaimInitialState({ isPending: false, isSuccess: true, isError: false, error: null });
    }
  }, [queryClient, refetchHasClaimed, refetchLastDaily]);

  // ── Write: claimInitial ──────────────────────────────────────────────────────

  const claimInitial = useCallback(
    async (fid) => {
      if (!address || !airdropAddress || !fid) return;

      setClaimInitialState({ isPending: true, isSuccess: false, isError: false, error: null });

      try {
        // Fetch EIP-712 attestation from backend
        const authHeaders = farcasterAuth?.getAuthHeaders?.() ?? {};
        const res = await fetch(`${API_BASE}/airdrop/attestation`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ fid, address }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Attestation request failed: ${res.status}`);
        }

        const { deadline, v, r, s } = await res.json();
        const claimArgs = [BigInt(fid), BigInt(deadline), v, r, s];

        // Tier 1: ERC-5792 batch + paymaster (same as buy/sell)
        try {
          await executeBatch([{
            to: airdropAddress,
            data: encodeFunctionData({
              abi: SOFAirdropAbi,
              functionName: "claimInitial",
              args: claimArgs,
            }),
          }]);
          onClaimSuccess("initial");
          return;
        } catch (batchErr) {
          if (batchErr?.code === 4001 || batchErr?.name === "UserRejectedRequestError") {
            throw batchErr;
          }
          // eslint-disable-next-line no-console
          console.warn("[Airdrop] Batch failed, falling back:", batchErr.message);
        }

        // Tier 2: direct writeContractAsync (user pays gas)
        await writeContractAsync({
          address: airdropAddress,
          abi: SOFAirdropAbi,
          functionName: "claimInitial",
          args: claimArgs,
        });
        onClaimSuccess("initial");
      } catch (err) {
        setClaimInitialState({
          isPending: false,
          isSuccess: false,
          isError: true,
          error: err.message || "Claim failed",
        });
      }
    },
    [address, airdropAddress, farcasterAuth, executeBatch, writeContractAsync, onClaimSuccess]
  );

  // ── Write: claimInitialBasic (no Farcaster) ─────────────────────────────────

  const claimInitialBasic = useCallback(async () => {
    if (!address || !airdropAddress) return;

    setClaimInitialState({ isPending: true, isSuccess: false, isError: false, error: null });

    try {
      // Tier 1: ERC-5792 batch + paymaster
      try {
        await executeBatch([{
          to: airdropAddress,
          data: encodeFunctionData({
            abi: SOFAirdropAbi,
            functionName: "claimInitialBasic",
            args: [],
          }),
        }]);
        onClaimSuccess("initial");
        return;
      } catch (batchErr) {
        if (batchErr?.code === 4001 || batchErr?.name === "UserRejectedRequestError") {
          throw batchErr;
        }
        // eslint-disable-next-line no-console
        console.warn("[Airdrop] Batch failed, falling back:", batchErr.message);
      }

      // Tier 2: direct writeContractAsync
      await writeContractAsync({
        address: airdropAddress,
        abi: SOFAirdropAbi,
        functionName: "claimInitialBasic",
        args: [],
      });
      onClaimSuccess("initial");
    } catch (err) {
      setClaimInitialState({
        isPending: false,
        isSuccess: false,
        isError: true,
        error: err.message || "Claim failed",
      });
    }
  }, [address, airdropAddress, executeBatch, writeContractAsync, onClaimSuccess]);

  // ── Write: claimDaily ────────────────────────────────────────────────────────

  const claimDaily = useCallback(async () => {
    if (!address || !airdropAddress || !canClaimDaily) return;

    setClaimDailyState({ isPending: true, isSuccess: false, isError: false, error: null });

    try {
      // Tier 1: ERC-5792 batch + paymaster
      try {
        await executeBatch([{
          to: airdropAddress,
          data: encodeFunctionData({
            abi: SOFAirdropAbi,
            functionName: "claimDaily",
            args: [],
          }),
        }]);
        onClaimSuccess("daily");
        return;
      } catch (batchErr) {
        if (batchErr?.code === 4001 || batchErr?.name === "UserRejectedRequestError") {
          throw batchErr;
        }
        // eslint-disable-next-line no-console
        console.warn("[Airdrop] Batch failed, falling back:", batchErr.message);
      }

      // Tier 2: direct writeContractAsync
      await writeContractAsync({
        address: airdropAddress,
        abi: SOFAirdropAbi,
        functionName: "claimDaily",
        args: [],
      });
      onClaimSuccess("daily");
    } catch (err) {
      setClaimDailyState({
        isPending: false,
        isSuccess: false,
        isError: true,
        error: err.message || "Daily claim failed",
      });
    }
  }, [address, airdropAddress, canClaimDaily, executeBatch, writeContractAsync, onClaimSuccess]);

  const resetDailyState = useCallback(() => {
    setClaimDailyState({ isPending: false, isSuccess: false, isError: false, error: null });
  }, []);

  const resetInitialState = useCallback(() => {
    setClaimInitialState({ isPending: false, isSuccess: false, isError: false, error: null });
  }, []);

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
    airdropAddress,
  };
}

export default useAirdrop;
