// src/components/infofi/InfoFiMarketCard.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOraclePriceLive } from '@/hooks/useOraclePriceLive';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from 'wagmi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { placeBetTx, readBet, claimPayoutTx } from '@/services/onchainInfoFi';
import { buildMarketTitleParts } from '@/lib/marketTitle';
import { useToast } from '@/hooks/useToast';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import ERC20Abi from '@/contracts/abis/ERC20.json';
import { createPublicClient, http, getAddress, formatUnits } from 'viem';
import { computeWinnerMarketId } from '@/services/onchainInfoFi';
import UsernameDisplay from '@/components/user/UsernameDisplay';

/**
 * InfoFiMarketCard
 * Displays a single InfoFi market with live hybrid pricing and minimal metadata.
 */
const InfoFiMarketCard = ({ market }) => {
  const { t } = useTranslation('market');
  // Safe defaults so hooks are not conditional
  const seasonId = market?.raffle_id ?? market?.seasonId;
  const isWinnerPrediction = market.market_type === 'WINNER_PREDICTION' && market.player && seasonId != null;
  const parts = buildMarketTitleParts(market);
  const title = market?.question || market?.market_type || t('market');
  const subtitle = t('marketId', { id: market?.id ?? '—' });
  const { isConnected, address } = useAccount();
  const qc = useQueryClient();
  const { toast } = useToast();
  // Live price
  const [bps, setBps] = React.useState({ hybrid: null, raffle: null, market: null });
  const { data: priceData } = useOraclePriceLive(market?.id);
  React.useEffect(() => {
    if (!priceData) return;
    
    // Validate and clamp probability data to 0-10000 range
    const hybrid = Math.max(0, Math.min(10000, Number(priceData.hybridPriceBps ?? 0)));
    const raffle = Math.max(0, Math.min(10000, Number(priceData.raffleProbabilityBps ?? 0)));
    const market = Math.max(0, Math.min(10000, Number(priceData.marketSentimentBps ?? 0)));
    
    setBps({ hybrid, raffle, market });
  }, [priceData, market?.id, market?.player]);

  // Derive preferred uint256 market id if listing supplied a bytes32 id
  const netKey = (import.meta.env.VITE_DEFAULT_NETWORK || 'LOCAL').toUpperCase();
  const net = getNetworkByKey(netKey);
  const addrs = getContractAddresses(netKey);
  const publicClient = React.useMemo(() => createPublicClient({ chain: { id: net.id }, transport: http(net.rpcUrl) }), [net.id, net.rpcUrl]);
  const [derivedMid, setDerivedMid] = React.useState(null);
  // Minimal ABI to read nextMarketId without dynamic imports
  const MarketMiniAbi = React.useMemo(() => ([{
    type: 'function',
    name: 'nextMarketId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }]
  }]), []);

  // Minimal ABI for getMarket -> MarketInfo with totalYesPool/totalNoPool
  const MarketInfoMiniAbi = React.useMemo(() => ([{
    type: 'function',
    name: 'getMarket',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      internalType: 'struct InfoFiMarket.MarketInfo',
      components: [
        { name: 'id', type: 'uint256', internalType: 'uint256' },
        { name: 'raffleId', type: 'uint256', internalType: 'uint256' },
        { name: 'question', type: 'string', internalType: 'string' },
        { name: 'createdAt', type: 'uint256', internalType: 'uint256' },
        { name: 'resolvedAt', type: 'uint256', internalType: 'uint256' },
        { name: 'locked', type: 'bool', internalType: 'bool' },
        { name: 'totalYesPool', type: 'uint256', internalType: 'uint256' },
        { name: 'totalNoPool', type: 'uint256', internalType: 'uint256' }
      ]
    }]
  }]), []);

  React.useEffect(() => {
    let cancelled = false;
    async function derive() {
      try {
        if (!addrs.INFOFI_MARKET) return;
        const looksBytes32 = typeof market?.id === 'string' && market.id.startsWith('0x') && market.id.length === 66;
        if (!looksBytes32) {
          setDerivedMid(market?.id ?? null);
          return;
        }
        const nextId = await publicClient.readContract({ address: addrs.INFOFI_MARKET, abi: MarketMiniAbi, functionName: 'nextMarketId' });
        const lastId = (typeof nextId === 'bigint' && nextId > 0n) ? (nextId - 1n) : 0n;
        if (!cancelled) setDerivedMid(lastId.toString());
      } catch (_) {
        if (!cancelled) setDerivedMid(market?.id ?? null);
      }
    }
    derive();
    return () => { cancelled = true };
  }, [market?.id, addrs.INFOFI_MARKET, publicClient, MarketMiniAbi]);

  const effectiveMarketId = derivedMid ?? market?.id;

  // Read my current YES/NO positions
  const yesPos = useQuery({
    queryKey: ['infofiBet', effectiveMarketId, address, true],
    enabled: !!address && !!effectiveMarketId,
    queryFn: () => readBet({ marketId: effectiveMarketId, account: address, prediction: true }),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // Read market info to compute total volume
  const marketInfo = useQuery({
    queryKey: ['infofiMarketInfo', effectiveMarketId],
    enabled: !!effectiveMarketId && !!addrs.INFOFI_MARKET,
    queryFn: async () => {
      const info = await publicClient.readContract({ address: addrs.INFOFI_MARKET, abi: MarketInfoMiniAbi, functionName: 'getMarket', args: [BigInt(effectiveMarketId)] });
      // Viem returns tuple as array with named props; normalize
      const yes = info?.totalYesPool ?? (Array.isArray(info) ? info[6] : 0n);
      const no = info?.totalNoPool ?? (Array.isArray(info) ? info[7] : 0n);
      return { totalYesPool: yes ?? 0n, totalNoPool: no ?? 0n };
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // Force an immediate refetch on mount and whenever the effective id or wallet changes
  React.useEffect(() => {
    if (!address || !effectiveMarketId) return;
    yesPos.refetch?.();
    noPos.refetch?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, effectiveMarketId]);

  const claimYes = useMutation({
    mutationFn: () => claimPayoutTx({ marketId: effectiveMarketId, prediction: true }),
    onSuccess: (hash) => {
      qc.invalidateQueries({ queryKey: ['infofiBet', effectiveMarketId, address, true] });
      toast({ title: t('claimSuccessful'), description: t('yesPayoutClaimed', { hash: String(hash) }) });
    },
    onError: (e) => {
      toast({ title: t('claimFailed'), description: e?.message || t('transactionError'), variant: 'destructive' });
    }
  });
  const claimNo = useMutation({
    mutationFn: () => claimPayoutTx({ marketId: effectiveMarketId, prediction: false }),
    onSuccess: (hash) => {
      qc.invalidateQueries({ queryKey: ['infofiBet', effectiveMarketId, address, false] });
      toast({ title: t('claimSuccessful'), description: t('noPayoutClaimed', { hash: String(hash) }) });
    },
    onError: (e) => {
      toast({ title: t('claimFailed'), description: e?.message || t('transactionError'), variant: 'destructive' });
    }
  });
  const noPos = useQuery({
    queryKey: ['infofiBet', effectiveMarketId, address, false],
    enabled: !!address && !!effectiveMarketId,
    queryFn: () => readBet({ marketId: effectiveMarketId, account: address, prediction: false }),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const [form, setForm] = React.useState({ side: 'YES', amount: '' });
  const betMutation = useMutation({
    mutationFn: async () => {
      const amt = form.amount || '0';
      return placeBetTx({ marketId: effectiveMarketId, prediction: form.side === 'YES', amount: amt });
    },
    onSuccess: (hash) => {
      qc.invalidateQueries({ queryKey: ['infofiBet', effectiveMarketId, address, true] });
      qc.invalidateQueries({ queryKey: ['infofiBet', effectiveMarketId, address, false] });
      // Force immediate refetch for snappy UI
      yesPos.refetch?.();
      noPos.refetch?.();
      setForm((f) => ({ ...f, amount: '' }));
      toast({ title: t('betConfirmed'), description: t('betDetails', { side: form.side, amount: form.amount, hash: String(hash) }) });
    },
    onError: (e) => {
      toast({ title: t('tradeFailed'), description: e?.message || t('transactionError'), variant: 'destructive' });
    }
  });

  const percent = React.useMemo(() => {
    const v = Number(bps.hybrid ?? 0);
    // Clamp to 0-10000 range, then convert to percentage with 1 decimal
    const clamped = Math.max(0, Math.min(10000, v));
    return (clamped / 100).toFixed(1);
  }, [bps.hybrid]);

  // Calculate payout for a given bet amount
  const calculatePayout = React.useCallback((betAmount, isYes) => {
    const amount = Number(betAmount || 0);
    if (amount <= 0) return 0;
    
    const yesPercent = Number(percent);
    const noPercent = 100 - yesPercent;
    
    // Payout = (bet amount / probability) if you win
    // This gives you back your stake plus profit
    if (isYes) {
      return yesPercent > 0 ? (amount / (yesPercent / 100)) : 0;
    } else {
      return noPercent > 0 ? (amount / (noPercent / 100)) : 0;
    }
  }, [percent]);

  // Calculate profit (payout minus stake)
  const calculateProfit = React.useCallback((betAmount, isYes) => {
    const payout = calculatePayout(betAmount, isYes);
    return Math.max(0, payout - Number(betAmount || 0));
  }, [calculatePayout]);

  // Format payout display
  const formatPayout = (amount) => {
    if (amount >= 1000) return `${(amount / 1000).toFixed(2)}k`;
    if (amount >= 100) return amount.toFixed(0);
    return amount.toFixed(2);
  };

  const formatVolume = (v) => {
    const n = Number(v || 0);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m ${t('volume')}`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}k ${t('volume')}`;
    return `$${n.toFixed(2)} ${t('volume')}`;
  };

  const formatSof = (amount) => {
    try {
      const bn = typeof amount === 'bigint' ? amount : BigInt(amount ?? 0);
      const s = formatUnits(bn, 18);
      // trim to at most 6 decimals without trailing zeros
      const [a, b = ''] = s.split('.');
      const dec = b.slice(0, 6).replace(/0+$/g, '');
      return dec ? `${a}.${dec}` : a;
    } catch { return '0'; }
  };

DebugInfoFiPanel.propTypes = {
  market: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    player: PropTypes.string,
    market_type: PropTypes.string,
  }),
  wallet: PropTypes.string,
  effectiveMarketId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  yesPos: PropTypes.object,
  noPos: PropTypes.object,
  onRefresh: PropTypes.func,
};


  return (
    <Card className="group hover:shadow-lg transition-shadow duration-200 overflow-hidden">
      {/* Polymarket-style header with market question */}
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium leading-tight">
          {isWinnerPrediction ? (
            <span className="flex flex-col gap-1">
              <span className="text-base">
                {parts.prefix}{" "}
                <UsernameDisplay 
                  address={market.player}
                  linkTo={`/users/${market.player}`}
                  className="font-semibold"
                />
              </span>
              <Link to={`/raffles/${seasonId}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                {parts.seasonLabel}
              </Link>
            </span>
          ) : (
            title
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Polymarket-style outcome buttons with percentages and payouts */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setForm({ ...form, side: 'YES' })}
            className={`relative overflow-hidden rounded-lg border-2 transition-all ${
              form.side === 'YES' 
                ? 'border-emerald-500 bg-emerald-50' 
                : 'border-gray-200 hover:border-emerald-300 bg-white'
            }`}
          >
            <div className="absolute inset-0 bg-emerald-100" style={{ width: `${percent}%` }} />
            <div className="relative px-4 py-3 flex flex-col items-center">
              <span className="text-2xl font-bold text-emerald-700">{percent}%</span>
              <span className="text-xs font-medium text-emerald-900 mt-1">{t('yes')}</span>
              <div className="mt-2 text-xs text-emerald-600">
                {form.amount && Number(form.amount) > 0 ? (
                  <>
                    <div className="font-semibold">{formatPayout(calculatePayout(form.amount, true))} SOF</div>
                    <div className="text-[10px] opacity-75">+{formatPayout(calculateProfit(form.amount, true))} profit</div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold">{formatPayout(calculatePayout(1, true))} SOF</div>
                    <div className="text-[10px] opacity-75">per 1 SOF bet</div>
                  </>
                )}
              </div>
            </div>
          </button>
          
          <button
            onClick={() => setForm({ ...form, side: 'NO' })}
            className={`relative overflow-hidden rounded-lg border-2 transition-all ${
              form.side === 'NO' 
                ? 'border-rose-500 bg-rose-50' 
                : 'border-gray-200 hover:border-rose-300 bg-white'
            }`}
          >
            <div className="absolute inset-0 bg-rose-100" style={{ width: `${100 - Number(percent)}%` }} />
            <div className="relative px-4 py-3 flex flex-col items-center">
              <span className="text-2xl font-bold text-rose-700">{(100 - Number(percent)).toFixed(1)}%</span>
              <span className="text-xs font-medium text-rose-900 mt-1">{t('no')}</span>
              <div className="mt-2 text-xs text-rose-600">
                {form.amount && Number(form.amount) > 0 ? (
                  <>
                    <div className="font-semibold">{formatPayout(calculatePayout(form.amount, false))} SOF</div>
                    <div className="text-[10px] opacity-75">+{formatPayout(calculateProfit(form.amount, false))} profit</div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold">{formatPayout(calculatePayout(1, false))} SOF</div>
                    <div className="text-[10px] opacity-75">per 1 SOF bet</div>
                  </>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Volume and market info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
          <div className="flex items-center gap-3">
            <span className="font-medium">
              {(() => {
                try {
                  const yes = marketInfo.data?.totalYesPool ?? 0n;
                  const no = marketInfo.data?.totalNoPool ?? 0n;
                  const sof = formatUnits((yes + no), 18);
                  return formatVolume(Number(sof));
                } catch { return '$0.00 Vol.'; }
              })()}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/60">{subtitle}</span>
        </div>

        {/* Your positions (collapsible) */}
        {isConnected && (() => {
          const yesAmt = (() => { try { const v = yesPos.data; return (typeof v === 'bigint') ? v : (v?.amount ?? 0n); } catch { return 0n; } })();
          const noAmt = (() => { try { const v = noPos.data; return (typeof v === 'bigint') ? v : (v?.amount ?? 0n); } catch { return 0n; } })();
          const hasPosition = yesAmt > 0n || noAmt > 0n;
          
          if (!hasPosition) return null;
          
          return (
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t('yourPositions')}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {yesAmt > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-700">{t('yes')}</span>
                    <span className="font-mono font-medium">{formatSof(yesAmt)} SOF</span>
                  </div>
                )}
                {noAmt > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700">{t('no')}</span>
                    <span className="font-mono font-medium">{formatSof(noAmt)} SOF</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Trade input - Polymarket style */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder={t('amountSof')}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="flex-1"
            />
            <Button
              onClick={() => betMutation.mutate()}
              disabled={!isConnected || !form.amount || betMutation.isPending}
              className={`min-w-[100px] ${
                form.side === 'YES' 
                  ? 'bg-emerald-600 hover:bg-emerald-700' 
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {betMutation.isPending ? t('submitting') : t('trade')}
            </Button>
          </div>
        </div>

        {/* Claims - only show if there are claimable positions */}
        {isConnected && (() => {
          const yesAmt = (() => { try { const v = yesPos.data; return (typeof v === 'bigint') ? v : (v?.amount ?? 0n); } catch { return 0n; } })();
          const noAmt = (() => { try { const v = noPos.data; return (typeof v === 'bigint') ? v : (v?.amount ?? 0n); } catch { return 0n; } })();
          const hasPosition = yesAmt > 0n || noAmt > 0n;
          
          if (!hasPosition) return null;
          
          return (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <Button 
                variant="outline" 
                size="sm"
                disabled={claimYes.isPending || yesAmt === 0n} 
                onClick={() => claimYes.mutate()}
                className="text-xs"
              >
                {claimYes.isPending ? t('claimingYes') : t('claimYes')}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={claimNo.isPending || noAmt === 0n} 
                onClick={() => claimNo.mutate()}
                className="text-xs"
              >
                {claimNo.isPending ? t('claimingNo') : t('claimNo')}
              </Button>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
};

InfoFiMarketCard.propTypes = {
  market: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    question: PropTypes.string,
    market_type: PropTypes.string,
    raffle_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    player: PropTypes.string,
    volume24h: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    volume: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
};

export default InfoFiMarketCard;

// Dev-only inline component: shows SOF/MARKET addresses, balances, allowances, ids
const DebugInfoFiPanel = ({ market, wallet, effectiveMarketId, yesPos, noPos, onRefresh }) => {
  const [state, setState] = React.useState({ sof: null, marketAddr: null, balance: null, allowance: null, idB32: null, idU256: null, error: null });
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const netKey = (import.meta.env.VITE_DEFAULT_NETWORK || 'LOCAL').toUpperCase();
        const net = getNetworkByKey(netKey);
        const addrs = getContractAddresses(netKey);
        const client = createPublicClient({ chain: { id: net.id }, transport: http(net.rpcUrl) });
        const sof = addrs.SOF;
        const marketAddr = addrs.INFOFI_MARKET;
        const walletAddr = wallet ? getAddress(wallet) : null;
        let balance = null;
        let allowance = null;
        if (walletAddr && sof) {
          try {
            balance = await client.readContract({ address: sof, abi: ERC20Abi.abi, functionName: 'balanceOf', args: [walletAddr] });
            allowance = await client.readContract({ address: sof, abi: ERC20Abi.abi, functionName: 'allowance', args: [walletAddr, marketAddr] });
          } catch (_) { /* no-op */ }
        }
        // Compute ids
        let idB32 = null;
        let idU256 = null;
        try {
          if (typeof market?.id === 'string' && market.id.startsWith('0x') && market.id.length === 66) {
            idB32 = market.id;
          } else if (market?.seasonId != null && market?.player && (market?.market_type === 'WINNER_PREDICTION')) {
            idB32 = computeWinnerMarketId({ seasonId: market.seasonId, player: market.player });
          }
        } catch (_) { /* no-op */ }
        try { idU256 = BigInt(market?.id ?? 0).toString(); } catch { idU256 = '0'; }

        if (!cancelled) setState({ sof, marketAddr, balance, allowance, idB32, idU256, error: null });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: e?.message || String(e) }));
      }
    }
    load();
    return () => { cancelled = true };
  }, [market, wallet]);

  return (
    <div className="mt-3 p-2 border rounded bg-muted/20 text-[11px]">
      <div className="font-medium mb-1">Debug (dev only)</div>
      <div>Wallet: <span className="font-mono">{wallet || '—'}</span></div>
      <div>Effective MarketId: <span className="font-mono break-all">{String(effectiveMarketId ?? '—')}</span></div>
      <div>SOF: <span className="font-mono">{state.sof || '—'}</span></div>
      <div>SOF Balance: <span className="font-mono">{state.balance != null ? state.balance.toString() : '—'}</span></div>
      <div>Allowance→Market: <span className="font-mono">{state.allowance != null ? state.allowance.toString() : '—'}</span></div>
      <div>Market: <span className="font-mono">{state.marketAddr || '—'}</span></div>
      <div>MarketId (bytes32): <span className="font-mono break-all">{state.idB32 || '—'}</span></div>
      <div>MarketId (uint256): <span className="font-mono break-all">{state.idU256 || '—'}</span></div>
      <div>YES raw: <span className="font-mono">{(() => { const v = yesPos?.data; const amt = (typeof v === 'bigint') ? v : (v?.amount ?? 0n); return amt.toString(); })()}</span></div>
      <div>NO raw: <span className="font-mono">{(() => { const v = noPos?.data; const amt = (typeof v === 'bigint') ? v : (v?.amount ?? 0n); return amt.toString(); })()}</span></div>
      <div className="mt-1"><Button size="sm" variant="outline" onClick={onRefresh}>Refresh</Button></div>
      {state.error && <div className="text-red-600">{state.error}</div>}
    </div>
  );
};
