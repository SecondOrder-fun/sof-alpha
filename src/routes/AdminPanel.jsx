// src/routes/AdminPanel.jsx
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useRaffleState } from '@/hooks/useRaffleState';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { Badge } from '@/components/ui/badge';
import { useAccessControl } from '@/hooks/useAccessControl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const AdminPanel = () => {
  const { 
    createSeason,
    startSeason,
    requestSeasonEnd
  } = useRaffleState();
  const allSeasonsQuery = useAllSeasons();
  const { address } = useAccount();
  const { hasRole } = useAccessControl();

  const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

  const { data: isAdmin, isLoading: isAdminLoading } = useQuery({
    queryKey: ['isAdmin', address],
    queryFn: () => hasRole(DEFAULT_ADMIN_ROLE, address),
    enabled: !!address,
  });

  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const handleCreateSeason = (e) => {
    e.preventDefault();
    const start = Math.floor(new Date(startTime).getTime() / 1000);
    const end = Math.floor(new Date(endTime).getTime() / 1000);
    // NOTE: This is a placeholder for the full SeasonConfig and BondStep structs
    const config = { name, startTime: BigInt(start), endTime: BigInt(end), isActive: false, isCompleted: false };
    const bondSteps = []; // Placeholder
    createSeason.mutate({ config, bondSteps });
  };

  if (isAdminLoading) {
    return <p>Checking authorization...</p>;
  }

  if (!isAdmin) {
    return <p>You are not authorized to view this page.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Create New Season</CardTitle>
            <CardDescription>Set up a new raffle season.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSeason} className="space-y-4">
              <Input placeholder="Season Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              <Button type="submit" disabled={createSeason.isPending}>
                {createSeason.isPending ? 'Creating...' : 'Create Season'}
              </Button>
              {createSeason.isError && <p className="text-red-500">{createSeason.error.message}</p>}
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Manage Seasons</CardTitle>
            <CardDescription>Start or end existing raffle seasons.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
            {allSeasonsQuery.error && <p>Error loading seasons: {allSeasonsQuery.error.message}</p>}
            {allSeasonsQuery.data && allSeasonsQuery.data.map((season) => (
              <div key={season.id} className="p-2 border rounded flex justify-between items-center">
                <div>
                  <p className="font-bold">Season #{season.id} - {season.config.name}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant={season.config.isActive ? 'secondary' : 'outline'}>
                      {season.config.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant={season.config.isCompleted ? 'destructive' : 'outline'}>
                      {season.config.isCompleted ? 'Completed' : 'Ongoing'}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => startSeason.mutate({ seasonId: season.id })} disabled={startSeason.isPending || season.config.isActive}>
                    Start
                  </Button>
                  <Button onClick={() => requestSeasonEnd.mutate({ seasonId: season.id })} disabled={requestSeasonEnd.isPending || !season.config.isActive || season.config.isCompleted} variant="destructive">
                    End
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
