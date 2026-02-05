import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatUnits, createPublicClient, http } from "viem";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import { useSeasonWinnerSummaries } from "@/hooks/useSeasonWinnerSummaries";
import { useCurveState } from "@/hooks/useCurveState";
import { useAccount, useChains } from "wagmi";
import BondingCurvePanel from "@/components/curve/CurveGraph";
import SOFBondingCurveJson from "@/contracts/abis/SOFBondingCurve.json";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CountdownTimer from "@/components/common/CountdownTimer";
import { usePlatform } from "@/hooks/usePlatform";
import MobileRafflesList from "@/components/mobile/MobileRafflesList";
import { useState } from "react";
import BuySellSheet from "@/components/mobile/BuySellSheet";
import UsernameDisplay from "@/components/user/UsernameDisplay";

const ActiveSeasonCard = ({ season, renderBadge, winnerSummary }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(["raffle", "common"]);
  const bondingCurveAddress = season?.config?.bondingCurve;
  const statusNum = Number(season?.status);
  const isActiveSeason = statusNum === 1;
  const nowSec = Math.floor(Date.now() / 1000);
  const startTimeSec = season?.config?.startTime
    ? Number(season.config.startTime)
    : null;
  const isPreStart =
    startTimeSec !== null && Number.isFinite(startTimeSec)
      ? nowSec < startTimeSec
      : false;
  const totalTickets = BigInt(season?.totalTickets ?? 0n);
  const { curveSupply, curveStep, allBondSteps } = useCurveState(
    bondingCurveAddress,
    {
      isActive: isActiveSeason,
      pollMs: 15000,
      enabled: isActiveSeason,
    },
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
  const isCompleted = statusNum === 4 || statusNum === 5;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="py-1 pb-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm text-primary">
              #{season.id}
            </span>
            <span className="font-medium truncate">{season.config?.name}</span>
          </div>
          {renderBadge(season.status)}
        </div>
        {/* Countdown timer */}
        {isPreStart && startTimeSec !== null ? (
          <div className="flex items-center gap-1 text-xs mt-1">
            <span className="text-muted-foreground">
              {t("startsIn", { defaultValue: "Raffle starts in" })}:
            </span>
            <CountdownTimer
              targetTimestamp={startTimeSec}
              className="text-primary"
            />
          </div>
        ) : (
          statusNum === 1 &&
          endTime && (
            <div className="flex items-center gap-1 text-xs mt-1">
              <span className="text-muted-foreground">{t("endsIn")}:</span>
              <CountdownTimer
                targetTimestamp={Number(endTime)}
                className="text-primary"
              />
            </div>
          )
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        {!isCompleted && !isPreStart && (
          <div className="overflow-hidden rounded-md bg-muted/40">
            <div className="h-44">
              <BondingCurvePanel
                curveSupply={curveSupply}
                curveStep={curveStep}
                allBondSteps={allBondSteps}
                mini
              />
            </div>
          </div>
        )}
        {isCompleted && winnerSummary && (
          <div className="rounded-md border border-border bg-muted/40 p-4 text-base text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm uppercase tracking-wide text-primary">
                {t("winner")}
              </span>
              <span className="text-lg font-semibold text-foreground">
                <UsernameDisplay
                  address={winnerSummary.winnerAddress}
                  className="text-lg"
                />
              </span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {t("grandPrize")}:{" "}
              {(() => {
                try {
                  return `${Number(formatUnits(winnerSummary.grandPrizeWei, 18)).toFixed(2)} SOF`;
                } catch {
                  return "0.00 SOF";
                }
              })()}
            </div>
          </div>
        )}
        {isCompleted && !winnerSummary && totalTickets === 0n && (
          <div className="rounded-md border border-border bg-muted/40 p-4 text-base text-muted-foreground">
            <div className="text-sm font-semibold text-foreground">
              {t("noWinner")}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {t("noParticipants")}
            </div>
          </div>
        )}
        {!isCompleted && !isPreStart && (
          <div className="flex items-center justify-between text-sm">
            <div>
              <div className="text-xs text-primary">{t("currentPrice")}</div>
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
        )}
      </CardContent>
    </Card>
  );
};

ActiveSeasonCard.propTypes = {
  season: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    status: PropTypes.number,
    totalTickets: PropTypes.any,
    config: PropTypes.shape({
      name: PropTypes.string,
      bondingCurve: PropTypes.string,
      startTime: PropTypes.any,
      // endTime can be string, number, or BigInt from blockchain
      endTime: PropTypes.any,
    }),
  }).isRequired,
  renderBadge: PropTypes.func.isRequired,
  winnerSummary: PropTypes.shape({
    winnerAddress: PropTypes.string,
    grandPrizeWei: PropTypes.any,
  }),
};

