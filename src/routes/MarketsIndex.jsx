// src/routes/MarketsIndex.jsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import InfoFiMarketCard from '@/components/infofi/InfoFiMarketCard';
import ArbitrageOpportunityDisplay from '@/components/infofi/ArbitrageOpportunityDisplay';
import { useOnchainInfoFiMarkets } from '@/hooks/useOnchainInfoFiMarkets';
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

  const { markets, isLoading, error } = useOnchainInfoFiMarkets(activeSeasonId, 'LOCAL');

  // Get bonding curve address from active season
  const bondingCurveAddress = useMemo(() => {
    const arr = Array.isArray(seasons) ? seasons : [];
    const active = arr.find((s) => Number(s?.status) === 1);
    return active?.config?.bondingCurve || null;
  }, [seasons]);

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
            <p className="text-muted-foreground">No active season found.</p>
          </CardContent>
        </Card>
      )}
      
      {isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading markets from chain...</p>
        </div>
      )}
      
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6">
            <p className="text-red-600 text-center">Failed to load markets</p>
          </CardContent>
        </Card>
      )}

      {/* Markets grid - Polymarket style */}
      {!isLoading && !error && (
        <div className="space-y-8">
          {winners.length === 0 && positionSize.length === 0 && behavioral.length === 0 && others.length === 0 && (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-muted-foreground">No on-chain markets found for this season.</p>
              </CardContent>
            </Card>
          )}

          {winners.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('winnerPrediction')}</h2>
                <span className="text-sm text-muted-foreground">{winners.length} {t('markets')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {winners.map((m) => (
                  <InfoFiMarketCard key={m.id} market={m} />
                ))}
              </div>
            </div>
          )}

          {positionSize.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('positionSize')}</h2>
                <span className="text-sm text-muted-foreground">{positionSize.length} {t('markets')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {positionSize.map((m) => (
                  <InfoFiMarketCard key={m.id} market={m} />
                ))}
              </div>
            </div>
          )}

          {behavioral.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('behavioral')}</h2>
                <span className="text-sm text-muted-foreground">{behavioral.length} {t('markets')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {behavioral.map((m) => (
                  <InfoFiMarketCard key={m.id} market={m} />
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('other')}</h2>
                <span className="text-sm text-muted-foreground">{others.length} {t('markets')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {others.map((m) => (
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
