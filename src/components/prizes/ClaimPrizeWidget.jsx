import { useTranslation } from "react-i18next";
import { useRafflePrizes } from "@/hooks/useRafflePrizes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FaTrophy } from "react-icons/fa";
import PropTypes from "prop-types";
import ExplorerLink from "@/components/common/ExplorerLink";

export function ClaimPrizeWidget({ seasonId }) {
  const { t } = useTranslation(["raffle", "common", "transactions"]);
  const {
    isWinner,
    claimableAmount,
    isLoading,
    isConfirming,
    isConfirmed,
    handleClaimGrandPrize,
    claimStatus,
    claimTxHash,
  } = useRafflePrizes(seasonId);

  if (isLoading) {
    return <div>{t("common:loading")}</div>;
  }

  // Only show this widget when the connected wallet is actually the
  // grand prize winner. For non-winners or incomplete seasons, we
  // hide the panel entirely so the Completed Season Prizes section
  // only lists true wins for the current user.
  if (!isWinner) {
    return null;
  }

  const prizeType = t("raffle:grandPrize");

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center justify-center gap-2">
          <FaTrophy className="h-5 w-5 text-yellow-500" />
          <span>Congratulations!</span>
          <FaTrophy className="h-5 w-5 text-yellow-500" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <>
            <p className="text-lg text-center">
              You won the {prizeType} of Season {String(seasonId)}!
            </p>
            <div className="text-2xl font-bold text-center">
              {claimableAmount} SOF
            </div>
            <Button
              onClick={handleClaimGrandPrize}
              disabled={isConfirming || isConfirmed}
              className="w-full"
              variant={isConfirmed ? "outline" : "default"}
            >
              {isConfirming
                ? t("transactions:claiming")
                : isConfirmed
                ? t("raffle:prizeClaimed")
                : t("raffle:claimPrize")}
            </Button>
            {claimStatus === "completed" && (
              <div className="text-center space-y-1">
                {claimTxHash ? (
                  <ExplorerLink
                    value={claimTxHash}
                    type="tx"
                    text="View transaction on Explorer"
                    className="text-sm text-muted-foreground underline"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("transactions:confirmed")}
                  </p>
                )}
              </div>
            )}
            {claimStatus === "claiming" && !isConfirmed && (
              <p className="text-center text-amber-600">
                {t("transactions:confirming")}
              </p>
            )}
          </>
        </div>
      </CardContent>
    </Card>
  );
}

ClaimPrizeWidget.propTypes = {
  seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    .isRequired,
};
