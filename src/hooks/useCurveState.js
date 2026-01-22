// src/hooks/useCurveState.js
import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { buildPublicClient } from "@/lib/viemClient";

/**
 * useCurveState keeps bonding curve state (supply, reserves, current step, steps tail) fresh.
 * - Exposes debounced refresh for tx success events
 * - Polls periodically while season is Active
 */
export function useCurveState(
  bondingCurveAddress,
  {
    isActive = false,
    pollMs = 12000,
    includeSteps = true,
    includeFees = true,
    enabled = true,
  } = {},
) {
  const [curveSupply, setCurveSupply] = useState(0n);
  const [curveReserves, setCurveReserves] = useState(0n);
  const [curveStep, setCurveStep] = useState(null); // { step, price, rangeTo }
  const [bondStepsPreview, setBondStepsPreview] = useState([]);
  const [allBondSteps, setAllBondSteps] = useState([]);
  const [curveFees, setCurveFees] = useState(0n);

  const refreshTimerRef = useRef(null);

  const refreshCurveState = useCallback(async () => {
    try {
      if (!bondingCurveAddress || !enabled) return;
      const netKey = getStoredNetworkKey();
      const client = buildPublicClient(netKey);
      if (!client) return;
      const SOFBondingCurveJson = (
        await import("@/contracts/abis/SOFBondingCurve.json")
      ).default;
      const SOFBondingCurveAbi =
        SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;

      const contracts = [
        {
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: "curveConfig",
          args: [],
        },
        {
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: "getCurrentStep",
          args: [],
        },
      ];

      if (includeSteps) {
        contracts.push({
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: "getBondSteps",
          args: [],
        });
      }

      if (includeFees) {
        contracts.push({
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: "accumulatedFees",
          args: [],
        });
      }

      const results = await client.multicall({
        contracts,
        allowFailure: true,
      });

      const cfgResult =
        results[0]?.status === "success" ? results[0].result : null;
      const stepResult =
        results[1]?.status === "success" ? results[1].result : null;
      const stepsIndex = includeSteps ? 2 : -1;
      const feesIndex = includeFees ? (includeSteps ? 3 : 2) : -1;
      const stepsResult =
        stepsIndex >= 0 && results[stepsIndex]?.status === "success"
          ? results[stepsIndex].result
          : [];
      const feesResult =
        feesIndex >= 0 && results[feesIndex]?.status === "success"
          ? results[feesIndex].result
          : 0n;

      const steps = Array.isArray(stepsResult) ? stepsResult : [];

      setCurveSupply(cfgResult?.[0] ?? 0n);
      setCurveReserves(cfgResult?.[1] ?? 0n);
      setCurveStep({
        step: stepResult?.[0] ?? 0n,
        price: stepResult?.[1] ?? 0n,
        rangeTo: stepResult?.[2] ?? 0n,
      });
      if (includeSteps) {
        setBondStepsPreview(steps.slice(Math.max(0, steps.length - 3)));
        setAllBondSteps(steps);
      } else {
        setBondStepsPreview([]);
        setAllBondSteps([]);
      }
      setCurveFees(includeFees ? (feesResult ?? 0n) : 0n);
    } catch (_e) {
      // silent
    }
  }, [bondingCurveAddress, enabled, includeSteps, includeFees]);

  const debouncedRefresh = useCallback(
    (delay = 600) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void refreshCurveState();
      }, delay);
    },
    [refreshCurveState],
  );

  useEffect(() => {
    if (!isActive || !bondingCurveAddress || !enabled) return;
    let mounted = true;
    // initial prime
    void refreshCurveState();
    const id = setInterval(() => {
      if (!mounted) return;
      void refreshCurveState();
    }, pollMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [isActive, pollMs, bondingCurveAddress, enabled, refreshCurveState]);

  return {
    curveSupply,
    curveReserves,
    curveFees,
    curveStep,
    bondStepsPreview,
    allBondSteps,
    refreshCurveState,
    debouncedRefresh,
  };
}
