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
import { useAccount } from "wagmi";

export const SeasonCard = ({
  seasonId,
  seasonConfig,
  curveStep,
  allBondSteps,
  curveSupply,
  bondingCurveAddress,
  onBuy,
  onSell,
  onClick,
}) => {
  const { t } = useTranslation(["raffle", "common"]);
  const { address, isConnected } = useAccount();

  const formatSOF = (value) => {
    if (!value) return "0";
    return formatUnits(BigInt(value || 0), 18);
  };

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:border-[#c82a54]/50 transition-colors max-w-sm mx-auto border-[#353e34] bg-[#130013]"
    >
      <CardHeader className="py-3 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-sm text-[#f9d6de]">
              Season #{seasonId}
            </div>
            <div className="font-medium text-white">{seasonConfig?.name}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0">
        {/* Mini Curve Graph */}
        <div className="bg-black/40 rounded-md overflow-hidden h-32">
          <CurveGraph
            curveSupply={curveSupply}
            allBondSteps={allBondSteps}
            currentStep={curveStep}
            mini
          />
        </div>

        {/* Current Price */}
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            Current Price
          </div>
          <div className="font-mono text-base">
            {formatSOF(curveStep?.price)} SOF
          </div>
        </div>

        {/* Countdown Timer */}
        {seasonConfig?.endTime && (
          <div className="bg-[#c82a54] rounded-lg p-4">
            <div className="text-xs text-white/80 mb-1">
              {t("raffle:endsIn")}
            </div>
            <CountdownTimer
              targetTimestamp={Number(seasonConfig.endTime)}
              compact
              className="text-white font-bold text-lg"
            />
          </div>
        )}

        {/* Action Buttons */}
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
      </CardContent>
    </Card>
  );
};

SeasonCard.propTypes = {
  seasonId: PropTypes.number.isRequired,
  seasonConfig: PropTypes.object,
  curveStep: PropTypes.object,
  allBondSteps: PropTypes.array,
  curveSupply: PropTypes.bigint,
  bondingCurveAddress: PropTypes.string.isRequired,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
  onClick: PropTypes.func,
};

export default SeasonCard;
