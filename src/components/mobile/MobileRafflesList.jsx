/**
 * Mobile Raffles List
 * Carousel-based seasons display for Farcaster and mobile
 */

import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Carousel from "@/components/common/Carousel";
import SeasonCard from "@/components/mobile/SeasonCard";
import { useCurveState } from "@/hooks/useCurveState";

const MobileActiveSeasonCard = ({ season, onBuy, onSell, index, total }) => {
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
      cardIndex={index}
      totalCards={total}
      onClick={() => navigate(`/raffles/${season.id}`)}
    />
  );
};

MobileActiveSeasonCard.propTypes = {
  season: PropTypes.object.isRequired,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
  index: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
};

export const MobileRafflesList = ({
  seasons = [],
  isLoading,
  onBuy,
  onSell,
}) => {
  const { t } = useTranslation(["raffle"]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex >= seasons.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, seasons.length]);

  const handlePrevious = () => {
    if (seasons.length === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      setCurrentIndex(seasons.length - 1);
    }
  };

  const handleNext = () => {
    if (seasons.length === 0) return;
    if (currentIndex < seasons.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  return (
    <div className="px-3 pt-2 pb-4 max-w-screen-sm mx-auto">
      {/* Page Title */}
      <h1 className="text-white text-2xl font-bold mb-4">{t("raffles")}</h1>

      {/* All Seasons */}
      <Card className="mb-6">
        <CardContent>
          {isLoading && <p>{t("loadingSeasons")}</p>}
          {!isLoading && seasons.length === 0 && <p>{t("noActiveSeasons")}</p>}
          {!isLoading && seasons.length > 0 && (
            <>
              <Carousel
                items={seasons}
                currentIndex={currentIndex}
                onIndexChange={setCurrentIndex}
                className="pb-2"
                showArrows={false}
                renderItem={(season, index) => (
                  <MobileActiveSeasonCard
                    key={season.id}
                    season={season}
                    index={index}
                    total={seasons.length}
                    onBuy={onBuy}
                    onSell={onSell}
                  />
                )}
              />
              <div className="mt-3 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevious}
                  className="h-9 w-9 rounded-full p-0"
                  aria-label="Previous raffle"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentIndex + 1} of {seasons.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNext}
                  className="h-9 w-9 rounded-full p-0"
                  aria-label="Next raffle"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

MobileRafflesList.propTypes = {
  seasons: PropTypes.array,
  isLoading: PropTypes.bool,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
};

export default MobileRafflesList;
