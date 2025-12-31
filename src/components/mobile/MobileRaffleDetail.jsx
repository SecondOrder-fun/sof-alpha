/**
 * Mobile Raffle Detail
 * Mobile-optimized layout using existing Card styling
 */

import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { formatUnits } from "viem";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProgressBar from "@/components/mobile/ProgressBar";
import CountdownTimer from "@/components/common/CountdownTimer";

export const MobileRaffleDetail = ({
  seasonId,
  seasonConfig,
  curveSupply,
  maxSupply,
  curveStep,
  localPosition,
  totalPrizePool,
  onBuy,
  onSell,
}) => {
  const navigate = useNavigate();

  const formatSOF = (weiAmount) => {
    return Number(formatUnits(weiAmount ?? 0n, 18)).toFixed(4);
  };

  return (
    <div className="px-3 pt-1 pb-20 space-y-3 max-w-screen-sm mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/raffles")}
          className="text-white hover:text-white/80"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-white">
          Raffles - Season #{seasonId}
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
            {seasonConfig?.endTime && (
              <CountdownTimer
                targetTimestamp={Number(seasonConfig.endTime)}
                compact
                className="text-sm"
              />
            )}
          </div>

          {/* Progress Section */}
          <div>
            <div className="text-sm text-muted-foreground mb-3">
              Tickets Sold
            </div>
            <ProgressBar current={curveSupply ?? 0n} max={maxSupply ?? 0n} />
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/40 rounded-lg p-4 border border-[#353e34]">
              <div className="text-xs text-muted-foreground mb-1">
                Ticket Price
              </div>
              <div className="font-bold text-lg">
                {formatSOF(curveStep?.price)} $SOF
              </div>
            </div>
            <div className="bg-black/40 rounded-lg p-4 border border-[#353e34]">
              <div className="text-xs text-muted-foreground mb-1">
                Your Tickets
              </div>
              <div className="font-bold text-lg">
                {localPosition?.tickets?.toString() ?? "0"}
              </div>
            </div>
          </div>

          {/* Grand Prize */}
          <div className="bg-[#c82a54]/10 border-2 border-[#c82a54] rounded-lg p-4 text-center">
            <div className="text-[#c82a54] text-sm font-semibold mb-1">
              GRAND PRIZE
            </div>
            <div className="text-2xl font-bold">
              {formatSOF(totalPrizePool)} $SOF
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={onBuy}
              size="lg"
              className="flex-1 bg-[#c82a54] hover:bg-[#c82a54]/90 text-white border-2 border-[#c82a54]"
            >
              BUY
            </Button>
            <Button
              onClick={onSell}
              size="lg"
              className="flex-1 bg-[#c82a54] hover:bg-[#c82a54]/90 text-white border-2 border-[#c82a54]"
            >
              SELL
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

MobileRaffleDetail.propTypes = {
  seasonId: PropTypes.number.isRequired,
  seasonConfig: PropTypes.object,
  curveSupply: PropTypes.bigint,
  maxSupply: PropTypes.bigint,
  curveStep: PropTypes.object,
  localPosition: PropTypes.object,
  totalPrizePool: PropTypes.bigint,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
};

export default MobileRaffleDetail;
