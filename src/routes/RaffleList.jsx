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
import UsernameDisplay from "@/components/user/UsernameDisplay";

const ActiveSeasonCard = ({ season, renderBadge, winnerSummary }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(["raffle", "common"]);
  const bondingCurveAddress = season?.config?.bondingCurve;
  const { curveSupply, curveStep, allBondSteps } = useCurveState(
    bondingCurveAddress,
    {
      isActive: season?.status === 1,
      pollMs: 15000,
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
  const isCompleted = season?.status === 5;

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
        {!isCompleted && (
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
        )}
        {isCompleted && winnerSummary && (
          <div className="rounded-md border border-[#353e34] bg-black/40 p-4 text-base text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm uppercase tracking-wide text-[#c82a54]">
                {t("winner")}
              </span>
              <span className="text-lg font-semibold text-white">
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
        {!isCompleted && (
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
        )}
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
        const positionClient = createPublicClient({
          chain: currentChain,
          transport: http(),
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
      <Card>
        <CardHeader>
          <CardTitle>{t("allSeasons")}</CardTitle>
          <CardDescription>{t("allSeasonsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default RaffleList;
