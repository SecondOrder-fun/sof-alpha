// src/routes/RaffleDetails.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRaffleState } from '@/hooks/useRaffleState';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// removed inline buy/sell form controls
import { createPublicClient, http } from 'viem';
import { getNetworkByKey } from '@/config/networks';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { useCurveState } from '@/hooks/useCurveState';
import CurveGraph from '@/components/curve/CurveGraph';
import BuySellWidget from '@/components/curve/BuySellWidget';
import TransactionsTab from '@/components/curve/TransactionsTab';
import TokenInfoTab from '@/components/curve/TokenInfoTab';
import HoldersTab from '@/components/curve/HoldersTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common/Tabs';
import { useCurveEvents } from '@/hooks/useCurveEvents';
import { useRaffleTracker } from '@/hooks/useRaffleTracker';
import { useWallet } from '@/hooks/useWallet';

const RaffleDetails = () => {
  const { seasonId } = useParams();
  const { seasonDetailsQuery } = useRaffleState(seasonId);
  const bondingCurveAddress = seasonDetailsQuery?.data?.config?.bondingCurve;
  const [chainNow, setChainNow] = useState(null);
  const { curveSupply, curveReserves, curveStep, /* bondStepsPreview, */ allBondSteps, debouncedRefresh } = useCurveState(
    bondingCurveAddress,
    { isActive: seasonDetailsQuery?.data?.status === 1, pollMs: 12000 }
  );
  // removed inline estimator state used by old form
  // helpers now imported from lib/curveMath

  // Subscribe to on-chain PositionUpdate events to refresh immediately
  useCurveEvents(bondingCurveAddress, {
    onPositionUpdate: () => {
      // Reason: server-side state has changed; refresh chart/supply/reserves quickly
      debouncedRefresh(0);
    },
  });

  // Tracker snapshot for the connected wallet
  const { address, isConnected } = useWallet();
  const { usePlayerSnapshot, usePlayerSnapshotLive } = useRaffleTracker();
  const snapshotQuery = usePlayerSnapshot(isConnected ? address : null);
  // Live invalidation on PositionSnapshot events for this player
  usePlayerSnapshotLive(isConnected ? address : null);

  // Live pricing rendered via InfoFiPricingTicker component (SSE)

  // removed old inline SOF formatter; TokenInfoTab handles formatting where needed

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
      } catch (_err) {
        // silent: non-fatal
      }
    })();
    const id = setInterval(async () => {
      try {
        const block = await client.getBlock();
        if (mounted) setChainNow(Number(block.timestamp));
      } catch (_err) {
        // silent: non-fatal
      }
    }, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // removed old inline buy/sell handlers (now in BuySellWidget)

  // Removed old sell estimate effect; BuySellWidget handles quoting and submission.

  // debouncedRefresh is triggered by BuySellWidget via onTxSuccess

  // removed estimator side-effects for old form

  // simulators now unused

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
                <CardDescription>Bonding curve and trading for this season.</CardDescription>
                <div className="text-sm text-muted-foreground mt-1">
                  <span className="mr-4">Start: {new Date(Number(cfg.startTime) * 1000).toLocaleString()}</span>
                  <span>End: {new Date(Number(cfg.endTime) * 1000).toLocaleString()}</span>
                </div>
              </CardHeader>
              <CardContent>

                {/* Player snapshot (from RafflePositionTracker) */}
                <div className="mt-3 p-3 border rounded-md bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Your Current Position</div>
                    {!isConnected && (<Badge variant="secondary">Connect wallet to view</Badge>)}
                  </div>
                  {isConnected && (
                    <div className="mt-2 text-sm">
                      {snapshotQuery.isLoading && <span className="text-muted-foreground">Loading snapshot…</span>}
                      {snapshotQuery.error && (<span className="text-red-600">Error: {snapshotQuery.error.message}</span>)}
                      {snapshotQuery.data && (
                        <div className="space-y-1">
                          <div>Tickets: <span className="font-mono">{snapshotQuery.data.ticketCount?.toString?.() ?? String(snapshotQuery.data.ticketCount ?? 0)}</span></div>
                          <div>Win Probability: <span className="font-mono">{(() => { try { const bps = Number(snapshotQuery.data.winProbabilityBps || 0); return `${(bps / 100).toFixed(2)}%`; } catch { return '0.00%'; } })()}</span></div>
                          <div className="text-xs text-muted-foreground">Total Tickets (at snapshot): <span className="font-mono">{snapshotQuery.data.totalTicketsAtTime?.toString?.() ?? String(snapshotQuery.data.totalTicketsAtTime ?? 0)}</span></div>
                        </div>
                      )}
                      {!snapshotQuery.isLoading && !snapshotQuery.error && !snapshotQuery.data && (<span className="text-muted-foreground">No snapshot yet.</span>)}
                    </div>
                  )}
                </div>

                {/* Status badge intentionally removed */}
                {(() => {
                  const st = seasonDetailsQuery.data.status;
                  const start = Number(cfg.startTime);
                  const end = Number(cfg.endTime);
                  if (chainNow && st === 0) {
                    if (chainNow >= start && chainNow < end) return (<p className="text-sm text-muted-foreground">Window open on-chain, awaiting admin Start.</p>);
                    if (chainNow >= end) return (<p className="text-sm text-muted-foreground">Window ended on-chain, awaiting admin End.</p>);
                  }
                  return null;
                })()}
                {/* Start/End times shown in header */}

                {/* Bonding Curve UI */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Bonding Curve Graph</CardTitle>
                      <CardDescription>Step progress, current price and supply</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CurveGraph curveSupply={curveSupply} curveStep={curveStep} allBondSteps={allBondSteps} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Buy / Sell</CardTitle>
                      <CardDescription>Purchase or sell raffle tickets</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BuySellWidget bondingCurveAddress={bc} onTxSuccess={() => debouncedRefresh(500)} />
                    </CardContent>
                  </Card>
                </div>

                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Activity & Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs>
                      <TabsList>
                        <TabsTrigger value="transactions">Transactions</TabsTrigger>
                        <TabsTrigger value="token-info">Token Info</TabsTrigger>
                        <TabsTrigger value="holders">Token Holders</TabsTrigger>
                      </TabsList>
                      <TabsContent value="transactions"><TransactionsTab bondingCurveAddress={bc} /></TabsContent>
                      <TabsContent value="token-info"><TokenInfoTab bondingCurveAddress={bc} curveSupply={curveSupply} allBondSteps={allBondSteps} curveReserves={curveReserves} /></TabsContent>
                      <TabsContent value="holders"><HoldersTab bondingCurveAddress={bc} /></TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          );
        })()
      )}
    </div>
  );
};

export default RaffleDetails;
