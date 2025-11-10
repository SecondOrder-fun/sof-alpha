// src/routes/RaffleDetails.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRaffleState } from '@/hooks/useRaffleState';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// removed inline buy/sell form controls
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { createPublicClient, http } from 'viem';
import { SOFBondingCurveAbi, ERC20Abi } from '@/utils/abis';
import { useCurveState } from '@/hooks/useCurveState';
import BondingCurvePanel from '@/components/curve/CurveGraph';
import BuySellWidget from '@/components/curve/BuySellWidget';
import TransactionsTab from '@/components/curve/TransactionsTab';
import TokenInfoTab from '@/components/curve/TokenInfoTab';
import HoldersTab from '@/components/curve/HoldersTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common/Tabs';
import { useCurveEvents } from '@/hooks/useCurveEvents';
import { useAccount } from 'wagmi';
import { RaffleAdminControls } from '@/components/admin/RaffleAdminControls';
import { TreasuryControls } from '@/components/admin/TreasuryControls';

const RaffleDetails = () => {
  const { t, i18n } = useTranslation('raffle');
  const { seasonId } = useParams();
  const { seasonDetailsQuery } = useRaffleState(seasonId);
  const bondingCurveAddress = seasonDetailsQuery?.data?.config?.bondingCurve;
  const [chainNow, setChainNow] = useState(null);
  const [activeTab, setActiveTab] = useState('token-info');
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

  // Connected wallet
  const { address, isConnected } = useAccount();

  // Local immediate position override after tx (until server snapshot catches up)
  const [localPosition, setLocalPosition] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshPositionNow = async () => {
    try {
      if (!isConnected || !address || !bondingCurveAddress) return;
      const netKey = getStoredNetworkKey();
      const net = getNetworkByKey(netKey);
      if (!net?.rpcUrl) return;
      const client = createPublicClient({
        chain: {
          id: net.id,
          name: net.name,
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: [net.rpcUrl] } },
        },
        transport: http(net.rpcUrl),
      });
      // 1) Try the curve's public mapping playerTickets(address) first (authoritative)
      try {
        const [pt, cfg] = await Promise.all([
          client.readContract({ address: bondingCurveAddress, abi: SOFBondingCurveAbi, functionName: 'playerTickets', args: [address] }),
          client.readContract({ address: bondingCurveAddress, abi: SOFBondingCurveAbi, functionName: 'curveConfig', args: [] }),
        ]);
        const tickets = BigInt(pt ?? 0n);
        const total = BigInt(cfg?.[0] ?? cfg?.totalSupply ?? 0n);
        const probBps = total > 0n ? Number((tickets * 10000n) / total) : 0;
        setLocalPosition({ tickets, probBps, total });
        return;
      } catch (_) {
        // fallback to ERC20 path below
      }

      // 2) Fallback: discover ERC20 tickets token from the curve if the curve is not the token itself
      // Prefer explicit token from season details if available
      let tokenAddress = (
        seasonDetailsQuery?.data?.ticketToken ||
        seasonDetailsQuery?.data?.config?.ticketToken ||
        seasonDetailsQuery?.data?.config?.token ||
        bondingCurveAddress
      );
      for (const fn of ['token', 'raffleToken', 'ticketToken', 'tickets', 'asset']) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const addr = await client.readContract({ address: bondingCurveAddress, abi: SOFBondingCurveAbi, functionName: fn, args: [] });
          if (typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr) && addr !== '0x0000000000000000000000000000000000000000') {
            tokenAddress = addr;
            break;
          }
        } catch (_) {
          // continue trying other function names
        }
      }

      const [bal, supply] = await Promise.all([
        client.readContract({ address: tokenAddress, abi: ERC20Abi, functionName: 'balanceOf', args: [address] }),
        client.readContract({ address: tokenAddress, abi: ERC20Abi, functionName: 'totalSupply', args: [] }),
      ]);
      const tickets = BigInt(bal ?? 0n);
      const total = BigInt(supply ?? 0n);
      const probBps = total > 0n ? Number((tickets * 10000n) / total) : 0;
      setLocalPosition({ tickets, probBps, total });
    } catch (_err) {
      // ignore
    }
  };

  // Toasts state for tx updates (component scope)
  const [toasts, setToasts] = useState([]);
  const netKeyOuter = getStoredNetworkKey();
  const netOuter = getNetworkByKey(netKeyOuter);
  const addToast = ({ type = 'success', message, hash }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = hash && netOuter?.explorer ? `${netOuter.explorer.replace(/\/$/, '')}/tx/${hash}` : undefined;
    setToasts((t) => [{ id, type, message, hash, url }, ...t]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 120000); // 2 minutes
  };
  const copyHash = async (hash) => {
    try { await navigator.clipboard.writeText(hash); } catch (_) { /* no-op */ }
  };

  // Initial load: fetch position immediately
  useEffect(() => {
    if (isConnected && address && bondingCurveAddress) {
      refreshPositionNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, bondingCurveAddress]);


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
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <CardTitle>{t('season')} #{seasonId} - {cfg.name}</CardTitle>
                  <div className="text-xs text-muted-foreground">
                    <span className="mr-4">{t('start')}: {new Date(Number(cfg.startTime) * 1000).toLocaleString(i18n.language)}</span>
                    <span>{t('end')}: {new Date(Number(cfg.endTime) * 1000).toLocaleString(i18n.language)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>

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

                {/* Bonding Curve UI */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                  <Card className="lg:col-span-2">
                    <CardContent>
                      <BondingCurvePanel curveSupply={curveSupply} curveStep={curveStep} allBondSteps={allBondSteps} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <BuySellWidget
                        bondingCurveAddress={bc}
                        onTxSuccess={() => {
                          setIsRefreshing(true);
                          debouncedRefresh(250);
                          refreshPositionNow();
                          // schedule a couple of follow-ups in case indexers are lagging
                          setTimeout(() => { debouncedRefresh(0); refreshPositionNow(); }, 1500);
                          setTimeout(() => { 
                            debouncedRefresh(0); 
                            refreshPositionNow(); 
                            setIsRefreshing(false);
                          }, 4000);
                        }}
                        onNotify={(evt) => {
                          addToast(evt);
                          setIsRefreshing(true);
                          debouncedRefresh(0);
                          refreshPositionNow();
                          setTimeout(() => { debouncedRefresh(0); refreshPositionNow(); }, 1500);
                          setTimeout(() => { 
                            debouncedRefresh(0); 
                            refreshPositionNow(); 
                            setIsRefreshing(false);
                          }, 4000);
                        }}
                      />
                      {/* Player position display */}
                      <div className="mt-3 p-3 border rounded-md bg-muted/20">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{t('yourCurrentPosition')}</div>
                          {!isConnected && (<Badge variant="secondary">{t('connectWalletToView')}</Badge>)}
                          {isConnected && isRefreshing && (<Badge variant="outline" className="animate-pulse">{t('updating')}</Badge>)}
                        </div>
                        {isConnected && (
                          <div className="mt-2 text-sm">
                            {localPosition && (
                              <div className="space-y-1">
                                <div>{t('tickets')}: <span className="font-mono">{localPosition.tickets.toString()}</span></div>
                                <div>{t('winProbability')}: <span className="font-mono">{(() => { try { const bps = Number(localPosition.probBps); return `${(bps / 100).toFixed(2)}%`; } catch { return '0.00%'; } })()}</span></div>
                                <div className="text-xs text-muted-foreground">{t('totalTicketsAtSnapshot')}: <span className="font-mono">{localPosition.total.toString()}</span></div>
                              </div>
                            )}
                            {!localPosition && (<span className="text-muted-foreground">No position yet.</span>)}
                          </div>
                        )}
                      </div>
                      {/* Toasts container (inline under position) */}
                      {toasts.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {toasts.map((t) => (
                            <div key={t.id} className="p-3 rounded-md border bg-card shadow">
                              <div className="text-sm font-medium mb-1">{t.message}</div>
                              {t.hash && (
                                <div className="text-xs flex items-center gap-2">
                                  <span className="font-mono break-all">{t.hash}</span>
                                  <button className="underline text-muted-foreground" onClick={() => copyHash(t.hash)}>Copy</button>
                                  {t.url && (
                                    <a className="underline text-muted-foreground" href={t.url} target="_blank" rel="noreferrer">View</a>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>{t('activityAndDetails')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                      <TabsList>
                        <TabsTrigger value="token-info">{t('tokenInfo')}</TabsTrigger>
                        <TabsTrigger value="transactions">{t('common:transactions')}</TabsTrigger>
                        <TabsTrigger value="holders">{t('tokenHolders')}</TabsTrigger>
                      </TabsList>
                      <TabsContent value="token-info">
                        <TokenInfoTab
                          bondingCurveAddress={bc}
                          seasonId={seasonId}
                          curveSupply={curveSupply}
                          allBondSteps={allBondSteps}
                          curveReserves={curveReserves}
                          seasonStatus={seasonDetailsQuery.data.status}
                          totalPrizePool={seasonDetailsQuery.data.totalPrizePool}
                        />
                      </TabsContent>
                      <TabsContent value="transactions">
                        <TransactionsTab bondingCurveAddress={bc} seasonId={seasonId} />
                      </TabsContent>
                      <TabsContent value="holders">
                        <HoldersTab bondingCurveAddress={bc} seasonId={seasonId} />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
                <RaffleAdminControls seasonId={seasonId} />
                <TreasuryControls seasonId={seasonId} bondingCurveAddress={bc} />
              </CardContent>
            </Card>
          );
        })()
      )}
    </div>
  );
};

export default RaffleDetails;
