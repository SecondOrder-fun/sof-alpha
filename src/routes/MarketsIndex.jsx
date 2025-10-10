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

  const { markets, isLoading: marketsLoading, error, refetch } = useInfoFiMarkets();

  // Get bonding curve address from active season
  const bondingCurveAddress = useMemo(() => {
    const arr = Array.isArray(seasons) ? seasons : [];
    const active = arr.find((s) => Number(s?.status) === 1);
    return active?.config?.bondingCurve || null;
  }, [seasons]);

  // Group markets by SecondOrder.fun plan types
  const filteredBySeason = useMemo(() => {
    const list = Array.isArray(markets) ? markets : [];
    if (!activeSeasonId || activeSeasonId === '0') return list;
    return list.filter((m) => {
      const rid = m?.raffle_id ?? m?.seasonId ?? m?.season_id;
      if (rid == null) return true;
      return String(rid) === String(activeSeasonId);
    });
  }, [markets, activeSeasonId]);

  const grouped = useMemo(() => {
    const list = filteredBySeason;
    const winners = list.filter((m) => (m.market_type || m.type) === 'WINNER_PREDICTION');
    const positionSize = list.filter((m) => (m.market_type || m.type) === 'POSITION_SIZE');
    const behavioral = list.filter((m) => (m.market_type || m.type) === 'BEHAVIORAL');
    const known = new Set(['WINNER_PREDICTION', 'POSITION_SIZE', 'BEHAVIORAL']);
    const others = list.filter((m) => !known.has((m.market_type || m.type) || ''));
    return { winners, positionSize, behavioral, others };
  }, [filteredBySeason]);

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
          {grouped.winners.length === 0 && grouped.positionSize.length === 0 && grouped.behavioral.length === 0 && grouped.others.length === 0 && (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-muted-foreground">No on-chain markets found for this season.</p>
              </CardContent>
            </Card>
          )}

          {grouped.winners.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('winnerPrediction')}</h2>
                <span className="text-sm text-muted-foreground">{grouped.winners.length} {t('markets')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped.winners.map((m) => (
                  <InfoFiMarketCard key={m.id} market={m} />
                ))}
              </div>
            </div>
          )}

          {grouped.positionSize.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('positionSize')}</h2>
                <span className="text-sm text-muted-foreground">{grouped.positionSize.length} {t('markets')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped.positionSize.map((m) => (
                  <InfoFiMarketCard key={m.id} market={m} />
                ))}
              </div>
            </div>
          )}

          {grouped.behavioral.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('behavioral')}</h2>
                <span className="text-sm text-muted-foreground">{grouped.behavioral.length} {t('markets')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped.behavioral.map((m) => (
                  <InfoFiMarketCard key={m.id} market={m} />
                ))}
              </div>
            </div>
          )}

          {grouped.others.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('other')}</h2>
                <span className="text-sm text-muted-foreground">{grouped.others.length} {t('markets')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped.others.map((m) => (
                  <InfoFiMarketCard key={m.id} market={m} />
                ))}
              </div>
            </div>
          )}
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
