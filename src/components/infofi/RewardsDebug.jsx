// src/components/infofi/RewardsDebug.jsx
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { getPrizeDistributor, getSeasonPayouts } from '@/services/onchainRaffleDistributor';

const RewardsDebug = ({ title = 'Debug: Rewards (Distributor)', description = 'Raw distributor state per season.' }) => {
  const netKey = getStoredNetworkKey();
  const seasonsQuery = useAllSeasons();

  const distributorQuery = useQuery({
    queryKey: ['rewards_debug_distributor', netKey],
    queryFn: () => getPrizeDistributor({ networkKey: netKey }),
    staleTime: 5000,
    refetchInterval: 5000,
  });

  const seasonIds = (seasonsQuery.data || []).map((s) => s.id);

  const payoutsQuery = useQuery({
    queryKey: ['rewards_debug_payouts', netKey, seasonIds.join(',')],
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
    staleTime: 5000,
    refetchInterval: 5000,
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {distributorQuery.data && (
          <div className="mb-2 text-xs">Distributor: <span className="font-mono">{distributorQuery.data}</span></div>
        )}
        {!payoutsQuery.isLoading && !payoutsQuery.error && (
          <div className="space-y-2 text-[11px]">
            {(payoutsQuery.data || []).map((row) => (
              <div key={String(row.seasonId)} className="p-2 border rounded bg-muted/20">
                <div className="flex justify-between mb-1">
                  <span className="font-medium">Season #{String(row.seasonId)}</span>
                  <span className="font-mono">{row.distributor}</span>
                </div>
                <pre className="whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(row.data, null, 2)}</pre>
              </div>
            ))}
            {(payoutsQuery.data || []).length === 0 && <div className="text-muted-foreground">No distributor snapshots yet.</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

RewardsDebug.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
};

export default RewardsDebug;