const RaffleList = () => {
  const { t } = useTranslation("raffle");
  const { isMobile } = usePlatform();
  const navigate = useNavigate();
  const { address } = useAccount();
  const { chainId } = useAccount();
  const chains = useChains();
  const allSeasonsQuery = useAllSeasons();
  const winnerSummariesQuery = useSeasonWinnerSummaries(allSeasonsQuery.data);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState("buy");
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [localPosition, setLocalPosition] = useState({
    tickets: 0n,
    probBps: 0,
    total: 0n,
  });

  const renderBadge = (st) => {
    const statusNum = Number(st);
    const label =
      statusNum === 1 ? "Active" : statusNum === 0 ? "NotStarted" : "Completed";
    const variant =
      statusNum === 1
        ? "statusActive"
        : statusNum === 0
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

  const handleSell = async (seasonId) => {
    const season = allSeasonsQuery.data?.find((s) => s.id === seasonId);
    setSelectedSeason(season);

    // Get the bonding curve address for position refresh
    const bondingCurveAddress =
      season?.config?.bondingCurve || season?.bondingCurveAddress;

    if (bondingCurveAddress && chainId) {
      // Find the current chain configuration
      const currentChain = chains.find((chain) => chain.id === chainId);

      if (currentChain?.rpcUrls?.default) {
        const rpcUrl = currentChain.rpcUrls.default.http?.[0];
        if (!rpcUrl) {
          setSheetMode("sell");
          setSheetOpen(true);
          return;
        }
        const positionClient = createPublicClient({
          chain: currentChain,
          transport: http(rpcUrl),
          blockTag: "latest",
        });

        try {
          const [pt, cfg] = await Promise.all([
            positionClient.readContract({
              address: bondingCurveAddress,
              abi: SOFBondingCurveJson,
              functionName: "playerTickets",
              args: [address],
            }),
            positionClient.readContract({
              address: bondingCurveAddress,
              abi: SOFBondingCurveJson,
              functionName: "curveConfig",
              args: [],
            }),
          ]);

          const tickets = BigInt(pt ?? 0n);
          const total = BigInt(cfg?.[0] ?? cfg?.totalSupply ?? 0n);
          const probBps = total > 0n ? Number((tickets * 10000n) / total) : 0;

          // Update local position state
          setLocalPosition({ tickets, probBps, total });
        } catch (error) {
          // ignore
        }
      }
    }

    // Small delay to ensure state update completes
    await new Promise((resolve) => setTimeout(resolve, 200));

    setSheetMode("sell");
    setSheetOpen(true);
  };

  // Mobile view for Farcaster Mini App and Base App
  const seasonsSorted = [...(allSeasonsQuery.data || [])].sort(
    (a, b) => Number(b.id) - Number(a.id),
  );

  if (isMobile) {
    // Note: We pass raw season data and let MobileRafflesList handle curve state
    // This avoids calling hooks inside map/filter which violates Rules of Hooks
    return (
      <>
        <MobileRafflesList
          seasons={seasonsSorted}
          isLoading={allSeasonsQuery.isLoading}
          onBuy={handleBuy}
          onSell={handleSell}
        />
        {selectedSeason && (
          <BuySellSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            mode={sheetMode}
            seasonId={selectedSeason.id}
            seasonStatus={selectedSeason.status}
            seasonEndTime={selectedSeason.config?.endTime}
            bondingCurveAddress={selectedSeason.config?.bondingCurve}
            maxSellable={localPosition?.tickets || 0n}
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
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{t("allSeasons")}</h2>
          <p className="text-sm text-muted-foreground">{t("allSeasonsDescription")}</p>
        </div>
        {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
        {allSeasonsQuery.error && <p>Error loading seasons.</p>}
        {seasonsSorted.length === 0 && !allSeasonsQuery.isLoading && (
          <p>{t("noActiveSeasons")}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {seasonsSorted.map((season) => (
            <ActiveSeasonCard
              key={season.id}
              season={season}
              renderBadge={renderBadge}
              winnerSummary={winnerSummariesQuery.data?.[season.id]}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default RaffleList;
