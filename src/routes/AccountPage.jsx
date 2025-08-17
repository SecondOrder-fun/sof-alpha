// src/routes/AccountPage.jsx
import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, formatUnits } from 'viem';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import ERC20Abi from '@/contracts/abis/ERC20.json';
import SOFBondingCurveAbi from '@/contracts/abis/SOFBondingCurve.json';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import InfoFiPricingTicker from '@/components/infofi/InfoFiPricingTicker';

const AccountPage = () => {
  const { address, isConnected } = useAccount();

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
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
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
    queryKey: ['sofBalance', netKey, contracts.SOF, address],
    enabled: isConnected && !!client && !!contracts.SOF && !!address,
    queryFn: async () => {
      const bal = await client.readContract({
        address: contracts.SOF,
        abi: ERC20Abi.abi,
        functionName: 'balanceOf',
        args: [address],
      });
      return bal; // BigInt
    },
    staleTime: 15_000,
  });

  // Helper to safely format BigInt by decimals
  const fmt = (v, decimals) => {
    try { return formatUnits(v ?? 0n, decimals); } catch { return '0'; }
  };

// (propTypes defined at bottom to avoid temporal dead zone)

  // For each season, resolve raffleToken from the bonding curve, then read balanceOf
  const seasons = allSeasonsQuery.data || [];
  const seasonBalancesQuery = useQuery({
    queryKey: ['raffleTokenBalances', netKey, address, seasons.map(s => s.id).join(',')],
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
            functionName: 'raffleToken',
            args: [],
          });
          // Read user balance in raffle token
          const [decimals, bal] = await Promise.all([
            client.readContract({
              address: raffleTokenAddr,
              abi: ERC20Abi.abi,
              functionName: 'decimals',
              args: [],
            }),
            client.readContract({
              address: raffleTokenAddr,
              abi: ERC20Abi.abi,
              functionName: 'balanceOf',
              args: [address],
            }),
          ]);
          // Only include raffles where user balance > 0
          if ((bal ?? 0n) > 0n) {
            results.push({ seasonId: s.id, name: s?.config?.name, token: raffleTokenAddr, balance: bal, decimals });
          }
        } catch (e) {
          // Skip problematic season gracefully
        }
      }
      return results;
    },
    staleTime: 15_000,
  });

  const sofBalance = useMemo(() => fmt(sofBalanceQuery.data, 18), [sofBalanceQuery.data]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My Account</h1>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Your wallet and raffle participation details.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected && <p>Please connect your wallet to view your account details.</p>}
          {isConnected && (
            <div className="space-y-4">
              <p><span className="font-semibold">Address:</span> {address}</p>
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
                {seasonBalancesQuery.isLoading && <p className="text-muted-foreground">Loading...</p>}
                {seasonBalancesQuery.error && <p className="text-red-500">Error loading ticket balances</p>}
                {!seasonBalancesQuery.isLoading && !seasonBalancesQuery.error && (
                  <div className="space-y-2">
                    {(seasonBalancesQuery.data || []).length === 0 && (
                      <p className="text-muted-foreground">No ticket balances found.</p>
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
      {/* Prediction Market Positions */}
      <PredictionPositionsCard address={address} isConnected={isConnected} />
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
    queryKey: ['raffleTransfersIn', row.token, address],
    enabled: open && !!client && !!row?.token && !!address,
    queryFn: async () => client.getLogs({
      address: row.token,
      event: {
        type: 'event', name: 'Transfer', inputs: [
          { indexed: true, name: 'from', type: 'address' },
          { indexed: true, name: 'to', type: 'address' },
          { indexed: false, name: 'value', type: 'uint256' },
        ]},
      args: { to: address },
      fromBlock: 'earliest', toBlock: 'latest',
    }),
  });

  const outQuery = useQuery({
    queryKey: ['raffleTransfersOut', row.token, address],
    enabled: open && !!client && !!row?.token && !!address,
    queryFn: async () => client.getLogs({
      address: row.token,
      event: {
        type: 'event', name: 'Transfer', inputs: [
          { indexed: true, name: 'from', type: 'address' },
          { indexed: true, name: 'to', type: 'address' },
          { indexed: false, name: 'value', type: 'uint256' },
        ]},
      args: { from: address },
      fromBlock: 'earliest', toBlock: 'latest',
    }),
  });

  const decimals = Number(row.decimals || 0);
  const base = 10n ** BigInt(decimals);
  const tickets = (row.balance ?? 0n) / base;

  const merged = useMemo(() => {
    const ins = (inQuery.data || []).map((l) => ({
      dir: 'IN',
      value: l.args?.value ?? 0n,
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
      from: l.args?.from,
      to: l.args?.to,
    }));
    const outs = (outQuery.data || []).map((l) => ({
      dir: 'OUT',
      value: l.args?.value ?? 0n,
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
      from: l.args?.from,
      to: l.args?.to,
    }));
    return [...ins, ...outs].sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)));
  }, [inQuery.data, outQuery.data]);

  return (
    <div className="border rounded p-2">
      <button className="w-full text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex justify-between">
          <span>Season #{row.seasonId}{row.name ? ` — ${row.name}` : ''}</span>
          <span className="font-mono">{tickets.toString()} Tickets</span>
        </div>
        <p className="text-xs text-muted-foreground break-all">Token: {row.token}</p>
      </button>
      {/* Compact live hybrid pricing for this season */}
      <div className="mt-2">
        <InfoFiPricingTicker marketId={row.seasonId} />
      </div>
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
                <div key={t.txHash + String(t.blockNumber)} className="text-sm flex justify-between">
                  <span className={t.dir === 'IN' ? 'text-green-600' : 'text-red-600'}>
                    {t.dir === 'IN' ? '+' : '-'}{((t.value ?? 0n) / base).toString()} tickets
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[60%]">{t.txHash}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AccountPage;

// Subcomponent: Prediction market positions (placeholder wiring)
const PredictionPositionsCard = ({ address, isConnected }) => {
  const positionsQuery = useQuery({
    queryKey: ['infofiPositions', address],
    enabled: isConnected && !!address,
    queryFn: async () => {
      const res = await fetch(`/api/infofi/positions?address=${address}`);
      if (!res.ok) {
        // Gracefully surface as empty when backend not ready
        if (res.status === 404) return [];
        throw new Error(`Failed to fetch positions (${res.status})`);
      }
      return res.json();
    },
    staleTime: 10_000,
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Prediction Market Positions</CardTitle>
        <CardDescription>Open positions across InfoFi markets.</CardDescription>
      </CardHeader>
      <CardContent>
        {!isConnected && <p>Please connect your wallet to view positions.</p>}
        {isConnected && (
          <div className="space-y-2">
            {positionsQuery.isLoading && (
              <p className="text-muted-foreground">Loading positions...</p>
            )}
            {positionsQuery.error && (
              <p className="text-muted-foreground">Prediction markets backend not available yet.</p>
            )}
            {!positionsQuery.isLoading && !positionsQuery.error && (
              <div className="space-y-2">
                {(positionsQuery.data || []).length === 0 && (
                  <p className="text-muted-foreground">No open positions found.</p>
                )}
                {(positionsQuery.data || []).map((pos) => (
                  <div key={`${pos.marketId}-${pos.id || pos.txHash || Math.random()}`} className="border rounded p-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{pos.marketType || 'Market'}</span>
                      <span className="text-xs text-muted-foreground">{pos.marketId}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Outcome: {pos.outcome || '—'} • Amount: {pos.amount || '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// PropTypes appended at end of file to satisfy ESLint prop validation
RaffleEntryRow.propTypes = {
  row: PropTypes.shape({
    token: PropTypes.string,
    decimals: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    balance: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.object, // some toolchains may serialize BigInt values
    ]),
    seasonId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string,
  }).isRequired,
  address: PropTypes.string,
  client: PropTypes.shape({
    getLogs: PropTypes.func,
  }),
};

PredictionPositionsCard.propTypes = {
  address: PropTypes.string,
  isConnected: PropTypes.bool,
};
