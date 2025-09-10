// src/components/infofi/InfoFiMarketCard.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import InfoFiPricingTicker from '@/components/infofi/InfoFiPricingTicker';
import ProbabilityChart from '@/components/infofi/ProbabilityChart';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from 'wagmi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { placeBetTx, readBet, claimPayoutTx } from '@/services/onchainInfoFi';
import { buildMarketTitleParts } from '@/lib/marketTitle';
import { useToast } from '@/hooks/useToast';

/**
 * InfoFiMarketCard
 * Displays a single InfoFi market with live hybrid pricing and minimal metadata.
 */
const InfoFiMarketCard = ({ market }) => {
  // Safe defaults so hooks are not conditional
  const seasonId = market?.raffle_id ?? market?.seasonId;
  const isWinnerPrediction = market.market_type === 'WINNER_PREDICTION' && market.player && seasonId != null;
  const parts = buildMarketTitleParts(market);
  const title = market?.question || market?.market_type || 'Market';
  const subtitle = `Market ID: ${market?.id ?? '—'}`;
  const { isConnected, address } = useAccount();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Read my current YES/NO positions
  const yesPos = useQuery({
    queryKey: ['infofiBet', market?.id, address, true],
    enabled: isConnected && !!address && !!market?.id,
    queryFn: () => readBet({ marketId: market?.id, account: address, prediction: true }),
    staleTime: 10_000,
  });

  const claimYes = useMutation({
    mutationFn: () => claimPayoutTx({ marketId: market?.id, prediction: true }),
    onSuccess: (hash) => {
      qc.invalidateQueries({ queryKey: ['infofiBet', market?.id, address, true] });
      toast({ title: 'Claim Successful', description: `YES payout claimed. Tx: ${String(hash)}` });
    },
    onError: (e) => {
      toast({ title: 'Claim Failed', description: e?.message || 'Transaction error', variant: 'destructive' });
    }
  });
  const claimNo = useMutation({
    mutationFn: () => claimPayoutTx({ marketId: market?.id, prediction: false }),
    onSuccess: (hash) => {
      qc.invalidateQueries({ queryKey: ['infofiBet', market?.id, address, false] });
      toast({ title: 'Claim Successful', description: `NO payout claimed. Tx: ${String(hash)}` });
    },
    onError: (e) => {
      toast({ title: 'Claim Failed', description: e?.message || 'Transaction error', variant: 'destructive' });
    }
  });
  const noPos = useQuery({
    queryKey: ['infofiBet', market?.id, address, false],
    enabled: isConnected && !!address && !!market?.id,
    queryFn: () => readBet({ marketId: market?.id, account: address, prediction: false }),
    staleTime: 10_000,
  });

  const [form, setForm] = React.useState({ side: 'YES', amount: '' });
  const betMutation = useMutation({
    mutationFn: async () => {
      const amt = form.amount || '0';
      return placeBetTx({ marketId: market?.id, prediction: form.side === 'YES', amount: amt });
    },
    onSuccess: (hash) => {
      qc.invalidateQueries({ queryKey: ['infofiBet', market?.id, address, true] });
      qc.invalidateQueries({ queryKey: ['infofiBet', market?.id, address, false] });
      setForm((f) => ({ ...f, amount: '' }));
      toast({ title: 'Purchase Successful', description: `Tx: ${String(hash)}` });
    },
    onError: (e) => {
      toast({ title: 'Trade Failed', description: e?.message || 'Transaction error', variant: 'destructive' });
    }
  });

  return (
    <Card className="border rounded p-2">
      <CardHeader>
        <CardTitle className="text-base">
          {isWinnerPrediction ? (
            <span>
              {parts.prefix} {" "}
              <Link to={`/users/${market.player}`} className="text-primary hover:underline font-mono">
                {parts.userAddr}
              </Link>{" "}
              win {" "}
              <Link to={`/raffles/${seasonId}`} className="text-primary hover:underline">
                {parts.seasonLabel}
              </Link>
              ?
            </span>
          ) : (
            title
          )}
        </CardTitle>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </CardHeader>
      <CardContent>
        <InfoFiPricingTicker marketId={market?.id} />
        <ProbabilityChart marketId={market?.id} />
        {/* Buy/Sell Position */}
        <div className="mt-3 border-t pt-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <div>My YES: <span className="font-mono">{(() => { try { return (yesPos.data?.amount ?? 0n).toString(); } catch { return '0'; } })()}</span></div>
            <div>My NO: <span className="font-mono">{(() => { try { return (noPos.data?.amount ?? 0n).toString(); } catch { return '0'; } })()}</span></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.side === 'YES' ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, side: 'YES' })}
              >Buy YES</Button>
              <Button
                type="button"
                variant={form.side === 'NO' ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, side: 'NO' })}
              >Buy NO</Button>
            </div>
            <Input
              placeholder="Amount (SOF)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <Button
              onClick={() => betMutation.mutate()}
              disabled={!isConnected || !form.amount || betMutation.isPending}
            >{betMutation.isPending ? 'Submitting…' : (form.side === 'YES' ? 'Place YES' : 'Place NO')}</Button>
          </div>
          {/* Claim section */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={claimYes.isPending} onClick={() => claimYes.mutate()}>
              {claimYes.isPending ? 'Claiming YES…' : 'Claim YES'}
            </Button>
            <Button variant="outline" disabled={claimNo.isPending} onClick={() => claimNo.mutate()}>
              {claimNo.isPending ? 'Claiming NO…' : 'Claim NO'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Tip: &quot;Sell&quot; by placing the opposite side to hedge/offset your exposure.</p>
        </div>
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
  }).isRequired,
};

export default InfoFiMarketCard;
