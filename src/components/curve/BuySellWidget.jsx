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
import { useWallet } from '@/hooks/useWallet';

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
  const { address: connectedAddress } = useWallet();
  const [activeTab, setActiveTab] = useState('buy');
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [buyEst, setBuyEst] = useState(0n);
  const [sellEst, setSellEst] = useState(0n);
  const [slippagePct, setSlippagePct] = useState('1'); // 1%
  const [showSettings, setShowSettings] = useState(false);

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
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
      const hash = tx?.hash ?? tx ?? '';
      
      // Notify immediately with transaction hash
      try { 
        onNotify && onNotify({ type: 'success', message: t('transactions:bought'), hash }); 
      } catch {
        /* no-op */
      }
      
      // Wait for transaction to be mined before refreshing
      if (client && hash) {
        try {
          await client.waitForTransactionReceipt({ hash, confirmations: 1 });
          onTxSuccess && onTxSuccess();
        } catch (waitErr) {
          // If waiting fails, still trigger refresh after delay
          setTimeout(() => onTxSuccess && onTxSuccess(), 2000);
        }
      } else {
        // Fallback: trigger refresh after delay if no client
        setTimeout(() => onTxSuccess && onTxSuccess(), 2000);
      }
      
      setBuyAmount('');
    } catch { /* surfaced by mutate */ }
  };

  const onSell = async (e) => {
    e.preventDefault();
    if (!sellAmount || !bondingCurveAddress) return;
    try {
      const tokenAmount = BigInt(sellAmount);
      const floor = applyMinSlippage(sellEst);
      
      // Check curve reserves before selling
      if (client) {
        try {
          const SOFBondingCurveJson = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
          const SOFBondingCurveAbi = SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;
          const cfg = await client.readContract({
            address: bondingCurveAddress,
            abi: SOFBondingCurveAbi,
            functionName: 'curveConfig',
            args: []
          });
          const reserves = cfg[1]; // sofReserves
          console.log('[BuySellWidget] Curve reserves:', reserves.toString(), 'SOF');
          console.log('[BuySellWidget] Sell would return:', sellEst.toString(), 'SOF');
          
          if (reserves < sellEst) {
            console.error('[BuySellWidget] INSUFFICIENT RESERVES! Reserves:', reserves.toString(), 'Need:', sellEst.toString());
            onNotify && onNotify({ 
              type: 'error', 
              message: 'Insufficient curve reserves - cannot sell this amount',
              hash: '' 
            });
            return;
          }
        } catch (checkErr) {
          console.warn('[BuySellWidget] Could not check reserves:', checkErr);
        }
      }
      
      console.log('[BuySellWidget] Selling:', {
        tokenAmount: tokenAmount.toString(),
        minSofAmount: floor.toString(),
        sellEst: sellEst.toString()
      });
      
      const tx = await sellTokens.mutateAsync({ tokenAmount, minSofAmount: floor });
      const hash = tx?.hash ?? tx ?? '';
      
      console.log('[BuySellWidget] Sell transaction submitted:', hash);
      
      // Notify immediately with transaction hash
      try { 
        onNotify && onNotify({ type: 'success', message: t('transactions:sold'), hash }); 
      } catch {
        /* no-op */
      }
      
      // Wait for transaction to be mined before refreshing
      if (client && hash) {
        try {
          const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
          console.log('[BuySellWidget] Transaction receipt:', receipt);
          
          if (receipt.status === 'reverted') {
            console.error('[BuySellWidget] Transaction REVERTED!');
            // Try to get revert reason
            try {
              const tx = await client.getTransaction({ hash });
              console.log('[BuySellWidget] Transaction details:', tx);
              
              // Try to simulate the transaction to get revert reason
              const result = await client.call({
                to: tx.to,
                data: tx.input,
                from: tx.from,
                value: tx.value,
                blockNumber: receipt.blockNumber - 1n
              });
              console.log('[BuySellWidget] Simulation result:', result);
            } catch (simErr) {
              console.error('[BuySellWidget] Revert reason:', simErr.message);
            }
            
            // Show error to user
            onNotify && onNotify({ 
              type: 'error', 
              message: 'Transaction reverted - check console for details',
              hash 
            });
            
            // Still refresh position to show accurate state
            // (transaction reverted, so balance should be unchanged)
            onTxSuccess && onTxSuccess();
          } else {
            // Transaction succeeded
            onTxSuccess && onTxSuccess();
          }
        } catch (waitErr) {
          console.error('[BuySellWidget] Wait for receipt failed:', waitErr);
          // If waiting fails, still trigger refresh after delay
          setTimeout(() => onTxSuccess && onTxSuccess(), 2000);
        }
      } else {
        // Fallback: trigger refresh after delay if no client
        setTimeout(() => onTxSuccess && onTxSuccess(), 2000);
      }
      
      setSellAmount('');
    } catch (err) {
      console.error('[BuySellWidget] Sell failed:', err);
      // Show error notification
      try {
        onNotify && onNotify({ 
          type: 'error', 
          message: t('transactions:sellFailed', { defaultValue: 'Sell failed' }),
          hash: '' 
        });
      } catch {
        /* no-op */
      }
    }
  };

  // MAX helpers - reads user's position from bonding curve's playerTickets mapping
  const onMaxSell = async () => {
    try {
      if (!client || !connectedAddress) return;
      console.log('[BuySellWidget] MAX clicked, reading playerTickets for:', connectedAddress);
      const SOFBondingCurveJson = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
      const SOFBondingCurveAbi = SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;
      const bal = await client.readContract({ 
        address: bondingCurveAddress, 
        abi: SOFBondingCurveAbi, 
        functionName: 'playerTickets', 
        args: [connectedAddress] 
      });
      console.log('[BuySellWidget] playerTickets balance:', bal?.toString());
      
      setSellAmount((bal ?? 0n).toString());
    } catch (err) {
      console.error('[BuySellWidget] MAX button failed:', err);
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
              <Button type="button" variant="outline" onClick={onMaxSell} disabled={!connectedAddress} title={connectedAddress ? t('common:max', { defaultValue: 'Max' }) : 'Connect wallet'}>MAX</Button>
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
