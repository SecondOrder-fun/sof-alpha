// src/components/mobile/MobileMarkets.jsx
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import SeasonCarousel from "@/components/infofi/SeasonCarousel";
import MarketTypeCarousel from "@/components/infofi/MarketTypeCarousel";
import MarketCarousel from "@/components/infofi/MarketCarousel";
import InfoFiMarketCardMobile from "@/components/infofi/InfoFiMarketCardMobile";
import { useInfoFiMarkets } from "@/hooks/useInfoFiMarkets";
import { useAllSeasons } from "@/hooks/useAllSeasons";

/**
 * MobileMarkets - Farcaster/Base App mobile-first InfoFi Markets page
 * Separate from the main MarketsIndex page for desktop users
 */
const MobileMarkets = () => {
  const [currentMarketIndex, setCurrentMarketIndex] = useState(0);
  const { t } = useTranslation(["market", "common"]);

  // Get all seasons
  const { data: seasons, isLoading: seasonsLoading } = useAllSeasons?.() || {
    data: [],
    isLoading: false,
  };

  // Determine active season and set as default
  const activeSeasonId = useMemo(() => {
    const arr = Array.isArray(seasons) ? seasons : [];
    const active = arr.find((s) => Number(s?.status) === 1);
    return active ? String(active.id ?? active.seasonId ?? "0") : "0";
  }, [seasons]);

  const [selectedSeasonId, setSelectedSeasonId] = useState(activeSeasonId);
  const [selectedMarketType, setSelectedMarketType] =
    useState("WINNER_PREDICTION");

  // Update selected season when active season changes
  useEffect(() => {
    if (activeSeasonId !== "0" && selectedSeasonId === "0") {
      setSelectedSeasonId(activeSeasonId);
    }
  }, [activeSeasonId, selectedSeasonId]);

  // Fetch markets only for the selected season (to avoid over-fetching)
  const selectedSeasonArray = useMemo(() => {
    if (!selectedSeasonId || selectedSeasonId === "0") return [];
    const season = seasons.find(
      (s) => String(s.id ?? s.seasonId) === selectedSeasonId
    );
    return season ? [season] : [];
  }, [seasons, selectedSeasonId]);

  const {
    markets,
    isLoading: marketsLoading,
    error,
  } = useInfoFiMarkets(selectedSeasonArray, { isActive: true });

  // Get markets for selected season
  const seasonMarkets = useMemo(() => {
    if (!markets || typeof markets !== "object") return [];
    const marketArray = markets[selectedSeasonId] || [];
    return Array.isArray(marketArray) ? marketArray : [];
  }, [markets, selectedSeasonId]);

  // Group markets by type
  const marketsByType = useMemo(() => {
    const winners = seasonMarkets.filter(
      (m) => (m.market_type || m.type) === "WINNER_PREDICTION"
    );
    const positionSize = seasonMarkets.filter(
      (m) => (m.market_type || m.type) === "POSITION_SIZE"
    );
    const behavioral = seasonMarkets.filter(
      (m) => (m.market_type || m.type) === "BEHAVIORAL"
    );

    return {
      WINNER_PREDICTION: winners,
      POSITION_SIZE: positionSize,
      BEHAVIORAL: behavioral,
    };
  }, [seasonMarkets]);

  // Get filtered markets for selected type
  const filteredMarkets = useMemo(() => {
    return marketsByType[selectedMarketType] || [];
  }, [marketsByType, selectedMarketType]);

  // Market types with counts
  const marketTypes = useMemo(() => {
    return [
      {
        type: "WINNER_PREDICTION",
        name: t("market:winnerPrediction"),
        count: marketsByType.WINNER_PREDICTION.length,
      },
      {
        type: "POSITION_SIZE",
        name: t("market:positionSize"),
        count: marketsByType.POSITION_SIZE.length,
      },
      {
        type: "BEHAVIORAL",
        name: t("market:behavioral"),
        count: marketsByType.BEHAVIORAL.length,
      },
    ].filter((mt) => mt.count > 0); // Only show types with markets
  }, [marketsByType, t]);

  // Reset market index when season or type changes
  useEffect(() => {
    setCurrentMarketIndex(0);
  }, [selectedSeasonId, selectedMarketType]);

  const isLoading = seasonsLoading || marketsLoading;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Page Title */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {t("market:infoFiMarkets")}
        </h1>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t("common:loading")}</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="py-6 text-center">
            <p className="text-destructive">
              {t("market:failedToLoadMarkets")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Carousel Navigation */}
      {!isLoading && !error && seasons.length > 0 && (
        <div className="space-y-4">
          {/* Season Selector */}
          <SeasonCarousel
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
            onSeasonChange={setSelectedSeasonId}
          />

          {/* Market Type Selector */}
          {marketTypes.length > 0 && (
            <MarketTypeCarousel
              marketTypes={marketTypes}
              selectedType={selectedMarketType}
              onTypeChange={setSelectedMarketType}
            />
          )}

          {/* Market Cards Carousel - Only render when there are markets */}
          {filteredMarkets.length > 0 && (
            <MarketCarousel
              markets={filteredMarkets}
              currentIndex={currentMarketIndex}
              onIndexChange={setCurrentMarketIndex}
              renderMarket={(market) => (
                <InfoFiMarketCardMobile key={market.id} market={market} />
              )}
            />
          )}
        </div>
      )}

      {/* No Markets State */}
      {!isLoading &&
        !error &&
        seasons.length > 0 &&
        filteredMarkets.length === 0 && (
          <Card className="text-center py-12">
            <CardContent className="space-y-4">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-lg font-semibold">
                {t("market:noMarketsAvailable")}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {t("market:noMarketsDescription", {
                  marketType: selectedMarketType
                    .toLowerCase()
                    .replace("_", " "),
                })}
              </p>
            </CardContent>
          </Card>
        )}

      {/* No Seasons State */}
      {!isLoading && !error && seasons.length === 0 && (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <div className="text-6xl mb-4">🎲</div>
            <h3 className="text-lg font-semibold">
              {t("market:noSeasonsAvailable")}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t("market:noSeasonsDescription")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MobileMarkets;
