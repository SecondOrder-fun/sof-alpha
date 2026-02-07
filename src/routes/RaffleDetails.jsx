// src/routes/RaffleDetails.jsx
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRaffleState } from "@/hooks/useRaffleState";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageTitle from "@/components/layout/PageTitle";
import { formatUnits } from "viem";
// removed inline buy/sell form controls
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { buildPublicClient } from "@/lib/viemClient";
import { SOFBondingCurveAbi, ERC20Abi } from "@/utils/abis";
import { useCurveState } from "@/hooks/useCurveState";
import BondingCurvePanel from "@/components/curve/CurveGraph";
import BuySellWidget from "@/components/curve/BuySellWidget";
import TransactionsTab from "@/components/curve/TransactionsTab";
import TokenInfoTab from "@/components/curve/TokenInfoTab";
import HoldersTab from "@/components/curve/HoldersTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurveEvents } from "@/hooks/useCurveEvents";
import { useAccount } from "wagmi";
import { RaffleAdminControls } from "@/components/admin/RaffleAdminControls";
import { TreasuryControls } from "@/components/admin/TreasuryControls";
import SecondaryCard from "@/components/common/SecondaryCard";
import ExplorerLink from "@/components/common/ExplorerLink";
import CountdownTimer from "@/components/common/CountdownTimer";
import { formatTimestamp } from "@/lib/utils";
import { usePlatform } from "@/hooks/usePlatform";
import MobileRaffleDetail from "@/components/mobile/MobileRaffleDetail";
import BuySellSheet from "@/components/mobile/BuySellSheet";
import PasswordGateModal from "@/components/gating/PasswordGateModal";
import UsernameDisplay from "@/components/user/UsernameDisplay";
import { useSeasonWinnerSummary } from "@/hooks/useSeasonWinnerSummaries";
import { useSeasonGating } from "@/hooks/useSeasonGating";
import { useSeasonBlock } from "@/hooks/useSeasonBlock";

