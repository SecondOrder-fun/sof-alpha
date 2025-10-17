// src/components/curve/CurveGraph.jsx
import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPublicClient, formatUnits, http } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import { ERC20Abi } from '@/utils/abis';

/**
 * BondingCurvePanel
 * Visualizes stepped linear curve progress and current price using simple bars.
 * MVP: progress, current step, current price, recent steps.
 */
const BondingCurvePanel = ({ curveSupply, curveStep, allBondSteps }) => {
  const { t } = useTranslation('raffle');
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
        const dec = await client.readContract({ address: SOF, abi: ERC20Abi, functionName: 'decimals', args: [] });
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
      const prices = steps.map((s) => Number(formatUnits(s?.price ?? 0n, sofDecimals)));
      const minY = Math.min(...prices);
      const maxY = Math.max(...prices);
      return { points: pts, maxX, minY, maxY };
    } catch {
      return { points: [], maxX: 0, minY: 0, maxY: 0 };
    }
  }, [allBondSteps, sofDecimals]);

  // SVG dimensions and scales
  const width = 640; // will scale via viewBox
  const height = 320;
  const margin = { top: 10, right: 16, bottom: 24, left: 48 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxX = chartData.maxX || 1;
  const minY = chartData.minY ?? 0;
  const maxY = chartData.maxY ?? 1;
  const yRange = Math.max(1e-9, maxY - minY);
  const xScale = (x) => margin.left + (innerW * (x / maxX));
  const yScale = (y) => margin.top + innerH - (innerH * ((y - minY) / yRange));

  // Build path string for stepped line
  const buildPath = () => {
    const pts = chartData.points;
    if (!pts || pts.length === 0) return '';
    const to = (p) => `${xScale(p.x)},${yScale(p.y)}`;
    let d = `M ${to(pts[0])}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${to(pts[i])}`;
    return d;
  };

  // Area under the stepped curve
  const buildArea = () => {
    const pts = chartData.points;
    if (!pts || pts.length === 0) return '';
    const baselineY = yScale(minY);
    const to = (p) => `${xScale(p.x)},${yScale(p.y)}`;
    let d = `M ${to(pts[0])}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${to(pts[i])}`;
    // close to baseline
    const last = pts[pts.length - 1];
    const first = pts[0];
    d += ` L ${xScale(last.x)},${baselineY}`;
    d += ` L ${xScale(first.x)},${baselineY} Z`;
    return d;
  };

  // Helper to get price at a specific supply using steps (SOF units)
  const getPriceAtSupply = (supply) => {
    try {
      const steps = Array.isArray(allBondSteps) ? allBondSteps : [];
      if (steps.length === 0) return 0;
      for (const s of steps) {
        const to = BigInt(s.rangeTo ?? 0);
        if (BigInt(Math.floor(supply)) <= to) {
          return Number(formatUnits(s.price ?? 0n, sofDecimals));
        }
      }
      return Number(formatUnits(steps[steps.length - 1].price ?? 0n, sofDecimals));
    } catch { return 0; }
  };

  // Hover interaction state
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null); // {xSupply, yPrice, cx, cy}

  const onMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // invert xScale → supply
    const clamped = Math.max(margin.left, Math.min(width - margin.right, mx));
    const ratio = (clamped - margin.left) / innerW;
    const xSupply = Math.max(0, Math.min(maxX, ratio * maxX));
    const yPrice = getPriceAtSupply(xSupply);
    const cx = xScale(xSupply);
    const cy = yScale(yPrice);
    setHover({ xSupply, yPrice, cx, cy, mx: clamped, my });
  };

  const onMouseLeave = () => setHover(null);

  // Progress bar tooltip (when hovering a step dot)
  const [progressTip, setProgressTip] = useState(null); // {leftPct, price, step}
  const onStepEnter = (leftPct, price, step) => setProgressTip({ leftPct, price, step });
  const onProgressLeave = () => setProgressTip(null);

  return (
    <div className="space-y-4">

      {/* SVG Stepped Curve Visualization */}
      <div className="w-full overflow-hidden border rounded p-2 bg-background">
        {chartData.points.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t('noBondingCurveData')}</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-80" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
            {/* Axes */}
            <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="#e5e7eb" />
            <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke="#e5e7eb" />

            {/* Y ticks */}
            {Array.from({ length: 5 }).map((_, i) => {
              const yVal = minY + (yRange * i) / 4;
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

            {/* Shaded area under curve */}
            <path d={buildArea()} fill="#93c5fd" fillOpacity="0.25" />
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
                    {/* Vertical guideline */}
                    <line x1={cx} y1={margin.top} x2={cx} y2={height - margin.bottom} stroke="#f97316" strokeDasharray="4 3" />
                    <circle cx={cx} cy={cy} r={3} fill="#ef4444" />
                    <text x={cx + 6} y={cy - 6} fontSize="10" fill="#ef4444">{t('current')}</text>
                  </g>
                );
              } catch { return null; }
            })()}

            {/* Hover vertical and tooltip */}
            {hover && (
              <g>
                <line x1={hover.cx} y1={margin.top} x2={hover.cx} y2={height - margin.bottom} stroke="#9ca3af" strokeDasharray="3 3" />
                <circle cx={hover.cx} cy={hover.cy} r={3} fill="#111827" />
                {/* Tooltip background */}
                {(() => {
                  const boxW = 120; const boxH = 44; const pad = 8;
                  let tx = hover.cx + 10; let ty = hover.cy - (boxH + 6);
                  if (tx + boxW > width - margin.right) tx = hover.cx - boxW - 10;
                  if (ty < margin.top) ty = hover.cy + 10;
                  return (
                    <g>
                      <rect x={tx} y={ty} width={boxW} height={boxH} rx={6} ry={6} fill="#111827" opacity="0.9" />
                      <text x={tx + pad} y={ty + 16} fontSize="11" fill="#e5e7eb">{t('supply')}: {Math.round(hover.xSupply)}</text>
                      <text x={tx + pad} y={ty + 32} fontSize="11" fill="#e5e7eb">{t('common:price')}: {hover.yPrice.toFixed(4)} SOF</text>
                    </g>
                  );
                })()}
              </g>
            )}

            {/* Axis labels */}
            <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="11" fill="#6b7280">{t('supplyTickets')}</text>
            <text x={12} y={height / 2} textAnchor="middle" fontSize="11" fill="#6b7280" transform={`rotate(-90 12 ${height / 2})`}>{t('priceSof')}</text>
          </svg>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="p-2 border rounded">
          <div className="text-muted-foreground">{t('currentStep')}</div>
          <div className="font-mono text-lg">{curveStep?.step?.toString?.() ?? '0'}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-muted-foreground">{t('currentPrice')}</div>
          <div className="font-mono text-lg">{formatSOF(currentPrice)}</div>
        </div>
      </div>

      {/* Progress bar moved below the graph */}
      <div>
        <div className="flex justify-between text-sm text-muted-foreground mb-1">
          <span>{t('bondingCurveProgress')}</span>
          <span>{progressPct.toFixed(2)}%</span>
        </div>
        <div className="w-full" onMouseLeave={onProgressLeave}>
          <div className="relative h-3 bg-muted rounded">
            <div className="h-3 bg-primary rounded" style={{ width: `${progressPct}%` }} />
            {/* Step dots with custom tooltip */}
            {(() => {
              const steps = Array.isArray(allBondSteps) ? allBondSteps : [];
              if (steps.length === 0 || !maxSupply || maxSupply === 0n) return null;
              const count = steps.length;
              const stride = count > 40 ? Math.ceil(count / 40) : 1;
              return (
                <>
                  {steps.map((s, idx) => {
                    if (idx % stride !== 0 && idx !== count - 1) return null;
                    const leftPct = Math.min(100, Math.max(0, Number((BigInt(s.rangeTo ?? 0) * 10000n) / (maxSupply || 1n)) / 100));
                    const price = Number(formatUnits(s.price ?? 0n, sofDecimals)).toFixed(4);
                    const stepNum = s?.step ?? (idx + 1);
                    return (
                      <div
                        key={`dot-${idx}`}
                        className="absolute -top-1 translate-x-[-50%] w-2 h-2 rounded-full bg-primary border border-white shadow cursor-help"
                        style={{ left: `${leftPct}%` }}
                        onMouseEnter={() => onStepEnter(leftPct, price, String(stepNum))}
                        aria-label={`${t('step')} ${String(stepNum)} ${t('common:price')} ${price} SOF`}
                      />
                    );
                  })}
                  {progressTip && (
                    <div
                      className="absolute -top-10 translate-x-[-50%] px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs border shadow"
                      style={{ left: `${progressTip.leftPct}%` }}
                      role="tooltip"
                      aria-label={`${t('step')} ${progressTip.step} ${t('common:price')} ${progressTip.price} SOF`}
                      // Prevent tooltip from capturing the mouse and causing flicker
                      onMouseEnter={(e) => e.stopPropagation()}
                      onMouseMove={(e) => e.stopPropagation()}
                      onMouseLeave={(e) => e.stopPropagation()}
                    >
                      <div className="font-mono">{progressTip.price} SOF</div>
                      <div className="text-[10px] text-muted-foreground">{t('step')} #{progressTip.step}</div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t('supply')}: <span className="font-mono">{curveSupply?.toString?.() ?? '0'}</span> / <span className="font-mono">{maxSupply?.toString?.() ?? '0'}</span>
        </div>
      </div>
    </div>
  );
};

BondingCurvePanel.propTypes = {
  // Accept bigint (no native PropTypes.bigint), object wrappers, strings, or numbers.
  // Internal logic normalizes values as needed.
  curveSupply: PropTypes.any,
  curveStep: PropTypes.object,
  allBondSteps: PropTypes.array,
};

export default BondingCurvePanel;
