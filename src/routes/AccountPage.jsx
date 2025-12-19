// src/routes/AccountPage.jsx
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useAccount, useWatchContractEvent } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, formatUnits } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { getContractAddresses } from "@/config/contracts";
import PrizeDistributorAbi from "@/contracts/abis/RafflePrizeDistributor.json";
import ERC20Abi from "@/contracts/abis/ERC20.json";
import SOFBondingCurveAbi from "@/contracts/abis/SOFBondingCurve.json";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import ClaimCenter from "@/components/infofi/ClaimCenter";
import { ClaimPrizeWidget } from "@/components/prizes/ClaimPrizeWidget";
import {
  useUsername,
  useSetUsername,
  useCheckUsername,
} from "@/hooks/useUsername";
import { Input } from "@/components/ui/input";
import SecondaryCard from "@/components/common/SecondaryCard";
import { FiEdit2 } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RaffleHoldingRow from "@/components/raffle/RaffleHoldingRow";
import {
  Carousel,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { getPrizeDistributor } from "@/services/onchainRaffleDistributor";
import { readBet } from "@/services/onchainInfoFi";
import RaffleAbi from "@/contracts/abis/Raffle.json";

const AccountPage = () => {
  const { address, isConnected } = useAccount();
  const { data: username } = useUsername(address);
  const [isEditingUsername, setIsEditingUsername] = useState(false);

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

  const sofBalance = useMemo(
    () => fmt(sofBalanceQuery.data, 18),
    [sofBalanceQuery.data]
  );

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
      <h1 className="text-2xl font-bold mb-4">Portfolio</h1>

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
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please connect your wallet to view your account details.</p>
          </CardContent>
        </Card>
      )}

      {/* When connected, lay out Account Information and Raffle Ticket Balances side by side (30/70 split) */}
      {isConnected && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-[30%_70%] gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <SecondaryCard title="Username">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#a89e99]">
                      {username || "Not set"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingUsername(!isEditingUsername)}
                      className="p-0 text-[#c82a54] hover:text-[#e25167] active:text-[#f9d6de] bg-transparent hover:bg-transparent active:bg-transparent border-none outline-none flex items-center justify-center"
                      aria-label={
                        isEditingUsername
                          ? "Cancel username edit"
                          : "Edit username"
                      }
                      title={
                        isEditingUsername
                          ? "Cancel username edit"
                          : "Edit username"
                      }
                    >
                      <FiEdit2 />
                    </button>
                  </div>
                  {isEditingUsername && (
                    <div className="mt-3">
                      <UsernameEditor
                        address={address}
                        currentUsername={username}
                        onSuccess={() => setIsEditingUsername(false)}
                      />
                    </div>
                  )}
                </SecondaryCard>

                <SecondaryCard title="$SOF Balance">
                  {sofBalanceQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : sofBalanceQuery.error ? (
                    <p className="text-sm text-red-500">
                      Error loading SOF balance
                    </p>
                  ) : (
                    <p className="font-mono text-sm">{sofBalance} SOF</p>
                  )}
                </SecondaryCard>

                <SecondaryCard title="Address">
                  <p className="font-mono text-xs break-all">{address}</p>
                </SecondaryCard>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="raffle" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="raffle">Raffle Tickets</TabsTrigger>
                  <TabsTrigger value="infofi">InfoFi Positions</TabsTrigger>
                </TabsList>

                <TabsContent value="raffle" className="mt-4">
                  {seasonBalancesQuery.isLoading && (
                    <p className="text-muted-foreground">Loading...</p>
                  )}
                  {seasonBalancesQuery.error && (
                    <p className="text-red-500">
                      Error loading ticket balances
                    </p>
                  )}
                  {!seasonBalancesQuery.isLoading &&
                    !seasonBalancesQuery.error && (
                      <div className="h-80 overflow-y-auto overflow-x-hidden pr-1">
                        {(seasonBalancesQuery.data || []).length === 0 && (
                          <p className="text-muted-foreground">
                            No ticket balances found.
                          </p>
                        )}
                        {(seasonBalancesQuery.data || []).length > 0 && (
                          <div className="space-y-2">
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
                          </div>
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

      {/* Claims */}
      <ClaimCenter address={address} />
    </div>
  );
};
/**
 * UsernameEditor - Component for editing username
 */
const UsernameEditor = ({ address, currentUsername, onSuccess }) => {
  const [newUsername, setNewUsername] = useState(currentUsername || "");
  const setUsernameMutation = useSetUsername();
  const checkUsernameMutation = useCheckUsername(newUsername);

  const handleSave = async () => {
    if (!newUsername.trim()) {
      alert("Username cannot be empty");
      return;
    }

    if (newUsername.length < 3) {
      alert("Username must be at least 3 characters");
      return;
    }

    if (newUsername === currentUsername) {
      onSuccess();
      return;
    }

    if (checkUsernameMutation.data && !checkUsernameMutation.data.available) {
      alert("Username is already taken");
      return;
    }

    try {
      await setUsernameMutation.mutateAsync({
        address,
        username: newUsername,
      });
      onSuccess();
    } catch (error) {
      alert(`Error setting username: ${error.message}`);
    }
  };

  return (
    <div className="border rounded p-3 bg-muted/50 space-y-3">
      <div>
        <label className="text-sm font-medium">New Username</label>
        <Input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Enter new username"
          disabled={setUsernameMutation.isPending}
        />
        {newUsername &&
          newUsername.length >= 3 &&
          checkUsernameMutation.data && (
            <p
              className={`text-xs mt-1 ${
                checkUsernameMutation.data.available
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {checkUsernameMutation.data.available
                ? "✓ Available"
                : "✗ Already taken"}
            </p>
          )}
      </div>
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={setUsernameMutation.isPending || !newUsername.trim()}
          size="sm"
        >
          {setUsernameMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
};

const InfoFiPositionsTab = ({ address }) => {
  const netKey = getStoredNetworkKey();
  const seasonsQry = useAllSeasons();
  const seasons = seasonsQry.data || [];

  // Get current active season (highest season ID)
  const currentSeason = useMemo(() => {
    if (!seasons || seasons.length === 0) return null;
    return seasons.reduce((max, s) => (s.id > max.id ? s : max), seasons[0]);
  }, [seasons]);

  // Fetch trade history from database
  const tradesQuery = useQuery({
    queryKey: ["infofiTrades", address],
    enabled: !!address,
    queryFn: async () => {
      const url = `${
        import.meta.env.VITE_BACKEND_URL ||
        "https://sof-alpha-production.up.railway.app"
      }/api/infofi/positions/${address}`;

      console.log("[InfoFi] Fetching trades from:", url);

      const response = await fetch(url);

      if (!response.ok) {
        console.error(
          "[InfoFi] Failed to fetch trades:",
          response.status,
          response.statusText
        );
        throw new Error("Failed to fetch trade history");
      }

      const data = await response.json();
      console.log("[InfoFi] Trades response:", data);
      return data.positions || [];
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const positionsQuery = useQuery({
    queryKey: [
      "infofiPositionsOnchainActive",
      address,
      currentSeason?.id,
      netKey,
    ],
    enabled: !!address && !!currentSeason,
    queryFn: async () => {
      const seasonId = currentSeason.id;

      // Fetch markets from Supabase (includes contract_address)
      const response = await fetch(
        `${
          import.meta.env.VITE_BACKEND_URL ||
          "https://sof-alpha-production.up.railway.app"
        }/api/infofi/markets?seasonId=${seasonId}&isActive=true`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch markets");
      }

      const data = await response.json();
      const markets = data.markets?.[seasonId] || [];

      if (!markets || markets.length === 0) {
        return [];
      }

      const positions = [];

      for (const m of markets) {
        try {
          const fpmmAddress = m.contract_address;

          if (
            !fpmmAddress ||
            fpmmAddress === "0x0000000000000000000000000000000000000000"
          ) {
            continue; // Skip if no FPMM exists
          }

          // eslint-disable-next-line no-await-in-loop
          const yes = await readBet({
            marketId: m.id,
            account: address,
            prediction: true,
            networkKey: netKey,
            fpmmAddress,
          });
          // eslint-disable-next-line no-await-in-loop
          const no = await readBet({
            marketId: m.id,
            account: address,
            prediction: false,
            networkKey: netKey,
            fpmmAddress,
          });

          const yesAmt = yes?.amount ?? 0n;
          const noAmt = no?.amount ?? 0n;

          if (yesAmt > 0n || noAmt > 0n) {
            positions.push({
              marketId: m.id,
              marketType: m.market_type || "Winner Prediction",
              player: m.player_address,
              yesAmount: yesAmt,
              noAmount: noAmt,
            });
          }
        } catch (error) {
          // Error handling: log the error and continue to the next market
          // This ensures that a single market error does not prevent the entire query from succeeding
          console.error(`Error reading position for market ${m.id}:`, error);
        }
      }

      console.log("[InfoFi] Positions found:", positions.length);
      return positions;
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  // Group trades by market
  const tradesByMarket = useMemo(() => {
    const trades = tradesQuery.data || [];
    const grouped = {};

    console.log("[InfoFi] Grouping trades:", trades.length, "trades");

    for (const trade of trades) {
      const marketId = trade.market_id;
      if (!grouped[marketId]) {
        grouped[marketId] = [];
      }
      grouped[marketId].push(trade);
    }

    console.log(
      "[InfoFi] Grouped by market:",
      Object.keys(grouped).length,
      "markets"
    );

    return grouped;
  }, [tradesQuery.data]);

  return (
    <div className="h-80 overflow-y-auto overflow-x-hidden pr-1">
      {!currentSeason && (
        <p className="text-muted-foreground">No active season found.</p>
      )}
      {currentSeason && (
        <>
          <div className="mb-3 text-sm text-muted-foreground">
            Season #{currentSeason.id}{" "}
            {currentSeason.name ? `— ${currentSeason.name}` : ""}
          </div>
          {(positionsQuery.isLoading || tradesQuery.isLoading) && (
            <p className="text-muted-foreground">Loading positions...</p>
          )}
          {(positionsQuery.error || tradesQuery.error) && (
            <p className="text-red-500">
              {positionsQuery.error?.message?.includes("does not exist") ||
              positionsQuery.error?.message?.includes("No prediction markets")
                ? "No prediction markets available yet."
                : `Error: ${String(
                    positionsQuery.error?.message ||
                      tradesQuery.error?.message ||
                      positionsQuery.error ||
                      tradesQuery.error
                  )}`}
            </p>
          )}
          {!positionsQuery.isLoading &&
            !tradesQuery.isLoading &&
            !positionsQuery.error &&
            !tradesQuery.error && (
              <>
                {(positionsQuery.data || []).length === 0 &&
                  Object.keys(tradesByMarket).length === 0 && (
                    <p className="text-muted-foreground">
                      No positions or trades found.
                    </p>
                  )}
                {Object.keys(tradesByMarket).length > 0 && (
                  <Accordion type="multiple" className="space-y-2">
                    {Object.entries(tradesByMarket).map(
                      ([marketId, marketTrades]) => {
                        // Find matching position if exists
                        const pos = (positionsQuery.data || []).find(
                          (p) => p.marketId === parseInt(marketId)
                        );

                        return (
                          <AccordionItem
                            key={`market-${marketId}`}
                            value={`market-${marketId}`}
                          >
                            <AccordionTrigger className="px-3 py-2 text-left">
                              <div className="flex flex-col w-full">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">
                                    {pos?.marketType || "Winner Prediction"}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Market #{marketId}
                                  </span>
                                </div>
                                {pos?.player && (
                                  <p className="text-xs text-[#f9d6de]">
                                    Player: {pos.player.slice(0, 6)}...
                                    {pos.player.slice(-4)}
                                  </p>
                                )}
                                <div className="flex gap-4 mt-1">
                                  {pos?.yesAmount > 0n && (
                                    <span className="text-xs text-green-600">
                                      YES: {formatUnits(pos.yesAmount, 18)} SOF
                                    </span>
                                  )}
                                  {pos?.noAmount > 0n && (
                                    <span className="text-xs text-red-600">
                                      NO: {formatUnits(pos.noAmount, 18)} SOF
                                    </span>
                                  )}
                                  {!pos && (
                                    <span className="text-xs text-muted-foreground">
                                      {marketTrades.length} trade
                                      {marketTrades.length !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="mt-2 border-t pt-2 max-h-48 overflow-y-auto overflow-x-hidden pr-1">
                                <p className="font-semibold mb-2">
                                  Trade History
                                </p>
                                <div className="space-y-1">
                                  {marketTrades
                                    .sort(
                                      (a, b) =>
                                        new Date(b.created_at) -
                                        new Date(a.created_at)
                                    )
                                    .map((trade, idx) => (
                                      <div
                                        key={`${trade.id}-${idx}`}
                                        className="text-sm flex justify-between items-center gap-2 py-1"
                                      >
                                        <span
                                          className={
                                            trade.outcome === "YES"
                                              ? "text-green-600"
                                              : "text-red-600"
                                          }
                                        >
                                          {trade.outcome === "YES" ? "+" : "-"}
                                          {parseFloat(trade.amount).toFixed(
                                            4
                                          )}{" "}
                                          SOF ({trade.outcome})
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {new Date(
                                            trade.created_at
                                          ).toLocaleString()}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      }
                    )}
                  </Accordion>
                )}
              </>
            )}
        </>
      )}
    </div>
  );
};

InfoFiPositionsTab.propTypes = {
  address: PropTypes.string,
};

export default AccountPage;

// PropTypes appended at end of file to satisfy ESLint prop validation
UsernameEditor.propTypes = {
  address: PropTypes.string.isRequired,
  currentUsername: PropTypes.string,
  onSuccess: PropTypes.func.isRequired,
};