const RaffleDetails = () => {
  const { t } = useTranslation("raffle");
  const { seasonId } = useParams();
  const seasonIdNumber = Number(seasonId);
  const [searchParams] = useSearchParams();
  const modeParam = searchParams.get("mode");
  const initialTradeTab =
    modeParam === "sell" || modeParam === "buy" ? modeParam : undefined;
  const { seasonDetailsQuery } = useRaffleState(seasonIdNumber);
  const bondingCurveAddress = seasonDetailsQuery?.data?.config?.bondingCurve;
  const [chainNow, setChainNow] = useState(null);
  const [activeTab, setActiveTab] = useState("token-info");
  const { isMobile } = usePlatform();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState("buy");
  const statusNum = Number(seasonDetailsQuery?.data?.status);
  const isActiveSeason = statusNum === 1;
  const isCompletedSeason = statusNum === 4 || statusNum === 5;
  const winnerSummaryQuery = useSeasonWinnerSummary(
    seasonIdNumber,
    seasonDetailsQuery?.data?.status,
  );

  // ── Season gating ──
  const isSeasonGated = Boolean(seasonDetailsQuery?.data?.config?.gated);
  const {
    isVerified: isGatingVerified,
    verifyPassword,
    refetch: refetchGating,
  } = useSeasonGating(seasonIdNumber, { isGated: isSeasonGated });
  const [gateModalOpen, setGateModalOpen] = useState(false);
  // Track which action to resume after password verification
  const [pendingAction, setPendingAction] = useState(null); // "buy" | "sell" | null

  // ── Created block for efficient event queries ──
  const { createdBlock } = useSeasonBlock(seasonIdNumber);

  const {
    curveSupply,
    curveReserves,
    curveStep,
    /* bondStepsPreview, */ allBondSteps,
    debouncedRefresh,
  } = useCurveState(bondingCurveAddress, {
    isActive: isActiveSeason,
    pollMs: 12000,
    enabled: isActiveSeason,
    includeSteps: !isCompletedSeason,
    includeFees: !isCompletedSeason,
  });
  // removed inline estimator state used by old form
  // helpers now imported from lib/curveMath

  const [lastPositionRefreshAt, setLastPositionRefreshAt] = useState(0);

  // Subscribe to on-chain PositionUpdate events to refresh immediately
  useCurveEvents(bondingCurveAddress, {
    onPositionUpdate: () => {
      if (!isActiveSeason) return;

      // Reason: server-side state has changed; refresh chart/supply/reserves quickly
      debouncedRefresh(0);

      // Keep wallet position fresh based on events too (mobile relies on this more heavily).
      // Throttle to avoid spamming RPC reads when multiple logs arrive quickly.
      const now = Date.now();
      if (now - lastPositionRefreshAt < 1200) return;
      setLastPositionRefreshAt(now);
      refreshPositionNow();
    },
  });

  // Connected wallet
  const { address, isConnected } = useAccount();

  // Local immediate position override after tx (until server snapshot catches up)
  const [localPosition, setLocalPosition] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshPositionNow = async () => {
    try {
      if (!isConnected || !address || !bondingCurveAddress) return;
      const netKey = getStoredNetworkKey();
      const client = buildPublicClient(netKey);
      if (!client) return;
      const curveAbi = Array.isArray(SOFBondingCurveAbi)
        ? SOFBondingCurveAbi
        : (SOFBondingCurveAbi?.abi ?? SOFBondingCurveAbi);
      const erc20Abi = Array.isArray(ERC20Abi)
        ? ERC20Abi
        : (ERC20Abi?.abi ?? ERC20Abi);
      // 1) Try the curve's public mapping playerTickets(address) first (authoritative)
      try {
        const [pt, cfg] = await Promise.all([
          client.readContract({
            address: bondingCurveAddress,
            abi: curveAbi,
            functionName: "playerTickets",
            args: [address],
          }),
          client.readContract({
            address: bondingCurveAddress,
            abi: curveAbi,
            functionName: "curveConfig",
            args: [],
          }),
        ]);
        const tickets = BigInt(pt ?? 0n);
        const total = BigInt(cfg?.[0] ?? cfg?.totalSupply ?? 0n);
        const probBps = total > 0n ? Number((tickets * 10000n) / total) : 0;
        setLocalPosition({ tickets, probBps, total });
        return;
      } catch (error) {
        // fallback to ERC20 path below
      }

      // 2) Fallback: discover ERC20 tickets token from the curve if the curve is not the token itself
      // Prefer explicit token from season details if available
      let tokenAddress =
        seasonDetailsQuery?.data?.ticketToken ||
        seasonDetailsQuery?.data?.config?.ticketToken ||
        seasonDetailsQuery?.data?.config?.token ||
        bondingCurveAddress;
      for (const fn of [
        "token",
        "raffleToken",
        "ticketToken",
        "tickets",
        "asset",
      ]) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const addr = await client.readContract({
            address: bondingCurveAddress,
            abi: curveAbi,
            functionName: fn,
            args: [],
          });
          if (
            typeof addr === "string" &&
            /^0x[a-fA-F0-9]{40}$/.test(addr) &&
            addr !== "0x0000000000000000000000000000000000000000"
          ) {
            tokenAddress = addr;
            break;
          }
        } catch (_) {
          // continue trying other function names
        }
      }

      const [bal, supply] = await Promise.all([
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "totalSupply",
          args: [],
        }),
      ]);
      const tickets = BigInt(bal ?? 0n);
      const total = BigInt(supply ?? 0n);
      const probBps = total > 0n ? Number((tickets * 10000n) / total) : 0;
      setLocalPosition({ tickets, probBps, total });
    } catch (err) {
      // ignore
    }
  };

  // Toasts state for tx updates (component scope)
  const [toasts, setToasts] = useState([]);
  const netKeyOuter = getStoredNetworkKey();
  const netOuter = getNetworkByKey(netKeyOuter);
  const addToast = ({ type = "success", message, hash }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url =
      hash && netOuter?.explorer
        ? `${netOuter.explorer.replace(/\/$/, "")}/tx/${hash}`
        : undefined;
    setToasts((t) => [{ id, type, message, hash, url }, ...t]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 120000); // 2 minutes
  };

  // Initial load: fetch position immediately
  useEffect(() => {
    if (isConnected && address && bondingCurveAddress) {
      refreshPositionNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, bondingCurveAddress]);

  // Live pricing rendered via InfoFiPricingTicker component (SSE)

  // removed old inline SOF formatter; TokenInfoTab handles formatting where needed

  // Fetch on-chain time for accurate window checks
  useEffect(() => {
    const netKey = getStoredNetworkKey();
    const client = buildPublicClient(netKey);
    if (!client) return;
    let mounted = true;
    (async () => {
      try {
        const block = await client.getBlock();
        if (mounted) setChainNow(Number(block.timestamp));
      } catch (_err) {
        // silent: non-fatal
      }
    })();
    const id = setInterval(async () => {
      try {
        const block = await client.getBlock();
        if (mounted) setChainNow(Number(block.timestamp));
      } catch (_err) {
        // silent: non-fatal
      }
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // removed old inline buy/sell handlers (now in BuySellWidget)

  // Removed old sell estimate effect; BuySellWidget handles quoting and submission.

  // debouncedRefresh is triggered by BuySellWidget via onTxSuccess

  // removed estimator side-effects for old form

  // simulators now unused

  // Mobile view handlers
  const handleBuy = () => {
    console.log("[handleBuy] ENTRY", {
      hasData: !!seasonDetailsQuery?.data,
      isLoading: seasonDetailsQuery?.isLoading,
      configGated: seasonDetailsQuery?.data?.config?.gated,
      isGatingVerified,
      gateModalOpen,
    });
    
    // Block if season data not loaded yet
    if (!seasonDetailsQuery?.data || seasonDetailsQuery.isLoading) {
      console.log("[handleBuy] BLOCKED: data not ready");
      return;
    }
    
    if (chainNow != null) {
      const startTs = Number(seasonDetailsQuery.data.config?.startTime || 0);
      if (Number.isFinite(startTs) && chainNow < startTs) {
        console.log("[handleBuy] BLOCKED: season not started");
        return;
      }
    }
    
    // Check gating from loaded season data (not derived state)
    const seasonGated = Boolean(seasonDetailsQuery.data.config?.gated);
    console.log("[handleBuy] Gating check:", { seasonGated, isGatingVerified });
    
    if (seasonGated && isGatingVerified !== true) {
      console.log("[handleBuy] SHOWING PASSWORD MODAL");
      setPendingAction("buy");
      setGateModalOpen(true);
      return;
    }
    
    console.log("[handleBuy] OPENING BUY SHEET");
    setSheetMode("buy");
    setSheetOpen(true);
  };

  const handleSell = async () => {
    // Block if season data not loaded yet
    if (!seasonDetailsQuery?.data || seasonDetailsQuery.isLoading) {
      return;
    }
    
    if (chainNow != null) {
      const startTs = Number(seasonDetailsQuery.data.config?.startTime || 0);
      if (Number.isFinite(startTs) && chainNow < startTs) return;
    }
    
    // Check gating from loaded season data (not derived state)
    const seasonGated = Boolean(seasonDetailsQuery.data.config?.gated);
    if (seasonGated && isGatingVerified !== true) {
      setPendingAction("sell");
      setGateModalOpen(true);
      return;
    }
    // Refresh position before opening sell sheet to get latest ticket count
    await refreshPositionNow();

    // Force a delay and check if position was actually updated
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Additional delay to ensure React processes all state updates
    await new Promise((resolve) => setTimeout(resolve, 100));

    setSheetMode("sell");

    // Additional delay to ensure React processes all state updates
    await new Promise((resolve) => setTimeout(resolve, 100));

    setSheetOpen(true);
  };

  // Called after successful password verification
  const handleGateVerified = async () => {
    refetchGating();
    if (pendingAction === "buy") {
      setSheetMode("buy");
      setSheetOpen(true);
    } else if (pendingAction === "sell") {
      await refreshPositionNow();
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSheetMode("sell");
      setSheetOpen(true);
    }
    setPendingAction(null);
  };

  // Mobile view for Farcaster Mini App and Base App
  if (isMobile && seasonDetailsQuery.data?.config) {
    const cfg = seasonDetailsQuery.data.config;
    const totalPrizePool = curveReserves || 0n;
    const maxSupply = (() => {
      try {
        if (cfg?.maxSupply != null) return BigInt(cfg.maxSupply);

        const last =
          Array.isArray(allBondSteps) && allBondSteps.length > 0
            ? allBondSteps[allBondSteps.length - 1]
            : null;

        const candidate = last?.rangeTo ?? last?.cumulativeSupply ?? 0n;
        return BigInt(candidate);
      } catch {
        return 0n;
      }
    })();

    return (
      <>
        <MobileRaffleDetail
          seasonId={seasonIdNumber}
          seasonConfig={cfg}
          status={seasonDetailsQuery.data.status}
          curveSupply={curveSupply}
          maxSupply={maxSupply}
          curveStep={curveStep}
          localPosition={localPosition}
          totalPrizePool={totalPrizePool}
          onBuy={handleBuy}
          onSell={handleSell}
          isGated={isSeasonGated}
          isVerified={isGatingVerified}
        />
        <BuySellSheet
          key={`position-${localPosition?.tickets?.toString() || "0"}`}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          mode={sheetMode}
          seasonId={seasonIdNumber}
          seasonStatus={seasonDetailsQuery.data.status}
          seasonEndTime={cfg?.endTime}
          bondingCurveAddress={bondingCurveAddress}
          maxSellable={localPosition?.tickets || 0n}
          onSuccess={async () => {
            setSheetOpen(false);
            // Immediate refresh
            await refreshPositionNow();
            // Debounced refresh for curve data
            debouncedRefresh(0);
            // Additional refreshes to catch up with blockchain indexing
            setTimeout(async () => {
              await refreshPositionNow();
              debouncedRefresh(0);
            }, 1000);
            setTimeout(async () => {
              await refreshPositionNow();
              debouncedRefresh(0);
            }, 3000);
          }}
          onNotify={(evt) => {
            // Handle position updates from sheet (don't close sheet)
            if (evt.type === "position_update" && evt.positionData) {
              setLocalPosition(evt.positionData);
              return;
            }

            // Handle other notifications
            addToast(evt);
            setIsRefreshing(true);
            debouncedRefresh(0);
            refreshPositionNow();
          }}
        />
        <PasswordGateModal
          open={gateModalOpen}
          onOpenChange={setGateModalOpen}
          seasonName={cfg?.name || ""}
          onVerify={verifyPassword}
          onVerified={handleGateVerified}
        />
      </>
    );
  }

  // Desktop view
  return (
    <div>
      {seasonDetailsQuery.isLoading && <p>Loading season details...</p>}
      {seasonDetailsQuery.error && (
        <p>Error: {seasonDetailsQuery.error.message}</p>
      )}
      {seasonDetailsQuery.data &&
        seasonDetailsQuery.data.config &&
        (() => {
          const cfg = seasonDetailsQuery.data.config;
          const start = Number(cfg?.startTime || 0);
          const end = Number(cfg?.endTime || 0);
          const bc = cfg?.bondingCurve;
          const isZeroAddr = typeof bc === "string" && /^0x0{40}$/i.test(bc);
          const isValid = start > 0 && end > 0 && bc && !isZeroAddr;

          if (!isValid) {
            return (
              <Card>
                <CardHeader>
                  <CardTitle>Season #{seasonId}</CardTitle>
                  <CardDescription>
                    Detailed view of the raffle season.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Season not found or not initialized.
                  </p>
                </CardContent>
              </Card>
            );
          }

          return (
            <>
              <PageTitle
                title={
                  <>
                    {t("season")} #{seasonId} - {cfg.name}
                  </>
                }
              />

              <div className="px-6 text-xs text-[#f9d6de] flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  {t("start")}: {formatTimestamp(cfg.startTime)}
                </span>
                <span>
                  {t("end")}: {formatTimestamp(cfg.endTime)}
                </span>
                {(() => {
                  if (!chainNow) return null;
                  const startTs = Number(cfg.startTime);
                  const endTs = Number(cfg.endTime);
                  const preStart = Number.isFinite(startTs)
                    ? chainNow < startTs
                    : false;
                  const activeWindow =
                    statusNum === 1 &&
                    Number.isFinite(startTs) &&
                    Number.isFinite(endTs)
                      ? chainNow >= startTs && chainNow < endTs
                      : false;

                  if (preStart) {
                    return (
                      <span className="flex items-center gap-1">
                        <span className="text-[#c82a54]">
                          {t("startsIn", {
                            defaultValue: "Raffle starts in",
                          })}
                          :
                        </span>
                        <CountdownTimer
                          targetTimestamp={startTs}
                          compact
                          className="text-white"
                        />
                      </span>
                    );
                  }

                  if (activeWindow) {
                    return (
                      <span className="flex items-center gap-1">
                        <span className="text-[#c82a54]">{t("endsIn")}:</span>
                        <CountdownTimer
                          targetTimestamp={endTs}
                          compact
                          className="text-white"
                        />
                      </span>
                    );
                  }

                  return null;
                })()}
              </div>

              {(() => {
                const startTs = Number(cfg.startTime);
                const endTs = Number(cfg.endTime);
                if (!chainNow) return null;

                // Reason: these hints are only intended for admin-controlled transitions.
                if (
                  statusNum === 0 &&
                  chainNow >= startTs &&
                  chainNow < endTs
                ) {
                  return (
                    <p className="px-6 text-sm text-muted-foreground">
                      Window open on-chain, awaiting admin Start.
                    </p>
                  );
                }

                if (chainNow >= endTs && statusNum === 1) {
                  return (
                    <p className="px-6 text-sm text-muted-foreground">
                      Window ended on-chain, awaiting admin End.
                    </p>
                  );
                }

                return null;
              })()}

              {isCompletedSeason && winnerSummaryQuery.data && (
                <div className="px-6 mt-3">
                  <Card className="border border-[#353e34] bg-[#130013]">
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold text-white">
                        {t("winnerAnnouncement")}
                      </div>
                      <div className="mt-2 text-sm uppercase tracking-wide text-[#c82a54]">
                        {t("winner")}:
                      </div>
                      <div className="text-lg font-semibold text-white mt-1">
                        <UsernameDisplay
                          address={winnerSummaryQuery.data.winnerAddress}
                          className="text-lg"
                        />
                      </div>
                      <div className="text-sm text-muted-foreground mt-2">
                        {t("grandPrize")}:{" "}
                        {(() => {
                          try {
                            return `${Number(formatUnits(winnerSummaryQuery.data.grandPrizeWei, 18)).toFixed(2)} SOF`;
                          } catch {
                            return "0.00 SOF";
                          }
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Bonding Curve UI */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                {(() => {
                  if (!chainNow) return null;
                  const startTs = Number(cfg.startTime);
                  const preStart = Number.isFinite(startTs)
                    ? chainNow < startTs
                    : false;
                  if (preStart) return null;

                  return (
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle>Bonding Curve</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <BondingCurvePanel
                          curveSupply={curveSupply}
                          curveStep={curveStep}
                          allBondSteps={allBondSteps}
                        />
                      </CardContent>
                    </Card>
                  );
                })()}
                <Card>
                  <CardContent>
                    {(() => {
                      if (!chainNow) return null;
                      const startTs = Number(cfg.startTime);
                      const endTs = Number(cfg.endTime);
                      const preStart = Number.isFinite(startTs)
                        ? chainNow < startTs
                        : false;
                      const activeWindow =
                        statusNum === 1 &&
                        Number.isFinite(startTs) &&
                        Number.isFinite(endTs)
                          ? chainNow >= startTs && chainNow < endTs
                          : false;

                      if (preStart) return null;
                      if (!activeWindow) return null;

                      return (
                        <BuySellWidget
                          bondingCurveAddress={bc}
                          initialTab={initialTradeTab}
                          isGated={isSeasonGated}
                          isVerified={isGatingVerified}
                          onGatingRequired={(mode) => {
                            console.log("[Desktop BuySellWidget] Gating required for:", mode);
                            setPendingAction(mode);
                            setGateModalOpen(true);
                          }}
                          onTxSuccess={() => {
                            setIsRefreshing(true);
                            debouncedRefresh(250);
                            refreshPositionNow();
                            // schedule a couple of follow-ups in case indexers are lagging
                            setTimeout(() => {
                              debouncedRefresh(0);
                              refreshPositionNow();
                            }, 1500);
                            setTimeout(() => {
                              debouncedRefresh(0);
                              refreshPositionNow();
                              setIsRefreshing(false);
                            }, 4000);
                          }}
                          onNotify={(evt) => {
                            addToast(evt);
                            setIsRefreshing(true);
                            debouncedRefresh(0);
                            refreshPositionNow();
                            setTimeout(() => {
                              debouncedRefresh(0);
                              refreshPositionNow();
                            }, 1500);
                            setTimeout(() => {
                              debouncedRefresh(0);
                              refreshPositionNow();
                              setIsRefreshing(false);
                            }, 4000);
                          }}
                        />
                      );
                    })()}
                    {/* Player position display - only visible when a wallet is connected */}
                    {isConnected && (
                      <SecondaryCard
                        title={t("yourCurrentPosition")}
                        right={
                          isRefreshing ? (
                            <Badge variant="outline" className="animate-pulse">
                              {t("updating")}
                            </Badge>
                          ) : null
                        }
                      >
                        {localPosition ? (
                          <div className="space-y-1">
                            <div>
                              <span className="text-[#c82a54]">
                                {t("tickets")}:
                              </span>{" "}
                              <span className="font-mono">
                                {localPosition.tickets.toString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#c82a54]">
                                {t("winProbability")}:
                              </span>{" "}
                              <span className="font-mono">
                                {(() => {
                                  try {
                                    const bps = Number(localPosition.probBps);
                                    return `${(bps / 100).toFixed(2)}%`;
                                  } catch {
                                    return "0.00%";
                                  }
                                })()}
                              </span>
                            </div>
                            <div className="text-xs text-[#f9d6de]">
                              {t("totalTicketsAtSnapshot")}:{" "}
                              <span className="font-mono">
                                {localPosition.total.toString()}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            No position yet.
                          </span>
                        )}
                      </SecondaryCard>
                    )}
                    {/* Toasts container (inline under position) */}
                    {toasts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {toasts.map((t) => (
                          <div
                            key={t.id}
                            className="p-3 rounded-md border border-[#353e34] bg-[#130013] shadow"
                          >
                            <div className="text-sm font-medium mb-1">
                              {t.message}
                            </div>
                            {t.hash && (
                              <div className="text-xs flex items-center gap-2">
                                <ExplorerLink
                                  value={t.hash}
                                  type="tx"
                                  text="View Transaction"
                                  className="underline text-[#c82a54] font-mono break-all"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>{t("activityAndDetails")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                      <TabsTrigger value="token-info">
                        {t("tokenInfo")}
                      </TabsTrigger>
                      <TabsTrigger value="transactions">
                        {t("common:transactions")}
                      </TabsTrigger>
                      <TabsTrigger value="holders">
                        {t("tokenHolders")}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="token-info">
                      <TokenInfoTab
                        bondingCurveAddress={bc}
                        seasonId={seasonIdNumber}
                        curveSupply={curveSupply}
                        allBondSteps={allBondSteps}
                        curveReserves={curveReserves}
                        seasonStatus={seasonDetailsQuery.data.status}
                        totalPrizePool={seasonDetailsQuery.data.totalPrizePool}
                        startBlock={createdBlock}
                        startTime={Number(seasonDetailsQuery.data?.config?.startTime || 0)}
                      />
                    </TabsContent>
                    <TabsContent value="transactions">
                      <TransactionsTab
                        bondingCurveAddress={bc}
                        seasonId={seasonIdNumber}
                        startBlock={createdBlock}
                        startTime={Number(seasonDetailsQuery.data?.config?.startTime || 0)}
                      />
                    </TabsContent>
                    <TabsContent value="holders">
                      <HoldersTab
                        bondingCurveAddress={bc}
                        seasonId={seasonIdNumber}
                        startBlock={createdBlock}
                        startTime={Number(seasonDetailsQuery.data?.config?.startTime || 0)}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
              <RaffleAdminControls seasonId={seasonIdNumber} />
              <TreasuryControls
                seasonId={seasonIdNumber}
                bondingCurveAddress={bc}
              />
            </>
          );
        })()}
      <PasswordGateModal
        open={gateModalOpen}
        onOpenChange={setGateModalOpen}
        seasonName={seasonDetailsQuery?.data?.config?.name || ""}
        onVerify={verifyPassword}
        onVerified={handleGateVerified}
      />
    </div>
  );
};

export default RaffleDetails;
