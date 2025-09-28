import { useRafflePrizes } from "@/hooks/useRafflePrizes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import PropTypes from "prop-types";

export function ClaimPrizeWidget({ seasonId }) {
  const {
    isWinner,
    claimableAmount,
    isLoading,
    isConfirming,
    isConfirmed,
    handleClaimGrandPrize,
    grandWinner,
    hasDistributor,
    distributorAddress,
    raffleWinner,
    raffleStatus,
  } = useRafflePrizes(seasonId);

  if (isLoading) {
    return <div>Loading prize information...</div>;
  }

  const winnerAddr = grandWinner || '0x0000000000000000000000000000000000000000';

  const prizeType = "Grand Prize";
  const Icon = Trophy;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-6 w-6 text-yellow-500" />
          {isWinner ? 'You Won a Prize!' : 'Season Prize Status'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isWinner ? (
            <>
              <p className="text-lg">
                Congratulations! You&apos;ve won the {prizeType} for Season {seasonId}.
              </p>
              <div className="text-2xl font-bold text-center">
                {claimableAmount} SOF
              </div>
              <Button
                onClick={handleClaimGrandPrize}
                disabled={isConfirming || isConfirmed}
                className="w-full"
              >
                {isConfirming
                  ? "Claiming..."
                  : isConfirmed
                  ? "Claimed!"
                  : "Claim Your Prize"}
              </Button>
              {isConfirmed && (
                <p className="text-center text-green-600">Your prize has been successfully claimed!</p>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>
                  Distributor winner: <span className="font-mono">{winnerAddr}</span>
                </div>
                <div className="text-xs">
                  Distributor: <span className="font-mono">{hasDistributor ? distributorAddress : 'Not available'}</span>
                </div>
                <div>
                  Raffle winner: <span className="font-mono">{raffleWinner || '0x0000000000000000000000000000000000000000'}</span>
                </div>
                <div className="text-xs">
                  Raffle status: <span className="font-mono">{typeof raffleStatus === 'number' ? raffleStatus : (raffleStatus ?? '—')}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

ClaimPrizeWidget.propTypes = {
  seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    .isRequired,
};
