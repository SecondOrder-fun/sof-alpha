import PropTypes from "prop-types";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatUnits } from "viem";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import { useCurveState } from "@/hooks/useCurveState";
import BondingCurvePanel from "@/components/curve/CurveGraph";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CountdownTimer from "@/components/common/CountdownTimer";
import { usePlatform } from "@/hooks/usePlatform";
import MobileRafflesList from "@/components/mobile/MobileRafflesList";
import { useState } from "react";
import BuySellSheet from "@/components/mobile/BuySellSheet";

const ActiveSeasonCard = ({ season, renderBadge }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(["raffle", "common"]);
  const bondingCurveAddress = season?.config?.bondingCurve;
  const { curveSupply, curveStep, allBondSteps } = useCurveState(
    bondingCurveAddress,
    {
      isActive: season?.status === 1,
      pollMs: 15000,
    }
  );

  const currentPriceLabel = (() => {
    try {
      const raw = curveStep?.price ?? 0n;
      // Reason: Bonding curve prices are in SOF (18 decimals by default). For
      // the list view we use a lightweight formatter; the detailed page uses
      // BondingCurvePanel which reads exact decimals.
      return Number(formatUnits(raw, 18)).toFixed(4);
    } catch {
      return "0.0000";
    }
  })();

  const endTime = season?.config?.endTime;

  return (
    <Card className="flex flex-col h-full border border-[#353e34] bg-[#130013]">
      <CardHeader className="py-1 pb-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm text-[#f9d6de]">
              #{season.id}
            </span>
            <span className="font-medium truncate">{season.config?.name}</span>
          </div>
          {renderBadge(season.status)}
        </div>
        {/* Countdown timer for active seasons */}
        {season.status === 1 && endTime && (
          <div className="flex items-center gap-1 text-xs mt-1">
            <span className="text-[#a89e99]">{t("endsIn")}:</span>
            <CountdownTimer
              targetTimestamp={Number(endTime)}
              className="text-[#f9d6de]"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        <div className="overflow-hidden rounded-md bg-black/40">
          <div className="h-44">
            <BondingCurvePanel
              curveSupply={curveSupply}
              curveStep={curveStep}
              allBondSteps={allBondSteps}
              mini
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="text-xs text-[#c82a54]">{t("currentPrice")}</div>
            <div className="font-mono text-base">{currentPriceLabel} SOF</div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => navigate(`/raffles/${season.id}?mode=buy`)}
            >
              {t("common:buy")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/raffles/${season.id}?mode=sell`)}
            >
              {t("common:sell")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

ActiveSeasonCard.propTypes = {
  season: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    status: PropTypes.number,
    config: PropTypes.shape({
      name: PropTypes.string,
      bondingCurve: PropTypes.string,
      // endTime can be string, number, or BigInt from blockchain
      endTime: PropTypes.any,
    }),
  }).isRequired,
  renderBadge: PropTypes.func.isRequired,
};

const RaffleList = () => {
  const { t } = useTranslation("raffle");
  const { isMobile } = usePlatform();
  const navigate = useNavigate();
  const allSeasonsQuery = useAllSeasons();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState("buy");
  const [selectedSeason, setSelectedSeason] = useState(null);

  const renderBadge = (st) => {
    const label = st === 1 ? "Active" : st === 0 ? "NotStarted" : "Completed";
    const variant =
      st === 1
        ? "statusActive"
        : st === 0
        ? "statusUpcoming"
        : "statusCompleted";
    return <Badge variant={variant}>{label}</Badge>;
  };

  const handleBuy = (seasonId) => {
    const season = allSeasonsQuery.data?.find((s) => s.id === seasonId);
    setSelectedSeason(season);
    setSheetMode("buy");
    setSheetOpen(true);
  };

  const handleSell = (seasonId) => {
    const season = allSeasonsQuery.data?.find((s) => s.id === seasonId);
    setSelectedSeason(season);
    setSheetMode("sell");
    setSheetOpen(true);
  };

  // Mobile view for Farcaster Mini App and Base App
  if (isMobile) {
    // Note: We pass raw season data and let MobileRafflesList handle curve state
    // This avoids calling hooks inside map/filter which violates Rules of Hooks
    const activeSeasons = (allSeasonsQuery.data || []).filter(
      (s) => s.status === 1
    );

    return (
      <>
        <MobileRafflesList
          activeSeasons={activeSeasons}
          allSeasons={allSeasonsQuery.data || []}
          onBuy={handleBuy}
          onSell={handleSell}
        />
        {selectedSeason && (
          <BuySellSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            mode={sheetMode}
            seasonId={selectedSeason.id}
            bondingCurveAddress={selectedSeason.config?.bondingCurve}
            maxSellable={0n}
            onSuccess={async () => {
              setSheetOpen(false);
              navigate(`/raffles/${selectedSeason.id}`);
            }}
          />
        )}
      </>
    );
  }

  // Desktop view
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("activeSeasons")}</CardTitle>
          <CardDescription>{t("activeSeasonsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
          {allSeasonsQuery.error && <p>Error loading seasons.</p>}
          {allSeasonsQuery.data &&
            (() => {
              const active = allSeasonsQuery.data.filter((s) => s.status === 1);
              if (active.length === 0) {
                return <p>No active seasons right now.</p>;
              }
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {active.map((s) => (
                    <ActiveSeasonCard
                      key={s.id}
                      season={s}
                      renderBadge={renderBadge}
                    />
                  ))}
                </div>
              );
            })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("allSeasons")}</CardTitle>
          <CardDescription>{t("allSeasonsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
          {allSeasonsQuery.error && <p>Error loading seasons.</p>}
          {allSeasonsQuery.data &&
            allSeasonsQuery.data.length === 0 &&
            !allSeasonsQuery.isLoading && <p>No seasons found.</p>}
          <div className="space-y-3">
            {allSeasonsQuery.data &&
              allSeasonsQuery.data.map((s) => (
                <Link
                  key={s.id}
                  to={`/raffles/${s.id}`}
                  className="flex items-center justify-between border rounded p-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono">#{s.id}</span>
                    <span className="font-medium">{s.config?.name}</span>
                    {renderBadge(s.status)}
                  </div>
                </Link>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RaffleList;
