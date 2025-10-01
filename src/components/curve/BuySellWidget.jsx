// src/components/curve/BuySellWidget.jsx
import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPublicClient, formatUnits, http } from 'viem';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common/Tabs';
import { useCurve } from '@/hooks/useCurve';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { useSofDecimals } from '@/hooks/useSofDecimals';
import { getContractAddresses } from '@/config/contracts';

function useFormatSOF() {
  const decimals = useSofDecimals();
  return (amountWei) => {
    try { return Number(formatUnits(amountWei ?? 0n, decimals)).toFixed(4); } catch { return '0.0000'; }
  };
}

const BuySellWidget = ({ bondingCurveAddress, onTxSuccess, onNotify }) => {
  const { t } = useTranslation(['common', 'transactions']);
  const { buyTokens, sellTokens, approve } = useCurve(bondingCurveAddress);
  const formatSOF = useFormatSOF();
  const [activeTab, setActiveTab] = useState('buy');
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [buyEst, setBuyEst] = useState(0n);
  const [sellEst, setSellEst] = useState(0n);
  const [slippagePct, setSlippagePct] = useState('1'); // 1%
  const [showSettings, setShowSettings] = useState(false);

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const addrs = getContractAddresses(netKey);
  const client = useMemo(() => {
    if (!net?.rpcUrl) return null; // Guard: TESTNET not configured
    return createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
  }, [net.id, net.name, net.rpcUrl]);

  const loadEstimate = useCallback(async (fnName, amount) => {
    try {
      if (!client) return 0n;
      const SOFBondingCurveJson = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
      const SOFBondingCurveAbi = SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;
      return await client.readContract({ address: bondingCurveAddress, abi: SOFBondingCurveAbi, functionName: fnName, args: [BigInt(amount || '0')] });
    } catch {
      return 0n;
    }
  }, [client, bondingCurveAddress]);

  // Persist active tab in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('buySell.activeTab');
      if (saved === 'buy' || saved === 'sell') setActiveTab(saved);
    } catch {
      /* no-op */
    }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('buySell.activeTab', activeTab); } catch {
      /* no-op */
    }
  }, [activeTab]);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!bondingCurveAddress) return;
      const est = await loadEstimate('calculateBuyPrice', buyAmount);
      if (!stop) setBuyEst(est);
    })();
    return () => { stop = true; };
  }, [bondingCurveAddress, buyAmount, loadEstimate]);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!bondingCurveAddress) return;
      const est = await loadEstimate('calculateSellPrice', sellAmount);
      if (!stop) setSellEst(est);
    })();
    return () => { stop = true; };
  }, [bondingCurveAddress, sellAmount, loadEstimate]);

  const applyMaxSlippage = (amountWei) => {
    try {
      const pct = Number(slippagePct || '0');
      const bps = Math.max(0, Math.min(10000, Math.floor(pct * 100)));
      return amountWei + (amountWei * BigInt(bps)) / 10000n;
    } catch { return amountWei; }
  };

  const applyMinSlippage = (amountWei) => {
    try {
      const pct = Number(slippagePct || '0');
      const bps = Math.max(0, Math.min(10000, Math.floor(pct * 100)));
      return amountWei - (amountWei * BigInt(bps)) / 10000n;
    } catch { return amountWei; }
  };

  const onBuy = async (e) => {
    e.preventDefault();
    if (!buyAmount || !bondingCurveAddress) return;
    try {
      const maxUint = (1n << 255n) - 1n;
      await approve.mutateAsync({ amount: maxUint });
      const cap = applyMaxSlippage(buyEst);
      const tx = await buyTokens.mutateAsync({ tokenAmount: BigInt(buyAmount), maxSofAmount: cap });
      onTxSuccess && onTxSuccess();
      try { const hash = tx?.hash ?? tx ?? ''; onNotify && onNotify({ type: 'success', message: t('transactions:bought'), hash }); } catch {
        /* no-op */
      }
      setBuyAmount('');
    } catch { /* surfaced by mutate */ }
  };

  const onSell = async (e) => {
    e.preventDefault();
    if (!sellAmount || !bondingCurveAddress) return;
    try {
      const floor = applyMinSlippage(sellEst);
      const tx = await sellTokens.mutateAsync({ tokenAmount: BigInt(sellAmount), minSofAmount: floor });
      onTxSuccess && onTxSuccess();
      try { const hash = tx?.hash ?? tx ?? ''; onNotify && onNotify({ type: 'success', message: t('transactions:sold'), hash }); } catch {
        /* no-op */
      }
      setSellAmount('');
    } catch { /* surfaced by mutate */ }
  };

  // MAX helpers
  const erc20Abi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }];
  const onMaxSell = async (ownerAddress) => {
    try {
      if (!client || !ownerAddress) return;
      const bal = await client.readContract({ address: bondingCurveAddress, abi: erc20Abi, functionName: 'balanceOf', args: [ownerAddress] });
      setSellAmount((bal ?? 0n).toString());
    } catch {
      /* no-op */
    }
  };

  const rpcMissing = !net?.rpcUrl;
  const disabledTip = rpcMissing ? 'Testnet RPC not configured. Set VITE_RPC_URL_TESTNET in .env and restart dev servers.' : undefined;

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="relative w-full mb-3 mt-2">
          <div className="w-full flex justify-center">
            <TabsList className="flex gap-3">
              <TabsTrigger value="buy" className="px-8 py-4 text-lg">{t('common:buy')}</TabsTrigger>
              <TabsTrigger value="sell" className="px-8 py-4 text-lg">{t('common:sell')}</TabsTrigger>
            </TabsList>
          </div>
          <button type="button" className="absolute right-0 top-0 text-xl px-2 py-1 rounded hover:bg-muted" onClick={() => setShowSettings((s) => !s)} title="Slippage settings">⚙︎</button>
          {showSettings && (
            <div className="absolute right-0 top-8 z-10 w-64 border rounded-md bg-card p-3 shadow">
              <div className="text-sm font-medium mb-2">{t('common:slippage', { defaultValue: 'Slippage tolerance' })}</div>
              <div className="text-xs text-muted-foreground mb-2">{t('common:slippageDescription', { defaultValue: 'Maximum percentage you are willing to lose due to unfavorable price changes.' })}</div>
              <div className="flex gap-2 mb-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSlippagePct('0')}>0.0%</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSlippagePct('1')}>1.0%</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSlippagePct('2')}>2.0%</Button>
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" value={slippagePct} onChange={(e) => setSlippagePct(e.target.value)} className="w-24" />
                <Button type="button" size="sm" onClick={() => setShowSettings(false)}>{t('common:save')}</Button>
              </div>
            </div>
          )}
        </div>

        <TabsContent value="buy">
          <form className="space-y-2" onSubmit={onBuy}>
            <div className="font-medium">{t('common:amount', { defaultValue: 'Amount' })}</div>
            <Input type="number" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} placeholder={t('common:amount', { defaultValue: 'Amount' })} />
            <div className="text-xs text-muted-foreground">{t('common:estimatedCost', { defaultValue: 'Estimated cost' })}: <span className="font-mono">{formatSOF(buyEst)}</span> SOF</div>
            <Button type="submit" disabled={rpcMissing || !buyAmount || buyTokens.isPending} className="w-full" title={disabledTip}>
              {buyTokens.isPending ? t('transactions:buying') : t('common:buy')}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="sell">
          <form className="space-y-2" onSubmit={onSell}>
            <div className="font-medium">{t('common:amount', { defaultValue: 'Amount' })}</div>
            <div className="flex gap-2">
              <Input type="number" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} placeholder={t('common:amount', { defaultValue: 'Amount' })} />
              <Button type="button" variant="outline" onClick={() => onMaxSell(addrs?.ACCOUNT0 || addrs?.RAFFLE)} title={t('common:max', { defaultValue: 'Max' })}>MAX</Button>
            </div>
            <div className="text-xs text-muted-foreground">{t('common:estimatedProceeds', { defaultValue: 'Estimated proceeds' })}: <span className="font-mono">{formatSOF(sellEst)}</span> SOF</div>
            <Button type="submit" variant="secondary" disabled={rpcMissing || !sellAmount || sellTokens.isPending} className="w-full" title={disabledTip}>
              {sellTokens.isPending ? t('transactions:selling') : t('common:sell')}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
};

BuySellWidget.propTypes = {
  bondingCurveAddress: PropTypes.string,
  onTxSuccess: PropTypes.func,
  onNotify: PropTypes.func,
};

export default BuySellWidget;
