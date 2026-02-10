/**
 * Season Card
 * Carousel card for season display in list view - uses existing Card component
 */

import PropTypes from "prop-types";
import { formatUnits } from "viem";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CurveGraph from "@/components/curve/CurveGraph";
import CountdownTimer from "@/components/common/CountdownTimer";
import UsernameDisplay from "@/components/user/UsernameDisplay";
import { useSeasonWinnerSummary } from "@/hooks/useSeasonWinnerSummaries";
import { useCurveState } from "@/hooks/useCurveState";
import { useMemo } from "react";

export const SeasonCard = ({
  seasonId,
  seasonConfig,
  status,
  curveStep,
  allBondSteps,
  curveSupply,
  onBuy,
  onSell,
  onClick,
}) => {
  const { t } = useTranslation(["raffle", "common"]);
  const statusNum = Number(status);
  const isCompleted = statusNum === 4 || statusNum === 5;
  const isActiveSeason = statusNum === 1;
  const nowSec = Math.floor(Date.now() / 1000);
  const startTimeSec = seasonConfig?.startTime
    ? Number(seasonConfig.startTime)
    : null;
  const isPreStart =
    startTimeSec !== null && Number.isFinite(startTimeSec)
      ? nowSec < startTimeSec
      : false;
  const seasonEndedByTime = useMemo(() => {
    if (!seasonConfig?.endTime) return false;
    const end = Number(seasonConfig.endTime);
    if (!Number.isFinite(end)) return false;
    return nowSec >= end;
  }, [nowSec, seasonConfig?.endTime]);
  const isSeasonEnded = isCompleted || seasonEndedByTime;
  const winnerSummaryQuery = useSeasonWinnerSummary(seasonId, status);
  const curveState = useCurveState(seasonConfig?.bondingCurve, {
    isActive: isActiveSeason,
    enabled: isActiveSeason,
    pollMs: 15000,
    includeFees: false,
  });
  const displayCurveSupply = curveState.curveSupply ?? curveSupply;
  const displayCurveStep = curveState.curveStep ?? curveStep;
  const displayBondSteps =
    (curveState.allBondSteps && curveState.allBondSteps.length > 0
      ? curveState.allBondSteps
      : allBondSteps) || [];

  const formatSOF = (value) => {
    if (!value) return "0";
    return formatUnits(BigInt(value || 0), 18);
  };

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:border-primary/50 transition-colors max-w-sm mx-auto border-0 bg-transparent shadow-none"
    >
      <CardHeader className="py-3 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-sm text-primary">
              Season #{seasonId}
            </div>
            <div className="font-medium text-foreground">{seasonConfig?.name}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0">
        {!isSeasonEnded && !isPreStart && (
          <>
            {/* Mini Curve Graph */}
            <div className="bg-muted/40 rounded-md overflow-hidden h-32">
              <CurveGraph
                curveSupply={displayCurveSupply}
                allBondSteps={displayBondSteps}
                currentStep={displayCurveStep}
                mini
              />
            </div>

            {/* Current Price */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Current Price
              </div>
              <div className="font-mono text-base">
                {formatSOF(displayCurveStep?.price)} SOF
              </div>
            </div>
          </>
        )}

        {/* Countdown Timer */}
        {isPreStart && startTimeSec !== null ? (
          <div className="bg-primary rounded-lg p-4">
            <div className="text-xs text-white/80 mb-1">
              {t("startsIn", { defaultValue: "Raffle starts in" })}
            </div>
            <CountdownTimer
              targetTimestamp={startTimeSec}
              compact
              className="text-white font-bold text-lg"
            />
          </div>
        ) : !isSeasonEnded && seasonConfig?.endTime ? (
          <div className="bg-primary rounded-lg p-4">
            <div className="text-xs text-white/80 mb-1">
              {t("raffle:endsIn")}
            </div>
            <CountdownTimer
              targetTimestamp={Number(seasonConfig.endTime)}
              compact
              className="text-white font-bold text-lg"
            />
          </div>
        ) : null}

        {isSeasonEnded && !isCompleted && (
          <div className="bg-primary rounded-lg p-4 text-center">
            <div className="text-white font-bold text-lg">
              {t("common:tradingLocked", { defaultValue: "Trading is Locked" })}
            </div>
            <div className="text-white/80 text-sm mt-1">
              {t("raffle:raffleEnded")}
            </div>
          </div>
        )}

        {isCompleted && winnerSummaryQuery.data && (
          <div className="bg-muted/40 rounded-lg p-4 border border-border">
            <div className="text-sm uppercase tracking-wide text-primary">
              {t("raffle:winner")}
            </div>
            <div className="text-lg font-semibold text-foreground mt-1">
              <UsernameDisplay
                address={winnerSummaryQuery.data.winnerAddress}
                className="text-lg"
              />
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {t("raffle:grandPrize")}:{" "}
              {(() => {
                try {
                  return `${Number(formatUnits(winnerSummaryQuery.data.grandPrizeWei, 18)).toFixed(2)} SOF`;
                } catch {
                  return "0.00 SOF";
                }
              })()}
            </div>
          </div>
        )}

        {isCompleted &&
          !winnerSummaryQuery.data &&
          BigInt(displayCurveSupply ?? 0n) === 0n && (
            <div className="bg-muted/40 rounded-lg p-4 border border-border">
              <div className="text-sm font-semibold text-foreground">
                {t("raffle:noWinner")}
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {t("raffle:noParticipants")}
              </div>
            </div>
          )}

        {/* Action Buttons */}
        {!isSeasonEnded && !isPreStart && (
          <div className="flex gap-2">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onBuy?.();
              }}
              size="sm"
              className="flex-1"
            >
              BUY
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onSell?.();
              }}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              SELL
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

SeasonCard.propTypes = {
  seasonId: PropTypes.number.isRequired,
  seasonConfig: PropTypes.object,
  status: PropTypes.number,
  curveStep: PropTypes.object,
  allBondSteps: PropTypes.array,
  curveSupply: PropTypes.bigint,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
  onClick: PropTypes.func,
};

export default SeasonCard;
