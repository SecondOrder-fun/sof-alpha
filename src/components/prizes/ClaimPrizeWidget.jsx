import { useTranslation } from 'react-i18next';
import { useRafflePrizes } from "@/hooks/useRafflePrizes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import PropTypes from "prop-types";

export function ClaimPrizeWidget({ seasonId }) {
  const { t } = useTranslation(['raffle', 'common', 'transactions']);
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
    claimStatus,
  } = useRafflePrizes(seasonId);

  if (isLoading) {
    return <div>{t('common:loading')}</div>;
  }

  const winnerAddr = grandWinner || '0x0000000000000000000000000000000000000000';

  const prizeType = t('raffle:grandPrize');
  const Icon = Trophy;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-6 w-6 text-yellow-500" />
          {isWinner ? t('raffle:youWon') : t('raffle:status')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isWinner ? (
            <>
              <p className="text-lg">
                {t('raffle:congratulations')}! {t('raffle:youWon')} {prizeType} {t('raffle:seasonNumber', { number: seasonId })}.
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
                  ? t('transactions:claiming')
                  : isConfirmed
                  ? t('raffle:prizeClaimed')
                  : t('raffle:claimPrize')}
              </Button>
              {claimStatus === 'completed' && (
                <div className="text-center text-green-600 space-y-1">
                  <p>{t('raffle:prizeClaimed')}</p>
                  <p className="text-sm text-muted-foreground">{t('transactions:confirmed')}</p>
                </div>
              )}
              {claimStatus === 'claiming' && !isConfirmed && (
                <p className="text-center text-amber-600">{t('transactions:confirming')}</p>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>
                  {t('raffle:winner')}: <span className="font-mono">{winnerAddr}</span>
                </div>
                <div className="text-xs">
                  {t('common:distributor', { defaultValue: 'Distributor' })}: <span className="font-mono">{hasDistributor ? distributorAddress : t('common:notAvailable')}</span>
                </div>
                <div>
                  {t('raffle:winner')}: <span className="font-mono">{raffleWinner || '0x0000000000000000000000000000000000000000'}</span>
                </div>
                <div className="text-xs">
                  {t('raffle:status')}: <span className="font-mono">{typeof raffleStatus === 'number' ? raffleStatus : (raffleStatus ?? '—')}</span>
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
