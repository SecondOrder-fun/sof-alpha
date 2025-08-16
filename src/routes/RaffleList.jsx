// src/routes/RaffleList.jsx
import { Link } from 'react-router-dom';
import { useRaffleState } from '@/hooks/useRaffleState';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const RaffleList = () => {
  const { currentSeasonQuery, seasonDetailsQuery } = useRaffleState();
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
          <CardTitle>Current Season</CardTitle>
          <CardDescription>The currently selected season from contract.</CardDescription>
        </CardHeader>
        <CardContent>
          {currentSeasonQuery.isLoading && <p>Loading current season...</p>}
          {currentSeasonQuery.error && <p>Error loading season: {currentSeasonQuery.error.message}</p>}
          {currentSeasonQuery.data == null && !currentSeasonQuery.isLoading && (
            <p>No current season set.</p>
          )}
          {currentSeasonQuery.data != null && seasonDetailsQuery.data && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="font-bold text-lg">#{String(currentSeasonQuery.data)} — {seasonDetailsQuery.data.config?.name}</p>
                {renderBadge(seasonDetailsQuery.data.status)}
              </div>
              <Link to={`/raffles/${currentSeasonQuery.data}`} className="text-blue-500 hover:underline">
                View Details
              </Link>
            </div>
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
                <Link to={`/raffles/${s.id}`} className="text-blue-500 hover:underline">Open</Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RaffleList;
