// src/routes/AccountPage.jsx
import { useEffect, useMemo, useState } from 'react';
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
          results.push({ seasonId: s.id, name: s?.config?.name, token: raffleTokenAddr, balance: bal, decimals });
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
                      <div key={row.seasonId} className="border rounded p-2">
                        <div className="flex justify-between">
                          <span>Season #{row.seasonId}{row.name ? ` — ${row.name}` : ''}</span>
                          {(() => {
                            const d = BigInt(Number(row.decimals || 0));
                            const base = 10n ** d;
                            const tickets = (row.balance ?? 0n) / base; // floor
                            return (
                              <span className="font-mono">{tickets.toString()} Tickets</span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground break-all">Token: {row.token}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountPage;
