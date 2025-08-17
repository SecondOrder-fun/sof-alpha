// src/routes/MarketsIndex.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const MarketsIndex = () => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    </div>
  );
};

export default MarketsIndex;
