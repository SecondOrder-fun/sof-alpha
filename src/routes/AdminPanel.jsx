// src/routes/AdminPanel.jsx
import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useAccount, usePublicClient, useChainId } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useRaffleWrite } from '@/hooks/useRaffleWrite';
import { useAllSeasons } from '@/hooks/useAllSeasons';
import { Badge } from '@/components/ui/badge';
import { useAccessControl } from '@/hooks/useAccessControl';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { keccak256, stringToHex, parseUnits, formatUnits } from 'viem';
import { getContractAddresses } from '@/config/contracts';

// Minimal ERC20 ABI for decimals
const ERC20_DECIMALS_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
];

const TransactionStatus = ({ mutation }) => {
  const m = mutation || {};
  // Explorer link
  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const explorerUrl = useMemo(() => {
    if (!net.explorer || !m.hash) return '';
    const base = net.explorer.endsWith('/') ? net.explorer.slice(0, -1) : net.explorer;
    return `${base}/tx/${m.hash}`;
  }, [net.explorer, m.hash]);

  // Pending warning if >60s
  const [pendingSince, setPendingSince] = useState(null);
  const [showPendingWarn, setShowPendingWarn] = useState(false);
  useEffect(() => {
    if (m.hash && !m.isConfirmed && !m.isError) {
      if (!pendingSince) setPendingSince(Date.now());
    } else {
      setPendingSince(null);
      setShowPendingWarn(false);
    }
  }, [m.hash, m.isConfirmed, m.isError, pendingSince]);

  useEffect(() => {
    if (!pendingSince) return;
    const t = setInterval(() => {
      if (Date.now() - pendingSince > 60000) setShowPendingWarn(true);
    }, 5000);
    return () => clearInterval(t);
  }, [pendingSince]);

  // Decide rendering after hooks are set
  const shouldRender = !!m && (
    m.isPending || m.isError || m.isSuccess || m.hash
  );
  if (!shouldRender) return null;

  return (
    <div className="mt-2 text-sm">
      {m.isPending && !m.isConfirming && <p>Please confirm in your wallet...</p>}
      {(m.isConfirming || (m.hash && !m.isConfirmed && !m.isError)) && (
        <p>Transaction submitted. Waiting for confirmation...</p>
      )}
      {m.isConfirmed && m.receipt?.status === 'success' && (
        <p className="text-green-500">Transaction confirmed!</p>
      )}
      {m.isConfirmed && m.receipt?.status === 'reverted' && (
        <p className="text-red-500">Transaction reverted on-chain.</p>
      )}
      {m.hash && (
        <p className="text-xs text-muted-foreground break-all">
          Hash: {m.hash}
          {explorerUrl && (
            <>
              {" "}
              <a className="underline" href={explorerUrl} target="_blank" rel="noreferrer">View on explorer</a>
            </>
          )}
        </p>
      )}
      {showPendingWarn && (
        <p className="text-xs text-amber-600">
          Pending for over 60s. Verify you are on {net.name} and the RAFFLE address matches this network. Check the explorer link above.
        </p>
      )}
      {m.isError && <p className="text-red-500">Error: {m.error?.shortMessage || m.error?.message}</p>}
    </div>
  );
};

TransactionStatus.propTypes = {
  mutation: PropTypes.shape({
    isPending: PropTypes.bool,
    isError: PropTypes.bool,
    isSuccess: PropTypes.bool,
    isConfirming: PropTypes.bool,
    isConfirmed: PropTypes.bool,
    hash: PropTypes.string,
    receipt: PropTypes.shape({
      status: PropTypes.string,
    }),
    error: PropTypes.shape({
      shortMessage: PropTypes.string,
      message: PropTypes.string,
    }),
  }),
  seasonId: PropTypes.number,
};

