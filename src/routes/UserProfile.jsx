// src/routes/UserProfile.jsx
import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, formatUnits } from 'viem';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import ERC20Abi from '@/contracts/abis/ERC20.json';
import SOFBondingCurveAbi from '@/contracts/abis/SOFBondingCurve.json';
import InfoFiPricingTicker from '@/components/infofi/InfoFiPricingTicker';
import { useAllSeasons } from '@/hooks/useAllSeasons';

const UserProfile = () => {
  const { address } = useParams();

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

  // Fetch all seasons
  const allSeasonsQuery = useAllSeasons();

  // SOF balance
  const sofBalanceQuery = useQuery({
    queryKey: ['sofBalanceProfile', netKey, contracts.SOF, address],
    enabled: !!client && !!contracts.SOF && !!address,
    queryFn: async () => client.readContract({ address: contracts.SOF, abi: ERC20Abi.abi, functionName: 'balanceOf', args: [address] }),
    staleTime: 15_000,
  });

  const fmt = (v, decimals) => { try { return formatUnits(v ?? 0n, decimals); } catch { return '0'; } };

  // Raffle ticket balances across seasons for this address
  const seasons = allSeasonsQuery.data || [];
  const seasonBalancesQuery = useQuery({
    queryKey: ['raffleTokenBalancesProfile', netKey, address, seasons.map(s => s.id).join(',')],
    enabled: !!client && !!address && seasons.length > 0,
    queryFn: async () => {
      const results = [];
      for (const s of seasons) {
        const curveAddr = s?.config?.bondingCurve;
        if (!curveAddr) continue;
        try {
          const raffleTokenAddr = await client.readContract({ address: curveAddr, abi: SOFBondingCurveAbi, functionName: 'raffleToken', args: [] });
          const [decimals, bal] = await Promise.all([
            client.readContract({ address: raffleTokenAddr, abi: ERC20Abi.abi, functionName: 'decimals', args: [] }),
            client.readContract({ address: raffleTokenAddr, abi: ERC20Abi.abi, functionName: 'balanceOf', args: [address] }),
          ]);
          if ((bal ?? 0n) > 0n) {
            results.push({ seasonId: s.id, name: s?.config?.name, token: raffleTokenAddr, balance: bal, decimals });
          }
        } catch (_) {}
      }
      return results;
    },
    staleTime: 15_000,
  });

  const sofBalance = useMemo(() => fmt(sofBalanceQuery.data, 18), [sofBalanceQuery.data]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">User Profile</h1>
      <p className="text-sm text-muted-foreground mb-4">Address: <span className="font-mono">{address}</span></p>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>$SOF Balance</CardTitle>
          <CardDescription>Wallet&apos;s current $SOF holdings.</CardDescription>
        </CardHeader>
        <CardContent>
          {sofBalanceQuery.isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : sofBalanceQuery.error ? (
            <p className="text-red-500">Error loading SOF balance</p>
          ) : (
            <p className="text-lg">{sofBalance} SOF</p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Raffle Holdings</CardTitle>
          <CardDescription>Tickets held by this user across seasons.</CardDescription>
        </CardHeader>
        <CardContent>
          {seasonBalancesQuery.isLoading && <p className="text-muted-foreground">Loading...</p>}
          {seasonBalancesQuery.error && <p className="text-red-500">Error loading ticket balances</p>}
          {!seasonBalancesQuery.isLoading && !seasonBalancesQuery.error && (
            <div className="space-y-2">
              {(seasonBalancesQuery.data || []).length === 0 && (
                <p className="text-muted-foreground">No ticket balances found.</p>
              )}
              {(seasonBalancesQuery.data || []).map((row) => (
                <div key={row.seasonId} className="border rounded p-2">
                  <div className="flex justify-between">
                    <span>Season #{row.seasonId}{row.name ? ` — ${row.name}` : ''}</span>
                    <Link to={`/raffles/${row.seasonId}`} className="text-primary hover:underline">View</Link>
                  </div>
                  <p className="text-xs text-muted-foreground break-all">Token: {row.token}</p>
                  <div className="mt-2">
                    <InfoFiPricingTicker marketId={row.seasonId} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PredictionPositionsCard address={address} />
    </div>
  );
};

export default UserProfile;

// Prediction positions reuse backend placeholder
const PredictionPositionsCard = ({ address }) => {
  const positionsQuery = useQuery({
    queryKey: ['infofiPositionsProfile', address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/infofi/positions?address=${address}`);
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`Failed to fetch positions (${res.status})`);
      }
      const json = await res.json();
      return Array.isArray(json) ? json : (json?.positions || []);
    },
    staleTime: 10_000,
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Prediction Market Positions</CardTitle>
        <CardDescription>Open positions for this user.</CardDescription>
      </CardHeader>
      <CardContent>
        {positionsQuery.isLoading && <p className="text-muted-foreground">Loading positions...</p>}
        {positionsQuery.error && <p className="text-muted-foreground">Prediction markets backend not available yet.</p>}
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
      </CardContent>
    </Card>
  );
};

PredictionPositionsCard.propTypes = {
  address: PropTypes.string,
};
