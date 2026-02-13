// src/components/mobile/MobileMarkets.jsx
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MobileMarketsList from "@/components/mobile/MobileMarketsList";
import { useInfoFiMarkets } from "@/hooks/useInfoFiMarkets";
import { useAllSeasons } from "@/hooks/useAllSeasons";

/**
 * MobileMarkets - Mobile-first InfoFi Markets page
 * Select dropdown for season + Tabs for market type + MobileMarketsList carousel
 */
const MobileMarkets = () => {
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

  // Fetch markets only for the selected season
  const selectedSeasonArray = useMemo(() => {
    if (!selectedSeasonId || selectedSeasonId === "0") return [];
    const arr = Array.isArray(seasons) ? seasons : [];
    const season = arr.find(
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

  // Only show types that have markets
  const availableTypes = useMemo(() => {
    const labels = {
      WINNER_PREDICTION: "Win?",
      POSITION_SIZE: "Tix #",
      BEHAVIORAL: "Hodl/Dump?",
    };
    return Object.entries(marketsByType)
      .filter(([, arr]) => arr.length > 0)
      .map(([type, arr]) => ({
        type,
        label: labels[type] || type,
        count: arr.length,
      }));
  }, [marketsByType]);

  const isLoading = seasonsLoading || marketsLoading;
  const seasonsArr = Array.isArray(seasons) ? seasons : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Page Title */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground text-left">
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

      {/* Main content */}
      {!isLoading && !error && seasonsArr.length > 0 && (
        <div className="space-y-4">
          {/* Season Select dropdown */}
          <Select
            value={selectedSeasonId}
            onValueChange={setSelectedSeasonId}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select season" />
            </SelectTrigger>
            <SelectContent>
              {seasonsArr.map((s) => {
                const id = String(s.id ?? s.seasonId);
                const isActive = Number(s.status) === 1;
                return (
                  <SelectItem key={id} value={id}>
                    Season #{id}
                    {s.config?.name ? ` - ${s.config.name}` : ""}
                    {isActive ? " (Active)" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Market Type Tabs */}
          {availableTypes.length > 0 && (
            <Tabs
              value={selectedMarketType}
              onValueChange={setSelectedMarketType}
            >
              <TabsList className="w-full">
                {availableTypes.map((mt) => (
                  <TabsTrigger
                    key={mt.type}
                    value={mt.type}
                    className="flex-1 text-xs"
                  >
                    {mt.label} ({mt.count})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Markets Carousel */}
          <MobileMarketsList
            markets={filteredMarkets}
            isLoading={marketsLoading}
          />
        </div>
      )}

      {/* No Markets State */}
      {!isLoading &&
        !error &&
        seasonsArr.length > 0 &&
        filteredMarkets.length === 0 &&
        !marketsLoading && (
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
      {!isLoading && !error && seasonsArr.length === 0 && (
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
