// src/hooks/useCurveState.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { getNetworkByKey } from '@/config/networks';
import { getStoredNetworkKey } from '@/lib/wagmi';

/**
 * useCurveState keeps bonding curve state (supply, reserves, current step, steps tail) fresh.
 * - Exposes debounced refresh for tx success events
 * - Polls periodically while season is Active
 */
export function useCurveState(bondingCurveAddress, { isActive = false, pollMs = 12000 } = {}) {
  const [curveSupply, setCurveSupply] = useState(0n);
  const [curveReserves, setCurveReserves] = useState(0n);
  const [curveStep, setCurveStep] = useState(null); // { step, price, rangeTo }
  const [bondStepsPreview, setBondStepsPreview] = useState([]);
  const [allBondSteps, setAllBondSteps] = useState([]);

  const refreshTimerRef = useRef(null);

  const refreshCurveState = useCallback(async () => {
    try {
      if (!bondingCurveAddress) return;
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
      const SOFBondingCurveJson = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
      const SOFBondingCurveAbi = SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;

      const cfg = await client.readContract({
        address: bondingCurveAddress,
        abi: SOFBondingCurveAbi,
        functionName: 'curveConfig',
        args: [],
      });
      const stepInfo = await client.readContract({
        address: bondingCurveAddress,
        abi: SOFBondingCurveAbi,
        functionName: 'getCurrentStep',
        args: [],
      });
      let steps = [];
      try {
        const all = await client.readContract({
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: 'getBondSteps',
          args: [],
        });
        steps = Array.isArray(all) ? all : [];
      } catch (e) { void e; }

      setCurveSupply(cfg[0] ?? 0n);
      setCurveReserves(cfg[1] ?? 0n);
      setCurveStep({ step: stepInfo?.[0] ?? 0n, price: stepInfo?.[1] ?? 0n, rangeTo: stepInfo?.[2] ?? 0n });
      setBondStepsPreview(steps.slice(Math.max(0, steps.length - 3)));
      setAllBondSteps(steps);
    } catch (_e) {
      // silent
    }
  }, [bondingCurveAddress]);

  const debouncedRefresh = useCallback((delay = 600) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshCurveState();
    }, delay);
  }, [refreshCurveState]);

  useEffect(() => {
    if (!isActive || !bondingCurveAddress) return;
    let mounted = true;
    // initial prime
    void refreshCurveState();
    const id = setInterval(() => {
      if (!mounted) return;
      void refreshCurveState();
    }, pollMs);
    return () => { mounted = false; clearInterval(id); };
  }, [isActive, pollMs, bondingCurveAddress, refreshCurveState]);

  return {
    curveSupply,
    curveReserves,
    curveStep,
    bondStepsPreview,
    allBondSteps,
    refreshCurveState,
    debouncedRefresh,
  };
}
