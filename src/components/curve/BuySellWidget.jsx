// src/components/curve/BuySellWidget.jsx
import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPublicClient, formatUnits, http } from 'viem';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCurve } from '@/hooks/useCurve';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { useSofDecimals } from '@/hooks/useSofDecimals';

function useFormatSOF() {
  const decimals = useSofDecimals();
  return (amountWei) => {
    try { return Number(formatUnits(amountWei ?? 0n, decimals)).toFixed(4); } catch { return '0.0000'; }
  };
}

const BuySellWidget = ({ bondingCurveAddress, onTxSuccess }) => {
  const { buyTokens, sellTokens, approve } = useCurve(bondingCurveAddress);
  const formatSOF = useFormatSOF();
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [buyEst, setBuyEst] = useState(0n);
  const [sellEst, setSellEst] = useState(0n);
  const [slippagePct, setSlippagePct] = useState('1'); // 1%

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
      await buyTokens.mutateAsync({ tokenAmount: BigInt(buyAmount), maxSofAmount: cap });
      onTxSuccess && onTxSuccess();
      setBuyAmount('');
    } catch { /* surfaced by mutate */ }
  };

  const onSell = async (e) => {
    e.preventDefault();
    if (!sellAmount || !bondingCurveAddress) return;
    try {
      const floor = applyMinSlippage(sellEst);
      await sellTokens.mutateAsync({ tokenAmount: BigInt(sellAmount), minSofAmount: floor });
      onTxSuccess && onTxSuccess();
      setSellAmount('');
    } catch { /* surfaced by mutate */ }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">Slippage %</div>
      <Input type="number" value={slippagePct} onChange={(e) => setSlippagePct(e.target.value)} placeholder="1" />

      <form className="space-y-2" onSubmit={onBuy}>
        <div className="font-medium">Buy Tickets</div>
        <Input type="number" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} placeholder="Amount" />
        <div className="text-xs text-muted-foreground">Estimated cost: <span className="font-mono">{formatSOF(buyEst)}</span> SOF</div>
        <Button type="submit" disabled={!buyAmount || buyTokens.isPending} className="w-full">{buyTokens.isPending ? 'Buying…' : 'Buy'}</Button>
      </form>

      <form className="space-y-2" onSubmit={onSell}>
        <div className="font-medium">Sell Tickets</div>
        <Input type="number" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} placeholder="Amount" />
        <div className="text-xs text-muted-foreground">Estimated proceed: <span className="font-mono">{formatSOF(sellEst)}</span> SOF</div>
        <Button type="submit" variant="secondary" disabled={!sellAmount || sellTokens.isPending} className="w-full">{sellTokens.isPending ? 'Selling…' : 'Sell'}</Button>
      </form>
    </div>
  );
};

BuySellWidget.propTypes = {
  bondingCurveAddress: PropTypes.string,
  onTxSuccess: PropTypes.func,
};

export default BuySellWidget;
