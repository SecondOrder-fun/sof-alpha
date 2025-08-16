// src/routes/AdminPanel.jsx
import { useState } from 'react';
import { useRaffleState } from '@/hooks/useRaffleState';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const AdminPanel = () => {
  const { 
    isAdmin, 
    isVrfManager,
    currentSeasonQuery,
    createSeasonMutation,
    startSeasonMutation,
    requestSeasonEndMutation
  } = useRaffleState();

  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const handleCreateSeason = (e) => {
    e.preventDefault();
    const start = Math.floor(new Date(startTime).getTime() / 1000);
    const end = Math.floor(new Date(endTime).getTime() / 1000);
    createSeasonMutation.mutate({ name, startTime: BigInt(start), endTime: BigInt(end) });
  };

  if (!isAdmin) {
    return <p>You are not authorized to view this page.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
      <p>Current Season ID: {currentSeasonQuery.data != null ? String(currentSeasonQuery.data) : 'N/A'}</p>
      <p>VRF Manager: {isVrfManager ? 'Yes' : 'No'}</p>
      
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
              <Button type="submit" disabled={createSeasonMutation.isPending}>
                {createSeasonMutation.isPending ? 'Creating...' : 'Create Season'}
              </Button>
              {createSeasonMutation.isError && <p className="text-red-500">{createSeasonMutation.error.message}</p>}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manage Current Season</CardTitle>
            <CardDescription>Actions for the current active season.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => startSeasonMutation.mutate()} disabled={startSeasonMutation.isPending}>
              {startSeasonMutation.isPending ? 'Starting...' : 'Start Season'}
            </Button>
            {startSeasonMutation.isError && <p className="text-red-500">{startSeasonMutation.error.message}</p>}

            <Button onClick={() => requestSeasonEndMutation.mutate()} disabled={requestSeasonEndMutation.isPending} variant="destructive">
              {requestSeasonEndMutation.isPending ? 'Ending...' : 'End Season'}
            </Button>
            {requestSeasonEndMutation.isError && <p className="text-red-500">{requestSeasonEndMutation.error.message}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
