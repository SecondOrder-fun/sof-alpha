// src/routes/RaffleDetails.jsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRaffleState } from '@/hooks/useRaffleState';
import { useCurve } from '@/hooks/useCurve';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RaffleDetails = () => {
  const { seasonId } = useParams();
  const { seasonDetailsQuery } = useRaffleState(seasonId);
  const { buyTokensMutation } = useCurve();
  const [buyAmount, setBuyAmount] = useState('');

  const handleBuyTickets = (e) => {
    e.preventDefault();
    if (!buyAmount) return;
    buyTokensMutation.mutate(BigInt(buyAmount) * BigInt(1e18));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Raffle Details</h1>
      {seasonDetailsQuery.isLoading && <p>Loading season details...</p>}
      {seasonDetailsQuery.error && <p>Error: {seasonDetailsQuery.error.message}</p>}
      {seasonDetailsQuery.data && seasonDetailsQuery.data.config && (
        <Card>
          <CardHeader>
            <CardTitle>{seasonDetailsQuery.data.config.name} - Season #{seasonId}</CardTitle>
            <CardDescription>Detailed view of the raffle season.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-2 my-2">
              <Badge variant={seasonDetailsQuery.data.config.isActive ? 'default' : 'secondary'}>
                {seasonDetailsQuery.data.config.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant={seasonDetailsQuery.data.config.isCompleted ? 'destructive' : 'outline'}>
                {seasonDetailsQuery.data.config.isCompleted ? 'Completed' : 'Ongoing'}
              </Badge>
            </div>
            <p>Start Time: {new Date(Number(seasonDetailsQuery.data.config.startTime) * 1000).toLocaleString()}</p>
            <p>End Time: {new Date(Number(seasonDetailsQuery.data.config.endTime) * 1000).toLocaleString()}</p>

            <form onSubmit={handleBuyTickets} className="mt-4 space-y-2">
              <Input 
                type="number"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder="Amount of SOF to spend"
              />
              <Button type="submit" disabled={buyTokensMutation.isPending}>
                {buyTokensMutation.isPending ? 'Purchasing...' : 'Buy Tickets'}
              </Button>
            </form>
            {buyTokensMutation.isError && <p className="text-red-500">Error: {buyTokensMutation.error.message}</p>}
            {buyTokensMutation.isSuccess && <p className="text-green-500">Purchase successful!</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RaffleDetails;
