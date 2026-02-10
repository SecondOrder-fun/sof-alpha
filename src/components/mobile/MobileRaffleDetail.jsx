/**
 * Mobile Raffle Detail
 * Mobile-optimized layout using existing Card styling
 */

import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatUnits } from "viem";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProgressBar from "@/components/mobile/ProgressBar";
import CountdownTimer from "@/components/common/CountdownTimer";
import { useMemo } from "react";
import UsernameDisplay from "@/components/user/UsernameDisplay";
import { useSeasonWinnerSummary } from "@/hooks/useSeasonWinnerSummaries";

export const MobileRaffleDetail = ({
  seasonId,
  seasonConfig,
  status,
  curveSupply,
  maxSupply,
  curveStep,
  localPosition,
  totalPrizePool,
  onBuy,
  onSell,
  isGated = false,
  isVerified = null,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation(["common", "raffle"]);

  const statusNum = Number(status);
  const isCompleted = statusNum === 4 || statusNum === 5;
  const winnerSummaryQuery = useSeasonWinnerSummary(seasonId, status);

  const formatSOF = (weiAmount) => {
    return Number(formatUnits(weiAmount ?? 0n, 18)).toFixed(2);
  };

  const grandPrize = useMemo(() => {
    if (winnerSummaryQuery.data?.grandPrizeWei != null) {
      return winnerSummaryQuery.data.grandPrizeWei;
    }
    try {
      const reserves = totalPrizePool ?? 0n;
      const grandPrizeBps = 6500n; // Fallback for pre-distributor seasons
      return (reserves * grandPrizeBps) / 10000n;
    } catch {
      return 0n;
    }
  }, [totalPrizePool, winnerSummaryQuery.data]);

  const now = Math.floor(Date.now() / 1000);
  const startTimeSec = seasonConfig?.startTime
    ? Number(seasonConfig.startTime)
    : null;
  const endTimeSec = seasonConfig?.endTime
    ? Number(seasonConfig.endTime)
    : null;
  const isPreStart =
    !isCompleted && startTimeSec !== null && Number.isFinite(startTimeSec)
      ? now < startTimeSec
      : false;
  const isActive =
    !isCompleted &&
    statusNum === 1 &&
    startTimeSec !== null &&
    endTimeSec !== null &&
    Number.isFinite(startTimeSec) &&
    Number.isFinite(endTimeSec)
      ? now >= startTimeSec && now < endTimeSec
      : false;

  return (
    <div className="px-3 pt-1 pb-20 space-y-3 max-w-screen-sm mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate("/raffles")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          {t("raffle:raffles")} - {t("raffle:season")} #{seasonId}
        </h1>
      </div>

      {/* Main Detail Card */}
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold mb-2">
              {seasonConfig?.name || "Loading..."}
            </h2>
            {isPreStart && startTimeSec !== null && (
              <div className="bg-primary px-4 py-2 rounded-lg">
                <span className="text-primary-foreground font-bold">
                  {t("raffle:startsIn", {
                    defaultValue: "Raffle starts in",
                  })}{" "}
                </span>
                <CountdownTimer
                  targetTimestamp={startTimeSec}
                  compact
                  className="text-primary-foreground font-bold"
                />
              </div>
            )}
            {!isPreStart && seasonConfig?.endTime && (
              <div className="bg-primary px-4 py-2 rounded-lg">
                <span className="text-primary-foreground font-bold">
                  {t("raffle:endsIn")}{" "}
                </span>
                <CountdownTimer
                  targetTimestamp={Number(seasonConfig.endTime)}
                  compact
                  className="text-primary-foreground font-bold"
                />
              </div>
            )}
          </div>

          {/* Progress Section */}
          <div>
            <div className="text-sm text-muted-foreground mb-3">
              {t("raffle:ticketsSold")}
            </div>
            <ProgressBar current={curveSupply ?? 0n} max={maxSupply ?? 0n} />
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-4">
            {isPreStart ? null : (
              <div className="bg-background/40 rounded-lg p-4 border border-border">
                <div className="text-xs text-muted-foreground mb-1">
                  {t("raffle:ticketPrice")}
                </div>
                <div className="font-bold text-lg">
                  {formatSOF(curveStep?.price)} $SOF
                </div>
              </div>
            )}
            <div className="bg-background/40 rounded-lg p-4 border border-border">
              <div className="text-xs text-muted-foreground mb-1">
                {t("raffle:yourTickets")}
              </div>
              <div className="font-bold text-lg text-center">
                {localPosition?.tickets
                  ? localPosition.tickets.toString()
                  : "0"}
              </div>
              {localPosition && (
                <div className="text-xs text-muted-foreground text-center mt-1">
                  {((localPosition.probBps || 0) / 100).toFixed(2)}% chance
                </div>
              )}
            </div>
          </div>

          {/* Grand Prize */}
          <div className="bg-primary/10 border-2 border-primary rounded-lg p-4 text-center">
            <div className="text-primary text-sm font-semibold mb-1">
              {t("raffle:grandPrize").toUpperCase()}
            </div>
            <div className="text-2xl font-bold">
              {formatSOF(grandPrize)} $SOF
            </div>
          </div>

          {isCompleted && winnerSummaryQuery.data && (
            <div className="bg-background/40 rounded-lg p-4 border border-border">
              <div className="text-xs text-muted-foreground mb-1">
                {t("raffle:winner")}
              </div>
              <div className="text-sm">
                <UsernameDisplay
                  address={winnerSummaryQuery.data.winnerAddress}
                />
              </div>
            </div>
          )}

          {isCompleted &&
            !winnerSummaryQuery.data &&
            BigInt(curveSupply ?? 0n) === 0n && (
              <div className="bg-background/40 rounded-lg p-4 border border-border">
                <div className="text-sm font-semibold text-foreground">
                  {t("raffle:noWinner")}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {t("raffle:noParticipants")}
                </div>
              </div>
            )}

          {/* Gated badge */}
          {isGated && isActive && (
            <div className="flex items-center justify-center">
              {isVerified === true ? (
                <div className="flex items-center gap-1.5 text-green-500 text-sm font-medium bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
                  <ShieldCheck className="w-4 h-4" />
                  {t("raffle:verified", { defaultValue: "Verified" })}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-primary text-sm font-medium bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                  <Lock className="w-4 h-4" />
                  {t("raffle:passwordRequired", { defaultValue: "Password Required" })}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {isPreStart ? null : isActive ? (
            <div className="flex gap-3">
              <Button
                onClick={onBuy}
                variant="primary"
                size="lg"
                className="flex-1 relative"
              >
                {isGated && isVerified !== true && (
                  <Lock className="w-4 h-4 mr-1.5" />
                )}
                {isGated && isVerified !== true
                  ? t("raffle:verifyAccess", { defaultValue: "Verify Access" }).toUpperCase()
                  : t("common:buy").toUpperCase()}
              </Button>
              <Button
                onClick={onSell}
                variant="primary"
                size="lg"
                className="flex-1 relative"
              >
                {isGated && isVerified !== true && (
                  <Lock className="w-4 h-4 mr-1.5" />
                )}
                {t("common:sell").toUpperCase()}
              </Button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex gap-3 opacity-30">
                <Button
                  disabled
                  variant="primary"
                  size="lg"
                  className="flex-1"
                >
                  {t("common:buy").toUpperCase()}
                </Button>
                <Button
                  disabled
                  variant="primary"
                  size="lg"
                  className="flex-1"
                >
                  {t("common:sell").toUpperCase()}
                </Button>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-background/90 border border-primary rounded-lg px-4 py-2">
                  <p className="text-sm font-semibold text-foreground">
                    {t("raffle:raffleEnded")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

MobileRaffleDetail.propTypes = {
  seasonId: PropTypes.number.isRequired,
  seasonConfig: PropTypes.object,
  status: PropTypes.number,
  curveSupply: PropTypes.bigint,
  maxSupply: PropTypes.bigint,
  curveStep: PropTypes.object,
  localPosition: PropTypes.object,
  totalPrizePool: PropTypes.bigint,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
  isGated: PropTypes.bool,
  isVerified: PropTypes.bool,
};

export default MobileRaffleDetail;
