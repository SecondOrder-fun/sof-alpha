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

  // Build chart data from steps: x=cumulative supply, y=price (SOF)
  const chartData = useMemo(() => {
    try {
      const steps = Array.isArray(allBondSteps) ? allBondSteps : [];
      if (steps.length === 0) return { points: [], maxX: 0, maxY: 0 };
      let prevX = 0n;
      const pts = [];
      for (const s of steps) {
        const x2 = BigInt(s?.rangeTo ?? 0);
        const price = s?.price ?? 0n;
        // horizontal segment from prevX -> x2 at current step price
        pts.push({ x: Number(prevX), y: Number(formatUnits(price, sofDecimals)) });
        pts.push({ x: Number(x2), y: Number(formatUnits(price, sofDecimals)) });
        prevX = x2;
      }
      const maxX = Number(steps[steps.length - 1]?.rangeTo ?? 0n);
      const maxY = pts.reduce((m, p) => Math.max(m, p.y), 0);
      return { points: pts, maxX, maxY };
    } catch {
      return { points: [], maxX: 0, maxY: 0 };
    }
  }, [allBondSteps, sofDecimals]);

  // SVG dimensions and scales
  const width = 640; // will scale via viewBox
  const height = 220;
  const margin = { top: 10, right: 16, bottom: 24, left: 48 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxX = chartData.maxX || 1;
  const maxY = chartData.maxY || Number(formatUnits(currentPrice || 0n, sofDecimals)) || 1;
  const xScale = (x) => margin.left + (innerW * (x / maxX));
  const yScale = (y) => margin.top + innerH - (innerH * (y / maxY));

  // Build path string for stepped line
  const buildPath = () => {
    const pts = chartData.points;
    if (!pts || pts.length === 0) return '';
    const to = (p) => `${xScale(p.x)},${yScale(p.y)}`;
    let d = `M ${to(pts[0])}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${to(pts[i])}`;
    return d;
  };

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

      {/* SVG Stepped Curve Visualization */}
      <div className="w-full overflow-hidden border rounded p-2 bg-background">
        {chartData.points.length === 0 ? (
          <div className="text-sm text-muted-foreground">No bonding curve data available.</div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
            {/* Axes */}
            <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="#e5e7eb" />
            <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke="#e5e7eb" />

            {/* Y ticks */}
            {Array.from({ length: 5 }).map((_, i) => {
              const yVal = (maxY * i) / 4;
              const y = yScale(yVal);
              return (
                <g key={`y-${i}`}>
                  <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="#f3f4f6" />
                  <text x={margin.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#6b7280">{yVal.toFixed(2)}</text>
                </g>
              );
            })}

            {/* X ticks */}
            {Array.from({ length: 5 }).map((_, i) => {
              const xVal = Math.floor((maxX * i) / 4);
              const x = xScale(xVal);
              return (
                <g key={`x-${i}`}>
                  <line x1={x} y1={height - margin.bottom} x2={x} y2={margin.top} stroke="#f9fafb" />
                  <text x={x} y={height - margin.bottom + 14} textAnchor="middle" fontSize="10" fill="#6b7280">{xVal}</text>
                </g>
              );
            })}

            {/* Stepped curve path */}
            <path d={buildPath()} fill="none" stroke="#2563eb" strokeWidth="2" />

            {/* Current supply marker (at currentPrice horizontally) */}
            {(() => {
              try {
                const cs = Number(curveSupply ?? 0n);
                const lastPrice = Number(formatUnits(currentPrice ?? 0n, sofDecimals));
                const cx = xScale(Math.min(cs, maxX));
                const cy = yScale(lastPrice);
                return (
                  <g>
                    <circle cx={cx} cy={cy} r={3} fill="#ef4444" />
                    <text x={cx + 6} y={cy - 6} fontSize="10" fill="#ef4444">Current</text>
                  </g>
                );
              } catch { return null; }
            })()}

            {/* Axis labels */}
            <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="11" fill="#6b7280">Supply (tickets)</text>
            <text x={12} y={height / 2} textAnchor="middle" fontSize="11" fill="#6b7280" transform={`rotate(-90 12 ${height / 2})`}>Price (SOF)</text>
          </svg>
        )}
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
