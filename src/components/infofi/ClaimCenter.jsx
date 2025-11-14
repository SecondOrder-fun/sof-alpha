// src/components/infofi/ClaimCenter.jsx
import PropTypes from "prop-types";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAccount, useWatchContractEvent, useWriteContract } from "wagmi";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/common/Tabs";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import {
  enumerateAllMarkets,
  readBetFull,
  claimPayoutTx,
  redeemPositionTx,
  readFpmmPosition,
} from "@/services/onchainInfoFi";
import {
  getPrizeDistributor,
  getSeasonPayouts,
  claimGrand,
  claimConsolation,
  isConsolationClaimed,
} from "@/services/onchainRaffleDistributor";
import PrizeDistributorAbi from "@/contracts/abis/RafflePrizeDistributor.json";
import { useToast } from "@/hooks/useToast";
// CSMM claims removed - FPMM claims will be implemented separately
import { formatUnits } from "viem";

/**
 * ClaimCenter
 * Unified interface for claiming both InfoFi market winnings and raffle prizes.
 * Organized into discrete sections for clarity.
 */
const ClaimCenter = ({ address, title, description }) => {
  const { t } = useTranslation(["market", "raffle", "common"]);
  const netKey = getStoredNetworkKey();
  const qc = useQueryClient();
  const [tabValue, setTabValue] = useState("markets");
  const allSeasonsQuery = useAllSeasons();
  const { address: connectedAddress } = useAccount();
  const { writeContractAsync: writeRaffleClaim } = useWriteContract();
  const { toast } = useToast();

  // InfoFi Market Claims
  const discovery = useQuery({
    queryKey: ["claimcenter_discovery", netKey],
    queryFn: async () => enumerateAllMarkets({ networkKey: netKey }),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const claimsQuery = useQuery({
    queryKey: [
      "claimcenter_claimables",
      address,
      netKey,
      (discovery.data || []).length,
    ],
    enabled: !!address && Array.isArray(discovery.data),
    queryFn: async () => {
      const out = [];
      for (const m of discovery.data || []) {
        const marketId = m.id;
        const yes = await readBetFull({
          marketId,
          account: address,
          prediction: true,
          networkKey: netKey,
        });
        const no = await readBetFull({
          marketId,
          account: address,
          prediction: false,
          networkKey: netKey,
        });
        if (yes.amount > 0n && yes.payout > 0n && !yes.claimed)
          out.push({
            seasonId: Number(m.seasonId),
            marketId,
            prediction: true,
            payout: yes.payout,
            type: "infofi",
          });
        if (no.amount > 0n && no.payout > 0n && !no.claimed)
          out.push({
            seasonId: Number(m.seasonId),
            marketId,
            prediction: false,
            payout: no.payout,
            type: "infofi",
          });
      }
      return out;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // FPMM Claims (FPMM-based prediction markets with CTF redemption)
  const fpmmClaimsQuery = useQuery({
    queryKey: [
      "claimcenter_fpmm_claimables",
      address,
      netKey,
      (discovery.data || []).length,
    ],
    enabled: !!address && Array.isArray(discovery.data),
    queryFn: async () => {
      const out = [];
      // Get unique seasons from discovered markets
      const seasons = new Set(
        (discovery.data || []).map((m) => Number(m.seasonId))
      );

      for (const seasonId of seasons) {
        // Get all players in this season (from discovery data)
        const playersInSeason = new Set(
          (discovery.data || [])
            .filter((m) => Number(m.seasonId) === seasonId)
            .map((m) => m.player)
            .filter(Boolean)
        );

        // Check each player's market for user's positions
        for (const player of playersInSeason) {
          try {
            // Check if user has YES or NO positions
            const yesPosition = await readFpmmPosition({
              seasonId,
              player,
              account: address,
              prediction: true,
              networkKey: netKey,
            });

            const noPosition = await readFpmmPosition({
              seasonId,
              player,
              account: address,
              prediction: false,
              networkKey: netKey,
            });

            // If user has positions and market is resolved, add to claimables
            if (yesPosition.amount > 0n || noPosition.amount > 0n) {
              out.push({
                seasonId,
                player,
                yesAmount: yesPosition.amount,
                noAmount: noPosition.amount,
                type: "fpmm",
              });
            }
          } catch (err) {
            // Skip markets that error (not created yet, etc)
            console.warn(
              `Failed to check FPMM position for season ${seasonId}, player ${player}:`,
              err
            );
          }
        }
      }
      return out;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // Raffle Prize Claims
  const distributorQuery = useQuery({
    queryKey: ["rewards_distributor", netKey],
    queryFn: () => getPrizeDistributor({ networkKey: netKey }),
    staleTime: 10000,
    refetchInterval: 10000,
  });

  // Keep raffle claims in sync with on-chain state by listening for
  // ConsolationClaimed events. This ensures the UI updates even if the
  // claim was triggered from another tab or direct contract call.
  useWatchContractEvent({
    address: distributorQuery.data,
    abi: PrizeDistributorAbi,
    eventName: "ConsolationClaimed",
    enabled: Boolean(distributorQuery.data && address && connectedAddress),
    onLogs: (logs) => {
      logs.forEach((log) => {
        const participant = log?.args?.account || log?.args?.participant;
        if (
          participant &&
          address &&
          participant.toLowerCase() === address.toLowerCase()
        ) {
          qc.invalidateQueries({ queryKey: ["raffle_claims"] });
          const amount = log?.args?.amount;
          toast({
            title: t("raffle:prizeClaimed"),
            // Reason: reuse existing translation keys; if no dedicated
            // consolation string exists, fall back to a generic message.
            description:
              typeof amount === "bigint"
                ? `${t("raffle:consolationPrize")}: ${formatUnits(
                    amount,
                    18
                  )} SOF`
                : t("transactions:confirmed"),
            variant: "success",
          });
        }
      });
    },
  });

  const raffleClaimsQuery = useQuery({
    queryKey: [
      "raffle_claims",
      address,
      netKey,
      (allSeasonsQuery.data || []).map((s) => s.id).join(","),
    ],
    enabled:
      !!address &&
      !!distributorQuery.data &&
      !!allSeasonsQuery.data &&
      (allSeasonsQuery.data || []).length > 0,
    queryFn: async () => {
      const out = [];
      const seasons = allSeasonsQuery.data || [];

      for (const season of seasons) {
        const seasonId = Number(season.id);
        const payout = await getSeasonPayouts({
          seasonId,
          networkKey: netKey,
        }).catch(() => null);
        if (!payout || !payout.data?.funded) continue;

        const grandWinner = payout.data.grandWinner;
        const isGrandWinner = Boolean(
          grandWinner &&
            address &&
            grandWinner.toLowerCase() === address.toLowerCase()
        );

        // Grand prize claim for the single winner
        if (isGrandWinner && !payout.data.grandClaimed) {
          out.push({
            seasonId,
            type: "raffle-grand",
            amount: payout.data.grandAmount,
            claimed: payout.data.grandClaimed,
          });
          // Grand winners are not eligible for consolation
          continue;
        }

        // Consolation prize claims for non-winning participants
        try {
          const totalParticipants = BigInt(payout.data.totalParticipants ?? 0n);
          const consolationAmount = BigInt(payout.data.consolationAmount ?? 0n);

          if (!address || totalParticipants <= 1n || consolationAmount === 0n) {
            // No consolation pool or not enough participants
            // Reason: consolation is only meaningful when there are losers
            // and a non-zero consolationAmount configured.
          } else {
            const alreadyClaimed = await isConsolationClaimed({
              seasonId,
              account: address,
              networkKey: netKey,
            });
            if (!alreadyClaimed && !isGrandWinner) {
              const loserCount = totalParticipants - 1n;
              if (loserCount > 0n) {
                const perLoser = consolationAmount / loserCount;
                if (perLoser > 0n) {
                  out.push({
                    seasonId,
                    type: "raffle-consolation",
                    amount: perLoser,
                    claimed: false,
                  });
                }
              }
            }
          }
        } catch (err) {
          // Swallow errors for consolation checks so they don't break the entire claim view
          // Reason: individual season issues should not prevent other claims from showing.
          // eslint-disable-next-line no-console
          console.warn(
            "Failed to evaluate consolation eligibility for season",
            seasonId,
            err
          );
        }
      }
      return out;
    },
    staleTime: 10000,
    refetchInterval: 10000,
  });

  // Mutations for claiming
  const claimInfoFiOne = useMutation({
    mutationFn: async ({ marketId, prediction }) =>
      claimPayoutTx({ marketId, prediction, networkKey: netKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["claimcenter_claimables"] });
    },
  });

  const claimRaffleConsolation = useMutation({
    mutationFn: async ({ seasonId }) => {
      if (!distributorQuery.data) {
        throw new Error("Prize distributor not configured");
      }
      return writeRaffleClaim({
        address: distributorQuery.data,
        abi: PrizeDistributorAbi,
        functionName: "claimConsolation",
        args: [BigInt(seasonId)],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raffle_claims"] });
    },
    onError: (error) => {
      toast({
        title: t("common:error"),
        description: error?.message || "Failed to claim consolation prize",
        variant: "destructive",
      });
    },
  });

  // FPMM claim mutation - Redeems conditional tokens after market resolution
  const claimFPMMOne = useMutation({
    mutationFn: async ({ seasonId, player }) => {
      return redeemPositionTx({ seasonId, player, networkKey: netKey });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["claimcenter_fpmm_claimables"] });
      qc.invalidateQueries({ queryKey: ["infoFiPositions"] });
    },
  });

  const claimRaffleGrand = useMutation({
    mutationFn: ({ seasonId }) => claimGrand({ seasonId, networkKey: netKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raffle_claims"] });
    },
  });

  // Merge and group all InfoFi claims (legacy + FPMM) by season
  const allInfoFiClaims = [
    ...(claimsQuery.data || []),
    ...(fpmmClaimsQuery.data || []),
  ];

  const infoFiGrouped = (() => {
    const out = new Map();
    for (const c of allInfoFiClaims) {
      const key = String(c.seasonId ?? "—");
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(c);
    }
    return out;
  })();

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{title || t("market:claimWinnings")}</CardTitle>
        <CardDescription>
          {description ||
            t("market:claimDescription", {
              defaultValue: "Claimable raffle prizes and market winnings.",
            })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!address && (
          <p className="text-muted-foreground">{t("errors:notConnected")}</p>
        )}
        {address && (
          <Tabs value={tabValue} onValueChange={setTabValue} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="markets">Prediction Markets</TabsTrigger>
              <TabsTrigger value="raffles">Raffle Prizes</TabsTrigger>
            </TabsList>

            {/* InfoFi Market Claims Tab */}
            <TabsContent value="markets" className="space-y-4">
              {(discovery.isLoading ||
                claimsQuery.isLoading ||
                fpmmClaimsQuery.isLoading) && (
                <p className="text-muted-foreground">{t("common:loading")}</p>
              )}
              {(claimsQuery.error || fpmmClaimsQuery.error) && (
                <p className="text-red-500">
                  {t("common:error")}:{" "}
                  {String(
                    claimsQuery.error?.message ||
                      fpmmClaimsQuery.error?.message ||
                      "Unknown error"
                  )}
                </p>
              )}
              {!claimsQuery.isLoading &&
                !fpmmClaimsQuery.isLoading &&
                !claimsQuery.error &&
                !fpmmClaimsQuery.error &&
                allInfoFiClaims.length === 0 && (
                  <p className="text-muted-foreground">
                    {t("raffle:nothingToClaim")}
                  </p>
                )}
              {!claimsQuery.isLoading &&
                !fpmmClaimsQuery.isLoading &&
                !claimsQuery.error &&
                !fpmmClaimsQuery.error &&
                allInfoFiClaims.length > 0 && (
                  <div className="space-y-3">
                    {Array.from(infoFiGrouped.entries()).map(
                      ([season, rows]) => (
                        <div key={season} className="border rounded">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                            <div className="text-sm font-medium">
                              {t("raffle:seasonNumber", { number: season })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t("common:subtotal", {
                                defaultValue: "Subtotal",
                              })}
                              :{" "}
                              <span className="font-mono">
                                {(() => {
                                  try {
                                    return formatUnits(
                                      rows.reduce((acc, r) => {
                                        const amount =
                                          r.type === "fpmm"
                                            ? r.netPayout ?? 0n
                                            : r.payout ?? 0n;
                                        return acc + amount;
                                      }, 0n),
                                      18
                                    );
                                  } catch {
                                    return "0";
                                  }
                                })()}
                              </span>{" "}
                              SOF
                            </div>
                          </div>
                          <div className="p-2 space-y-2">
                            {rows.map((r) => {
                              if (r.type === "fpmm") {
                                // FPMM claim (CTF redemption)
                                const totalAmount =
                                  (r.yesAmount ?? 0n) + (r.noAmount ?? 0n);
                                return (
                                  <div
                                    key={`fpmm-${r.player}`}
                                    className="flex items-center justify-between border rounded p-2 text-sm bg-blue-50/50"
                                  >
                                    <div className="text-xs text-muted-foreground">
                                      <span className="font-semibold text-blue-600">
                                        FPMM Market
                                      </span>{" "}
                                      • Player:{" "}
                                      <span className="font-mono">
                                        {String(r.player).slice(0, 6)}...
                                        {String(r.player).slice(-4)}
                                      </span>{" "}
                                      • YES:{" "}
                                      <span className="font-mono">
                                        {formatUnits(r.yesAmount ?? 0n, 18)}
                                      </span>{" "}
                                      • NO:{" "}
                                      <span className="font-mono">
                                        {formatUnits(r.noAmount ?? 0n, 18)}
                                      </span>{" "}
                                      • Total:{" "}
                                      <span className="font-mono">
                                        {formatUnits(totalAmount, 18)}
                                      </span>{" "}
                                      SOF
                                    </div>
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        claimFPMMOne.mutate({
                                          seasonId: r.seasonId,
                                          player: r.player,
                                        })
                                      }
                                      disabled={claimFPMMOne.isPending}
                                    >
                                      {claimFPMMOne.isPending
                                        ? t("transactions:claiming")
                                        : t("common:redeem")}
                                    </Button>
                                  </div>
                                );
                              } else {
                                // Old InfoFi claim
                                return (
                                  <div
                                    key={`${r.marketId}-${String(
                                      r.prediction
                                    )}`}
                                    className="flex items-center justify-between border rounded p-2 text-sm"
                                  >
                                    <div className="text-xs text-muted-foreground">
                                      {t("market:market")}:{" "}
                                      <span className="font-mono">
                                        {String(r.marketId)}
                                      </span>{" "}
                                      •{" "}
                                      {t("common:side", {
                                        defaultValue: "Side",
                                      })}
                                      : {r.prediction ? "YES" : "NO"} •{" "}
                                      {t("market:potentialPayout")}:{" "}
                                      <span className="font-mono">
                                        {formatUnits(r.payout ?? 0n, 18)}
                                      </span>{" "}
                                      SOF
                                    </div>
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        claimInfoFiOne.mutate({
                                          marketId: r.marketId,
                                          prediction: r.prediction,
                                        })
                                      }
                                      disabled={claimInfoFiOne.isPending}
                                    >
                                      {claimInfoFiOne.isPending
                                        ? t("transactions:claiming")
                                        : t("common:claim")}
                                    </Button>
                                  </div>
                                );
                              }
                            })}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
            </TabsContent>

            {/* Raffle Prize Claims Tab */}
            <TabsContent value="raffles" className="space-y-4">
              {raffleClaimsQuery.isLoading && (
                <p className="text-muted-foreground">{t("common:loading")}</p>
              )}
              {raffleClaimsQuery.error && (
                <p className="text-red-500">
                  {t("common:error")}:{" "}
                  {String(
                    raffleClaimsQuery.error?.message || raffleClaimsQuery.error
                  )}
                </p>
              )}
              {!raffleClaimsQuery.isLoading &&
                !raffleClaimsQuery.error &&
                (raffleClaimsQuery.data || []).length === 0 && (
                  <p className="text-muted-foreground">
                    {t("raffle:noActiveSeasons")}
                  </p>
                )}
              {!raffleClaimsQuery.isLoading &&
                !raffleClaimsQuery.error &&
                (raffleClaimsQuery.data || []).length > 0 && (
                  <div className="space-y-3">
                    {(raffleClaimsQuery.data || []).map((row) => {
                      const isGrand = row.type === "raffle-grand";
                      const labelKey = isGrand
                        ? "raffle:grandPrize"
                        : "raffle:consolationPrize";
                      const isPending = isGrand
                        ? claimRaffleGrand.isPending
                        : claimRaffleConsolation.isPending;

                      return (
                        <div
                          key={`${String(row.seasonId)}-${row.type}`}
                          className="border rounded p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">
                              {t("raffle:season")} #{String(row.seasonId)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t(labelKey)}:{" "}
                              <span className="font-mono">
                                {formatUnits(row.amount ?? 0n, 18)}
                              </span>{" "}
                              SOF
                            </div>
                          </div>
                          <div className="mt-2">
                            <Button
                              onClick={() => {
                                if (isGrand) {
                                  claimRaffleGrand.mutate({
                                    seasonId: row.seasonId,
                                  });
                                } else {
                                  claimRaffleConsolation.mutate({
                                    seasonId: row.seasonId,
                                  });
                                }
                              }}
                              disabled={isPending}
                              className="w-full"
                            >
                              {isPending
                                ? t("transactions:claiming")
                                : t("raffle:claimPrize")}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};

ClaimCenter.propTypes = {
  address: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
};

export default ClaimCenter;
