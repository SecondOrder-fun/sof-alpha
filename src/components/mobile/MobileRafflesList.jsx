/**
 * Mobile Raffles List
 * Carousel-based seasons display for Farcaster and mobile
 */

import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import Carousel from "@/components/common/Carousel";
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
    },
  );

  return (
    <SeasonCard
      seasonId={season.id}
      seasonConfig={season.config}
      status={season.status}
      curveStep={curveStep}
      allBondSteps={allBondSteps}
      curveSupply={curveSupply}
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

export const MobileRafflesList = ({ seasons = [], onBuy, onSell }) => {
  const { t } = useTranslation(["raffle"]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex >= seasons.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, seasons.length]);

  return (
    <div className="px-3 pt-2 pb-4 max-w-screen-sm mx-auto">
      {/* Page Title */}
      <h1 className="text-white text-2xl font-bold mb-4">{t("raffles")}</h1>

      {/* All Seasons */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("allSeasons")}</CardTitle>
          <CardDescription>{t("allSeasonsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {seasons.length === 0 && <p>{t("noActiveSeasons")}</p>}
          {seasons.length > 0 && (
            <Carousel
              items={seasons}
              currentIndex={currentIndex}
              onIndexChange={setCurrentIndex}
              className="pb-2"
              renderItem={(season) => (
                <MobileActiveSeasonCard
                  key={season.id}
                  season={season}
                  onBuy={onBuy}
                  onSell={onSell}
                />
              )}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

MobileRafflesList.propTypes = {
  seasons: PropTypes.array,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
};

export default MobileRafflesList;
