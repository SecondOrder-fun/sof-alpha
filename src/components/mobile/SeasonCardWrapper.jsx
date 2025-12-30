/**
 * Season Card Wrapper
 * Fetches curve state for a season and passes to SeasonCard
 */

import PropTypes from "prop-types";
import { useCurveState } from "@/hooks/useCurveState";
import SeasonCard from "@/components/mobile/SeasonCard";

export const SeasonCardWrapper = ({
  seasonId,
  seasonConfig,
  status,
  onBuy,
  onSell,
  onClick,
}) => {
  const bondingCurveAddress = seasonConfig?.bondingCurve;
  const { curveSupply, curveStep, allBondSteps } = useCurveState(
    bondingCurveAddress,
    {
      isActive: status === 1,
      pollMs: 15000,
    }
  );

  return (
    <SeasonCard
      seasonId={seasonId}
      seasonConfig={seasonConfig}
      curveStep={curveStep}
      allBondSteps={allBondSteps}
      curveSupply={curveSupply}
      onBuy={onBuy}
      onSell={onSell}
      onClick={onClick}
    />
  );
};

SeasonCardWrapper.propTypes = {
  seasonId: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    .isRequired,
  seasonConfig: PropTypes.object,
  status: PropTypes.number,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
  onClick: PropTypes.func,
};

export default SeasonCardWrapper;
