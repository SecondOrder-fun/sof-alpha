// src/components/curve/TokenInfoTab.jsx
import PropTypes from 'prop-types';
import { useMemo, useState, useEffect } from 'react';
import { formatUnits, createPublicClient, http } from 'viem';
import { useTranslation } from 'react-i18next';
import { useSofDecimals } from '@/hooks/useSofDecimals';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';

const TokenInfoTab = ({ bondingCurveAddress, curveSupply, allBondSteps, curveReserves }) => {
  const { t } = useTranslation('common');
  const sofDecimals = useSofDecimals();
  const [raffleTokenAddress, setRaffleTokenAddress] = useState(null);
  
  const formatSOF = (v) => { try { return Number(formatUnits(v ?? 0n, sofDecimals)).toFixed(4); } catch { return '0.0000'; } };
  const maxSupply = useMemo(() => {
    try {
      const last = Array.isArray(allBondSteps) && allBondSteps.length > 0 ? allBondSteps[allBondSteps.length - 1] : null;
      return last?.rangeTo ?? 0n;
    } catch { return 0n; }
  }, [allBondSteps]);

  // Fetch raffle token address from bonding curve
  useEffect(() => {
    let cancelled = false;
    async function fetchRaffleToken() {
      if (!bondingCurveAddress) return;
      
      try {
        const netKey = getStoredNetworkKey();
        const net = getNetworkByKey(netKey);
        if (!net?.rpcUrl) return;
        
        const client = createPublicClient({
          chain: {
            id: net.id,
            name: net.name,
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [net.rpcUrl] } },
          },
          transport: http(net.rpcUrl),
        });
        
        const abi = [
          { type: 'function', name: 'raffleToken', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] }
        ];
        
        const tokenAddr = await client.readContract({
          address: bondingCurveAddress,
          abi,
          functionName: 'raffleToken',
          args: []
        });
        
        if (!cancelled) {
          setRaffleTokenAddress(tokenAddr);
        }
      } catch (error) {
        // If raffleToken() doesn't exist or fails, the bonding curve might be the token itself
        if (!cancelled) {
          setRaffleTokenAddress(null);
        }
      }
    }
    
    fetchRaffleToken();
    return () => { cancelled = true; };
  }, [bondingCurveAddress]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">{t('bondingCurveAddress')}</div>
          <div className="font-mono break-all text-xs">{bondingCurveAddress || '—'}</div>
        </div>
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">{t('raffleTokenAddress')}</div>
          <div className="font-mono break-all text-xs">{raffleTokenAddress || bondingCurveAddress || '—'}</div>
        </div>
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">{t('totalValueLocked')}</div>
          <div className="font-mono">{formatSOF(curveReserves ?? 0n)} SOF</div>
        </div>
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">{t('currentSupply')}</div>
          <div className="font-mono">{curveSupply?.toString?.() ?? '0'}</div>
        </div>
        <div className="p-3 border rounded">
          <div className="text-sm text-muted-foreground">{t('maxSupply')}</div>
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
