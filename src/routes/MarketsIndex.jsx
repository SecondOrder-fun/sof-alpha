// src/routes/MarketsIndex.jsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import InfoFiMarketCard from '@/components/infofi/InfoFiMarketCard';
// Arbitrage UI removed for on-chain-only refactor
import { useOnchainInfoFiMarkets } from '@/hooks/useOnchainInfoFiMarkets';
import { useAllSeasons } from '@/hooks/useAllSeasons';

const MarketsIndex = () => {
  // Determine current active season and default to it
  const { data: seasons, isLoading: seasonsLoading } = useAllSeasons?.() || { data: [], isLoading: false };
  const activeSeasonId = useMemo(() => {
    const arr = Array.isArray(seasons) ? seasons : [];
    const active = arr.find((s) => Number(s?.status) === 1);
    return active ? String(active.id ?? active.seasonId ?? '0') : '0';
  }, [seasons]);

  const { markets, isLoading, error } = useOnchainInfoFiMarkets(activeSeasonId, 'LOCAL');

  // Group markets by SecondOrder.fun plan types
  const { winners, positionSize, behavioral, others } = useMemo(() => {
    const list = Array.isArray(markets) ? markets : [];
    const winners = list.filter((m) => (m.market_type || m.type) === 'WINNER_PREDICTION');
    const positionSize = list.filter((m) => (m.market_type || m.type) === 'POSITION_SIZE');
    const behavioral = list.filter((m) => (m.market_type || m.type) === 'BEHAVIORAL');
    const known = new Set(['WINNER_PREDICTION', 'POSITION_SIZE', 'BEHAVIORAL']);
    const others = list.filter((m) => !known.has((m.market_type || m.type) || ''));
    return { winners, positionSize, behavioral, others };
  }, [markets]);

  // Markets loaded via React Query (useOnchainInfoFiMarkets)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Prediction Markets</h1>
        {!seasonsLoading && activeSeasonId !== '0' && (
          <div className="text-xs border rounded px-2 py-1 bg-muted/30">Active Season: <span className="font-mono">#{activeSeasonId}</span></div>
        )}
      </div>
      {/* Admin-only market creation UI moved to Admin page */}
      <Card>
        <CardHeader>
          <CardTitle>Active Markets</CardTitle>
        </CardHeader>
        <CardContent>
          {seasonsLoading && <p className="text-muted-foreground">Loading seasons…</p>}
          {!seasonsLoading && activeSeasonId === '0' && (
            <p className="text-muted-foreground">No active season found.</p>
          )}
          {isLoading && <p className="text-muted-foreground">Loading markets from chain...</p>}
          {error && <p className="text-red-500">Failed to load markets</p>}
          {!isLoading && !error && (
            <div className="space-y-4">
              {winners.length === 0 && positionSize.length === 0 && behavioral.length === 0 && others.length === 0 && (
                <p className="text-muted-foreground">No on-chain markets found for this season.</p>
              )}

              {winners.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Winner Prediction ({winners.length})</div>
                  <div className="space-y-2">
                    {winners.map((m) => (
                      <div key={m.id} className="relative">
                        <InfoFiMarketCard market={m} />
                        {m.raffle_id && (
                          <div className="absolute top-2 right-3 text-xs">
                            <Link to={`/raffles/${m.raffle_id}`} className="text-primary hover:underline">View Raffle</Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {positionSize.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Position Size ({positionSize.length})</div>
                  <div className="space-y-2">
                    {positionSize.map((m) => (
                      <div key={m.id} className="relative">
                        <InfoFiMarketCard market={m} />
                        {m.raffle_id && (
                          <div className="absolute top-2 right-3 text-xs">
                            <Link to={`/raffles/${m.raffle_id}`} className="text-primary hover:underline">View Raffle</Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {behavioral.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Behavioral ({behavioral.length})</div>
                  <div className="space-y-2">
                    {behavioral.map((m) => (
                      <div key={m.id} className="relative">
                        <InfoFiMarketCard market={m} />
                        {m.raffle_id && (
                          <div className="absolute top-2 right-3 text-xs">
                            <Link to={`/raffles/${m.raffle_id}`} className="text-primary hover:underline">View Raffle</Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {others.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Other ({others.length})</div>
                  <div className="space-y-2">
                    {others.map((m) => (
                      <div key={m.id} className="relative">
                        <InfoFiMarketCard market={m} />
                        {m.raffle_id && (
                          <div className="absolute top-2 right-3 text-xs">
                            <Link to={`/raffles/${m.raffle_id}`} className="text-primary hover:underline">View Raffle</Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* On-chain-only: activity/arbitrage UI removed */}
    </div>
  );
};

export default MarketsIndex;
