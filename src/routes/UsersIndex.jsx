// src/routes/UsersIndex.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAccount } from 'wagmi';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { getSeasonPlayersOnchain } from '@/services/onchainInfoFi';
import UsernameDisplay from '@/components/user/UsernameDisplay';

const UsersIndex = () => {
  const { t } = useTranslation('common');
  const { address: myAddress } = useAccount();
  const netKey = getStoredNetworkKey();
  const { data: seasons = [], isLoading: seasonsLoading } = useAllSeasons();
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const seasonIds = useMemo(() => (seasons || []).map((s) => s.id), [seasons]);
  const seasonKey = useMemo(() => seasonIds.join(','), [seasonIds]);
  const netKeyUpper = useMemo(() => (netKey || 'LOCAL').toUpperCase(), [netKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (seasonIds.length === 0) { setPlayers([]); return; }
      setLoading(true);
      try {
        const set = new Set();
        for (const sid of seasonIds) {
          try {
            const arr = await getSeasonPlayersOnchain({ seasonId: sid, networkKey: netKeyUpper });
            (arr || []).forEach((a) => set.add(String(a)));
          } catch (_) {
            // continue
          }
        }
        if (!cancelled) setPlayers(Array.from(set));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // no live subscription here; users can refresh by navigating back
    return () => { cancelled = true; };
  }, [seasonKey, netKeyUpper, seasonIds]);

  // Reset to first page when players list changes
  useEffect(() => { setPage(1); }, [players.length]);

  const total = players.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageSlice = players.slice(start, end);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t('users')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('allUserProfiles')}</CardTitle>
        </CardHeader>
        <CardContent>
          {(seasonsLoading || loading) && <p className="text-muted-foreground">{t('loading')}</p>}
          {!seasonsLoading && !loading && players.length === 0 && (
            <p className="text-muted-foreground">{t('noUsersFound')}</p>
          )}
          {!seasonsLoading && !loading && players.length > 0 && (
            <div className="divide-y rounded border">
              {pageSlice.map((addr) => {
                const isMyAddress = myAddress && addr?.toLowerCase?.() === myAddress.toLowerCase();
                const linkTo = isMyAddress ? '/account' : `/users/${addr}`;
                const linkText = isMyAddress ? t('viewYourAccount') : t('viewProfile');
                
                return (
                  <div key={addr} className="flex items-center justify-between px-3 py-2">
                    <UsernameDisplay 
                      address={addr} 
                      showBadge={true}
                    />
                    <Link to={linkTo} className="text-primary hover:underline">{linkText}</Link>
                  </div>
                );
              })}
            </div>
          )}
          {/* Pagination Controls */}
          {!seasonsLoading && !loading && players.length > 0 && (
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-muted-foreground">
                {t('showingRange', { start: start + 1, end: Math.min(end, total), total })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 rounded border disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  {t('previous')}
                </button>
                <span className="text-sm">{t('page')} {page} / {pageCount}</span>
                <button
                  className="px-3 py-1 rounded border disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersIndex;
