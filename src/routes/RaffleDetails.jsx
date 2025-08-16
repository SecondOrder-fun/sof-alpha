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
  const { buyTokens } = useCurve(bondingCurveAddress);
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

  const handleBuyTickets = (e) => {
    e.preventDefault();
    if (!buyAmount) return;
    // Interpret input as token amount to buy; max SOF set to 0 for now (adjust when pricing is wired)
    try {
      buyTokens.mutate({ tokenAmount: BigInt(buyAmount), maxSofAmount: BigInt(0) });
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
        <Card>
          <CardHeader>
            <CardTitle>{seasonDetailsQuery.data.config.name} - Season #{seasonId}</CardTitle>
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
              const cfg = seasonDetailsQuery.data.config;
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
            <p>Start Time: {new Date(Number(seasonDetailsQuery.data.config.startTime) * 1000).toLocaleString()}</p>
            <p>End Time: {new Date(Number(seasonDetailsQuery.data.config.endTime) * 1000).toLocaleString()}</p>

            <form onSubmit={handleBuyTickets} className="mt-4 space-y-2">
              <Input 
                type="number"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder="Ticket token amount to buy"
              />
              <Button
                type="submit"
                disabled={buyTokens.isPending || seasonDetailsQuery.data.status !== 1}
              >
                {buyTokens.isPending ? 'Purchasing...' : 'Buy Tickets'}
              </Button>
            </form>
            {buyTokens.isError && <p className="text-red-500">Error: {buyTokens.error.message}</p>}
            {buyTokens.isSuccess && <p className="text-green-500">Purchase successful!</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RaffleDetails;
