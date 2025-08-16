// src/routes/RaffleList.jsx
import { Link } from 'react-router-dom';
import { useRaffleState } from '@/hooks/useRaffleState';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const RaffleList = () => {
  const { currentSeasonQuery, seasonDetailsQuery } = useRaffleState();

  const renderContent = () => {
    if (currentSeasonQuery.isLoading) {
      return <p>Loading current season...</p>;
    }

    if (currentSeasonQuery.error) {
      return <p>Error loading season: {currentSeasonQuery.error.message}</p>;
    }

    if (currentSeasonQuery.data == null) {
      return <p>No active season.</p>;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Season: #{String(currentSeasonQuery.data)}</CardTitle>
          <CardDescription>The currently active raffle season.</CardDescription>
        </CardHeader>
        <CardContent>
          {seasonDetailsQuery.isLoading && <p>Loading details...</p>}
          {seasonDetailsQuery.error && <p>Error loading details.</p>}
          {seasonDetailsQuery.data && (
            <div>
              <p className="font-bold text-lg">{seasonDetailsQuery.data.name}</p>
              <div className="flex space-x-2 my-2">
                <Badge variant={seasonDetailsQuery.data.isActive ? 'default' : 'secondary'}>
                  {seasonDetailsQuery.data.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant={seasonDetailsQuery.data.isCompleted ? 'destructive' : 'outline'}>
                  {seasonDetailsQuery.data.isCompleted ? 'Completed' : 'Ongoing'}
                </Badge>
              </div>
              <Link to={`/raffles/${currentSeasonQuery.data}`} className="text-blue-500 hover:underline">
                View Details
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Active Raffles</h1>
      {renderContent()}
    </div>
  );
};

export default RaffleList;
