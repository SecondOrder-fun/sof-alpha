// src/components/infofi/ClaimCenter.jsx
import PropTypes from 'prop-types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common/Tabs';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { enumerateAllMarkets, readBetFull, claimPayoutTx } from '@/services/onchainInfoFi';
import { getPrizeDistributor, getSeasonPayouts, claimGrand } from '@/services/onchainRaffleDistributor';
import { getClaimableCSMMPayouts, claimCSMMPayout } from '@/services/seasonCSMMService';
import { formatUnits } from 'viem';

/**
 * ClaimCenter
 * Unified interface for claiming both InfoFi market winnings and raffle prizes.
 * Organized into discrete sections for clarity.
 */
const ClaimCenter = ({ address, title, description }) => {
  const { t } = useTranslation(['market', 'raffle', 'common']);
  const netKey = getStoredNetworkKey();
  const qc = useQueryClient();

  // InfoFi Market Claims
  const discovery = useQuery({
    queryKey: ['claimcenter_discovery', netKey],
    queryFn: async () => enumerateAllMarkets({ networkKey: netKey }),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const claimsQuery = useQuery({
    queryKey: ['claimcenter_claimables', address, netKey, (discovery.data || []).length],
    enabled: !!address && Array.isArray(discovery.data),
    queryFn: async () => {
      const out = [];
      for (const m of (discovery.data || [])) {
        const marketId = m.id;
        const yes = await readBetFull({ marketId, account: address, prediction: true, networkKey: netKey });
        const no = await readBetFull({ marketId, account: address, prediction: false, networkKey: netKey });
        if (yes.amount > 0n && yes.payout > 0n && !yes.claimed) out.push({ seasonId: Number(m.seasonId), marketId, prediction: true, payout: yes.payout, type: 'infofi' });
        if (no.amount > 0n && no.payout > 0n && !no.claimed) out.push({ seasonId: Number(m.seasonId), marketId, prediction: false, payout: no.payout, type: 'infofi' });
      }
      return out;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // CSMM Claims (new prediction markets)
  const csmmClaimsQuery = useQuery({
    queryKey: ['claimcenter_csmm_claimables', address, netKey],
    enabled: !!address,
    queryFn: async () => getClaimableCSMMPayouts({ address, networkKey: netKey }),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // Raffle Prize Claims
  const distributorQuery = useQuery({
    queryKey: ['rewards_distributor', netKey],
    queryFn: () => getPrizeDistributor({ networkKey: netKey }),
    staleTime: 10000,
    refetchInterval: 10000,
  });

  const raffleClaimsQuery = useQuery({
    queryKey: ['raffle_claims', address, netKey],
    enabled: !!address && !!distributorQuery.data,
    queryFn: async () => {
      const out = [];
      // Get all seasons to check for raffle prizes
      const seasons = await enumerateAllMarkets({ networkKey: netKey });
      for (const season of seasons) {
        const seasonId = Number(season.seasonId);
        const payout = await getSeasonPayouts({ seasonId, networkKey: netKey }).catch(() => null);
        if (payout && payout.data.funded && !payout.data.grandClaimed) {
          const isGrandWinner = address.toLowerCase() === payout.data.grandWinner?.toLowerCase();
          if (isGrandWinner) {
            out.push({
              seasonId,
              type: 'raffle',
              amount: payout.data.grandAmount,
              claimed: payout.data.grandClaimed
            });
          }
        }
      }
      return out;
    },
    staleTime: 10000,
    refetchInterval: 10000,
  });

  // Mutations for claiming
  const claimInfoFiOne = useMutation({
    mutationFn: async ({ marketId, prediction }) => claimPayoutTx({ marketId, prediction, networkKey: netKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claimcenter_claimables'] });
    },
  });

  const claimCSMMOne = useMutation({
    mutationFn: async ({ csmmAddress, playerId }) => claimCSMMPayout({ csmmAddress, playerId, networkKey: netKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claimcenter_csmm_claimables'] });
    },
  });

  const claimRaffleGrand = useMutation({
    mutationFn: ({ seasonId }) => claimGrand({ seasonId, networkKey: netKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raffle_claims'] });
    },
  });

  // Merge and group all InfoFi claims (old + CSMM) by season
  const allInfoFiClaims = [
    ...(claimsQuery.data || []),
    ...(csmmClaimsQuery.data || [])
  ];
  
  const infoFiGrouped = (() => {
    const out = new Map();
    for (const c of allInfoFiClaims) {
      const key = String(c.seasonId ?? '—');
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(c);
    }
    return out;
  })();

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{title || t('market:claimWinnings')}</CardTitle>
        <CardDescription>{description || t('market:claimDescription', { defaultValue: 'Claimable raffle prizes and market winnings.' })}</CardDescription>
      </CardHeader>
      <CardContent>
        {!address && <p className="text-muted-foreground">{t('errors:notConnected')}</p>}
        {address && (
          <Tabs defaultValue="markets" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="markets">Prediction Markets</TabsTrigger>
              <TabsTrigger value="raffles">Raffle Prizes</TabsTrigger>
            </TabsList>

            {/* InfoFi Market Claims Tab */}
            <TabsContent value="markets" className="space-y-4">
              {(discovery.isLoading || claimsQuery.isLoading || csmmClaimsQuery.isLoading) && (
                <p className="text-muted-foreground">{t('common:loading')}</p>
              )}
              {(claimsQuery.error || csmmClaimsQuery.error) && (
                <p className="text-red-500">{t('common:error')}: {String(claimsQuery.error?.message || csmmClaimsQuery.error?.message || 'Unknown error')}</p>
              )}
              {!claimsQuery.isLoading && !csmmClaimsQuery.isLoading && !claimsQuery.error && !csmmClaimsQuery.error && allInfoFiClaims.length === 0 && (
                <p className="text-muted-foreground">{t('raffle:nothingToClaim')}</p>
              )}
              {!claimsQuery.isLoading && !csmmClaimsQuery.isLoading && !claimsQuery.error && !csmmClaimsQuery.error && allInfoFiClaims.length > 0 && (
                <div className="space-y-3">
                  {Array.from(infoFiGrouped.entries()).map(([season, rows]) => (
                    <div key={season} className="border rounded">
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                        <div className="text-sm font-medium">{t('raffle:seasonNumber', { number: season })}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('common:subtotal', { defaultValue: 'Subtotal' })}: <span className="font-mono">{
                            (() => {
                              try { 
                                return formatUnits(rows.reduce((acc, r) => {
                                  const amount = r.type === 'csmm' ? (r.netPayout ?? 0n) : (r.payout ?? 0n);
                                  return acc + amount;
                                }, 0n), 18);
                              } catch { return '0' }
                            })()
                          }</span> SOF
                        </div>
                      </div>
                      <div className="p-2 space-y-2">
                        {rows.map((r) => {
                          if (r.type === 'csmm') {
                            // CSMM claim
                            return (
                              <div key={`csmm-${r.playerId}`} className="flex items-center justify-between border rounded p-2 text-sm bg-blue-50/50">
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-semibold text-blue-600">CSMM Market</span> • Player: <span className="font-mono">{String(r.playerAddress).slice(0, 6)}...{String(r.playerAddress).slice(-4)}</span> • Outcome: <span className="font-semibold">{r.outcome}</span> • Payout: <span className="font-mono">{formatUnits(r.netPayout ?? 0n, 18)}</span> SOF (2% fee)
                                </div>
                                <Button variant="outline" onClick={() => claimCSMMOne.mutate({ csmmAddress: r.csmmAddress, playerId: r.playerId })} disabled={claimCSMMOne.isPending}>
                                  {claimCSMMOne.isPending ? t('transactions:claiming') : t('common:claim')}
                                </Button>
                              </div>
                            );
                          } else {
                            // Old InfoFi claim
                            return (
                              <div key={`${r.marketId}-${String(r.prediction)}`} className="flex items-center justify-between border rounded p-2 text-sm">
                                <div className="text-xs text-muted-foreground">
                                  {t('market:market')}: <span className="font-mono">{String(r.marketId)}</span> • {t('common:side', { defaultValue: 'Side' })}: {r.prediction ? 'YES' : 'NO'} • {t('market:potentialPayout')}: <span className="font-mono">{formatUnits(r.payout ?? 0n, 18)}</span> SOF
                                </div>
                                <Button variant="outline" onClick={() => claimInfoFiOne.mutate({ marketId: r.marketId, prediction: r.prediction })} disabled={claimInfoFiOne.isPending}>
                                  {claimInfoFiOne.isPending ? t('transactions:claiming') : t('common:claim')}
                                </Button>
                              </div>
                            );
                          }
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Raffle Prize Claims Tab */}
            <TabsContent value="raffles" className="space-y-4">
              {raffleClaimsQuery.isLoading && <p className="text-muted-foreground">{t('common:loading')}</p>}
              {raffleClaimsQuery.error && (
                <p className="text-red-500">{t('common:error')}: {String(raffleClaimsQuery.error?.message || raffleClaimsQuery.error)}</p>
              )}
              {!raffleClaimsQuery.isLoading && !raffleClaimsQuery.error && (raffleClaimsQuery.data || []).length === 0 && (
                <p className="text-muted-foreground">{t('raffle:noActiveSeasons')}</p>
              )}
              {!raffleClaimsQuery.isLoading && !raffleClaimsQuery.error && (raffleClaimsQuery.data || []).length > 0 && (
                <div className="space-y-3">
                  {(raffleClaimsQuery.data || []).map((row) => (
                    <div key={String(row.seasonId)} className="border rounded p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{t('raffle:season')} #{String(row.seasonId)}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('raffle:grandPrize')}: <span className="font-mono">{formatUnits(row.amount ?? 0n, 18)}</span> SOF
                        </div>
                      </div>
                      <div className="mt-2">
                        <Button
                          onClick={() => claimRaffleGrand.mutate({ seasonId: row.seasonId })}
                          disabled={claimRaffleGrand.isPending}
                          className="w-full"
                        >
                          {claimRaffleGrand.isPending ? t('transactions:claiming') : t('raffle:claimPrize')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
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
