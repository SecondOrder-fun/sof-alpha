// src/routes/AccountPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useAccount, useWatchContractEvent } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, formatUnits } from "viem";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { getContractAddresses } from "@/config/contracts";
import { RafflePrizeDistributorAbi as PrizeDistributorAbi, ERC20Abi, SOFBondingCurveAbi, RaffleAbi } from "@/utils/abis";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import ClaimCenter from "@/components/infofi/ClaimCenter";
import { ClaimPrizeWidget } from "@/components/prizes/ClaimPrizeWidget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion } from "@/components/ui/accordion";
import RaffleHoldingRow from "@/components/raffle/RaffleHoldingRow";
import {
  Carousel,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { getPrizeDistributor } from "@/services/onchainRaffleDistributor";
import useIsMobile from "@/hooks/useIsMobile";
import MobilePortfolio from "@/components/mobile/MobilePortfolio";
import InfoFiPositionsTab from "@/components/account/InfoFiPositionsTab";
import { SOFTransactionHistory } from "@/components/user/SOFTransactionHistory";
import { SponsorStakingCard } from "@/components/sponsor/SponsorStakingCard";

const AccountPage = () => {
  const isMobile = useIsMobile();

  // Mobile view - render mobile component
  if (isMobile) {
    return <MobilePortfolio />;
  }

  // Desktop view continues below
  return <DesktopAccountPage />;
};

const DesktopAccountPage = () => {
  const { address, isConnected } = useAccount();
  const { t } = useTranslation(["account", "common"]);

  // Build viem public client for current network
  const [client, setClient] = useState(null);
  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const contracts = getContractAddresses(netKey);

  useEffect(() => {
    const c = createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
    setClient(c);
  }, [net.id, net.name, net.rpcUrl]);

  // Fetch all seasons (filtered for valid configs in hook)
  const allSeasonsQuery = useAllSeasons();

  // SOF balance query
  const sofBalanceQuery = useQuery({
    queryKey: ["sofBalance", netKey, contracts.SOF, address],
    enabled: isConnected && !!client && !!contracts.SOF && !!address,
    queryFn: async () => {
      const bal = await client.readContract({
        address: contracts.SOF,
        abi: ERC20Abi.abi,
        functionName: "balanceOf",
        args: [address],
      });
      return bal; // BigInt
    },
    staleTime: 15_000,
  });

  // When a ConsolationClaimed event is emitted for the connected user,
  // refresh their SOF balance so the My Account view stays in sync.
  useWatchContractEvent({
    address: contracts.PRIZE_DISTRIBUTOR,
    abi: PrizeDistributorAbi,
    eventName: "ConsolationClaimed",
    enabled: Boolean(isConnected && address && contracts.PRIZE_DISTRIBUTOR),
    onLogs: (logs) => {
      logs.forEach((log) => {
        const participant = log?.args?.participant || log?.args?.account;
        if (
          participant &&
          address &&
          participant.toLowerCase() === address.toLowerCase()
        ) {
          sofBalanceQuery.refetch?.();
        }
      });
    },
  });

  // Helper to safely format BigInt by decimals
  const fmt = (v, decimals) => {
    try {
      return formatUnits(v ?? 0n, decimals);
    } catch {
      return "0";
    }
  };

  // (propTypes defined at bottom to avoid temporal dead zone)

  // For each season, resolve raffleToken from the bonding curve, then read balanceOf
  const seasons = allSeasonsQuery.data || [];
  const seasonBalancesQuery = useQuery({
    queryKey: [
      "raffleTokenBalances",
      netKey,
      address,
      seasons.map((s) => s.id).join(","),
    ],
    enabled: isConnected && !!client && !!address && seasons.length > 0,
    queryFn: async () => {
      const results = [];
      for (const s of seasons) {
        const curveAddr = s?.config?.bondingCurve;
        if (!curveAddr) continue;
        try {
          const raffleTokenAddr = await client.readContract({
            address: curveAddr,
            abi: SOFBondingCurveAbi,
            functionName: "raffleToken",
            args: [],
          });
          // Read user balance in raffle token
          const [decimals, bal] = await Promise.all([
            client.readContract({
              address: raffleTokenAddr,
              abi: ERC20Abi.abi,
              functionName: "decimals",
              args: [],
            }),
            client.readContract({
              address: raffleTokenAddr,
              abi: ERC20Abi.abi,
              functionName: "balanceOf",
              args: [address],
            }),
          ]);
          // Only include raffles where user balance > 0
          if ((bal ?? 0n) > 0n) {
            results.push({
              seasonId: s.id,
              name: s?.config?.name,
              token: raffleTokenAddr,
              balance: bal,
              decimals,
            });
          }
        } catch (e) {
          // Skip problematic season gracefully
        }
      }
      return results;
    },
    staleTime: 15_000,
  });

  // Winning seasons for Completed Season Prizes carousel
  const winningSeasonsQuery = useQuery({
    queryKey: [
      "winningSeasons",
      netKey,
      address,
      seasons.map((s) => s.id).join(","),
    ],
    enabled: isConnected && !!client && !!address && seasons.length > 0,
    queryFn: async () => {
      // Discover prize distributor address (service first, then on-chain RAFFLE fallback)
      let distributorAddress;
      try {
        distributorAddress = await getPrizeDistributor({
          networkKey: netKey,
        });
      } catch {
        distributorAddress = undefined;
      }

      if (!distributorAddress && contracts.RAFFLE) {
        try {
          distributorAddress = await client.readContract({
            address: contracts.RAFFLE,
            abi: RaffleAbi,
            functionName: "prizeDistributor",
            args: [],
          });
        } catch {
          distributorAddress = undefined;
        }
      }

      if (
        !distributorAddress ||
        distributorAddress === "0x0000000000000000000000000000000000000000"
      ) {
        return [];
      }

      const lowerAddr = address?.toLowerCase();
      const checks = await Promise.all(
        seasons.map(async (s) => {
          try {
            const seasonData = await client.readContract({
              address: distributorAddress,
              abi: PrizeDistributorAbi,
              functionName: "getSeason",
              args: [BigInt(s.id)],
            });
            const gw = seasonData?.grandWinner;
            if (
              gw &&
              typeof gw === "string" &&
              lowerAddr &&
              gw.toLowerCase() === lowerAddr
            ) {
              return s;
            }
          } catch {
            // ignore failing season
          }
          return null;
        })
      );

      return checks.filter(Boolean);
    },
    staleTime: 15_000,
  });

  const winningSeasons = winningSeasonsQuery.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t("account:myAccount")}</h1>

      {/* Completed Season Prizes – carousel of winning seasons only */}
      {Array.isArray(allSeasonsQuery.data) && winningSeasons.length > 0 && (
        <div className="mb-4 flex flex-col items-center w-full">
          <Carousel className="w-full max-w-md">
            {winningSeasons.length > 1 && <CarouselPrevious />}
            {winningSeasons.length > 1 && <CarouselNext />}
            {winningSeasons.map((s) => (
              <CarouselItem key={`claim-${String(s.id)}`}>
                <ClaimPrizeWidget seasonId={s.id} />
              </CarouselItem>
            ))}
          </Carousel>
        </div>
      )}

      {/* When not connected, show a single Account Information card with guidance */}
      {!isConnected && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t("account:profile")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{t("account:connectWalletToViewAccount")}</p>
          </CardContent>
        </Card>
      )}

      {/* When connected, show Balances card */}
      {isConnected && (
        <div className="mb-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("account:balance")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="sof" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="sof">SOF Holdings</TabsTrigger>
                  <TabsTrigger value="raffle">
                    {t("account:raffleHoldings")}
                  </TabsTrigger>
                  <TabsTrigger value="infofi">InfoFi Positions</TabsTrigger>
                </TabsList>

                <TabsContent value="sof" className="mt-4">
                  <SOFTransactionHistory address={address} embedded />
                </TabsContent>

                <TabsContent value="raffle" className="mt-4">
                  {seasonBalancesQuery.isLoading && (
                    <p className="text-muted-foreground">
                      {t("common:loading")}
                    </p>
                  )}
                  {seasonBalancesQuery.error && (
                    <p className="text-red-500">
                      {t("account:errorLoadingTicketBalances")}
                    </p>
                  )}
                  {!seasonBalancesQuery.isLoading &&
                    !seasonBalancesQuery.error && (
                      <div className="h-80 overflow-y-auto overflow-x-hidden pr-1">
                        {(seasonBalancesQuery.data || []).length === 0 && (
                          <p className="text-muted-foreground">
                            {t("account:noTicketBalances")}
                          </p>
                        )}
                        {(seasonBalancesQuery.data || []).length > 0 && (
                          <Accordion type="multiple" className="space-y-2">
                            {(seasonBalancesQuery.data || [])
                              .slice()
                              .sort(
                                (a, b) =>
                                  Number(b.seasonId) - Number(a.seasonId)
                              )
                              .map((row) => (
                                <RaffleHoldingRow
                                  key={row.seasonId}
                                  row={row}
                                  address={address}
                                  showViewLink={false}
                                />
                              ))}
                          </Accordion>
                        )}
                      </div>
                    )}
                </TabsContent>

                <TabsContent value="infofi" className="mt-4">
                  <InfoFiPositionsTab address={address} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sponsor Staking */}
      {isConnected && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <SponsorStakingCard />
        </div>
      )}

      {/* Claims */}
      <ClaimCenter address={address} />
    </div>
  );
};

export default AccountPage;
