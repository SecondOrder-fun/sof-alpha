import { useRafflePrizes } from "@/hooks/useRafflePrizes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Star } from "lucide-react";
import PropTypes from "prop-types";

export function ClaimPrizeWidget({ seasonId }) {
  const {
    isWinner,
    isConsolationWinner,
    claimableAmount,
    isLoading,
    isConfirming,
    isConfirmed,
    handleClaimGrandPrize,
    handleClaimConsolationPrize,
  } = useRafflePrizes(seasonId);

  if (isLoading) {
    return <div>Loading prize information...</div>;
  }

  if (!isWinner && !isConsolationWinner) {
    return null; // Don't show the widget if the user has no prize to claim
  }

  const prizeType = isWinner ? "Grand Prize" : "Consolation Prize";
  const Icon = isWinner ? Trophy : Star;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-6 w-6 text-yellow-500" />
          You Won a Prize!
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-lg">
            Congratulations! You&apos;ve won the {prizeType} for Season{" "}
            {seasonId}.
          </p>
          <div className="text-2xl font-bold text-center">
            {claimableAmount} SOF
          </div>
          <Button
            onClick={
              isWinner ? handleClaimGrandPrize : handleClaimConsolationPrize
            }
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
            <p className="text-center text-green-600">
              Your prize has been successfully claimed!
            </p>
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
