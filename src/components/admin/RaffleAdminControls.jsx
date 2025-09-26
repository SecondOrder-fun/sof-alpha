import { useRaffleAdmin } from '@/hooks/useRaffleAdmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PropTypes from 'prop-types';

export function RaffleAdminControls({ seasonId }) {
  const { isAdmin, isLoadingAdminRole, requestSeasonEnd, isConfirming, isConfirmed } = useRaffleAdmin(seasonId);

  if (isLoadingAdminRole || !isAdmin) {
    return null; // Don't show admin controls if loading or not an admin
  }

  return (
    <Card className="mt-4 border-red-500" data-testid="admin-controls">
      <CardHeader>
        <CardTitle>Admin Controls</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          These controls are only visible to raffle administrators.
        </p>
        <Button
          data-testid="request-season-end"
          onClick={requestSeasonEnd}
          disabled={isConfirming || isConfirmed}
          variant="destructive"
        >
          {isConfirming ? 'Ending Season...' : isConfirmed ? 'Season Ended' : 'Request Season End'}
        </Button>
        {isConfirmed && (
          <p className="text-green-600 mt-2" data-testid="season-end-confirmed">Season end has been successfully requested. VRF fulfillment is in progress.</p>
        )}
      </CardContent>
    </Card>
  );
}

RaffleAdminControls.propTypes = {
  seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};