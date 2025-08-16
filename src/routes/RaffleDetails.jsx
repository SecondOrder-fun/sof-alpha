// src/routes/RaffleDetails.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRaffleState } from '@/hooks/useRaffleState';
import { useCurve } from '@/hooks/useCurve';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPublicClient, http } from 'viem';
import { getNetworkByKey } from '@/config/networks';
import { getStoredNetworkKey } from '@/lib/wagmi';

const RaffleDetails = () => {
  const { seasonId } = useParams();
  const { seasonDetailsQuery } = useRaffleState(seasonId);
  const bondingCurveAddress = seasonDetailsQuery?.data?.config?.bondingCurve;
  const { buyTokens, approve } = useCurve(bondingCurveAddress);
  const [buyAmount, setBuyAmount] = useState('');
  const [chainNow, setChainNow] = useState(null);

  // Fetch on-chain time for accurate window checks
  useEffect(() => {
    const netKey = getStoredNetworkKey();
    const net = getNetworkByKey(netKey);
    const client = createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
    let mounted = true;
    (async () => {
      try {
        const block = await client.getBlock();
        if (mounted) setChainNow(Number(block.timestamp));
      } catch (err) {
        // Reason: avoid empty catch; network hiccups are non-fatal for hinting
        console.debug('getBlock initial failed', err);
      }
    })();
    const id = setInterval(async () => {
      try {
        const block = await client.getBlock();
        if (mounted) setChainNow(Number(block.timestamp));
      } catch (err) {
        // Reason: avoid empty catch; periodic polling can fail transiently
        console.debug('getBlock polling failed', err);
      }
    }, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const handleBuyTickets = async (e) => {
    e.preventDefault();
    if (!buyAmount) return;
    if (!bondingCurveAddress) return;
    // Reason: contracts typically require spender allowance and a non-zero max spend cap
    // Use a generous cap until pricing math is wired in the UI
    const cap = 10n ** 24n; // 1,000,000 SOF with 18 decimals (approx), adjust later
    try {
      // Approve SOF spend for bonding curve first
      await approve.mutateAsync({ amount: cap });
      // Resolve raffle token and decimals to scale human ticket count -> base units
      const netKey = getStoredNetworkKey();
      const net = getNetworkByKey(netKey);
      const client = createPublicClient({
        chain: {
          id: net.id,
          name: net.name,
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: [net.rpcUrl] } },
        },
        transport: http(net.rpcUrl),
      });
      // Read raffleToken address from curve
      // Import ABI inline to avoid extra imports here
      const SOFBondingCurveAbi = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
      const raffleToken = await client.readContract({
        address: bondingCurveAddress,
        abi: SOFBondingCurveAbi,
        functionName: 'raffleToken',
        args: [],
      });
      // Tickets are non-fractional (decimals = 0). Use whole-unit amount directly.
      const tokenAmountUnits = BigInt(buyAmount);
      // Then execute buy with non-zero maxSofAmount
      buyTokens.mutate({ tokenAmount: tokenAmountUnits, maxSofAmount: cap });
    } catch (_) {
      // no-op: mutation will surface errors
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Raffle Details</h1>
      {seasonDetailsQuery.isLoading && <p>Loading season details...</p>}
      {seasonDetailsQuery.error && <p>Error: {seasonDetailsQuery.error.message}</p>}
      {seasonDetailsQuery.data && seasonDetailsQuery.data.config && (
        (() => {
          const cfg = seasonDetailsQuery.data.config;
          const start = Number(cfg?.startTime || 0);
          const end = Number(cfg?.endTime || 0);
          const bc = cfg?.bondingCurve;
          const isZeroAddr = typeof bc === 'string' && /^0x0{40}$/i.test(bc);
          const isValid = start > 0 && end > 0 && bc && !isZeroAddr;

          if (!isValid) {
            return (
              <Card>
                <CardHeader>
                  <CardTitle>Season #{seasonId}</CardTitle>
                  <CardDescription>Detailed view of the raffle season.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Season not found or not initialized.</p>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card>
              <CardHeader>
                <CardTitle>{cfg.name} - Season #{seasonId}</CardTitle>
                <CardDescription>Detailed view of the raffle season.</CardDescription>
              </CardHeader>
              <CardContent>
            <div className="flex space-x-2 my-2">
              {(() => {
                const st = seasonDetailsQuery.data.status;
                const label = st === 1 ? 'Active' : st === 0 ? 'NotStarted' : 'Completed';
                const variant = st === 1 ? 'default' : st === 0 ? 'secondary' : 'destructive';
                return <Badge variant={variant}>{label}</Badge>;
              })()}
            </div>
            {(() => {
              const st = seasonDetailsQuery.data.status;
              const start = Number(cfg.startTime);
              const end = Number(cfg.endTime);
              if (chainNow && st === 0) {
                if (chainNow >= start && chainNow < end) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Window open on-chain, awaiting admin Start.
                    </p>
                  );
                }
                if (chainNow >= end) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Window ended on-chain, awaiting admin End.
                    </p>
                  );
                }
              }
              return null;
            })()}
            <p>Start Time: {new Date(Number(cfg.startTime) * 1000).toLocaleString()}</p>
            <p>End Time: {new Date(Number(cfg.endTime) * 1000).toLocaleString()}</p>

            <form onSubmit={handleBuyTickets} className="mt-4 space-y-2">
              <Input 
                type="number"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder="Ticket token amount to buy"
              />
              <Button
                type="submit"
                disabled={approve.isPending || buyTokens.isPending || seasonDetailsQuery.data.status !== 1}
              >
                {approve.isPending || buyTokens.isPending ? 'Processing...' : 'Buy Tickets'}
              </Button>
            </form>
            {(approve.isError || buyTokens.isError) && (
              <p className="text-red-500">Error: {(approve.error?.message || buyTokens.error?.message)}</p>
            )}
            {buyTokens.isSuccess && <p className="text-green-500">Purchase successful!</p>}
              </CardContent>
            </Card>
          );
        })()
      )}
    </div>
  );
};

export default RaffleDetails;
