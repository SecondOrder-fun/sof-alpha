/**
 * Mobile Raffle Detail
 * Simplified season detail view optimized for mobile
 */

import PropTypes from "prop-types";
import { formatUnits } from "viem";
import { ArrowLeft } from "lucide-react";
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
  onBack,
}) => {
  const formatSOF = (weiAmount) => {
    return Number(formatUnits(weiAmount ?? 0n, 18)).toFixed(4);
  };

  return (
    <div className="px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={onBack} className="text-[#a89e99] hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white text-lg font-semibold">
          Raffles - Season #{seasonId}
        </h1>
      </div>

      {/* Detail Card */}
      <div className="bg-[#6b6b6b] rounded-lg p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-white text-2xl font-bold mb-2">
            {seasonConfig?.name || "Loading..."}
          </h2>
          {seasonConfig?.endTime && (
            <CountdownTimer
              endTime={seasonConfig.endTime}
              className="text-sm"
            />
          )}
        </div>

        {/* Progress Section */}
        <div>
          <div className="text-[#a89e99] text-sm mb-3">Tickets Sold</div>
          <ProgressBar current={curveSupply ?? 0n} max={maxSupply ?? 0n} />
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#130013]/30 rounded-lg p-4">
            <div className="text-[#a89e99] text-xs mb-1">Ticket Price</div>
            <div className="text-white font-bold text-lg">
              {formatSOF(curveStep?.price)} $SOF
            </div>
          </div>
          <div className="bg-[#130013]/30 rounded-lg p-4">
            <div className="text-[#a89e99] text-xs mb-1">Your Tickets</div>
            <div className="text-white font-bold text-lg">
              {localPosition?.tickets?.toString() ?? "0"}
            </div>
          </div>
        </div>

        {/* Grand Prize */}
        <div className="bg-[#c82a54]/10 border-2 border-[#c82a54] rounded-lg p-4 text-center">
          <div className="text-[#c82a54] text-sm font-semibold mb-1">
            GRAND PRIZE
          </div>
          <div className="text-white text-2xl font-bold">
            {formatSOF(totalPrizePool)} $SOF
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={onBuy}
            className="flex-1 bg-[#c82a54] hover:bg-[#c82a54]/90 text-white h-12 text-base font-semibold"
          >
            BUY
          </Button>
          <Button
            onClick={onSell}
            variant="outline"
            className="flex-1 border-2 border-[#c82a54] text-[#c82a54] hover:bg-[#c82a54]/10 h-12 text-base font-semibold"
          >
            SELL
          </Button>
        </div>
      </div>
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
  onBack: PropTypes.func,
};

export default MobileRaffleDetail;
