/**
 * Mobile Raffles List
 * Grid-based seasons display matching desktop version
 */

import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import SeasonCard from "@/components/mobile/SeasonCard";
import { useCurveState } from "@/hooks/useCurveState";

const MobileActiveSeasonCard = ({ season, onBuy, onSell }) => {
  const navigate = useNavigate();
  const bondingCurveAddress = season?.config?.bondingCurve;
  const { curveSupply, curveStep, allBondSteps } = useCurveState(
    bondingCurveAddress,
    {
      isActive: season?.status === 1,
      pollMs: 15000,
    }
  );

  return (
    <SeasonCard
      seasonId={season.id}
      seasonConfig={season.config}
      status={season.status}
      curveStep={curveStep}
      allBondSteps={allBondSteps}
      curveSupply={curveSupply}
      bondingCurveAddress={bondingCurveAddress}
      onBuy={() => onBuy(season.id)}
      onSell={() => onSell(season.id)}
      onClick={() => navigate(`/raffles/${season.id}`)}
    />
  );
};

MobileActiveSeasonCard.propTypes = {
  season: PropTypes.object.isRequired,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
};

export const MobileRafflesList = ({ activeSeasons = [], onBuy, onSell }) => {
  const { t } = useTranslation(["raffle"]);

  return (
    <div className="px-3 pt-2 pb-4 max-w-screen-sm mx-auto">
      {/* Page Title */}
      <h1 className="text-white text-2xl font-bold mb-4">{t("raffles")}</h1>

      {/* Active Seasons */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("activeSeasons")}</CardTitle>
          <CardDescription>{t("activeSeasonsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {activeSeasons.length === 0 && <p>No active seasons right now.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSeasons.map((season) => (
              <MobileActiveSeasonCard
                key={season.id}
                season={season}
                onBuy={onBuy}
                onSell={onSell}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

MobileRafflesList.propTypes = {
  activeSeasons: PropTypes.array,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
};

export default MobileRafflesList;
