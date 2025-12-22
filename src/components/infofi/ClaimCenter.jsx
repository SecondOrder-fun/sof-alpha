// src/components/infofi/ClaimCenter.jsx
import PropTypes from "prop-types";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAccount, useWatchContractEvent } from "wagmi";
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
import { readFpmmPosition } from "@/services/onchainInfoFi";
import {
  getPrizeDistributor,
  getSeasonPayouts,
  isConsolationClaimed,
  isSeasonParticipant,
} from "@/services/onchainRaffleDistributor";
import { executeClaim } from "@/services/claimService";
import PrizeDistributorAbi from "@/contracts/abis/RafflePrizeDistributor.json";
import { useToast } from "@/hooks/useToast";
// CSMM claims removed - FPMM claims will be implemented separately
import { formatUnits } from "viem";

/**
 * Parse claim errors into user-friendly messages
 * @param {Error} error - The error from the claim transaction
 * @returns {string} - User-friendly error message
 */
function parseClaimError(error) {
  const msg = error?.message || error?.toString() || "Unknown error";

  // Common contract revert reasons
  if (msg.includes("already claimed") || msg.includes("AlreadyClaimed")) {
    return "This prize has already been claimed.";
  }
  if (msg.includes("not eligible") || msg.includes("NotEligible")) {
    return "You are not eligible to claim this prize.";
  }
  if (msg.includes("not finalized") || msg.includes("SeasonNotFinalized")) {
    return "The season has not been finalized yet. Please wait for the raffle to complete.";
  }
  if (msg.includes("not funded") || msg.includes("NotFunded")) {
    return "The prize pool has not been funded yet.";
  }
  if (msg.includes("User rejected") || msg.includes("user rejected")) {
    return "Transaction was cancelled.";
  }
  if (msg.includes("insufficient funds")) {
    return "Insufficient funds for gas fees.";
  }

  // Truncate long technical errors
  if (msg.length > 150) {
    return msg.substring(0, 150) + "...";
  }

  return msg;
}

/**
 * ClaimCenter
 * Unified interface for claiming both InfoFi market winnings and raffle prizes.
 * Organized into discrete sections for clarity.
 */
