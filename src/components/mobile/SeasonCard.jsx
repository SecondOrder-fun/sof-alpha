/**
 * Season Card
 * Carousel card for season display in list view
 */

import PropTypes from "prop-types";
import { formatUnits } from "viem";
import { Button } from "../ui/button";
import CurveGraph from "../curve/CurveGraph";
import CountdownTimer from "../CountdownTimer";

export const SeasonCard = ({
  seasonId,
  seasonConfig,
  curveStep,
  allBondSteps,
  curveSupply,
  onBuy,
  onSell,
  onClick,
}) => {
  const formatSOF = (weiAmount) => {
    return Number(formatUnits(weiAmount ?? 0n, 18)).toFixed(4);
  };

  return (
    <div
      onClick={onClick}
      className="bg-[#6b6b6b] rounded-lg p-4 min-w-[280px] max-w-[320px] cursor-pointer hover:bg-[#6b6b6b]/90 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-white font-semibold text-sm mb-1">
            Season #{seasonId}: {seasonConfig?.name || "Loading..."}
          </h3>
          {seasonConfig?.endTime && (
            <CountdownTimer
              endTime={seasonConfig.endTime}
              compact
              className="text-xs"
            />
          )}
        </div>
      </div>

      {/* Mini Graph */}
      <div className="mb-3 h-24 bg-[#130013]/30 rounded">
        {allBondSteps && curveSupply !== undefined && (
          <CurveGraph
            bondSteps={allBondSteps}
            currentSupply={curveSupply}
            mini={true}
          />
        )}
      </div>

      {/* Current Price */}
      <div className="mb-3">
        <div className="text-[#a89e99] text-xs mb-1">Current Price</div>
        <div className="text-white font-bold text-lg">
          {formatSOF(curveStep?.price)} $SOF
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onBuy?.();
          }}
          className="flex-1 bg-[#c82a54] hover:bg-[#c82a54]/90 text-white"
          size="sm"
        >
          BUY
        </Button>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onSell?.();
          }}
          variant="outline"
          className="flex-1 border-[#c82a54] text-[#c82a54] hover:bg-[#c82a54]/10"
          size="sm"
        >
          SELL
        </Button>
      </div>
    </div>
  );
};

SeasonCard.propTypes = {
  seasonId: PropTypes.number.isRequired,
  seasonConfig: PropTypes.object,
  curveStep: PropTypes.object,
  allBondSteps: PropTypes.array,
  curveSupply: PropTypes.bigint,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
  onClick: PropTypes.func,
};

export default SeasonCard;
