// src/pages/InfoFiMarketDetail.jsx
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OddsChart from "@/components/infofi/OddsChart";
import BuySellWidget from "@/components/infofi/BuySellWidget";
import UsernameDisplay from "@/components/user/UsernameDisplay";
import { useQuery } from "@tanstack/react-query";
import { useRaffleRead } from "@/hooks/useRaffleRead";
import { buildMarketTitleParts } from "@/lib/marketTitle";
import { formatDistanceToNow } from "date-fns";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

/**
 * InfoFiMarketDetail Page
 * Displays detailed market information with odds-over-time chart and trading interface
 * Inspired by Polymarket's market detail page design
 */
const InfoFiMarketDetail = () => {
  const { marketId } = useParams();
  const { t } = useTranslation("market");

  // Fetch market data from backend API (synced from blockchain on startup)
  const { data: marketData, isLoading } = useQuery({
    queryKey: ["infofiMarket", marketId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/infofi/markets/${marketId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch market");
      }
      const data = await response.json();
      return data.market;
    },
    enabled: Boolean(marketId),
    staleTime: 30000, // 30 seconds
  });

  const market = marketData;

  const { currentSeasonQuery } = useRaffleRead();
  const seasonId =
    market?.raffle_id ??
    market?.seasonId ??
    market?.season_id ??
    currentSeasonQuery?.data;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">{t("marketNotFound")}</p>
            <Link to="/markets">
              <Button className="mt-4" variant="outline">
                {t("backToMarkets")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const parts = buildMarketTitleParts(market);
  const isWinnerPrediction = market.market_type === "WINNER_PREDICTION";

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Back button */}
      <Link
        to="/markets"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToMarkets")}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - 2/3 width on large screens */}
        <div className="lg:col-span-2 space-y-6">
          {/* Market header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <CardTitle className="text-2xl font-bold">
                    {isWinnerPrediction ? (
                      <span className="flex flex-col gap-2">
                        <span>
                          {parts.prefix}{" "}
                          <UsernameDisplay
                            address={market.player}
                            linkTo={`/users/${market.player}`}
                            className="font-bold text-primary"
                          />
                        </span>
                        <Link
                          to={`/raffles/${seasonId}`}
                          className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                        >
                          {parts.seasonLabel}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </span>
                    ) : (
                      market.question || market.market_type
                    )}
                  </CardTitle>

                  {/* Market metadata */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>
                        {market.created_at
                          ? formatDistanceToNow(new Date(market.created_at), {
                              addSuffix: true,
                            })
                          : t("unknown")}
                      </span>
                    </div>
                    <div className="font-medium">
                      ${(market.volume || 0).toLocaleString()} {t("volume")}
                    </div>
                  </div>
                </div>

                {/* Current odds display */}
                <div className="text-right">
                  <div className="text-3xl font-bold text-emerald-600">
                    {((market.current_probability || 0) / 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("yesOdds")}
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {/* Odds over time chart */}
              <OddsChart marketId={marketId} />
            </CardContent>
          </Card>

          {/* Market details tabs */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="activity">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="activity">{t("activity")}</TabsTrigger>
                  <TabsTrigger value="holders">{t("topHolders")}</TabsTrigger>
                  <TabsTrigger value="info">{t("marketInfo")}</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="mt-4">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>{t("activityComingSoon")}</p>
                  </div>
                </TabsContent>

                <TabsContent value="holders" className="mt-4">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>{t("holdersComingSoon")}</p>
                  </div>
                </TabsContent>

                <TabsContent value="info" className="mt-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">{t("marketType")}</h4>
                      <p className="text-sm text-muted-foreground">
                        {market.market_type}
                      </p>
                    </div>
                    {market.description && (
                      <div>
                        <h4 className="font-medium mb-2">{t("description")}</h4>
                        <p className="text-sm text-muted-foreground">
                          {market.description}
                        </p>
                      </div>
                    )}
                    <div>
                      <h4 className="font-medium mb-2">{t("marketId")}</h4>
                      <p className="text-sm font-mono text-muted-foreground">
                        {marketId}
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Buy/Sell widget - 1/3 width on large screens */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <BuySellWidget marketId={marketId} market={market} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoFiMarketDetail;
