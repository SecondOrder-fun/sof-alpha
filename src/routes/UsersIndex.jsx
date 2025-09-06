// src/routes/UsersIndex.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { getSeasonPlayersOnchain } from '@/services/onchainInfoFi';
import { formatAddress } from '@/lib/utils';

const UsersIndex = () => {
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
      <h1 className="text-2xl font-bold mb-4">Users</h1>
      <Card>
        <CardHeader>
          <CardTitle>All User Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {(seasonsLoading || loading) && <p className="text-muted-foreground">Loading...</p>}
          {!seasonsLoading && !loading && players.length === 0 && (
            <p className="text-muted-foreground">No users found yet.</p>
          )}
          {!seasonsLoading && !loading && players.length > 0 && (
            <div className="divide-y rounded border">
              {pageSlice.map((addr) => (
                <div key={addr} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="font-mono">{formatAddress(addr)}</div>
                    {myAddress && addr?.toLowerCase?.() === myAddress.toLowerCase() && (
                      <Badge variant="secondary">You</Badge>
                    )}
                  </div>
                  <Link to={`/users/${addr}`} className="text-primary hover:underline">View Profile</Link>
                </div>
              ))}
            </div>
          )}
          {/* Pagination Controls */}
          {!seasonsLoading && !loading && players.length > 0 && (
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-muted-foreground">
                Showing {start + 1}-{Math.min(end, total)} of {total}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 rounded border disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span className="text-sm">Page {page} / {pageCount}</span>
                <button
                  className="px-3 py-1 rounded border disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                >
                  Next
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
