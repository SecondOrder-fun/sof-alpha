// src/components/infofi/PositionsPanel.jsx
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { listSeasonWinnerMarkets, enumerateAllMarkets, readBet } from '@/services/onchainInfoFi';
import { formatUnits } from 'viem';

/**
 * PositionsPanel
 * Shared InfoFi positions panel used by AccountPage and UserProfile to avoid divergence.
 * - Aggregates across provided seasons (or falls back to current season externally)
 * - Discovers markets via factory events; falls back to enumerating InfoFiMarket
 * - Displays discovery debug panel for now (can be toggled off later)
 */
const PositionsPanel = ({ address, seasons = [], title, description }) => {
  const { t } = useTranslation('market');
  const netKey = getStoredNetworkKey();
  const defaultTitle = title || t('predictionMarketPositions');
  const defaultDescription = description || t('openPositionsAcross');

  const positionsQuery = useQuery({
    queryKey: ['positionsPanel_all', address, seasons.map((s) => s.id).join(','), netKey],
    enabled: !!address,
    queryFn: async () => {
      const out = [];
      // 1) Try factory-based discovery per provided season
      let discovered = [];
      for (const s of seasons) {
        // eslint-disable-next-line no-await-in-loop
        const markets = await listSeasonWinnerMarkets({ seasonId: s.id, networkKey: netKey }).catch(() => []);
        discovered = discovered.concat((markets || []).map((m) => ({ ...m, seasonId: m.seasonId ?? s.id })));
      }
      // 2) Fallback to enumerate all markets
      if (discovered.length === 0) {
        // eslint-disable-next-line no-await-in-loop
        const all = await enumerateAllMarkets({ networkKey: netKey }).catch(() => []);
        discovered = all || [];
      }
      // 3) Read wallet positions for each discovered market
      for (const m of discovered) {
        const seasonId = Number(m.seasonId);
        // eslint-disable-next-line no-await-in-loop
        const yes = await readBet({ marketId: m.id, account: address, prediction: true, networkKey: netKey });
        // eslint-disable-next-line no-await-in-loop
        const no = await readBet({ marketId: m.id, account: address, prediction: false, networkKey: netKey });
        const yesAmt = yes?.amount ?? 0n;
        const noAmt = no?.amount ?? 0n;
        if (yesAmt > 0n) out.push({ seasonId, marketId: m.id, marketType: 'Winner Prediction', outcome: 'YES', amountBig: yesAmt, amount: formatUnits(yesAmt, 18) + ' SOF', player: m.player });
        if (noAmt > 0n) out.push({ seasonId, marketId: m.id, marketType: 'Winner Prediction', outcome: 'NO', amountBig: noAmt, amount: formatUnits(noAmt, 18) + ' SOF', player: m.player });
      }
      return out;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // Full fallback: enumerate all markets and read ALL positions (mirrors discovery panel but complete)
  const fallbackQuery = useQuery({
    queryKey: ['positionsPanel_fallback_all', address, netKey],
    enabled: !!address && (!positionsQuery.data || (positionsQuery.data || []).length === 0),
    queryFn: async () => {
      const out = [];
      const all = await enumerateAllMarkets({ networkKey: netKey }).catch(() => []);
      for (const m of (all || [])) {
        const seasonId = Number(m.seasonId);
        // eslint-disable-next-line no-await-in-loop
        const yes = await readBet({ marketId: m.id, account: address, prediction: true, networkKey: netKey });
        // eslint-disable-next-line no-await-in-loop
        const no = await readBet({ marketId: m.id, account: address, prediction: false, networkKey: netKey });
        const yesAmt = yes?.amount ?? 0n;
        const noAmt = no?.amount ?? 0n;
        if (yesAmt > 0n) out.push({ seasonId, marketId: m.id, marketType: 'Winner Prediction', outcome: 'YES', amountBig: yesAmt, amount: formatUnits(yesAmt, 18) + ' SOF', player: m.player });
        if (noAmt > 0n) out.push({ seasonId, marketId: m.id, marketType: 'Winner Prediction', outcome: 'NO', amountBig: noAmt, amount: formatUnits(noAmt, 18) + ' SOF', player: m.player });
      }
      return out;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{defaultTitle}</CardTitle>
        <CardDescription>{defaultDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {!address && <p className="text-muted-foreground">{t('connectWalletToView')}</p>}
        {address && (
          <div className="space-y-2">
            {positionsQuery.isLoading && (
              <p className="text-muted-foreground">{t('loadingPositions')}</p>
            )}
            {positionsQuery.error && (
              <p className="text-red-500">{t('errorLoadingPositions', { error: String(positionsQuery.error?.message || positionsQuery.error) })}</p>
            )}
            {!positionsQuery.isLoading && !positionsQuery.error && (() => {
              const primary = positionsQuery.data || [];
              const data = primary.length > 0 ? primary : (fallbackQuery.data || []);
              if (data.length === 0) return <p className="text-muted-foreground">{t('noOpenPositions')}</p>;
              // Group by seasonId
              const bySeason = new Map();
              for (const row of data) {
                const key = String(row.seasonId ?? '—');
                if (!bySeason.has(key)) bySeason.set(key, []);
                bySeason.get(key).push(row);
              }
              return (
                <div className="space-y-3">
                  {Array.from(bySeason.entries()).map(([season, rows]) => {
                    const totalBig = rows.reduce((acc, r) => acc + (r.amountBig ?? 0n), 0n);
                    const totalSof = formatUnits(totalBig, 18);
                    return (
                      <div key={season} className="border rounded">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                          <div className="text-sm font-medium">{t('raffle:season')} #{season}</div>
                          <div className="text-xs text-muted-foreground">{t('subtotal')}: <span className="font-mono">{totalSof}</span> SOF</div>
                        </div>
                        <div className="p-2 space-y-2">
                          {rows.map((pos) => (
                            <div key={`${pos.seasonId}-${pos.marketId}-${pos.outcome}`} className="border rounded p-2 text-sm">
                              <div className="flex justify-between">
                                <span className="font-medium">{pos.marketType || t('market')}</span>
                                <span className="text-xs text-muted-foreground">{t('common:id')}: {pos.marketId}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t('outcome')}: {pos.outcome || '—'} • {t('common:amount')}: {pos.amount || '—'} {pos.player ? `• ${t('player')}: ${pos.player}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <DiscoveryDebug address={address} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

PositionsPanel.propTypes = {
  address: PropTypes.string,
  seasons: PropTypes.array,
  title: PropTypes.string,
  description: PropTypes.string,
};

// Inline discovery panel while stabilizing feature
const DiscoveryDebug = ({ address }) => {
  const { t } = useTranslation('market');
  const netKey = getStoredNetworkKey();
  const disc = useQuery({
    queryKey: ['positionsPanel_discovery', netKey],
    queryFn: async () => {
      try {
        const all = await enumerateAllMarkets({ networkKey: netKey });
        return Array.isArray(all) ? all : [];
      } catch (e) { return { error: String(e?.message || e) }; }
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
  // Normalize discovery data to an array to avoid runtime errors when an object like { error } is returned
  const discData = Array.isArray(disc.data) ? disc.data : [];
  const firstFew = discData.slice(0, 5);
  const reads = useQuery({
    queryKey: ['positionsPanel_discoveryReads', netKey, address, firstFew.map((m) => m.id).join(',')],
    enabled: !!address && firstFew.length > 0,
    queryFn: async () => {
      const rows = [];
      for (const m of firstFew) {
        // eslint-disable-next-line no-await-in-loop
        const yes = await readBet({ marketId: m.id, account: address, prediction: true, networkKey: netKey });
        // eslint-disable-next-line no-await-in-loop
        const no = await readBet({ marketId: m.id, account: address, prediction: false, networkKey: netKey });
        rows.push({ id: m.id, seasonId: m.seasonId, yes: String(yes?.amount ?? 0n), no: String(no?.amount ?? 0n) });
      }
      return rows;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  return (
    <div className="mt-2 p-2 border rounded bg-muted/20 text-[11px]">
      <div className="font-medium mb-1">{t('debugDiscovery')}</div>
      <div>{t('network')}: <span className="font-mono">{netKey}</span></div>
      <div>{t('marketsFound')}: <span className="font-mono">{discData.length}</span></div>
      {Array.isArray(reads.data) && reads.data.length > 0 && (
        <div className="mt-1 space-y-1">
          {reads.data.map((r) => (
            <div key={r.id} className="flex justify-between">
              <span className="font-mono">ID {String(r.id)}{typeof r.seasonId !== 'undefined' ? ` • S#${r.seasonId}` : ''}</span>
              <span className="font-mono">YES {r.yes} • NO {r.no}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

DiscoveryDebug.propTypes = {
  address: PropTypes.string,
};

export default PositionsPanel;
