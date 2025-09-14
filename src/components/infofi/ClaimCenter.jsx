// src/components/infofi/ClaimCenter.jsx
import PropTypes from 'prop-types';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { enumerateAllMarkets, readBetFull, claimPayoutTx } from '@/services/onchainInfoFi';
import { formatUnits } from 'viem';

/**
 * ClaimCenter
 * Groups claimable InfoFi market payouts by season.
 * No placeholders; reads strictly from chain.
 */
const ClaimCenter = ({ address, title = 'Claims', description = 'Claimable raffle prizes and InfoFi market winnings.' }) => {
  const netKey = getStoredNetworkKey();
  const qc = useQueryClient();
  const [claimingAll, setClaimingAll] = useState(false);

  // Discover all markets; we keep this simple and robust
  const discovery = useQuery({
    queryKey: ['claimcenter_discovery', netKey],
    queryFn: async () => enumerateAllMarkets({ networkKey: netKey }),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // For each market, read YES and NO bet info to find claimables
  const claimsQuery = useQuery({
    queryKey: ['claimcenter_claimables', address, netKey, (discovery.data || []).length],
    enabled: !!address && Array.isArray(discovery.data),
    queryFn: async () => {
      const out = [];
      for (const m of (discovery.data || [])) {
        const marketId = m.id;
        // eslint-disable-next-line no-await-in-loop
        const yes = await readBetFull({ marketId, account: address, prediction: true, networkKey: netKey });
        // eslint-disable-next-line no-await-in-loop
        const no = await readBetFull({ marketId, account: address, prediction: false, networkKey: netKey });
        if (yes.amount > 0n && yes.payout > 0n && !yes.claimed) out.push({ seasonId: Number(m.seasonId), marketId, prediction: true, payout: yes.payout });
        if (no.amount > 0n && no.payout > 0n && !no.claimed) out.push({ seasonId: Number(m.seasonId), marketId, prediction: false, payout: no.payout });
      }
      return out;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const claimOne = useMutation({
    mutationFn: async ({ marketId, prediction }) => claimPayoutTx({ marketId, prediction, networkKey: netKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claimcenter_claimables'] });
    },
  });

  const claimAll = async () => {
    if (!claimsQuery.data || claimsQuery.data.length === 0) return;
    setClaimingAll(true);
    try {
      for (const c of claimsQuery.data) {
        // eslint-disable-next-line no-await-in-loop
        await claimPayoutTx({ marketId: c.marketId, prediction: c.prediction, networkKey: netKey });
      }
      qc.invalidateQueries({ queryKey: ['claimcenter_claimables'] });
    } finally {
      setClaimingAll(false);
    }
  };

  const grouped = (() => {
    const out = new Map();
    for (const c of (claimsQuery.data || [])) {
      const key = String(c.seasonId ?? '—');
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(c);
    }
    return out;
  })();

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!address && <p className="text-muted-foreground">Connect wallet to view claims.</p>}
        {address && (
          <div className="space-y-3">
            {(discovery.isLoading || claimsQuery.isLoading) && (
              <p className="text-muted-foreground">Scanning for claims…</p>
            )}
            {claimsQuery.error && (
              <p className="text-red-500">Error loading claims: {String(claimsQuery.error?.message || claimsQuery.error)}</p>
            )}
            {!claimsQuery.isLoading && !claimsQuery.error && (claimsQuery.data || []).length === 0 && (
              <p className="text-muted-foreground">No claimable items found right now.</p>
            )}
            {!claimsQuery.isLoading && !claimsQuery.error && (claimsQuery.data || []).length > 0 && (
              <>
                <div className="flex justify-end">
                  <Button onClick={claimAll} disabled={claimingAll}>
                    {claimingAll ? 'Claiming…' : 'Claim All'}
                  </Button>
                </div>
                <div className="space-y-3">
                  {Array.from(grouped.entries()).map(([season, rows]) => (
                    <div key={season} className="border rounded">
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                        <div className="text-sm font-medium">Season #{season}</div>
                        <div className="text-xs text-muted-foreground">
                          Subtotal: <span className="font-mono">{
                            (() => {
                              try { return formatUnits(rows.reduce((acc, r) => acc + (r.payout ?? 0n), 0n), 18) } catch { return '0' }
                            })()
                          }</span> SOF
                        </div>
                      </div>
                      <div className="p-2 space-y-2">
                        {rows.map((r) => (
                          <div key={`${r.marketId}-${String(r.prediction)}`} className="flex items-center justify-between border rounded p-2 text-sm">
                            <div className="text-xs text-muted-foreground">
                              Market: <span className="font-mono">{String(r.marketId)}</span> • Side: {r.prediction ? 'YES' : 'NO'} • Payout: <span className="font-mono">{formatUnits(r.payout ?? 0n, 18)}</span> SOF
                            </div>
                            <Button variant="outline" onClick={() => claimOne.mutate({ marketId: r.marketId, prediction: r.prediction })} disabled={claimOne.isPending}>
                              {claimOne.isPending ? 'Claiming…' : 'Claim'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

ClaimCenter.propTypes = {
  address: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
};

export default ClaimCenter;
