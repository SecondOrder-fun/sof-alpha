// src/routes/MarketsIndex.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const MarketsIndex = () => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activity, setActivity] = useState({ items: [], loading: true, error: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/infofi/markets');
        if (!res.ok) throw new Error(`Failed to fetch markets (${res.status})`);
        const data = await res.json();
        if (mounted) setMarkets(data?.markets || []);
      } catch (e) {
        if (mounted) setError(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Activity feed (arbitrage opportunities placeholder)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/arbitrage/opportunities');
        if (!res.ok) throw new Error(`Failed to fetch opportunities (${res.status})`);
        const data = await res.json();
        if (mounted) setActivity({ items: data?.opportunities || [], loading: false, error: null });
      } catch (e) {
        if (mounted) setActivity({ items: [], loading: false, error: e });
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Prediction Markets</h1>
      <Card>
        <CardHeader>
          <CardTitle>Active Markets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-muted-foreground">Loading...</p>}
          {error && <p className="text-red-500">Failed to load markets</p>}
          {!loading && !error && (
            <div className="space-y-2">
              {markets.length === 0 && (
                <p className="text-muted-foreground">No markets available yet.</p>
              )}
              {markets.map((m) => (
                <div key={m.id} className="border rounded p-2 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{m.question || m.market_type || 'Market'}</div>
                    <div className="text-xs text-muted-foreground">{m.id}</div>
                  </div>
                  {m.raffle_id && (
                    <Link to={`/raffles/${m.raffle_id}`} className="text-primary hover:underline">View Raffle</Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Markets Activity Feed</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.loading && <p className="text-muted-foreground">Loading...</p>}
            {activity.error && <p className="text-red-500">Failed to load activity</p>}
            {!activity.loading && !activity.error && (
              <div className="space-y-2">
                {activity.items.length === 0 && (
                  <p className="text-muted-foreground">No recent activity.</p>
                )}
                {activity.items.map((it) => (
                  <div key={`${it.market_id}-${it.created_at}`} className="border rounded p-2">
                    <div className="flex justify-between">
                      <div>
                        <div className="text-sm">Opportunity</div>
                        <div className="text-xs text-muted-foreground">Market: {it.market_id}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-medium">{Number(it.profitability || 0).toFixed(2)}%</div>
                        <div className="text-xs text-muted-foreground">{new Date(it.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MarketsIndex;
