// src/routes/UserProfile.jsx
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, formatUnits } from "viem";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { getContractAddresses } from "@/config/contracts";
import ERC20Abi from "@/contracts/abis/ERC20.json";
import SOFBondingCurveAbi from "@/contracts/abis/SOFBondingCurve.json";
import PositionsPanel from "@/components/infofi/PositionsPanel";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import { useAccount } from "wagmi";
import {
  listSeasonWinnerMarkets,
  readBet,
  claimPayoutTx,
} from "@/services/onchainInfoFi";
import { Button } from "@/components/ui/button";
import { ClaimPrizeWidget } from "@/components/prizes/ClaimPrizeWidget";
import { useUsername } from "@/hooks/useUsername";
import { useUsernameContext } from "@/context/UsernameContext";
import { Badge } from "@/components/ui/badge";
import { SOFTransactionHistory } from "@/components/user/SOFTransactionHistory";
import { Accordion } from "@/components/ui/accordion";
import RaffleHoldingRow from "@/components/raffle/RaffleHoldingRow";

const UserProfile = () => {
  const { t } = useTranslation("account");
  const { address: addressParam } = useParams();
  const { address: myAddress, isConnected } = useAccount();
  const { setShowDialog } = useUsernameContext();

  // If no address param (e.g., /account route), use connected wallet address
  const address = addressParam || myAddress;

  // Fetch username for this address
  const { data: username } = useUsername(address);

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

  // Fetch all seasons
  const allSeasonsQuery = useAllSeasons();

  // SOF balance
  const sofBalanceQuery = useQuery({
    queryKey: ["sofBalanceProfile", netKey, contracts.SOF, address],
    enabled: !!client && !!contracts.SOF && !!address,
    queryFn: async () => {
      // Read decimals first; then balance, so we can format correctly and detect ABI/address issues early.
      const [decimals, bal] = await Promise.all([
        client.readContract({
          address: contracts.SOF,
          abi: ERC20Abi.abi,
          functionName: "decimals",
          args: [],
        }),
        client.readContract({
          address: contracts.SOF,
          abi: ERC20Abi.abi,
          functionName: "balanceOf",
          args: [address],
        }),
      ]);
      return { decimals: Number(decimals || 18), balance: bal ?? 0n };
    },
    staleTime: 15_000,
  });

  const fmt = (v, decimals) => {
    try {
      return formatUnits(v ?? 0n, decimals);
    } catch {
      return "0";
    }
  };

  // Raffle ticket balances across seasons for this address
  const seasons = allSeasonsQuery.data || [];
  const seasonBalancesQuery = useQuery({
    queryKey: [
      "raffleTokenBalancesProfile",
      netKey,
      address,
      seasons.map((s) => s.id).join(","),
    ],
    enabled: !!client && !!address && seasons.length > 0,
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
          /* ignore read failure per season */
        }
      }
      return results;
    },
    staleTime: 15_000,
  });

  const totalTicketsAcrossSeasons = useMemo(() => {
    try {
      const rows = seasonBalancesQuery.data || [];
      return rows.reduce((acc, row) => {
        const d = Number(row.decimals || 0);
        const base = 10n ** BigInt(d);
        const t = (row.balance ?? 0n) / base;
        return acc + Number(t);
      }, 0);
    } catch {
      return 0;
    }
  }, [seasonBalancesQuery.data]);

  // Debug logs removed for production cleanliness.

  // Determine if this is "My Account" view (no param) or viewing another user
  const isMyAccount = !addressParam;
  const pageTitle = isMyAccount ? t("myAccount") : t("userProfile");

  // Show connect wallet message if viewing /account without connection
  if (isMyAccount && !isConnected) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">{t("myAccount")}</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              {t("connectWalletToViewAccount")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {username ? (
              <>
                {username}
                {isMyAccount && (
                  <Badge variant="secondary">{t("common:you")}</Badge>
                )}
              </>
            ) : (
              pageTitle
            )}
          </h1>
          {address && (
            <p className="text-sm text-muted-foreground mt-1">
              {t("address")}: <span className="font-mono">{address}</span>
            </p>
          )}
        </div>
        {isMyAccount && (
          <Button variant="outline" onClick={() => setShowDialog(true)}>
            {username ? t("common:editUsername") : t("common:setUsername")}
          </Button>
        )}
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("sofBalanceTitle")}</CardTitle>
          <CardDescription>{t("sofBalanceDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sofBalanceQuery.isLoading ? (
            <p className="text-muted-foreground">{t("common:loading")}</p>
          ) : sofBalanceQuery.error ? (
            <div>
              <p className="text-red-500">{t("errorLoadingSofBalance")}</p>
              <p className="text-xs text-muted-foreground">
                {t("token")}:{" "}
                <span className="font-mono">{contracts.SOF || "—"}</span>
              </p>
            </div>
          ) : (
            (() => {
              const d = Number(sofBalanceQuery.data?.decimals || 18);
              const b = sofBalanceQuery.data?.balance ?? 0n;
              return <p className="text-lg">{fmt(b, d)} SOF</p>;
            })()
          )}
        </CardContent>
      </Card>

      {/* SOF Transaction History */}
      {address && <SOFTransactionHistory address={address} />}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("raffleHoldings")}</CardTitle>
          <CardDescription>
            {t("raffleHoldingsDescription")}
            {seasonBalancesQuery.isSuccess && (
              <span className="ml-2">
                {t("total")}:{" "}
                <span className="font-semibold">
                  {totalTicketsAcrossSeasons}
                </span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {seasonBalancesQuery.isLoading && (
            <p className="text-muted-foreground">{t("common:loading")}</p>
          )}
          {seasonBalancesQuery.error && (
            <p className="text-red-500">{t("errorLoadingTicketBalances")}</p>
          )}
          {!seasonBalancesQuery.isLoading && !seasonBalancesQuery.error && (
            <div className="space-y-2">
              {(seasonBalancesQuery.data || []).length === 0 && (
                <p className="text-muted-foreground">{t("noTicketBalances")}</p>
              )}
              {(seasonBalancesQuery.data || []).length > 0 && (
                <Accordion type="multiple" className="space-y-2">
                  {(seasonBalancesQuery.data || [])
                    .slice()
                    .sort((a, b) => Number(b.seasonId) - Number(a.seasonId))
                    .map((row) => (
                      <RaffleHoldingRow
                        key={row.seasonId}
                        row={row}
                        address={address}
                      />
                    ))}
                </Accordion>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <PositionsPanel address={address} seasons={allSeasonsQuery.data || []} />

      {/* Claims Panel (only visible for logged-in user viewing own profile) */}
      {myAddress &&
        myAddress.toLowerCase() === String(address).toLowerCase() && (
          <>
            <div className="my-4">
              <h2 className="text-xl font-bold mb-2">
                {t("completedSeasonPrizes")}
              </h2>
              <p className="text-sm text-muted-foreground mb-2">
                {t("completedSeasonPrizesDescription")}
              </p>
              <div className="space-y-3">
                {(seasons || []).map((s) => (
                  <ClaimPrizeWidget
                    key={`claim-profile-${String(s.id)}`}
                    seasonId={s.id}
                  />
                ))}
              </div>
            </div>
          </>
        )}
    </div>
  );
};

export default UserProfile;

// Claims panel: lists claimable InfoFi winnings and provides Claim All
const ClaimsPanel = ({ profileAddress, seasons, netKey }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const claims = [];
        for (const s of seasons || []) {
          try {
            const markets = await listSeasonWinnerMarkets({
              seasonId: s.id,
              networkKey: netKey.toUpperCase(),
            });
            for (const m of markets) {
              try {
                const yes = await readBet({
                  marketId: m.id,
                  account: profileAddress,
                  prediction: true,
                  networkKey: netKey.toUpperCase(),
                });
                const no = await readBet({
                  marketId: m.id,
                  account: profileAddress,
                  prediction: false,
                  networkKey: netKey.toUpperCase(),
                });
                // Bets struct: [prediction, amount, claimed, payout]
                const normalize = (b) => ({
                  amount: b?.amount ?? 0n,
                  claimed: Boolean(b?.claimed),
                  payout: b?.payout ?? 0n,
                });
                const y = normalize(yes);
                const n = normalize(no);
                if (y.amount > 0n && !y.claimed && y.payout > 0n) {
                  claims.push({
                    marketId: m.id,
                    seasonId: m.seasonId,
                    type: "InfoFi",
                    side: "YES",
                    payout: y.payout,
                  });
                }
                if (n.amount > 0n && !n.claimed && n.payout > 0n) {
                  claims.push({
                    marketId: m.id,
                    seasonId: m.seasonId,
                    type: "InfoFi",
                    side: "NO",
                    payout: n.payout,
                  });
                }
              } catch (_) {
                /* ignore market read failure */
              }
            }
          } catch (_) {
            /* ignore season enumeration failure */
          }
        }
        if (!cancelled) setItems(claims);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [profileAddress, seasons, netKey]);

  async function claimAll() {
    for (const it of items) {
      if (it.type === "InfoFi") {
        await claimPayoutTx({
          marketId: it.marketId,
          prediction: it.side === "YES",
          networkKey: netKey.toUpperCase(),
        });
      }
      // Raffle prize claims can be added here when ABI exposes claim
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Claims</CardTitle>
        <CardDescription>
          Claimable raffle prizes and InfoFi market winnings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="text-muted-foreground">Scanning for claims…</p>
        )}
        {!loading && items.length === 0 && (
          <p className="text-muted-foreground">
            No claimable items found right now.
          </p>
        )}
        {!loading && items.length > 0 && (
          <>
            <div className="flex justify-end mb-2">
              <Button onClick={claimAll}>Claim All</Button>
            </div>
            <div className="divide-y rounded border">
              {items.map((it) => (
                <div
                  key={`${String(it.marketId)}-${it.side}`}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div className="text-sm">
                    <div className="font-medium">
                      {it.type} — Season #{it.seasonId} — {it.side}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Market:{" "}
                      <span className="font-mono">{String(it.marketId)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground">
                      Payout:{" "}
                      <span className="font-mono">{String(it.payout)}</span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        claimPayoutTx({
                          marketId: it.marketId,
                          prediction: it.side === "YES",
                          networkKey: netKey.toUpperCase(),
                        })
                      }
                    >
                      Claim
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

ClaimsPanel.propTypes = {
  profileAddress: PropTypes.string.isRequired,
  seasons: PropTypes.array,
  netKey: PropTypes.string.isRequired,
};

// Prediction positions — on-chain aggregation across all seasons
const PredictionPositionsCard = ({ address }) => {
  const netKey = getStoredNetworkKey();
  const seasonsQry = useAllSeasons();
  const seasons = seasonsQry.data || [];

  const positionsQuery = useQuery({
    queryKey: [
      "infofiPositionsProfileOnchainAll",
      address,
      seasons.map((s) => s.id).join(","),
      netKey,
    ],
    enabled: !!address && seasons.length > 0,
    queryFn: async () => {
      const out = [];
      for (const s of seasons) {
        const seasonId = s.id;
        // eslint-disable-next-line no-await-in-loop
        const markets = await listSeasonWinnerMarkets({
          seasonId,
          networkKey: netKey,
        });
        for (const m of markets) {
          // eslint-disable-next-line no-await-in-loop
          const yes = await readBet({
            marketId: m.id,
            account: address,
            prediction: true,
            networkKey: netKey,
          });
          // eslint-disable-next-line no-await-in-loop
          const no = await readBet({
            marketId: m.id,
            account: address,
            prediction: false,
            networkKey: netKey,
          });
          const yesAmt = yes?.amount ?? 0n;
          const noAmt = no?.amount ?? 0n;
          if (yesAmt > 0n)
            out.push({
              seasonId,
              marketId: m.id,
              marketType: "Winner Prediction",
              outcome: "YES",
              amount: formatUnits(yesAmt, 18) + " SOF",
              player: m.player,
            });
          if (noAmt > 0n)
            out.push({
              seasonId,
              marketId: m.id,
              marketType: "Winner Prediction",
              outcome: "NO",
              amount: formatUnits(noAmt, 18) + " SOF",
              player: m.player,
            });
        }
      }
      return out;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Prediction Market Positions</CardTitle>
        <CardDescription>Open positions across InfoFi markets.</CardDescription>
      </CardHeader>
      <CardContent>
        {positionsQuery.isLoading && (
          <p className="text-muted-foreground">Loading positions...</p>
        )}
        {positionsQuery.error && (
          <p className="text-muted-foreground">
            {positionsQuery.error?.message?.includes("does not exist") ||
            positionsQuery.error?.message?.includes("No prediction markets")
              ? "No prediction markets available yet. Markets will be created automatically when players reach certain position thresholds."
              : `Error loading positions: ${String(
                  positionsQuery.error?.message || positionsQuery.error,
                )}`}
          </p>
        )}
        {!positionsQuery.isLoading && !positionsQuery.error && (
          <div className="space-y-2">
            {(positionsQuery.data || []).length === 0 && (
              <p className="text-muted-foreground">No open positions found.</p>
            )}
            {(positionsQuery.data || []).map((p) => (
              <div
                key={`${p.seasonId}-${p.marketId}-${p.outcome}`}
                className="border rounded p-2 text-sm"
              >
                <div className="flex justify-between">
                  <span className="font-medium">
                    {p.marketType || "Market"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    S#{p.seasonId} • ID: {p.marketId}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Outcome: {p.outcome || "—"} • Amount: {p.amount || "—"}{" "}
                  {p.player ? `• Player: ${p.player}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

PredictionPositionsCard.propTypes = {
  address: PropTypes.string,
};
