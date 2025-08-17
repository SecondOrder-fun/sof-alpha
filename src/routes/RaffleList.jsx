// src/routes/RaffleList.jsx
import { Link } from 'react-router-dom';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import InfoFiPricingTicker from '@/components/infofi/InfoFiPricingTicker';

const RaffleList = () => {
  const allSeasonsQuery = useAllSeasons();

  const renderBadge = (st) => {
    const label = st === 1 ? 'Active' : st === 0 ? 'NotStarted' : 'Completed';
    const variant = st === 1 ? 'default' : st === 0 ? 'secondary' : 'destructive';
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Raffles</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Active Seasons</CardTitle>
          <CardDescription>All seasons currently available to participate in.</CardDescription>
        </CardHeader>
        <CardContent>
          {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
          {allSeasonsQuery.error && <p>Error loading seasons.</p>}
          {allSeasonsQuery.data && (
            (() => {
              const active = allSeasonsQuery.data.filter((s) => s.status === 1);
              if (active.length === 0) {
                return <p>No active seasons right now.</p>;
              }
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {active.map((s) => (
                    <div key={s.id} className="border rounded p-3">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono">#{s.id}</span>
                        <span className="font-medium">{s.config?.name}</span>
                        {renderBadge(s.status)}
                      </div>
                      {/* Live ticker for this season */}
                      <div className="mb-2">
                        <InfoFiPricingTicker marketId={s.id} />
                      </div>
                      <Link to={`/raffles/${s.id}`} className="text-blue-500 hover:underline">Open</Link>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Seasons</CardTitle>
          <CardDescription>Includes started and completed seasons.</CardDescription>
        </CardHeader>
        <CardContent>
          {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
          {allSeasonsQuery.error && <p>Error loading seasons.</p>}
          {allSeasonsQuery.data && allSeasonsQuery.data.length === 0 && !allSeasonsQuery.isLoading && (
            <p>No seasons found.</p>
          )}
          <div className="space-y-3">
            {allSeasonsQuery.data && allSeasonsQuery.data.map((s) => (
              <div key={s.id} className="flex items-center justify-between border rounded p-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono">#{s.id}</span>
                  <span className="font-medium">{s.config?.name}</span>
                  {renderBadge(s.status)}
                </div>
                <div className="flex items-center gap-3">
                  {/* Compact ticker */}
                  <div className="hidden md:block">
                    <InfoFiPricingTicker marketId={s.id} />
                  </div>
                  <Link to={`/raffles/${s.id}`} className="text-blue-500 hover:underline">Open</Link>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RaffleList;
