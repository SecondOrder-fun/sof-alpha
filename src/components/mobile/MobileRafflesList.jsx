/**
 * Mobile Raffles List
 * Carousel-based seasons display for Farcaster and mobile
 * Uses adaptive card height to fill space between header and footer
 */

import PropTypes from "prop-types";
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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

export const MobileRafflesList = ({
  seasons = [],
  isLoading,
  onBuy,
  onSell,
}) => {
  const { t } = useTranslation(["raffle"]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardHeight, setCardHeight] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (currentIndex >= seasons.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, seasons.length]);

  // Calculate and lock card height to fill space between header and footer
  // Depends on `isLoading` so it re-runs when the card first appears in the DOM
  useEffect(() => {
    const update = () => {
      if (!cardRef.current) return;
      const cardTop = cardRef.current.getBoundingClientRect().top;
      const navEl = document.querySelector("nav.fixed.bottom-0");
      const navHeight = navEl ? navEl.getBoundingClientRect().height : 120;
      const h = window.innerHeight - cardTop - navHeight - 12;
      setCardHeight(h);
    };
    const timer = setTimeout(update, 100);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", update);
    };
  }, [isLoading]);

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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden px-3 pt-1 pb-20">
        {/* Title row with pagination controls */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-foreground">{t("raffles")}</h1>
          {!isLoading && seasons.length > 1 && (
            <div className="flex items-center gap-2">
              <ButtonGroup>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePrevious}
                  className="h-8 w-8"
                  aria-label="Previous raffle"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNext}
                  className="h-8 w-8"
                  aria-label="Next raffle"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </ButtonGroup>
              <span className="text-sm text-muted-foreground font-mono">
                {currentIndex + 1} / {seasons.length}
              </span>
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                {t("loadingSeasons")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Empty */}
        {!isLoading && seasons.length === 0 && (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                {t("noActiveSeasons")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Season Carousel */}
        {!isLoading && seasons.length > 0 && (
          <Card
            ref={cardRef}
            className="flex flex-col overflow-hidden"
            style={cardHeight ? { height: cardHeight } : undefined}
          >
            <CardContent className="p-0 flex-1 overflow-hidden">
              <Carousel
                items={seasons}
                currentIndex={currentIndex}
                onIndexChange={setCurrentIndex}
                className="h-full"
                showArrows={false}
                renderItem={(season) => (
                  <MobileActiveSeasonCard
                    key={season.id}
                    season={season}
                    onBuy={onBuy}
                    onSell={onSell}
                  />
                )}
              />
            </CardContent>
          </Card>
        )}
      </div>
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
