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
import { queryLogsInChunks } from "@/utils/blockRangeQuery";
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
import ExplorerLink from "@/components/common/ExplorerLink";
import {
  Carousel,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { getPrizeDistributor } from "@/services/onchainRaffleDistributor";
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
              <CardTitle>Raffle Ticket Balances</CardTitle>
            </CardHeader>
            <CardContent>
              {seasonBalancesQuery.isLoading && (
                <p className="text-muted-foreground">Loading...</p>
              )}
              {seasonBalancesQuery.error && (
                <p className="text-red-500">Error loading ticket balances</p>
              )}
              {!seasonBalancesQuery.isLoading && !seasonBalancesQuery.error && (
                <div className="h-80 overflow-y-auto overflow-x-hidden pr-1">
                  {(seasonBalancesQuery.data || []).length === 0 && (
                    <p className="text-muted-foreground">
                      No ticket balances found.
                    </p>
                  )}
                  {(seasonBalancesQuery.data || []).length > 0 && (
                    <Accordion type="multiple" className="space-y-2">
                      {(seasonBalancesQuery.data || [])
                        .slice()
                        .sort((a, b) => Number(b.seasonId) - Number(a.seasonId))
                        .map((row) => (
                          <RaffleEntryRow
                            key={row.seasonId}
                            row={row}
                            address={address}
                            client={client}
                          />
                        ))}
                    </Accordion>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Claims */}
      <ClaimCenter address={address} />
    </div>
  );
};
// Subcomponent: one raffle entry with expandable transaction history
const RaffleEntryRow = ({ row, address, client }) => {
  // Note: We intentionally removed a generic transfersQuery due to lack of OR filters; we
  // query IN and OUT separately below and merge for clarity and ESLint cleanliness.

  // Separate queries for IN and OUT, then merge
  const inQuery = useQuery({
    queryKey: ["raffleTransfersIn", row.token, address],
    enabled: !!client && !!row?.token && !!address,
    queryFn: async () => {
      const currentBlock = await client.getBlockNumber();
      const lookbackBlocks = 100000n; // Last 100k blocks
      const fromBlock =
        currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

      return queryLogsInChunks(
        client,
        {
          address: row.token,
          event: {
            type: "event",
            name: "Transfer",
            inputs: [
              { indexed: true, name: "from", type: "address" },
              { indexed: true, name: "to", type: "address" },
              { indexed: false, name: "value", type: "uint256" },
            ],
          },
          args: { to: address },
          fromBlock,
          toBlock: "latest",
        },
        10000n
      );
    },
  });

  const outQuery = useQuery({
    queryKey: ["raffleTransfersOut", row.token, address],
    enabled: !!client && !!row?.token && !!address,
    queryFn: async () => {
      const currentBlock = await client.getBlockNumber();
      const lookbackBlocks = 100000n; // Last 100k blocks
      const fromBlock =
        currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

      return queryLogsInChunks(
        client,
        {
          address: row.token,
          event: {
            type: "event",
            name: "Transfer",
            inputs: [
              { indexed: true, name: "from", type: "address" },
              { indexed: true, name: "to", type: "address" },
              { indexed: false, name: "value", type: "uint256" },
            ],
          },
          args: { from: address },
          fromBlock,
          toBlock: "latest",
        },
        10000n
      );
    },
  });

  const decimals = Number(row.decimals || 0);
  const base = 10n ** BigInt(decimals);
  const tickets = (row.balance ?? 0n) / base;

  const merged = useMemo(() => {
    const ins = (inQuery.data || []).map((l) => ({
      dir: "IN",
      value: l.args?.value ?? 0n,
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
      from: l.args?.from,
      to: l.args?.to,
    }));
    const outs = (outQuery.data || []).map((l) => ({
      dir: "OUT",
      value: l.args?.value ?? 0n,
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
      from: l.args?.from,
      to: l.args?.to,
    }));
    return [...ins, ...outs].sort((a, b) =>
      Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n))
    );
  }, [inQuery.data, outQuery.data]);

  return (
    <AccordionItem value={`season-${row.seasonId}`}>
      <AccordionTrigger className="px-3 py-2 text-left">
        <div className="flex flex-col w-full">
          <div className="flex items-center justify-between">
            <span>
              Season #{row.seasonId}
              {row.name ? ` — ${row.name}` : ""}
            </span>
            <span className="font-mono">{tickets.toString()} Tickets</span>
          </div>
          <p className="text-xs break-all text-[#f9d6de]">Token: {row.token}</p>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="mt-2 border-t pt-2 max-h-48 overflow-y-auto overflow-x-hidden pr-1">
          <p className="font-semibold mb-2">Transactions</p>
          {(inQuery.isLoading || outQuery.isLoading) && (
            <p className="text-muted-foreground">Loading...</p>
          )}
          {(inQuery.error || outQuery.error) && (
            <p className="text-red-500">Error loading transfers</p>
          )}
          {!inQuery.isLoading && !outQuery.isLoading && (
            <div className="space-y-1">
              {merged.length === 0 && (
                <p className="text-muted-foreground">No transfers found.</p>
              )}
              {merged.map((t) => (
                <div
                  key={t.txHash + String(t.blockNumber)}
                  className="text-sm flex justify-between items-center gap-2"
                >
                  <span
                    className={
                      t.dir === "IN" ? "text-green-600" : "text-red-600"
                    }
                  >
                    {t.dir === "IN" ? "+" : "-"}
                    {((t.value ?? 0n) / base).toString()} tickets
                  </span>
                  <div className="max-w-[60%] flex-1">
                    <ExplorerLink
                      value={t.txHash}
                      type="tx"
                      text="View transaction on Explorer"
                      className="text-xs text-[#a89e99] underline truncate"
                      copyLabelText="Copy transaction ID to clipboard."
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
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

export default AccountPage;

// PropTypes appended at end of file to satisfy ESLint prop validation
RaffleEntryRow.propTypes = {
  row: PropTypes.shape({
    token: PropTypes.string,
    decimals: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    // Accept any type for balance to support BigInt in dev
    balance: PropTypes.any,
    seasonId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string,
  }).isRequired,
  address: PropTypes.string,
  client: PropTypes.shape({
    getLogs: PropTypes.func,
    getBlockNumber: PropTypes.func,
    readContract: PropTypes.func,
  }),
};

UsernameEditor.propTypes = {
  address: PropTypes.string.isRequired,
  currentUsername: PropTypes.string,
  onSuccess: PropTypes.func.isRequired,
};
