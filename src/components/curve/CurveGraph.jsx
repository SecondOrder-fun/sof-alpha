// src/components/curve/CurveGraph.jsx
import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import { createPublicClient, formatUnits, http } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';

/**
 * CurveGraph
 * Visualizes stepped linear curve progress and current price using simple bars.
 * MVP: progress, current step, current price, recent steps.
 */
const CurveGraph = ({ curveSupply, curveStep, allBondSteps }) => {
  const [sofDecimals, setSofDecimals] = useState(18);

  // Read SOF decimals from configured token
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const netKey = getStoredNetworkKey();
        const net = getNetworkByKey(netKey);
        const { SOF } = getContractAddresses(netKey);
        if (!SOF) return;
        const client = createPublicClient({
          chain: { id: net.id, name: net.name, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [net.rpcUrl] } } },
          transport: http(net.rpcUrl),
        });
        // Minimal ERC20 decimals() ABI fragment
        const erc20DecimalsAbi = [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] }];
        const dec = await client.readContract({ address: SOF, abi: erc20DecimalsAbi, functionName: 'decimals', args: [] });
        if (!cancelled) setSofDecimals(Number(dec || 18));
      } catch (_) {
        // fallback to 18
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formatSOF = (weiLike) => {
    try { return Number(formatUnits(weiLike ?? 0n, sofDecimals)).toFixed(4); } catch { return '0.0000'; }
  };
  const maxSupply = useMemo(() => {
    try {
      const last = Array.isArray(allBondSteps) && allBondSteps.length > 0 ? allBondSteps[allBondSteps.length - 1] : null;
      return last?.rangeTo ?? 0n;
    } catch { return 0n; }
  }, [allBondSteps]);

  const progressPct = useMemo(() => {
    try {
      if (!maxSupply || maxSupply === 0n) return 0;
      const pct = Number((curveSupply * 10000n) / maxSupply) / 100;
      return Math.min(100, Math.max(0, pct));
    } catch { return 0; }
  }, [curveSupply, maxSupply]);

  const currentPrice = useMemo(() => {
    try { return curveStep?.price ?? 0n; } catch { return 0n; }
  }, [curveStep]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between text-sm text-muted-foreground mb-1">
          <span>Bonding Curve Progress</span>
          <span>{progressPct.toFixed(2)}%</span>
        </div>
        <div className="w-full h-3 bg-muted rounded">
          <div className="h-3 bg-primary rounded" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Supply: <span className="font-mono">{curveSupply?.toString?.() ?? '0'}</span> / <span className="font-mono">{maxSupply?.toString?.() ?? '0'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="p-2 border rounded">
          <div className="text-muted-foreground">Current Step</div>
          <div className="font-mono text-lg">{curveStep?.step?.toString?.() ?? '0'}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-muted-foreground">Current Price (SOF)</div>
          <div className="font-mono text-lg">{formatSOF(currentPrice)}</div>
        </div>
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">Recent Steps</div>
        <div className="flex gap-1 overflow-x-auto">
          {(allBondSteps || []).slice(-12).map((s, idx) => (
            <div key={idx} className="min-w-[72px] p-1 border rounded text-center">
              <div className="text-xs text-muted-foreground">#{s?.step?.toString?.() ?? String(s?.step ?? '')}</div>
              <div className="font-mono text-xs">{formatSOF(s?.price ?? 0n)}</div>
            </div>
          ))}
          {(!allBondSteps || allBondSteps.length === 0) && (
            <div className="text-sm text-muted-foreground">No step preview</div>
          )}
        </div>
      </div>
    </div>
  );
};

CurveGraph.propTypes = {
  curveSupply: PropTypes.oneOfType([PropTypes.object, PropTypes.string, PropTypes.number]),
  curveStep: PropTypes.object,
  allBondSteps: PropTypes.array,
};

export default CurveGraph;
