/**
 * Season Card
 * Carousel card for season display in list view - uses existing Card component
 */

import PropTypes from "prop-types";
import { formatUnits } from "viem";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ContentBox, ImportantBox } from "@/components/ui/content-box";
import MiniCurveChart from "@/components/curve/MiniCurveChart";
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
    const num = Number(formatUnits(BigInt(value || 0), 18));
    return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
  };

  const grandPrize = useMemo(() => {
    try {
      const reserves = curveState.curveReserves ?? 0n;
      return (reserves * 6500n) / 10000n;
    } catch {
      return 0n;
    }
  }, [curveState.curveReserves]);

  return (
    <div
      onClick={onClick}
      className="cursor-pointer max-w-sm mx-auto h-full flex flex-col"
    >
      <CardHeader className="py-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-primary shrink-0">
            Season #{seasonId}
          </span>
          <span className="font-medium text-foreground truncate">{seasonConfig?.name}</span>
          {seasonConfig?.gated && (
            <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 ml-auto" />
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0 flex-1 min-h-0">
        {!isSeasonEnded && !isPreStart && (
          <>
            {/* Mini Curve Graph */}
            <div className="bg-muted/40 overflow-hidden flex-1 min-h-0 border border-primary rounded-lg">
              <MiniCurveChart
                curveSupply={displayCurveSupply}
                allBondSteps={displayBondSteps}
                currentStep={displayCurveStep}
              />
            </div>

            {/* Grand Prize */}
            <ImportantBox className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-primary-foreground/80 uppercase tracking-wide">
                {t("raffle:grandPrize")}
              </span>
              <span className="font-bold text-primary-foreground">
                {formatSOF(grandPrize)} $SOF
              </span>
            </ImportantBox>

            {/* Current Price + Countdown — same row */}
            <div className="flex gap-2">
              <ContentBox style={{ flex: "35" }}>
                <div className="text-xs text-muted-foreground mb-1">
                  Current Price
                </div>
                <div className="font-mono text-base">
                  {formatSOF(displayCurveStep?.price)} SOF
                </div>
              </ContentBox>

              {seasonConfig?.endTime && (
                <ImportantBox style={{ flex: "65" }}>
                  <div className="text-xs text-primary-foreground/80 mb-1">
                    {t("raffle:endsIn")}
                  </div>
                  <CountdownTimer
                    targetTimestamp={Number(seasonConfig.endTime)}
                    compact
                    className="text-primary-foreground font-bold text-base"
                  />
                </ImportantBox>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Pre-start countdown — full width */}
        {isPreStart && startTimeSec !== null && (
          <ImportantBox className="p-4">
            <div className="text-xs text-primary-foreground/80 mb-1">
              {t("startsIn", { defaultValue: "Raffle starts in" })}
            </div>
            <CountdownTimer
              targetTimestamp={startTimeSec}
              compact
              className="text-primary-foreground font-bold text-lg"
            />
          </ImportantBox>
        )}

        {isSeasonEnded && !isCompleted && (
          <ImportantBox className="p-4 text-center">
            <div className="text-primary-foreground font-bold text-lg">
              {t("common:tradingLocked", { defaultValue: "Trading is Locked" })}
            </div>
            <div className="text-primary-foreground/80 text-sm mt-1">
              {t("raffle:raffleEnded")}
            </div>
          </ImportantBox>
        )}

        {isCompleted && winnerSummaryQuery.data && (
          <ContentBox className="p-4">
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
          </ContentBox>
        )}

        {isCompleted &&
          !winnerSummaryQuery.data &&
          BigInt(displayCurveSupply ?? 0n) === 0n && (
            <ContentBox className="p-4">
              <div className="text-sm font-semibold text-foreground">
                {t("raffle:noWinner")}
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {t("raffle:noParticipants")}
              </div>
            </ContentBox>
          )}

        {/* Action Buttons */}
        {!isSeasonEnded && !isPreStart && (
          <div className="flex gap-2">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onBuy?.();
              }}
              variant="outline"
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
    </div>
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
