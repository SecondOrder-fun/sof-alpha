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
  const { buyTokens, sellTokens, approve } = useCurve(bondingCurveAddress);
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [chainNow, setChainNow] = useState(null);
  const [buySlippagePct, setBuySlippagePct] = useState('1'); // default 1%
  const [sellSlippagePct, setSellSlippagePct] = useState('1'); // default 1%
  const [sellEstimate, setSellEstimate] = useState(0n);
  const [sellEstError, setSellEstError] = useState('');
  const [buyEstimate, setBuyEstimate] = useState(0n);
  const [buyEstError, setBuyEstError] = useState('');
  const [curveSupply, setCurveSupply] = useState(0n);
  const [curveReserves, setCurveReserves] = useState(0n);
  const [curveStep, setCurveStep] = useState(null); // { step, price, rangeTo }
  const [bondStepsPreview, setBondStepsPreview] = useState([]); // last few steps
  const [allBondSteps, setAllBondSteps] = useState([]);
  const [testSell1, setTestSell1] = useState(0n);
  const [testSell10, setTestSell10] = useState(0n);
  const [testBuy1, setTestBuy1] = useState(0n);
  const [testBuy10, setTestBuy10] = useState(0n);

  // Helper to compute min after slippage in basis points safely from string input (e.g., "0.5")
  const computeMinAfterSlippage = (estimate, pctStr) => {
    try {
      const pctFloat = Number.parseFloat(pctStr || '0');
      if (!Number.isFinite(pctFloat) || pctFloat < 0) return estimate;
      // Clamp to [0, 100]
      const clamped = Math.max(0, Math.min(100, pctFloat));
      // Convert percent to basis points integer (e.g., 1.25% => 125 bps)
      const bps = BigInt(Math.round(clamped * 100));
      const deduction = (estimate * bps) / 10000n;
      const minAmt = estimate - deduction;
      return minAmt < 0n ? 0n : minAmt;
    } catch (_e) {
      return estimate;
    }
  };

  // Compute a max cap adding slippage for buys
  const computeMaxWithSlippage = (estimate, pctStr) => {
    try {
      const pctFloat = Number.parseFloat(pctStr || '0');
      if (!Number.isFinite(pctFloat) || pctFloat < 0) return estimate;
      const clamped = Math.max(0, Math.min(100, pctFloat));
      const bps = BigInt(Math.round(clamped * 100));
      const add = (estimate * bps) / 10000n;
      return estimate + add;
    } catch (_e) {
      return estimate;
    }
  };

  // Format SOF (18 decimals) to a string with floor(4) decimals
  const formatSof4 = (amountWeiLike) => {
    try {
      const DECIMALS = 18n;
      const SHOW = 4n;
      // We want to floor to 4 decimals: divide by 10^(18-4) first
      const factor = 10n ** (DECIMALS - SHOW); // 1e14
      const scaled = amountWeiLike / factor; // integer with 4 implied decimals
      const denom = 10n ** SHOW; // 1e4
      const whole = scaled / denom;
      const frac = scaled % denom;
      return `${whole.toString()}.${frac.toString().padStart(Number(SHOW), '0')}`;
    } catch (_e) {
      return '0.0000';
    }
  };

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

  const handleBuyTickets = async (e) => {
    e.preventDefault();
    if (!buyAmount) return;
    if (!bondingCurveAddress) return;
    // Reason: contracts typically require spender allowance and a non-zero max spend cap
    try {
      // Approve a large SOF allowance once (user can manage allowance off-app)
      const maxUint = (1n << 255n) - 1n; // sufficiently large cap
      await approve.mutateAsync({ amount: maxUint });

      // Set a reasonable cap for this purchase from on-chain estimate plus slippage buffer
      const est = buyEstimate > 0n ? buyEstimate : 0n;
      const maxSpendCap = computeMaxWithSlippage(est, buySlippagePct);
      // Tickets are non-fractional (decimals = 0). Use whole-unit amount directly.
      const tokenAmountUnits = BigInt(buyAmount);
      // Then execute buy with non-zero maxSofAmount
      buyTokens.mutate({ tokenAmount: tokenAmountUnits, maxSofAmount: maxSpendCap });
    } catch (_) {
      // no-op: mutation will surface errors
    }
  };

  const handleSellTickets = async (e) => {
    e.preventDefault();
    if (!sellAmount) return;
    if (!bondingCurveAddress) return;
    try {
      const tokenAmountUnits = BigInt(sellAmount);
      // Build a client for reads
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
      const SOFBondingCurveJson = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
      const SOFBondingCurveAbi = SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;
      // Estimate base SOF to receive (before fee already handled in contract's view)
      const estimate = await client.readContract({
        address: bondingCurveAddress,
        abi: SOFBondingCurveAbi,
        functionName: 'calculateSellPrice',
        args: [tokenAmountUnits],
      });
      // Apply slippage buffer from decimal string percent to basis points safely
      const minSofAmount = computeMinAfterSlippage(estimate, sellSlippagePct);
      sellTokens.mutate({ tokenAmount: tokenAmountUnits, minSofAmount });
    } catch (_) {
      // no-op: mutation surfaces errors
    }
  };

  // Update estimated SOF received when amount/slippage changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSellEstError('');
        if (!bondingCurveAddress) return;
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
        const SOFBondingCurveJson = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
        const SOFBondingCurveAbi = SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;
        // Read curve config pieces for visibility
        const cfg = await client.readContract({
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: 'curveConfig',
          args: [],
        });
        // Read current step
        const stepInfo = await client.readContract({
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: 'getCurrentStep',
          args: [],
        });
        // Get a small preview of steps to validate config
        let steps = [];
        try {
          const all = await client.readContract({
            address: bondingCurveAddress,
            abi: SOFBondingCurveAbi,
            functionName: 'getBondSteps',
            args: [],
          });
          steps = Array.isArray(all) ? all : [];
        } catch (e) { void e; }
        if (!cancelled) {
          setCurveSupply(cfg[0] ?? 0n);
          setCurveReserves(cfg[1] ?? 0n);
          // stepInfo => [step, price, rangeTo]
          setCurveStep({ step: stepInfo?.[0] ?? 0n, price: stepInfo?.[1] ?? 0n, rangeTo: stepInfo?.[2] ?? 0n });
          setBondStepsPreview(steps.slice(Math.max(0, steps.length - 3)));
          setAllBondSteps(steps);
        }
        if (!sellAmount) { if (!cancelled) setSellEstimate(0n); return; }
        const est = await client.readContract({
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: 'calculateSellPrice',
          args: [BigInt(sellAmount)],
        });
        // quick probes for 1 and 10
        let probe1 = 0n;
        let probe10 = 0n;
        try { probe1 = await client.readContract({ address: bondingCurveAddress, abi: SOFBondingCurveAbi, functionName: 'calculateSellPrice', args: [1n] }); } catch (e) { void e; }
        try { probe10 = await client.readContract({ address: bondingCurveAddress, abi: SOFBondingCurveAbi, functionName: 'calculateSellPrice', args: [10n] }); } catch (e) { void e; }
        if (!cancelled) {
          setSellEstimate(est);
          setTestSell1(probe1);
          setTestSell10(probe10);
        }
      } catch (_) {
        if (!cancelled) {
          setSellEstimate(0n);
          setSellEstError(String(_?.shortMessage || _?.message || _));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sellAmount, bondingCurveAddress]);

  // Update estimated SOF cost for buy when amount changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBuyEstError('');
        if (!bondingCurveAddress) return;
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
        const SOFBondingCurveJson = (await import('@/contracts/abis/SOFBondingCurve.json')).default;
        const SOFBondingCurveAbi = SOFBondingCurveJson?.abi ?? SOFBondingCurveJson;
        if (!buyAmount) { if (!cancelled) setBuyEstimate(0n); return; }
        const est = await client.readContract({
          address: bondingCurveAddress,
          abi: SOFBondingCurveAbi,
          functionName: 'calculateBuyPrice',
          args: [BigInt(buyAmount)],
        });
        let probe1 = 0n;
        let probe10 = 0n;
        try { probe1 = await client.readContract({ address: bondingCurveAddress, abi: SOFBondingCurveAbi, functionName: 'calculateBuyPrice', args: [1n] }); } catch (e) { void e; }
        try { probe10 = await client.readContract({ address: bondingCurveAddress, abi: SOFBondingCurveAbi, functionName: 'calculateBuyPrice', args: [10n] }); } catch (e) { void e; }
        if (!cancelled) {
          setBuyEstimate(est);
          setTestBuy1(probe1);
          setTestBuy10(probe10);
        }
      } catch (_) {
        if (!cancelled) {
          setBuyEstimate(0n);
          setBuyEstError(String(_?.shortMessage || _?.message || _));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [buyAmount, bondingCurveAddress]);

  // Client-side simulator for buy
  const simBuy = (amount) => {
    try {
      const amt = BigInt(amount || '0');
      if (amt === 0n || allBondSteps.length === 0) return 0n;
      let current = curveSupply;
      let target = current + amt;
      let total = 0n;
      for (let i = 0; i < allBondSteps.length; i++) {
        const stepStart = i === 0 ? 0n : BigInt(allBondSteps[i - 1].rangeTo);
        const stepEnd = BigInt(allBondSteps[i].rangeTo);
        if (current >= stepEnd) continue; // already above this step
        if (target <= stepStart) break; // before this step
        const buyStart = current > stepStart ? current : stepStart;
        const buyEnd = target < stepEnd ? target : stepEnd;
        const tokensInStep = buyEnd - buyStart;
        if (tokensInStep > 0n) total += tokensInStep * BigInt(allBondSteps[i].price);
      }
      return total;
    } catch {
      return 0n;
    }
  };

  // Client-side simulator as fallback when estimate is 0
  const simSell = (amount) => {
    try {
      const amt = BigInt(amount || '0');
      if (amt === 0n || allBondSteps.length === 0) return 0n;
      let currentSupply = curveSupply;
      if (amt > currentSupply) return 0n;
      let targetSupply = currentSupply - amt;
      let total = 0n;
      for (let i = allBondSteps.length - 1; i >= 0; i--) {
        const stepStart = i === 0 ? 0n : BigInt(allBondSteps[i - 1].rangeTo);
        const stepEnd = BigInt(allBondSteps[i].rangeTo);
        if (targetSupply >= stepEnd) continue;
        if (currentSupply <= stepStart) break;
        const sellStart = targetSupply > stepStart ? targetSupply : stepStart;
        const sellEnd = currentSupply < stepEnd ? currentSupply : stepEnd;
        const tokensInStep = sellEnd - sellStart;
        if (tokensInStep > 0n) {
          total += tokensInStep * BigInt(allBondSteps[i].price);
        }
      }
      return total;
    } catch {
      return 0n;
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
              <div className="text-sm text-muted-foreground">
                Estimated cost: <span className="font-mono">{formatSof4(buyEstimate)}</span> SOF
              </div>
              <div className="text-xs text-muted-foreground">
                Debug est (wei): <span className="font-mono">{buyEstimate.toString()}</span>
              </div>
              {buyEstimate === 0n && buyAmount && (
                <div className="text-sm text-muted-foreground">
                  Simulated cost: <span className="font-mono">{formatSof4(simBuy(buyAmount))}</span> SOF
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Max with slippage: <span className="font-mono">{formatSof4(computeMaxWithSlippage(buyEstimate, buySlippagePct))}</span> SOF
              </div>
              {buyEstError && (
                <div className="text-xs text-amber-600">Estimate warning: {buyEstError}</div>
              )}
              <div className="text-xs text-muted-foreground">
                Test quotes: 1 → <span className="font-mono">{formatSof4(testBuy1)}</span> SOF, 10 → <span className="font-mono">{formatSof4(testBuy10)}</span> SOF
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="buySlip" className="text-sm">Buy Slippage %</label>
                <Input id="buySlip" type="number" min="0" max="100" step="0.1" value={buySlippagePct} onChange={(e) => setBuySlippagePct(e.target.value)} className="w-24" />
              </div>
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

            <form onSubmit={handleSellTickets} className="mt-6 space-y-2">
              <Input
                type="number"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder="Ticket token amount to sell"
              />
              <div className="text-sm text-muted-foreground">
                Estimated receive: <span className="font-mono">{formatSof4(sellEstimate)}</span> SOF
              </div>
              <div className="text-xs text-muted-foreground">
                Debug est (wei): <span className="font-mono">{sellEstimate.toString()}</span>
              </div>
              {sellEstimate === 0n && sellAmount && (
                <div className="text-sm text-muted-foreground">
                  Simulated receive: <span className="font-mono">{formatSof4(simSell(sellAmount))}</span> SOF
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Min after slippage: <span className="font-mono">{formatSof4(computeMinAfterSlippage(sellEstimate, sellSlippagePct))}</span> SOF
              </div>
              {(curveSupply > 0n || curveReserves > 0n) && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Curve total supply: <span className="font-mono">{curveSupply.toString()} tickets</span></div>
                  <div>Curve SOF reserves: <span className="font-mono">{formatSof4(curveReserves)}</span> SOF</div>
                  {curveStep && (
                    <div>
                      Current step: <span className="font-mono">#{curveStep.step.toString()}</span> · Price <span className="font-mono">{formatSof4(curveStep.price)}</span> SOF (<span className="font-mono">{curveStep.price.toString()}</span> wei) · RangeTo <span className="font-mono">{curveStep.rangeTo.toString()}</span>
                    </div>
                  )}
                  {bondStepsPreview?.length > 0 && (
                    <div>
                      Steps tail: {bondStepsPreview.map((s, idx) => (
                        <span key={idx} className="font-mono mr-2">[{formatSof4(s.price)} SOF → {s.rangeTo.toString()}]</span>
                      ))}
                    </div>
                  )}
                  {curveStep && sellAmount && (
                    <div>
                      Approx base (step*amount): <span className="font-mono">{formatSof4(curveStep.price * BigInt(sellAmount))}</span> SOF
                    </div>
                  )}
                  <div>
                    Test quotes: 1 → <span className="font-mono">{formatSof4(testSell1)}</span> SOF, 10 → <span className="font-mono">{formatSof4(testSell10)}</span> SOF
                  </div>
                </div>
              )}
              {sellEstError && (
                <div className="text-xs text-amber-600">Estimate warning: {sellEstError}</div>
              )}
              <div className="flex items-center gap-2">
                <label htmlFor="slip" className="text-sm">Slippage %</label>
                <Input id="slip" type="number" min="0" max="100" step="0.1" value={sellSlippagePct} onChange={(e) => setSellSlippagePct(e.target.value)} className="w-24" />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={sellTokens.isPending || seasonDetailsQuery.data.status !== 1}
              >
                {sellTokens.isPending ? 'Processing...' : 'Sell Tickets'}
              </Button>
            </form>
            {sellTokens.isError && (
              <p className="text-red-500">Error: {sellTokens.error?.message}</p>
            )}
            {sellTokens.isSuccess && <p className="text-green-500">Sell successful!</p>}
              </CardContent>
            </Card>
          );
        })()
      )}
    </div>
  );
};

export default RaffleDetails;