const ClaimCenter = ({ address, title, description }) => {
  const { t } = useTranslation(["market", "raffle", "common"]);
  const netKey = getStoredNetworkKey();
  const qc = useQueryClient();
  const [tabValue, setTabValue] = useState("raffles");
  const allSeasonsQuery = useAllSeasons();
  const { address: connectedAddress } = useAccount();
  const { toast } = useToast();

  // Track pending and successful claims by unique key
  // Key format: "raffle-grand-{seasonId}", "raffle-consolation-{seasonId}", "infofi-{marketId}-{prediction}", "fpmm-{seasonId}-{player}"
  const [pendingClaims, setPendingClaims] = useState(new Set());
  const [successfulClaims, setSuccessfulClaims] = useState(new Set());

  // Helper to generate claim keys
  const getClaimKey = (type, params) => {
    switch (type) {
      case "raffle-grand":
        return `raffle-grand-${params.seasonId}`;
      case "raffle-consolation":
        return `raffle-consolation-${params.seasonId}`;
      case "infofi":
        return `infofi-${params.marketId}-${params.prediction}`;
      case "fpmm":
        return `fpmm-${params.seasonId}-${params.player}`;
      default:
        return `unknown-${JSON.stringify(params)}`;
    }
  };

  // InfoFi Market Claims - fetch from backend API which has correct data
  const API_BASE = import.meta.env.VITE_API_BASE_URL;
  const discovery = useQuery({
    queryKey: ["claimcenter_discovery", netKey],
    queryFn: async () => {
      // Fetch settled markets from backend API
      const response = await fetch(`${API_BASE}/infofi/markets?isActive=false`);
      if (!response.ok) {
        throw new Error(`Failed to fetch markets: ${response.status}`);
      }
      const data = await response.json();
      // Flatten markets from all seasons into a single array with player info
      const allMarkets = [];
      for (const [seasonId, markets] of Object.entries(data.markets || {})) {
        for (const m of markets) {
          allMarkets.push({
            id: String(m.id),
            seasonId: Number(seasonId),
            raffle_id: Number(seasonId),
            player: m.player_address,
            contractAddress: m.contract_address,
            isSettled: m.is_settled,
            winningOutcome: m.winning_outcome,
          });
        }
      }
      return allMarkets;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
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
      // Fetch user positions from backend API instead of making RPC calls
      const response = await fetch(`${API_BASE}/infofi/positions/${address}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch positions: ${response.status}`);
      }
      const data = await response.json();
      const positions = data.positions || [];

      // Filter for claimable positions (has payout and not claimed)
      const out = [];
      for (const pos of positions) {
        // Find the corresponding market from discovery to get contract address
        const market = discovery.data?.find(
          (m) => String(m.id) === String(pos.market_id)
        );
        if (!market || !market.contractAddress) continue;

        // Only include positions with payouts that haven't been claimed
        if (pos.payout && parseFloat(pos.payout) > 0 && !pos.is_claimed) {
          out.push({
            seasonId: Number(pos.season_id || market.seasonId),
            marketId: String(pos.market_id),
            prediction: pos.prediction === true || pos.prediction === "true",
            payout: BigInt(Math.floor(parseFloat(pos.payout) * 1e18)), // Convert to wei
            contractAddress: market.contractAddress,
            type: "infofi",
          });
        }
      }
      return out;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
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
      // Only check settled markets from discovery data
      const settledMarkets = (discovery.data || []).filter(
        (m) => m.isSettled && m.player
      );

      for (const market of settledMarkets) {
        const { seasonId, player, winningOutcome, contractAddress } = market;
        try {
          // Check if user has YES or NO positions
          // Pass contract address from database to avoid ENV lookup
          const yesPosition = await readFpmmPosition({
            seasonId,
            player,
            account: address,
            prediction: true,
            networkKey: netKey,
            fpmmAddress: contractAddress,
          });

          const noPosition = await readFpmmPosition({
            seasonId,
            player,
            account: address,
            prediction: false,
            networkKey: netKey,
            fpmmAddress: contractAddress,
          });

          // Only add claimable positions (winning side has value)
          // winningOutcome=true means YES wins, winningOutcome=false means NO wins
          const hasClaimableYes =
            winningOutcome === true && yesPosition.amount > 0n;
          const hasClaimableNo =
            winningOutcome === false && noPosition.amount > 0n;

          if (hasClaimableYes || hasClaimableNo) {
            out.push({
              seasonId,
              player,
              yesAmount: hasClaimableYes ? yesPosition.amount : 0n,
              noAmount: hasClaimableNo ? noPosition.amount : 0n,
              winningOutcome,
              type: "fpmm",
            });
          }
        } catch (err) {
          // Skip markets that error (not created yet, etc)
          // Reason: individual season issues should not prevent other claims from showing
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
          // Invalidate raffle claims and SOF balance
          qc.invalidateQueries({ queryKey: ["raffle_claims"] });
          qc.invalidateQueries({ queryKey: ["sofBalance"] });
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

  // Watch for GrandClaimed events to update UI and SOF balance
  useWatchContractEvent({
    address: distributorQuery.data,
    abi: PrizeDistributorAbi,
    eventName: "GrandClaimed",
    enabled: Boolean(distributorQuery.data && address && connectedAddress),
    onLogs: (logs) => {
      logs.forEach((log) => {
        const winner = log?.args?.winner;
        if (
          winner &&
          address &&
          winner.toLowerCase() === address.toLowerCase()
        ) {
          // Invalidate raffle claims and SOF balance
          qc.invalidateQueries({ queryKey: ["raffle_claims"] });
          qc.invalidateQueries({ queryKey: ["sofBalance"] });
          const amount = log?.args?.amount;
          toast({
            title: t("raffle:prizeClaimed"),
            description:
              typeof amount === "bigint"
                ? `${t("raffle:grandPrize")}: ${formatUnits(amount, 18)} SOF`
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
            // First check if user actually participated in this season
            const wasParticipant = await isSeasonParticipant({
              seasonId,
              account: address,
              networkKey: netKey,
            });

            // Only show consolation if user was a participant
            if (!wasParticipant) {
              // User never participated - skip showing consolation
              continue;
            }

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
    mutationFn: async ({ marketId, prediction, contractAddress }) => {
      const claimKey = getClaimKey("infofi", { marketId, prediction });
      setPendingClaims((prev) => new Set(prev).add(claimKey));

      const result = await executeClaim({
        type: "infofi-payout",
        params: { marketId, prediction, contractAddress },
        networkKey: netKey,
      });
      if (!result.success) throw new Error(result.error);
      return { hash: result.hash, claimKey };
    },
    onSuccess: (data) => {
      const { claimKey } = data;
      setPendingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimKey);
        return next;
      });
      setSuccessfulClaims((prev) => new Set(prev).add(claimKey));
      qc.invalidateQueries({ queryKey: ["claimcenter_claimables"] });
      qc.invalidateQueries({ queryKey: ["sofBalance"] });
    },
    onError: (error, variables) => {
      const claimKey = getClaimKey("infofi", variables);
      setPendingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimKey);
        return next;
      });
      const message = parseClaimError(error);
      toast({
        title: t("common:error"),
        description: message,
        variant: "destructive",
      });
      // Refresh claims list in case the claim was already processed
      qc.invalidateQueries({ queryKey: ["claimcenter_claimables"] });
    },
  });

  const claimRaffleConsolation = useMutation({
    mutationFn: async ({ seasonId }) => {
      const claimKey = getClaimKey("raffle-consolation", { seasonId });
      setPendingClaims((prev) => new Set(prev).add(claimKey));

      if (!distributorQuery.data) {
        throw new Error("Prize distributor not configured");
      }
      const result = await executeClaim({
        type: "raffle-consolation",
        params: { seasonId },
        networkKey: netKey,
      });
      if (!result.success) throw new Error(result.error);
      return { hash: result.hash, claimKey };
    },
    onSuccess: (data) => {
      const { claimKey } = data;
      setPendingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimKey);
        return next;
      });
      setSuccessfulClaims((prev) => new Set(prev).add(claimKey));
      qc.invalidateQueries({ queryKey: ["raffle_claims"] });
      qc.invalidateQueries({ queryKey: ["sofBalance"] });
    },
    onError: (error, variables) => {
      const claimKey = getClaimKey("raffle-consolation", variables);
      setPendingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimKey);
        return next;
      });
      const message = parseClaimError(error);
      toast({
        title: t("common:error"),
        description: message,
        variant: "destructive",
      });
      // Refresh claims list in case the claim was already processed
      qc.invalidateQueries({ queryKey: ["raffle_claims"] });
    },
  });

  // FPMM claim mutation - Redeems conditional tokens after market resolution
  const claimFPMMOne = useMutation({
    mutationFn: async ({ seasonId, player }) => {
      const claimKey = getClaimKey("fpmm", { seasonId, player });
      setPendingClaims((prev) => new Set(prev).add(claimKey));

      const result = await executeClaim({
        type: "fpmm-position",
        params: { seasonId, player },
        networkKey: netKey,
      });
      if (!result.success) throw new Error(result.error);
      return { hash: result.hash, claimKey };
    },
    onSuccess: (data) => {
      const { claimKey } = data;
      setPendingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimKey);
        return next;
      });
      setSuccessfulClaims((prev) => new Set(prev).add(claimKey));
      qc.invalidateQueries({ queryKey: ["claimcenter_fpmm_claimables"] });
      qc.invalidateQueries({ queryKey: ["infoFiPositions"] });
      qc.invalidateQueries({ queryKey: ["sofBalance"] });
    },
    onError: (error, variables) => {
      const claimKey = getClaimKey("fpmm", variables);
      setPendingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimKey);
        return next;
      });
      const message = parseClaimError(error);
      toast({
        title: t("common:error"),
        description: message,
        variant: "destructive",
      });
      // Refresh claims list in case the claim was already processed
      qc.invalidateQueries({ queryKey: ["claimcenter_fpmm_claimables"] });
    },
  });

  const claimRaffleGrand = useMutation({
    mutationFn: async ({ seasonId }) => {
      const claimKey = getClaimKey("raffle-grand", { seasonId });
      setPendingClaims((prev) => new Set(prev).add(claimKey));

      const result = await executeClaim({
        type: "raffle-grand",
        params: { seasonId },
        networkKey: netKey,
      });
      if (!result.success) throw new Error(result.error);
      return { hash: result.hash, claimKey };
    },
    onSuccess: (data) => {
      const { claimKey } = data;
      setPendingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimKey);
        return next;
      });
      setSuccessfulClaims((prev) => new Set(prev).add(claimKey));
      qc.invalidateQueries({ queryKey: ["raffle_claims"] });
      qc.invalidateQueries({ queryKey: ["sofBalance"] });
    },
    onError: (error, variables) => {
      const claimKey = getClaimKey("raffle-grand", variables);
      setPendingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimKey);
        return next;
      });
      const message = parseClaimError(error);
      toast({
        title: t("common:error"),
        description: message,
        variant: "destructive",
      });
      // Refresh claims list in case the claim was already processed
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
              <TabsTrigger value="raffles">Raffle Prizes</TabsTrigger>
              <TabsTrigger value="markets">Prediction Markets</TabsTrigger>
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
                                const fpmmClaimKey = getClaimKey("fpmm", {
                                  seasonId: r.seasonId,
                                  player: r.player,
                                });
                                const isFpmmPending =
                                  pendingClaims.has(fpmmClaimKey);
                                const isFpmmSuccessful =
                                  successfulClaims.has(fpmmClaimKey);

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
                                    {isFpmmSuccessful ? (
                                      <span className="text-sm text-green-600 font-medium">
                                        ✓{" "}
                                        {t("transactions:confirmed", {
                                          defaultValue: "Claimed",
                                        })}
                                      </span>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        onClick={() =>
                                          claimFPMMOne.mutate({
                                            seasonId: r.seasonId,
                                            player: r.player,
                                          })
                                        }
                                        disabled={isFpmmPending}
                                      >
                                        {isFpmmPending
                                          ? t("transactions:claimInProgress", {
                                              defaultValue: "Claiming...",
                                            })
                                          : t("common:redeem")}
                                      </Button>
                                    )}
                                  </div>
                                );
                              } else {
                                // Old InfoFi claim
                                const infofiClaimKey = getClaimKey("infofi", {
                                  marketId: r.marketId,
                                  prediction: r.prediction,
                                });
                                const isInfofiPending =
                                  pendingClaims.has(infofiClaimKey);
                                const isInfofiSuccessful =
                                  successfulClaims.has(infofiClaimKey);

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
                                    {isInfofiSuccessful ? (
                                      <span className="text-sm text-green-600 font-medium">
                                        ✓{" "}
                                        {t("transactions:confirmed", {
                                          defaultValue: "Claimed",
                                        })}
                                      </span>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        onClick={() =>
                                          claimInfoFiOne.mutate({
                                            marketId: r.marketId,
                                            prediction: r.prediction,
                                            contractAddress: r.contractAddress,
                                          })
                                        }
                                        disabled={isInfofiPending}
                                      >
                                        {isInfofiPending
                                          ? t("transactions:claimInProgress", {
                                              defaultValue: "Claiming...",
                                            })
                                          : t("common:claim")}
                                      </Button>
                                    )}
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
                      const claimKey = getClaimKey(
                        isGrand ? "raffle-grand" : "raffle-consolation",
                        { seasonId: row.seasonId }
                      );
                      const isThisPending = pendingClaims.has(claimKey);
                      const isThisSuccessful = successfulClaims.has(claimKey);

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
                            {isThisSuccessful ? (
                              <p className="text-sm text-green-600 font-medium text-center py-2">
                                ✓{" "}
                                {t("transactions:confirmed", {
                                  defaultValue: "Claim Successful",
                                })}
                              </p>
                            ) : (
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
                                disabled={isThisPending}
                                className="w-full"
                              >
                                {isThisPending
                                  ? t("transactions:claimInProgress", {
                                      defaultValue: "Claim in Progress...",
                                    })
                                  : t("raffle:claimPrize")}
                              </Button>
                            )}
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
