// src/components/curve/TokenInfoTab.jsx
import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { formatUnits } from 'viem';
import { useSofDecimals } from '@/hooks/useSofDecimals';

const TokenInfoTab = ({ bondingCurveAddress, curveSupply, allBondSteps, curveReserves }) => {
  const sofDecimals = useSofDecimals();
  const formatSOF = (v) => { try { return Number(formatUnits(v ?? 0n, sofDecimals)).toFixed(4); } catch { return '0.0000'; } };
  const maxSupply = useMemo(() => {
    try {
      const last = Array.isArray(allBondSteps) && allBondSteps.length > 0 ? allBondSteps[allBondSteps.length - 1] : null;
      return last?.rangeTo ?? 0n;
    } catch { return 0n; }
  }, [allBondSteps]);

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
      {/* Progress meter removed to avoid duplication; the graph above already shows progress */}
    </div>
  );
};

TokenInfoTab.propTypes = {
  bondingCurveAddress: PropTypes.string,
  curveSupply: PropTypes.any,
  allBondSteps: PropTypes.array,
  curveReserves: PropTypes.any,
};

export default TokenInfoTab;