const AdminPanel = () => {
  const { createSeason, startSeason, requestSeasonEnd, requestSeasonEndEarly } = useRaffleWrite();
  const allSeasonsQuery = useAllSeasons();
  const { address } = useAccount();
  const { hasRole } = useAccessControl();
  const chainId = useChainId();
  const net = getNetworkByKey(getStoredNetworkKey());

  const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const SEASON_CREATOR_ROLE = keccak256(stringToHex('SEASON_CREATOR_ROLE'));
  const EMERGENCY_ROLE = keccak256(stringToHex('EMERGENCY_ROLE'));

  const { data: isAdmin, isLoading: isAdminLoading } = useQuery({
    queryKey: ['isAdmin', address],
    queryFn: () => hasRole(DEFAULT_ADMIN_ROLE, address),
    enabled: !!address,
  });

  const { data: hasCreatorRole, isLoading: isCreatorLoading } = useQuery({
    queryKey: ['hasSeasonCreatorRole', address],
    queryFn: () => hasRole(SEASON_CREATOR_ROLE, address),
    enabled: !!address,
  });

  const { data: hasEmergencyRole, isLoading: isEmergencyLoading } = useQuery({
    queryKey: ['hasEmergencyRole', address],
    queryFn: () => hasRole(EMERGENCY_ROLE, address),
    enabled: !!address,
  });

  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [bondStepsText, setBondStepsText] = useState('');
  const [maxTickets, setMaxTickets] = useState('');
  const [numSteps, setNumSteps] = useState('');
  const [basePrice, setBasePrice] = useState('10'); // $SOF starting price
  const [priceDelta, setPriceDelta] = useState('1'); // $SOF increase per step
  const [sofDecimals, setSofDecimals] = useState(18);
  const [autoStart, setAutoStart] = useState(false);
  const [autoStartTriggered, setAutoStartTriggered] = useState(false);
  // Track which season row initiated actions to scope status/errors per row
  const [lastStartSeasonId, setLastStartSeasonId] = useState(null);
  const [lastEndSeasonId, setLastEndSeasonId] = useState(null);
  const [lastEarlyEndSeasonId, setLastEarlyEndSeasonId] = useState(null);
  const [pendingStartThenEndId, setPendingStartThenEndId] = useState(null);
  const stepSize = useMemo(() => {
    const max = Number(maxTickets);
    const steps = Number(numSteps);
    if (!max || !steps || steps <= 0) return 0;
    return Math.ceil(max / steps);
  }, [maxTickets, numSteps]);

  // Fetch SOF decimals once
  const netKey = getStoredNetworkKey();
  const addresses = getContractAddresses(netKey);
  const publicClient = usePublicClient();

  useEffect(() => {
    let cancelled = false;
    async function loadDecimals() {
      try {
        if (!addresses.SOF || !publicClient) return;
        const dec = await publicClient.readContract({
          address: addresses.SOF,
          abi: ERC20_DECIMALS_ABI,
          functionName: 'decimals',
        });
        if (!cancelled && typeof dec === 'number') setSofDecimals(dec);
      } catch (_) {
        // ignore; default 18
      }
    }
    loadDecimals();
    return () => {
      cancelled = true;
    };
  }, [addresses.SOF, publicClient]);

  // Chain time (block.timestamp) for correct time-window checks
  const [showEarlyEndConfirm, setShowEarlyEndConfirm] = useState(false);
  const [earlyEndSeasonId, setEarlyEndSeasonId] = useState(null);

  const chainTimeQuery = useQuery({
    queryKey: ['chainTime', netKey],
    queryFn: async () => {
      if (!publicClient) return null;
      const block = await publicClient.getBlock();
      return Number(block.timestamp);
    },
    enabled: !!publicClient && !showEarlyEndConfirm,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // Auto-generate linear bond steps JSON when inputs change
  useEffect(() => {
    const max = Number(maxTickets);
    const steps = Number(numSteps);
    const b = Number(basePrice);
    const d = Number(priceDelta);
    if (!max || !steps || steps <= 0 || isNaN(b) || isNaN(d)) return;
    const size = Math.ceil(max / steps);
    const arr = Array.from({ length: steps }, (_, i) => {
      const idx = i + 1;
      const rangeTo = Math.min(size * idx, max);
      const priceScaledBig = (parseUnits(b.toString(), sofDecimals)) + (BigInt(i) * parseUnits(d.toString(), sofDecimals));
      const priceHuman = Number(Number(formatUnits(priceScaledBig, sofDecimals)).toFixed(6));
      return { rangeTo, price: priceHuman, priceScaled: priceScaledBig.toString() };
    });
    setBondStepsText(JSON.stringify(arr));
  }, [maxTickets, numSteps, basePrice, priceDelta, sofDecimals]);
  const [formError, setFormError] = useState('');

  const handleCreateSeason = (e) => {
    e.preventDefault();
    // If auto-start, use chain time (fallback to local) and hide startTime input
    const chainNowSec = typeof chainTimeQuery.data === 'number' ? chainTimeQuery.data : Math.floor(Date.now() / 1000);
    const start = autoStart
      ? chainNowSec
      : Math.floor(new Date(startTime).getTime() / 1000);
    const end = Math.floor(new Date(endTime).getTime() / 1000);
    const config = { name, startTime: BigInt(start), endTime: BigInt(end), winnerCount: 1, prizePercentage: 80, consolationPercentage: 10, raffleToken: '0x0000000000000000000000000000000000000000', bondingCurve: '0x0000000000000000000000000000000000000000', isActive: false, isCompleted: false };

    // Parse and validate bond steps
    let bondSteps = [];
    try {
      const parsed = JSON.parse(bondStepsText || '[]');
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setFormError('Bond steps required: provide a non-empty JSON array of { rangeTo, priceScaled }');
        return;
      }
      // Basic shape validation
      for (const s of parsed) {
        if (
          typeof s !== 'object' ||
          s === null ||
          (typeof s.rangeTo !== 'number' && typeof s.rangeTo !== 'string') ||
          (typeof s.priceScaled !== 'number' && typeof s.priceScaled !== 'string')
        ) {
          setFormError('Each bond step must have numeric rangeTo and priceScaled (smallest units of $SOF, 10^decimals)');
          return;
        }
      }
      // Convert to on-chain friendly types (uint128). priceScaled may be string; convert via BigInt.
      bondSteps = parsed.map((s) => ({ rangeTo: BigInt(s.rangeTo), price: BigInt(s.priceScaled) }));
      setFormError('');
    } catch (err) {
      setFormError('Invalid JSON for bond steps');
      return;
    }
    const buyFeeBps = 10; // 0.10%
    const sellFeeBps = 70; // 0.70%
    createSeason.mutate({ config, bondSteps, buyFeeBps, sellFeeBps });
  };

  // Auto-start newly created season after confirmation
  useEffect(() => {
    if (!autoStart || autoStartTriggered) return;
    if (!createSeason?.isConfirmed) return;
    const seasons = allSeasonsQuery.data || [];
    if (!seasons.length) return;
    // Pick the highest id NotStarted season
    const candidate = seasons
      .filter((s) => s.status === 0)
      .sort((a, b) => Number(b.id) - Number(a.id))[0];
    if (candidate) {
      setLastStartSeasonId(candidate.id);
      startSeason?.mutate && startSeason.mutate({ seasonId: candidate.id });
      setAutoStartTriggered(true);
    }
  }, [autoStart, autoStartTriggered, createSeason?.isConfirmed, allSeasonsQuery.data, startSeason]);

  // If user clicked "Start & End", once Start confirms, immediately request End
  useEffect(() => {
    if (!pendingStartThenEndId) return;
    if (!startSeason?.isConfirmed) return;
    // Only proceed for the same season we started
    if (String(lastStartSeasonId) !== String(pendingStartThenEndId)) return;
    setLastEndSeasonId(pendingStartThenEndId);
    requestSeasonEnd?.mutate && requestSeasonEnd.mutate({ seasonId: pendingStartThenEndId });
    // Clear flag to avoid duplicate triggers
    setPendingStartThenEndId(null);
  }, [pendingStartThenEndId, startSeason?.isConfirmed, lastStartSeasonId, requestSeasonEnd]);

  if (isAdminLoading || isCreatorLoading || isEmergencyLoading) {
    return <p>Checking authorization...</p>;
  }

  if (!isAdmin) {
    return <p>You are not authorized to view this page.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Create New Season</CardTitle>
            <CardDescription>Set up a new raffle season.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSeason} className="space-y-4">
              <Input placeholder="Season Name" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex items-center gap-2">
                <input
                  id="auto-start-toggle"
                  type="checkbox"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                />
                <label htmlFor="auto-start-toggle" className="text-sm">Auto-start this season</label>
              </div>
              {!autoStart && (
                <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              )}
              {autoStart && (
                <p className="text-xs text-muted-foreground">
                  Start time will be set to current chain time when creating.
                </p>
              )}
              <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              <div>
                <label className="text-sm">Bond Steps</label>
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm">Max Tickets</label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 1000000"
                        value={maxTickets}
                        onChange={(e) => setMaxTickets(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm"># of Bond Steps</label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 500"
                        value={numSteps}
                        onChange={(e) => setNumSteps(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm">Initial Price ($SOF)</label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="e.g. 10"
                        value={basePrice}
                        onChange={(e) => setBasePrice(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm">Price Increase per Step ($SOF)</label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="e.g. 1"
                        value={priceDelta}
                        onChange={(e) => setPriceDelta(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Step size: {stepSize || '-'} tickets/step • Price: {basePrice || '-'} → {numSteps && basePrice ? (Number(basePrice) + (Number(numSteps) - 1) * Number(priceDelta)).toString() : '-'} $SOF
                  </p>
                  <label className="text-sm">Bond Steps (JSON)</label>
                  <textarea
                    className="mt-1 w-full border rounded p-2 text-sm"
                    rows={4}
                    placeholder='e.g. [{"rangeTo": 10000, "price": 10, "priceScaled": "10000000000000000000"}] // priceScaled is in smallest units of $SOF (10^decimals)'
                    value={bondStepsText}
                    onChange={(e) => setBondStepsText(e.target.value)}
                  />
                  {formError && <p className="text-xs text-red-500 mt-1">{formError}</p>}
                </div>
              </div>
              <Button type="submit" disabled={createSeason?.isPending}>
                {createSeason?.isPending ? 'Creating...' : 'Create Season'}
              </Button>
              <TransactionStatus mutation={createSeason} />
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Manage Seasons</CardTitle>
            <CardDescription>Start or end existing raffle seasons.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Optimistic pending season row */}
            {(createSeason?.isPending || (createSeason?.hash && !createSeason?.isConfirmed)) && (
              <div className="p-2 border rounded flex justify-between items-center bg-muted/40">
                <div>
                  <p className="font-bold">Season (pending) - {name || 'New Season'}</p>
                  <p className="text-xs text-muted-foreground">
                    Start: {startTime ? new Date(startTime).toLocaleString() : '-'} | End: {endTime ? new Date(endTime).toLocaleString() : '-'}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant='outline'>Pending</Badge>
                  </div>
                </div>
                <div className="flex gap-2 flex-col">
                  <Button disabled variant="secondary">Start</Button>
                  <Button disabled variant="destructive">End</Button>
                  <TransactionStatus mutation={createSeason} />
                </div>
              </div>
            )}
            {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
            {allSeasonsQuery.error && <p>Error loading seasons: {allSeasonsQuery.error.message}</p>}
            {allSeasonsQuery.data && allSeasonsQuery.data
              .filter((season) => Number(season.id) > 0)
              .map((season) => {
              const nowSec = typeof chainTimeQuery.data === 'number' ? chainTimeQuery.data : Math.floor(Date.now() / 1000);
              const startSec = Number(season.config.startTime);
              const endSec = Number(season.config.endTime);
              const isWindowOpen = nowSec >= startSec && nowSec < endSec;
              const isPastEnd = nowSec >= endSec;
              const isNotStarted = season.status === 0; // NotStarted
              const isActive = season.status === 1; // Active
              const isCreator = !!hasCreatorRole;
              const isEmergency = !!hasEmergencyRole;
              const chainMatch = chainId === net.id;
              // Allow late start as long as NotStarted and within window
              const canStart = isNotStarted && isWindowOpen;
              // Allow end if Active and past end; optionally allow end when NotStarted but past end (may revert if contract forbids)
              const canEnd = (isActive && isPastEnd) || (isNotStarted && isPastEnd);
              const startDate = new Date(Number(season.config.startTime) * 1000).toLocaleString();
              const endDate = new Date(Number(season.config.endTime) * 1000).toLocaleString();
              const showStartStatus = lastStartSeasonId === season.id;
              const showEndStatus = lastEndSeasonId === season.id;
              return (
              <div key={season.id} className="p-2 border rounded flex justify-between items-center">
                <div>
                  <p className="font-bold">Season #{season.id} - {season.config.name}</p>
                  <p className="text-xs text-muted-foreground">Start: {startDate} | End: {endDate}</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <Badge variant={season.config.isActive ? 'secondary' : 'outline'}>
                      {season.config.isActive ? 'Ongoing' : 'Inactive'}
                    </Badge>
                    <Badge variant={'outline'}>
                      {season.status === 0 ? 'NotStarted' : season.status === 1 ? 'Active' : 'Completed'}
                    </Badge>
                    <Badge variant={isCreator ? 'secondary' : 'destructive'}>
                      {isCreator ? 'Role OK' : 'Missing Role'}
                    </Badge>
                    <Badge variant={isWindowOpen ? 'secondary' : 'destructive'}>
                      {isWindowOpen ? 'Chain Time OK' : 'Chain Time Closed'}
                    </Badge>
                    <Badge variant={isEmergency ? 'secondary' : 'destructive'}>
                      {isEmergency ? 'Emergency OK' : 'No Emergency Role'}
                    </Badge>
                    <Badge variant={isNotStarted ? 'secondary' : isActive ? 'destructive' : 'destructive'}>
                      {isNotStarted ? 'Ready to Start' : (isActive ? 'Already Active' : 'Completed')}
                    </Badge>
                    <Badge variant={chainMatch ? 'secondary' : 'destructive'}>
                      {chainMatch ? `Chain OK (${chainId})` : `Wrong Chain (${chainId})`}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 flex-col">
                  {!hasCreatorRole && <p className="text-xs text-amber-600">Missing SEASON_CREATOR_ROLE</p>}
                  {/* Start button (shows late label if now > start) */}
                  <Button
                    onClick={() => { setLastStartSeasonId(season.id); startSeason?.mutate && startSeason.mutate({ seasonId: season.id }); }}
                    disabled={startSeason?.isPending || !hasCreatorRole || !canStart || !chainMatch}
                  >
                    {nowSec > startSec ? 'Start Now (late)' : 'Start'}
                  </Button>
                  {showStartStatus && startSeason?.error && (
                    <p className="text-xs text-red-600 max-w-[260px] break-words">
                      {startSeason.error.message}
                    </p>
                  )}
                  {/* Post-end actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => { setLastEndSeasonId(season.id); requestSeasonEnd?.mutate && requestSeasonEnd.mutate({ seasonId: season.id }); }}
                      disabled={requestSeasonEnd?.isPending || !hasCreatorRole || !canEnd || !chainMatch}
                      variant="destructive"
                    >
                      {isPastEnd ? 'End Season' : 'End'}
                    </Button>
                    {/* Early end button: only when Active and before end, gated by EMERGENCY_ROLE */}
                    {isActive && !isPastEnd && (
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setEarlyEndSeasonId(season.id);
                          setShowEarlyEndConfirm(true);
                        }}
                        disabled={requestSeasonEndEarly?.isPending || !isEmergency || !chainMatch}
                      >
                        End Now (early)
                      </Button>
                    )}
                    {isNotStarted && isPastEnd && (
                      <Button
                        variant="secondary"
                        onClick={() => { setPendingStartThenEndId(season.id); setLastStartSeasonId(season.id); startSeason?.mutate && startSeason.mutate({ seasonId: season.id }); }}
                        disabled={startSeason?.isPending || requestSeasonEnd?.isPending || !hasCreatorRole || !chainMatch}
                      >
                        Start & End
                      </Button>
                    )}
                  </div>
                  {showStartStatus && <TransactionStatus mutation={startSeason} />}
                  {showEndStatus && <TransactionStatus mutation={requestSeasonEnd} />}
                  {lastEarlyEndSeasonId === season.id && <TransactionStatus mutation={requestSeasonEndEarly} />}
                </div>
              </div>
            );})}
          </CardContent>
        </Card>
      </div>

      {/* Early End Confirmation Modal */}
      <Dialog open={showEarlyEndConfirm} onOpenChange={(open) => { if (!open) { setShowEarlyEndConfirm(false); setEarlyEndSeasonId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Season Early</DialogTitle>
            <DialogDescription>
              This will immediately lock trading and request VRF to resolve the season. Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setShowEarlyEndConfirm(false); setEarlyEndSeasonId(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={requestSeasonEndEarly?.isPending || !hasEmergencyRole}
              onClick={() => {
                if (!earlyEndSeasonId) return;
                setLastEarlyEndSeasonId(earlyEndSeasonId);
                requestSeasonEndEarly?.mutate && requestSeasonEndEarly.mutate({ seasonId: earlyEndSeasonId });
                setShowEarlyEndConfirm(false);
                // keep earlyEndSeasonId so per-row TransactionStatus renders; it resets when list re-renders
              }}
            >
              Confirm End Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPanel;
