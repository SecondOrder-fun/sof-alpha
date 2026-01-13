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
// removed inline buy/sell form controls
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { createPublicClient, http } from "viem";
import { SOFBondingCurveAbi, ERC20Abi } from "@/utils/abis";
import { useCurveState } from "@/hooks/useCurveState";
import BondingCurvePanel from "@/components/curve/CurveGraph";
import BuySellWidget from "@/components/curve/BuySellWidget";
import TransactionsTab from "@/components/curve/TransactionsTab";
import TokenInfoTab from "@/components/curve/TokenInfoTab";
import HoldersTab from "@/components/curve/HoldersTab";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/common/Tabs";
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
  const {
    curveSupply,
    curveReserves,
    curveStep,
    /* bondStepsPreview, */ allBondSteps,
    debouncedRefresh,
  } = useCurveState(bondingCurveAddress, {
    isActive: seasonDetailsQuery?.data?.status === 1,
    pollMs: 12000,
  });
  // removed inline estimator state used by old form
  // helpers now imported from lib/curveMath

  // Subscribe to on-chain PositionUpdate events to refresh immediately
  useCurveEvents(bondingCurveAddress, {
    onPositionUpdate: () => {
      // Reason: server-side state has changed; refresh chart/supply/reserves quickly
      debouncedRefresh(0);
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
      const net = getNetworkByKey(netKey);
      if (!net?.rpcUrl) return;
      const client = createPublicClient({
        chain: {
          id: net.id,
          name: net.name,
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: net.rpcUrl },
        },
        transport: http(net.rpcUrl),
        blockTag: "latest", // Force latest block
      });
      // 1) Try the curve's public mapping playerTickets(address) first (authoritative)
      try {
        const [pt, cfg] = await Promise.all([
          client.readContract({
            address: bondingCurveAddress,
            abi: SOFBondingCurveAbi,
            functionName: "playerTickets",
            args: [address],
          }),
          client.readContract({
            address: bondingCurveAddress,
            abi: SOFBondingCurveAbi,
            functionName: "curveConfig",
            args: [],
          }),
        ]);
        const tickets = BigInt(pt ?? 0n);
        const total = BigInt(cfg?.[0] ?? cfg?.totalSupply ?? 0n);
        const probBps = total > 0n ? Number((tickets * 10000n) / total) : 0;
        console.log("🎯 Primary method result:", { tickets, total, probBps });
        setLocalPosition({ tickets, probBps, total });
        return;
      } catch (error) {
        console.log("⚠️ Primary method failed, trying fallback:", error);
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
            abi: SOFBondingCurveAbi,
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
          abi: ERC20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        client.readContract({
          address: tokenAddress,
          abi: ERC20Abi,
          functionName: "totalSupply",
          args: [],
        }),
      ]);
      const tickets = BigInt(bal ?? 0n);
      const total = BigInt(supply ?? 0n);
      const probBps = total > 0n ? Number((tickets * 10000n) / total) : 0;
      console.log("🔄 Fallback ERC20 method result:", {
        tickets,
        total,
        probBps,
      });
      setLocalPosition({ tickets, probBps, total });
    } catch (err) {
      console.log("❌ Fallback method also failed:", err);
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
    const net = getNetworkByKey(netKey);
    const client = createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
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
    setSheetMode("buy");
    setSheetOpen(true);
  };

  const handleSell = () => {
    setSheetMode("sell");
    setSheetOpen(true);
  };

  // Mobile view for Farcaster Mini App and Base App
  if (isMobile && seasonDetailsQuery.data?.config) {
    const cfg = seasonDetailsQuery.data.config;
    const totalPrizePool = curveReserves || 0n;
    const maxSupply = BigInt(
      cfg?.maxSupply ||
        allBondSteps?.[allBondSteps.length - 1]?.cumulativeSupply ||
        0
    );

    return (
      <>
        <MobileRaffleDetail
          seasonId={seasonIdNumber}
          seasonConfig={cfg}
          curveSupply={curveSupply}
          maxSupply={maxSupply}
          curveStep={curveStep}
          localPosition={localPosition}
          totalPrizePool={totalPrizePool}
          onBuy={handleBuy}
          onSell={handleSell}
        />
        <BuySellSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          mode={sheetMode}
          seasonId={seasonIdNumber}
          bondingCurveAddress={bondingCurveAddress}
          maxSellable={localPosition?.tickets || 0n}
          onSuccess={async ({ mode, quantity, seasonId }) => {
            console.log("🔄 onSuccess callback:", { mode, quantity, seasonId });
            setSheetOpen(false);
            await refreshPositionNow();
            debouncedRefresh(0);
            console.log("✅ onSuccess callback completed");
          }}
          onNotify={(evt) => {
            addToast(evt);
            setIsRefreshing(true);
            debouncedRefresh(0);
            refreshPositionNow();
          }}
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
                {seasonDetailsQuery.data.status === 1 && (
                  <span className="flex items-center gap-1">
                    <span className="text-[#c82a54]">{t("endsIn")}:</span>
                    <CountdownTimer
                      targetTimestamp={Number(cfg.endTime)}
                      compact
                      className="text-white"
                    />
                  </span>
                )}
              </div>

              {(() => {
                const st = seasonDetailsQuery.data.status;
                const startTs = Number(cfg.startTime);
                const endTs = Number(cfg.endTime);
                if (chainNow && st === 0) {
                  if (chainNow >= startTs && chainNow < endTs) {
                    return (
                      <p className="px-6 text-sm text-muted-foreground">
                        Window open on-chain, awaiting admin Start.
                      </p>
                    );
                  }
                  if (chainNow >= endTs) {
                    return (
                      <p className="px-6 text-sm text-muted-foreground">
                        Window ended on-chain, awaiting admin End.
                      </p>
                    );
                  }
                }
                return null;
              })()}

              {/* Bonding Curve UI */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
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
                <Card>
                  <CardContent>
                    <BuySellWidget
                      bondingCurveAddress={bc}
                      initialTab={initialTradeTab}
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
                      />
                    </TabsContent>
                    <TabsContent value="transactions">
                      <TransactionsTab
                        bondingCurveAddress={bc}
                        seasonId={seasonIdNumber}
                      />
                    </TabsContent>
                    <TabsContent value="holders">
                      <HoldersTab
                        bondingCurveAddress={bc}
                        seasonId={seasonIdNumber}
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
    </div>
  );
};

export default RaffleDetails;
