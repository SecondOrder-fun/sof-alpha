// src/components/infofi/RewardsPanel.jsx
import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from 'wagmi';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { getStoredNetworkKey } from '@/lib/wagmi';
import AddressLink from '@/components/common/AddressLink';
import { shortAddress } from '@/lib/format';
import { getPrizeDistributor, getSeasonPayouts, claimGrand, claimConsolation } from '@/services/onchainRaffleDistributor';
import { formatUnits } from 'viem';

const RewardsPanel = ({ readOnly = false }) => {
  const netKey = getStoredNetworkKey();
  const { address } = useAccount();
  const qc = useQueryClient();
  const seasonsQuery = useAllSeasons();

  const distributorQuery = useQuery({
    queryKey: ['rewards_distributor', netKey],
    queryFn: () => getPrizeDistributor({ networkKey: netKey }),
    staleTime: 10000,
    refetchInterval: 10000,
  });

  const seasonIds = useMemo(() => (seasonsQuery.data || []).map((s) => s.id), [seasonsQuery.data]);

  const payoutsQuery = useQuery({
    queryKey: ['rewards_payouts', netKey, seasonIds.join(',')],
    enabled: !!distributorQuery.data && seasonIds.length > 0,
    queryFn: async () => {
      const out = [];
      for (const sid of seasonIds) {
        // eslint-disable-next-line no-await-in-loop
        const row = await getSeasonPayouts({ seasonId: sid, networkKey: netKey }).catch(() => null);
        if (row) out.push(row);
      }
      return out;
    },
    staleTime: 10000,
    refetchInterval: 10000,
  });

  // Auto-fetch per-season merkle payload from /public/merkle/season-<id>.json
  const merkleQuery = useQuery({
    queryKey: ['rewards_merkle', seasonIds.join(',')],
    enabled: seasonIds.length > 0,
    queryFn: async () => {
      const out = {};
      for (const sid of seasonIds) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch(`/merkle/season-${sid}.json`, { cache: 'no-store' });
          if (!res.ok) continue;
          // eslint-disable-next-line no-await-in-loop
          const json = await res.json();
          out[String(sid)] = json;
        } catch (_) {
          // ignore
        }
      }
      return out;
    },
    staleTime: 10000,
    refetchInterval: 10000,
  });

  const claimGrandMut = useMutation({
    mutationFn: ({ seasonId }) => claimGrand({ seasonId, networkKey: netKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rewards_payouts'] }),
  });

  // Local state for consolation claim inputs (manual during alpha)
  const [consolationInputs, setConsolationInputs] = useState({});
  const onSetInput = (seasonId, key, val) => setConsolationInputs((prev) => ({ ...prev, [seasonId]: { ...(prev[seasonId] || {}), [key]: val } }));

  const claimConsoMut = useMutation({
    mutationFn: ({ seasonId, index, amount, proof }) => claimConsolation({ seasonId, index, amount, proof, networkKey: netKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rewards_payouts'] }),
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Rewards</CardTitle>
        <CardDescription>Grand prize and consolation claims by season.</CardDescription>
      </CardHeader>
      <CardContent>
        {!address && !readOnly && (
          <p className="text-muted-foreground">Connect your wallet to view and claim rewards.</p>
        )}
        {distributorQuery.data && (
          <div className="text-xs mb-2">Distributor: <span className="font-mono">{distributorQuery.data}</span></div>
        )}
        {payoutsQuery.isLoading && <p className="text-muted-foreground">Loading rewards…</p>}
        {payoutsQuery.error && (
          <p className="text-red-500">Error: {String(payoutsQuery.error?.message || payoutsQuery.error)}</p>
        )}
        {!payoutsQuery.isLoading && !payoutsQuery.error && (
          <div className="space-y-3">
            {(payoutsQuery.data || []).length === 0 && (
              <p className="text-muted-foreground">No seasons found.</p>
            )}
            {(payoutsQuery.data || []).map((row) => {
              const s = row.data;
              const seasonId = row.seasonId;
              const isGrandWinner = address && s.grandWinner?.toLowerCase?.() === address.toLowerCase();
              const sof = (v) => {
                try { return formatUnits(BigInt(v || 0), 18); } catch { return '0'; }
              };
              // Try to find this user's merkle leaf if payload is available
              const merkle = merkleQuery.data?.[String(seasonId)];
              const myLeaf = (() => {
                if (!merkle || !address) return null;
                const addrLc = address.toLowerCase();
                const found = (merkle.leaves || []).find((l) => (l.account || '').toLowerCase() === addrLc);
                return found || null;
              })();
              return (
                <div key={String(seasonId)} className="border rounded p-3">
                  <div className="flex flex-col gap-1 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">Season #{String(seasonId)}</div>
                      <div className="text-xs text-muted-foreground">Funded: {s.funded ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="text-xs">Grand Winner: <AddressLink address={s.grandWinner} /> ({shortAddress(s.grandWinner)})</div>
                    <div className="text-xs">Grand Amount: <span className="font-mono">{sof(s.grandAmount)}</span> SOF</div>
                    <div className="text-xs">Consolation Pool: <span className="font-mono">{sof(s.consolationAmount)}</span> SOF</div>
                  </div>

                  {/* Grand section */}
                  <div className="mt-2 border rounded p-2">
                    <div className="text-xs font-medium mb-1">Grand Prize</div>
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        Claimable by: <AddressLink address={s.grandWinner} />
                      </div>
                      {!readOnly && (
                        <Button
                          size="sm"
                          disabled={!isGrandWinner || !s.funded || s.grandClaimed || claimGrandMut.isPending}
                          onClick={() => claimGrandMut.mutate({ seasonId })}
                        >
                          {s.grandClaimed ? 'Claimed' : claimGrandMut.isPending ? 'Claiming…' : isGrandWinner ? 'Claim Grand' : 'Not Eligible'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Consolation section: auto-claim if merkle available; fallback to manual */}
                  <div className="mt-2 border rounded p-2">
                    <div className="text-xs font-medium mb-1">Consolation</div>
                    {myLeaf && !readOnly ? (
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          Auto-claim available. Amount: <span className="font-mono">{sof(myLeaf.amount)}</span> SOF
                        </div>
                        <Button
                          size="sm"
                          disabled={claimConsoMut.isPending || !s.funded}
                          onClick={async () => {
                            try {
                              await claimConsoMut.mutateAsync({ seasonId, index: myLeaf.index, amount: myLeaf.amount, proof: myLeaf.proof || [] });
                              qc.invalidateQueries({ queryKey: ['rewards_payouts'] });
                            } catch (err) {
                              // eslint-disable-next-line no-console
                              console.error('Consolation claim error', err);
                            }
                          }}
                        >
                          {claimConsoMut.isPending ? 'Claiming…' : 'Claim Consolation'}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="text-[11px] text-muted-foreground mb-2">Enter your merkle claim data (index, amount, proof JSON) to claim.</div>
                        {!readOnly && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                            <Input
                              placeholder="Index"
                              value={consolationInputs[seasonId]?.index || ''}
                              onChange={(e) => onSetInput(seasonId, 'index', e.target.value)}
                            />
                            <Input
                              placeholder="Amount (wei)"
                              value={consolationInputs[seasonId]?.amount || ''}
                              onChange={(e) => onSetInput(seasonId, 'amount', e.target.value)}
                            />
                            <Input
                              placeholder='Proof (JSON array of hex)'
                              value={consolationInputs[seasonId]?.proof || ''}
                              onChange={(e) => onSetInput(seasonId, 'proof', e.target.value)}
                            />
                          </div>
                        )}
                        {!readOnly && (
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              disabled={claimConsoMut.isPending || !s.funded}
                              onClick={async () => {
                                try {
                                  const idx = parseInt(consolationInputs[seasonId]?.index || '0', 10);
                                  const amt = consolationInputs[seasonId]?.amount || '0';
                                  let proof = [];
                                  try { proof = JSON.parse(consolationInputs[seasonId]?.proof || '[]'); } catch { proof = []; }
                                  await claimConsoMut.mutateAsync({ seasonId, index: idx, amount: amt, proof });
                                  qc.invalidateQueries({ queryKey: ['rewards_payouts'] });
                                } catch (err) {
                                  // eslint-disable-next-line no-console
                                  console.error('Consolation claim error', err);
                                }
                              }}
                            >
                              {claimConsoMut.isPending ? 'Claiming…' : 'Claim Consolation'}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

RewardsPanel.propTypes = {
  readOnly: PropTypes.bool,
};

export default RewardsPanel;
