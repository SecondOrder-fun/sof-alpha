// src/routes/AccountPage.jsx
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useAccount, useWatchContractEvent } from "wagmi";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {username ? username : "My Account"}
      </h1>
      {/* Completed Season Prizes – moved to top */}
      {Array.isArray(allSeasonsQuery.data) &&
        (allSeasonsQuery.data || []).length > 0 && (
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">
              Completed Season Prizes
            </h2>
            <p className="text-sm text-muted-foreground mb-2">
              If your connected wallet was the grand winner for a completed
              season, a claim panel will appear here.
            </p>
            <div className="space-y-3">
              {(allSeasonsQuery.data || []).map((s) => (
                <ClaimPrizeWidget
                  key={`claim-${String(s.id)}`}
                  seasonId={s.id}
                />
              ))}
            </div>
          </div>
        )}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            Your wallet and raffle participation details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected && (
            <p>Please connect your wallet to view your account details.</p>
          )}
          {isConnected && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Username</p>
                  <p className="text-muted-foreground">
                    {username || "Not set"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingUsername(!isEditingUsername)}
                >
                  {isEditingUsername ? "Cancel" : "Edit"}
                </Button>
              </div>
              {isEditingUsername && (
                <UsernameEditor
                  address={address}
                  currentUsername={username}
                  onSuccess={() => setIsEditingUsername(false)}
                />
              )}
              <p>
                <span className="font-semibold">Address:</span> {address}
              </p>
              <div>
                <p className="font-semibold">$SOF Balance</p>
                {sofBalanceQuery.isLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : sofBalanceQuery.error ? (
                  <p className="text-red-500">Error loading SOF balance</p>
                ) : (
                  <p>{sofBalance} SOF</p>
                )}
              </div>
              <div>
                <p className="font-semibold">Raffle Ticket Balances</p>
                {seasonBalancesQuery.isLoading && (
                  <p className="text-muted-foreground">Loading...</p>
                )}
                {seasonBalancesQuery.error && (
                  <p className="text-red-500">Error loading ticket balances</p>
                )}
                {!seasonBalancesQuery.isLoading &&
                  !seasonBalancesQuery.error && (
                    <div className="space-y-2">
                      {(seasonBalancesQuery.data || []).length === 0 && (
                        <p className="text-muted-foreground">
                          No ticket balances found.
                        </p>
                      )}
                      {(seasonBalancesQuery.data || []).map((row) => (
                        <RaffleEntryRow
                          key={row.seasonId}
                          row={row}
                          address={address}
                          client={client}
                        />
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Claims */}
      <ClaimCenter address={address} />
    </div>
  );
};

// Subcomponent: one raffle entry with expandable transaction history
const RaffleEntryRow = ({ row, address, client }) => {
  const [open, setOpen] = useState(false);

  // Note: We intentionally removed a generic transfersQuery due to lack of OR filters; we
  // query IN and OUT separately below and merge for clarity and ESLint cleanliness.

  // Separate queries for IN and OUT, then merge
  const inQuery = useQuery({
    queryKey: ["raffleTransfersIn", row.token, address],
    enabled: open && !!client && !!row?.token && !!address,
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
    enabled: open && !!client && !!row?.token && !!address,
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
    <div className="border rounded p-2">
      <button className="w-full text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex justify-between">
          <span>
            Season #{row.seasonId}
            {row.name ? ` — ${row.name}` : ""}
          </span>
          <span className="font-mono">{tickets.toString()} Tickets</span>
        </div>
        <p className="text-xs text-muted-foreground break-all">
          Token: {row.token}
        </p>
      </button>
      {open && (
        <div className="mt-2 border-t pt-2">
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
                  className="text-sm flex justify-between"
                >
                  <span
                    className={
                      t.dir === "IN" ? "text-green-600" : "text-red-600"
                    }
                  >
                    {t.dir === "IN" ? "+" : "-"}
                    {((t.value ?? 0n) / base).toString()} tickets
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[60%]">
                    {t.txHash}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
