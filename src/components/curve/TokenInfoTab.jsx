// src/components/curve/TokenInfoTab.jsx
import PropTypes from 'prop-types';
import { useMemo } from 'react';

const DECIMALS = 18n;

function formatSOF(amountWei) {
  try {
    const whole = amountWei / (10n ** DECIMALS);
    const frac = (amountWei % (10n ** DECIMALS)) / (10n ** (DECIMALS - 4n));
    return `${whole.toString()}.${frac.toString().padStart(4, '0')}`;
  } catch {
    return '0.0000';
  }
}

const TokenInfoTab = ({ bondingCurveAddress, curveSupply, allBondSteps, curveReserves }) => {
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">Contract Address</div>
          <div className="font-mono break-all">{bondingCurveAddress || '—'}</div>
        </div>
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">Total Value Locked (SOF)</div>
          <div className="font-mono">{formatSOF(curveReserves ?? 0n)} SOF</div>
        </div>
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">Current Supply</div>
          <div className="font-mono">{curveSupply?.toString?.() ?? '0'}</div>
        </div>
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">Max Supply</div>
          <div className="font-mono">{maxSupply?.toString?.() ?? '0'}</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-sm text-muted-foreground mb-1">
          <span>Bonding Curve Progress</span>
          <span>{progressPct.toFixed(2)}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded">
          <div className="h-2 bg-primary rounded" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
    </div>
  );
};

TokenInfoTab.propTypes = {
  bondingCurveAddress: PropTypes.string,
  curveSupply: PropTypes.oneOfType([PropTypes.object, PropTypes.string, PropTypes.number]),
  allBondSteps: PropTypes.array,
  curveReserves: PropTypes.oneOfType([PropTypes.object, PropTypes.string, PropTypes.number]),
};

export default TokenInfoTab;
