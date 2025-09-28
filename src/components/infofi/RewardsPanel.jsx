// src/components/infofi/RewardsPanel.jsx
import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccount } from 'wagmi';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { getStoredNetworkKey } from '@/lib/wagmi';
import AddressLink from '@/components/common/AddressLink';
import { shortAddress } from '@/lib/format';
import { getPrizeDistributor, getSeasonPayouts, claimGrand } from '@/services/onchainRaffleDistributor';
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
  // Merkle-based consolation flow removed.

  const claimGrandMut = useMutation({
    mutationFn: ({ seasonId }) => claimGrand({ seasonId, networkKey: netKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rewards_payouts'] }),
  });

  // Consolation claim removed.

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
              // Consolation flow removed.
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

                  {/* Consolation section removed */}
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
