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
// Removed Dialog imports after early-end cleanup
import { keccak256, stringToHex, parseUnits, formatUnits, createWalletClient, custom, getAddress, encodePacked } from 'viem';
import { getContractAddresses } from '@/config/contracts';
import HealthStatus from '@/components/admin/HealthStatus';

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
  const { createSeason, startSeason } = useRaffleWrite();
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

  // Minimal ABIs used for local E2E resolution
  const RaffleMiniAbi = [
    { type: 'function', name: 'requestSeasonEnd', stateMutability: 'nonpayable', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'setSeasonMerkleRoot', stateMutability: 'nonpayable', inputs: [{ name: 'seasonId', type: 'uint256' }, { name: 'merkleRoot', type: 'bytes32' }], outputs: [] },
    { type: 'function', name: 'getParticipants', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }] },
    { type: 'function', name: 'getParticipantPosition', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }, { name: 'participant', type: 'address' }], outputs: [{ name: 'position', type: 'tuple', components: [
      { name: 'ticketCount', type: 'uint256' }, { name: 'entryBlock', type: 'uint256' }, { name: 'lastUpdateBlock', type: 'uint256' }, { name: 'isActive', type: 'bool' }
    ]}] },
  ];

  const DistributorMiniAbi = [
    { type: 'function', name: 'getSeason', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [
      { name: 'token', type: 'address' }, { name: 'grandWinner', type: 'address' }, { name: 'grandAmount', type: 'uint256' }, { name: 'consolationAmount', type: 'uint256' }, { name: 'totalTicketsSnapshot', type: 'uint256' }, { name: 'grandWinnerTickets', type: 'uint256' }, { name: 'merkleRoot', type: 'bytes32' }, { name: 'funded', type: 'bool' }, { name: 'grandClaimed', type: 'bool' }
    ]}] },
  ];

  // Helper: build Merkle root from leaves (index,address,amount) using keccak256(abi.encodePacked(...)) and sorted pair hashing
  function buildMerkleRoot(leaves) {
    const hashes = leaves.map((l) => keccak256(encodePacked(['uint256','address','uint256'], [BigInt(l.index), getAddress(l.account), BigInt(l.amount)])));
    if (hashes.length === 0) return '0x'.padEnd(66, '0');
    let layer = hashes;
    while (layer.length > 1) {
      const next = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i];
        const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
        const packed = left.toLowerCase() < right.toLowerCase() ? `${left}${right.slice(2)}` : `${right}${left.slice(2)}`;
        next.push(keccak256(`0x${packed.slice(2)}`));
      }
      layer = next;
    }
    return layer[0];
  }

  async function endSeasonLocalE2E(seasonId) {
    try {
      setEndingE2EId(seasonId);
      setEndStatus('Requesting season end...');
      // Step 1: requestSeasonEnd via wallet
      const netKey = getStoredNetworkKey();
      const raffleAddr = getContractAddresses(netKey).RAFFLE;
      const distributorAddr = (await publicClient.readContract({ address: raffleAddr, abi: [{ type:'function', name:'prizeDistributor', stateMutability:'view', inputs:[], outputs:[{type:'address'}]}], functionName: 'prizeDistributor' }));

      const wallet = createWalletClient({ chain: { id: chainId }, transport: custom(window.ethereum) });
      const [from] = await wallet.getAddresses();
      const endHash = await wallet.writeContract({ address: raffleAddr, abi: RaffleMiniAbi, functionName: 'requestSeasonEnd', args: [BigInt(seasonId)], account: from });

      // Step 2: fulfill VRF on local (chainId 31337) using known mock address
      setEndStatus('Fulfilling VRF...');
      let requestIdDec = null;
      if (chainId === 31337) {
        const vrfMock = getContractAddresses(netKey).VRF_COORDINATOR || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
        // First try to parse the tx receipt for the VRF request emitted during requestSeasonEnd
        const endReceipt = await publicClient.waitForTransactionReceipt({ hash: endHash });
        let matchLog = [...(endReceipt.logs || [])].reverse().find((lg) => (lg.address || '').toLowerCase() === vrfMock.toLowerCase());
        // Fallback: scan chain logs if not found in receipt (e.g., if coordinator emitted in another tx)
        if (!matchLog) {
          const sLogs = await publicClient.getLogs({ address: vrfMock, fromBlock: 0n, toBlock: 'latest' });
          const raffleTopic = `0x${raffleAddr.toLowerCase().slice(2).padStart(64,'0')}`;
          matchLog = [...sLogs].reverse().find((lg) => (lg.topics?.[3] || '').toLowerCase() === raffleTopic);
        }
        if (!matchLog) {
          setVerify((prev) => ({ ...prev, [seasonId]: { error: 'No VRF requestId found for this raffle. Confirm end time has passed, then retry.' } }));
          throw new Error('VRF request log not found for raffle');
        }
        const dataHex = matchLog.data || '0x';
        // Heuristic: take first 32-byte word from data as requestId
        const reqHex = dataHex.slice(0, 66);
        requestIdDec = parseInt(reqHex, 16);
        if (!Number.isFinite(requestIdDec)) {
          setVerify((prev) => ({ ...prev, [seasonId]: { error: 'Could not parse VRF requestId from log.' } }));
          throw new Error('Failed to parse VRF requestId');
        }
        // Call fulfillRandomWords(requestId, raffle)
        await wallet.writeContract({ address: vrfMock, abi: [{ type:'function', name:'fulfillRandomWords', stateMutability:'nonpayable', inputs:[{type:'uint256'},{type:'address'}], outputs:[] }], functionName: 'fulfillRandomWords', args: [BigInt(requestIdDec), raffleAddr], account: from });
      }

      // Step 3: verify distributor funded & compute merkle
      setEndStatus('Computing Merkle root...');
      const distributor = distributorAddr;
      const snap = await publicClient.readContract({ address: distributor, abi: DistributorMiniAbi, functionName: 'getSeason', args: [BigInt(seasonId)] });
      const grandWinner = snap.grandWinner || snap[1];
      const consol = BigInt(snap.consolationAmount || snap[3] || 0);
      const totalTicketsSnapshot = BigInt(snap.totalTicketsSnapshot || snap[4] || 0);
      const grandWinnerTickets = BigInt(snap.grandWinnerTickets || snap[5] || 0);
      const funded = Boolean(snap.funded ?? snap[7] ?? false);

      let root = '0x'.padEnd(66, '0');
      if (consol > 0n && totalTicketsSnapshot > 0n) {
        const participants = await publicClient.readContract({ address: raffleAddr, abi: RaffleMiniAbi, functionName: 'getParticipants', args: [BigInt(seasonId)] });
        const denom = totalTicketsSnapshot - grandWinnerTickets;
        const leaves = [];
        let idx = 0;
        if (denom > 0n) {
          for (const acct of participants) {
            if (acct.toLowerCase() === String(grandWinner).toLowerCase()) continue;
            const pos = await publicClient.readContract({ address: raffleAddr, abi: RaffleMiniAbi, functionName: 'getParticipantPosition', args: [BigInt(seasonId), acct] });
            const tickets = BigInt(pos?.ticketCount ?? (Array.isArray(pos) ? pos[0] : 0));
            if (tickets === 0n) continue;
            const amount = (consol * tickets) / denom;
            if (amount > 0n) leaves.push({ index: idx++, account: acct, amount: amount.toString() });
          }
        }
        root = buildMerkleRoot(leaves);
      }

      // Step 4: setSeasonMerkleRoot on raffle
      setEndStatus('Setting merkle root on-chain...');
      await wallet.writeContract({ address: raffleAddr, abi: RaffleMiniAbi, functionName: 'setSeasonMerkleRoot', args: [BigInt(seasonId), root], account: from });

      setEndStatus('Done');
      allSeasonsQuery.refetch();
      // Store verification for UI
      setVerify((prev) => ({
        ...prev,
        [seasonId]: {
          funded,
          grandWinner,
          grandAmount: String(snap.grandAmount ?? snap[2] ?? 0n),
          consolationAmount: String(consol),
          requestId: requestIdDec,
          error: null,
        },
      }));
    } catch (e) {
      setEndStatus(`Error: ${e?.shortMessage || e?.message || String(e)}`);
    } finally {
      setEndingE2EId(null);
    }
  }

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
  // Grand prize split as percentage for UI (we'll convert to BPS when building config)
  const [grandPct, setGrandPct] = useState('65');
  const [autoStartTriggered, setAutoStartTriggered] = useState(false);
  // Track which season row initiated actions to scope status/errors per row
  const [lastStartSeasonId, setLastStartSeasonId] = useState(null);
  const [lastEndSeasonId, setLastEndSeasonId] = useState(null);
  // Removed early-end flow states
  const [endingE2EId, setEndingE2EId] = useState(null);
  const [endStatus, setEndStatus] = useState('');
  // Post-action verification per seasonId
  const [verify, setVerify] = useState({}); // { [seasonId]: { funded, grandWinner, grandAmount, consolationAmount, requestId, error } }
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
    // Validate grand prize percentage (UI only constraints 55% - 75%)
    const grandParsedPct = Number(grandPct);
    if (Number.isNaN(grandParsedPct) || grandParsedPct < 55 || grandParsedPct > 75) {
      setFormError('Grand Prize must be between 55% and 75%');
      return;
    }
    const grandPrizeBps = Math.round(grandParsedPct * 100); // convert % -> BPS
    const config = {
      name,
      startTime: BigInt(start),
      endTime: BigInt(end),
      winnerCount: 1,
      prizePercentage: 80,
      consolationPercentage: 10,
      grandPrizeBps,
      raffleToken: '0x0000000000000000000000000000000000000000',
      bondingCurve: '0x0000000000000000000000000000000000000000',
      isActive: false,
      isCompleted: false,
    };

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

  // Early-end flow removed; no chained start->end effect

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
            <CardTitle>Platform Health</CardTitle>
            <CardDescription>Backend connectivity status</CardDescription>
          </CardHeader>
          <CardContent>
            <HealthStatus />
          </CardContent>
        </Card>
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
                <label className="text-sm">Grand Prize Split (%)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={55}
                    max={75}
                    step={1}
                    value={grandPct}
                    onChange={(e) => setGrandPct(e.target.value)}
                    className="w-full"
                  />
                  <span className="w-12 text-right text-sm font-mono">{grandPct}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Allowed range: 55%–75%. You can adjust per season.</p>
              </div>
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
                  <Button onClick={() => { setLastStartSeasonId(season.id); startSeason?.mutate && startSeason.mutate({ seasonId: season.id }); }} disabled={startSeason?.isPending || !hasCreatorRole || !canStart || !chainMatch}>
                    Start
                  </Button>
                  {showStartStatus && startSeason?.error && (
                    <p className="text-xs text-red-600 max-w-[260px] break-words">
                      {startSeason.error.message}
                    </p>
                  )}
                  {/* End action (single click, local E2E). Enabled only after end time */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => endSeasonLocalE2E(season.id)}
                      disabled={endingE2EId === season.id || !hasCreatorRole || !chainMatch || !canEnd}
                      variant="destructive"
                    >
                      {endingE2EId === season.id ? (endStatus || 'Ending…') : 'End Season'}
                    </Button>
                  </div>
                  {showStartStatus && <TransactionStatus mutation={startSeason} />}
                  {/* Post-action verification splash */}
                  {verify[season.id] && (
                    <div className="mt-2 p-2 border rounded text-xs">
                      {verify[season.id].error ? (
                        <p className="text-red-600">{verify[season.id].error}</p>
                      ) : (
                        <>
                          <p>Winner: <span className="font-mono">{verify[season.id].grandWinner}</span></p>
                          <p>Grand: <span className="font-mono">{verify[season.id].grandAmount}</span> SOF • Consolation: <span className="font-mono">{verify[season.id].consolationAmount}</span> SOF</p>
                          <p>Funded: {verify[season.id].funded ? 'Yes' : 'No'}{verify[season.id].requestId != null ? ` • VRF reqId: ${verify[season.id].requestId}` : ''}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );})}
          </CardContent>
        </Card>
      </div>

      {/* Early end modal removed for MVP cleanup */}
    </div>
  );
};

export default AdminPanel;
