// src/routes/MarketsIndex.jsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import InfoFiMarketCard from '@/components/infofi/InfoFiMarketCard';
import ArbitrageOpportunityDisplay from '@/components/infofi/ArbitrageOpportunityDisplay';
import { useInfoFiMarkets } from '@/hooks/useInfoFiMarkets';
import { useAllSeasons } from '@/hooks/useAllSeasons';

const MarketsIndex = () => {
  const { t } = useTranslation('market');
  // Determine current active season and default to it
  const { data: seasons, isLoading: seasonsLoading } = useAllSeasons?.() || { data: [], isLoading: false };
  const activeSeasonId = useMemo(() => {
    const arr = Array.isArray(seasons) ? seasons : [];
    const active = arr.find((s) => Number(s?.status) === 1);
    return active ? String(active.id ?? active.seasonId ?? '0') : '0';
  }, [seasons]);

  // Pass seasons to useInfoFiMarkets so it can query markets for each season
  const seasonsArray = useMemo(() => {
    return Array.isArray(seasons) ? seasons : [];
  }, [seasons]);

  const { markets, isLoading: marketsLoading, error, refetch } = useInfoFiMarkets(seasonsArray);

  // Get bonding curve address from active season
  const bondingCurveAddress = useMemo(() => {
    const arr = Array.isArray(seasons) ? seasons : [];
    const active = arr.find((s) => Number(s?.status) === 1);
    return active?.config?.bondingCurve || null;
  }, [seasons]);

  // Group markets by season and market type
  const groupedBySeason = useMemo(() => {
    if (!markets || typeof markets !== 'object') return {};

    const result = {};

    Object.entries(markets).forEach(([seasonId, seasonMarkets]) => {
      const marketArray = Array.isArray(seasonMarkets) ? seasonMarkets : [];
      const winners = marketArray.filter((m) => (m.market_type || m.type) === 'WINNER_PREDICTION');
      const positionSize = marketArray.filter((m) => (m.market_type || m.type) === 'POSITION_SIZE');
      const behavioral = marketArray.filter((m) => (m.market_type || m.type) === 'BEHAVIORAL');
      const known = new Set(['WINNER_PREDICTION', 'POSITION_SIZE', 'BEHAVIORAL']);
      const others = marketArray.filter((m) => !known.has((m.market_type || m.type) || ''));

      result[seasonId] = { winners, positionSize, behavioral, others };
    });

    return result;
  }, [markets]);

  const isLoading = seasonsLoading || marketsLoading;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Polymarket-style header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          {!seasonsLoading && activeSeasonId !== '0' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('activeSeason')}:</span>
              <span className="font-mono font-semibold">#{activeSeasonId}</span>
            </div>
          )}
        </div>
        <p className="text-muted-foreground">{t('browseActiveMarkets')}</p>
      </div>

      {/* Loading and error states */}
      {seasonsLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading seasons…</p>
        </div>
      )}

      {!seasonsLoading && activeSeasonId === '0' && (
        <Card className="text-center py-12">
          <CardContent>
          </CardContent>
        </Card>
      )}
      {isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading markets from backend...</p>
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6">
            <p className="text-red-600 text-center">Failed to load markets</p>
            <div className="text-center mt-4">
              <button
                type="button"
                className="px-3 py-1 text-sm rounded bg-red-100 hover:bg-red-200 text-red-700"
                onClick={() => refetch?.()}
              >
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Markets grid - Polymarket style */}
      {!isLoading && !error && (
        <div className="space-y-8">
          {Object.keys(groupedBySeason).length === 0 && (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-muted-foreground">No on-chain markets found for this season.</p>
              </CardContent>
            </Card>
          )}

          {Object.entries(groupedBySeason).map(([seasonId, seasonGrouped]) => (
            <div key={seasonId}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Season #{seasonId}</h2>
                <span className="text-sm text-muted-foreground">
                  {Object.values(seasonGrouped).flat().length} {t('markets')}
                </span>
              </div>

              <div className="space-y-6">
                {seasonGrouped.winners.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{t('winnerPrediction')}</h3>
                      <span className="text-sm text-muted-foreground">{seasonGrouped.winners.length} {t('markets')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {seasonGrouped.winners.map((m) => (
                        <InfoFiMarketCard key={m.id} market={m} />
                      ))}
                    </div>
                  </div>
                )}

                {seasonGrouped.positionSize.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{t('positionSize')}</h3>
                      <span className="text-sm text-muted-foreground">{seasonGrouped.positionSize.length} {t('markets')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {seasonGrouped.positionSize.map((m) => (
                        <InfoFiMarketCard key={m.id} market={m} />
                      ))}
                    </div>
                  </div>
                )}

                {seasonGrouped.behavioral.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{t('behavioral')}</h3>
                      <span className="text-sm text-muted-foreground">{seasonGrouped.behavioral.length} {t('markets')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {seasonGrouped.behavioral.map((m) => (
                        <InfoFiMarketCard key={m.id} market={m} />
                      ))}
                    </div>
                  </div>
                )}

                {seasonGrouped.others.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{t('other')}</h3>
                      <span className="text-sm text-muted-foreground">{seasonGrouped.others.length} {t('markets')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {seasonGrouped.others.map((m) => (
                        <InfoFiMarketCard key={m.id} market={m} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Arbitrage Opportunities - On-chain only */}
      {!seasonsLoading && activeSeasonId !== '0' && bondingCurveAddress && (
        <div className="mt-8">
          <ArbitrageOpportunityDisplay
            seasonId={activeSeasonId}
            bondingCurveAddress={bondingCurveAddress}
            minProfitability={2}
          />
        </div>
      )}
    </div>
  );
};

export default MarketsIndex;
