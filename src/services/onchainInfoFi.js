// src/services/onchainInfoFi.js
// Lightweight viem helpers to read/write InfoFi on-chain state without relying on DB.

import { createPublicClient, createWalletClient, getAddress, http, webSocket, custom, keccak256, encodePacked, parseUnits } from 'viem';
import InfoFiMarketFactoryABI from '@/contracts/abis/InfoFiMarketFactory.json';
import InfoFiPriceOracleABI from '@/contracts/abis/InfoFiPriceOracle.json';
import InfoFiMarketABI from '@/contracts/abis/InfoFiMarket.json';
import ERC20Abi from '@/contracts/abis/ERC20.json';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import { queryLogsInChunks, estimateBlockFromTimestamp } from '@/utils/blockRangeQuery';

// Build a public client (HTTP) and optional WS client for subscriptions
function buildClients(networkKey) {
  const chain = getNetworkByKey(networkKey);
  const transportHttp = http(chain.rpcUrl);
  // Optional WS support if provided via env
  const wsUrl = import.meta.env.VITE_WS_URL_LOCAL && networkKey?.toUpperCase() === 'LOCAL'
    ? import.meta.env.VITE_WS_URL_LOCAL
    : import.meta.env.VITE_WS_URL_TESTNET;
  const transportWs = wsUrl ? webSocket(wsUrl) : null;
  const publicClient = createPublicClient({ chain: { id: chain.id }, transport: transportHttp });
  const wsClient = transportWs ? createPublicClient({ chain: { id: chain.id }, transport: transportWs }) : null;
  return { publicClient, wsClient };
}

// Read full bet info including claimed/payout, preferring explicit prediction overload
export async function readBetFull({ marketId, account, prediction, networkKey = 'LOCAL' }) {
  const { publicClient } = buildClients(networkKey);
  const { market } = getContracts(networkKey);
  if (!market.address) throw new Error('INFOFI_MARKET address missing');
  const idU256 = toUint256Id(marketId);
  // ABI fragment for getBet overloads
  const GetBetAbi = [
    { type: 'function', name: 'getBet', stateMutability: 'view', inputs: [
      { name: 'marketId', type: 'uint256' }, { name: 'better', type: 'address' }, { name: 'prediction', type: 'bool' }
    ], outputs: [{ name: '', type: 'tuple', components: [
      { name: 'prediction', type: 'bool' }, { name: 'amount', type: 'uint256' }, { name: 'claimed', type: 'bool' }, { name: 'payout', type: 'uint256' }
    ]}] },
    { type: 'function', name: 'getBet', stateMutability: 'view', inputs: [
      { name: 'marketId', type: 'uint256' }, { name: 'better', type: 'address' }
    ], outputs: [{ name: '', type: 'tuple', components: [
      { name: 'prediction', type: 'bool' }, { name: 'amount', type: 'uint256' }, { name: 'claimed', type: 'bool' }, { name: 'payout', type: 'uint256' }
    ]}] },
  ];
  // Try explicit overload when prediction is provided
  if (typeof prediction === 'boolean') {
    try {
      const bet = await publicClient.readContract({ address: market.address, abi: GetBetAbi, functionName: 'getBet', args: [idU256, getAddress(account), prediction] });
      const arr = Array.isArray(bet) ? bet : [bet.prediction, bet.amount, bet.claimed, bet.payout];
      return { prediction: Boolean(arr[0]), amount: BigInt(arr[1] ?? 0), claimed: Boolean(arr[2]), payout: BigInt(arr[3] ?? 0) };
    } catch (_) { /* fall through */ }
  }
  // Fallback to two-arg overload
  try {
    const bet = await publicClient.readContract({ address: market.address, abi: GetBetAbi, functionName: 'getBet', args: [idU256, getAddress(account)] });
    const arr = Array.isArray(bet) ? bet : [bet.prediction, bet.amount, bet.claimed, bet.payout];
    return { prediction: Boolean(arr[0]), amount: BigInt(arr[1] ?? 0), claimed: Boolean(arr[2]), payout: BigInt(arr[3] ?? 0) };
  } catch (e) {
    return { prediction: false, amount: 0n, claimed: false, payout: 0n };
  }
}

// Enumerate all markets directly from the InfoFiMarket contract as a fallback when
// factory events or season player lists are unavailable.
export async function enumerateAllMarkets({ networkKey = 'LOCAL' }) {
  const { publicClient } = buildClients(networkKey);
  const { market } = getContracts(networkKey);
  if (!market.address) throw new Error('INFOFI_MARKET address missing');
  // Minimal ABI for nextMarketId and getMarket
  const abiMini = [
    { type: 'function', name: 'nextMarketId', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
    { type: 'function', name: 'getMarket', stateMutability: 'view', inputs: [{ name: 'marketId', type: 'uint256' }], outputs: [{
      name: '', type: 'tuple', components: [
        { name: 'id', type: 'uint256' },
        { name: 'raffleId', type: 'uint256' },
        { name: 'question', type: 'string' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'resolvedAt', type: 'uint256' },
        { name: 'locked', type: 'bool' },
        { name: 'totalYesPool', type: 'uint256' },
        { name: 'totalNoPool', type: 'uint256' },
      ]
    }] }
  ];
  const nextId = await publicClient.readContract({ address: market.address, abi: abiMini, functionName: 'nextMarketId', args: [] });
  const count = typeof nextId === 'bigint' ? Number(nextId) : Number(nextId || 0);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const info = await publicClient.readContract({ address: market.address, abi: abiMini, functionName: 'getMarket', args: [BigInt(i)] });
      const raffleId = Number(info?.raffleId ?? (Array.isArray(info) ? info[1] : 0));
      out.push({ id: String(i), seasonId: raffleId, raffle_id: raffleId });
    } catch (_) { /* skip */ }
  }
  return out;
}

// Helpers to normalize marketId into both candidate shapes
function toUint256Id(marketId) {
  try {
    if (typeof marketId === 'bigint') return marketId;
    if (typeof marketId === 'number') return BigInt(marketId);
    if (typeof marketId === 'string') {
      if (marketId.startsWith('0x')) return BigInt(marketId); // allow hex -> bigint
      return BigInt(marketId);
    }
  } catch (_) { /* fallthrough */ }
  return 0n;
}

function toBytes32Id(marketId) {
  try {
    if (typeof marketId === 'string' && marketId.startsWith('0x') && marketId.length === 66) return marketId;
    const bn = toUint256Id(marketId);
    return `0x${bn.toString(16).padStart(64, '0')}`;
  } catch (_) {
    return '0x'.padEnd(66, '0');
  }
}

function getContracts(networkKey) {
  const addrs = getContractAddresses(networkKey);
  return {
    factory: {
      address: addrs.INFOFI_FACTORY,
      abi: InfoFiMarketFactoryABI,
    },
    oracle: {
      address: addrs.INFOFI_ORACLE,
      abi: InfoFiPriceOracleABI,
    },
    market: {
      address: addrs.INFOFI_MARKET,
      abi: InfoFiMarketABI,
    },
    sof: {
      address: addrs.SOF,
      abi: ERC20Abi,
    },
  };
}

export async function getSeasonPlayersOnchain({ seasonId, networkKey = 'LOCAL' }) {
  const { publicClient } = buildClients(networkKey);
  const { factory } = getContracts(networkKey);
  if (!factory.address) throw new Error('INFOFI_FACTORY address missing');
  const players = await publicClient.readContract({
    address: factory.address,
    abi: factory.abi,
    functionName: 'getSeasonPlayers',
    args: [BigInt(seasonId)],
  });
  return players;
}

export async function hasWinnerMarketOnchain({ seasonId, player, networkKey = 'LOCAL' }) {
  const { publicClient } = buildClients(networkKey);
  const { factory } = getContracts(networkKey);
  if (!factory.address) throw new Error('INFOFI_FACTORY address missing');
  const created = await publicClient.readContract({
    address: factory.address,
    abi: factory.abi,
    functionName: 'hasWinnerMarket',
    args: [BigInt(seasonId), getAddress(player)],
  });
  return created;
}

export async function createWinnerPredictionMarketTx({ seasonId, player, networkKey = 'LOCAL' }) {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No wallet available');
  const chain = getNetworkByKey(networkKey);
  const walletClient = createWalletClient({ chain: { id: chain.id }, transport: custom(window.ethereum) });
  const accountList = await walletClient.getAddresses();
  const from = accountList?.[0];
  if (!from) throw new Error('Connect wallet first');

  const { factory } = getContracts(networkKey);
  const hash = await walletClient.writeContract({
    address: factory.address,
    abi: factory.abi,
    functionName: 'createWinnerPredictionMarket',
    args: [BigInt(seasonId), getAddress(player)],
    account: from,
  });
  return hash;
}

// Optional: subscribe to MarketCreated; falls back to polling if WS not available
export function subscribeMarketCreated({ networkKey = 'LOCAL', onEvent }) {
  const { wsClient } = buildClients(networkKey);
  const { factory } = getContracts(networkKey);
  if (wsClient) {
    const unwatch = wsClient.watchContractEvent({
      address: factory.address,
      abi: factory.abi,
      eventName: 'MarketCreated',
      onLogs: (logs) => {
        logs.forEach((log) => onEvent?.(log));
      },
    });
    return () => unwatch?.();
  }
  // No WS → return noop; callers can refetch periodically
  return () => {};
}

// Oracle: read full price struct for a marketId (bytes32)
export async function readOraclePrice({ marketId, networkKey = 'LOCAL' }) {
  const { publicClient } = buildClients(networkKey);
  const { oracle } = getContracts(networkKey);
  if (!oracle.address) throw new Error('INFOFI_ORACLE address missing');
  // Try both id shapes
  const idB32 = toBytes32Id(marketId);
  const idU256 = toUint256Id(marketId);
  // Try primary getter first
  try {
    const price = await publicClient.readContract({
      address: oracle.address,
      abi: oracle.abi,
      functionName: 'getPrice',
      args: [idU256],
    });
    // Expect struct PriceData { raffleProbabilityBps, marketSentimentBps, hybridPriceBps, lastUpdate, active }
    return price;
  } catch (_) {
    // Fallback: some oracles expose only getMarketPrice(bytes32) returning hybrid price
    try {
      const hybrid = await publicClient.readContract({
        address: oracle.address,
        abi: oracle.abi,
        functionName: 'getMarketPrice',
        args: [idB32],
      });
      return {
        raffleProbabilityBps: null,
        marketSentimentBps: null,
        hybridPriceBps: Number(hybrid),
        lastUpdate: 0,
        active: true,
      };
    } catch (e2) {
      // Last try: some implementations might index by uint256
      try {
        const price = await publicClient.readContract({
          address: oracle.address,
          abi: oracle.abi,
          functionName: 'getPriceU256', // optional alternative
          args: [idU256],
        });
        return price;
      } catch (_) { /* no-op */ }
      // Last resort: return an inactive struct
      return {
        raffleProbabilityBps: null,
        marketSentimentBps: null,
        hybridPriceBps: null,
        lastUpdate: 0,
        active: false,
      };
    }
  }
}

// Oracle: subscribe to PriceUpdated
export function subscribeOraclePriceUpdated({ networkKey = 'LOCAL', onEvent }) {
  const { wsClient } = buildClients(networkKey);
  const { oracle } = getContracts(networkKey);
  if (wsClient) {
    const unwatch = wsClient.watchContractEvent({
      address: oracle.address,
      abi: oracle.abi,
      eventName: 'PriceUpdated',
      onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
    });
    return () => unwatch?.();
  }
  return () => {};
}

// Compute bytes32 marketId for WINNER_PREDICTION markets
// Solidity: keccak256(abi.encodePacked(seasonId, player, keccak256("WINNER_PREDICTION")))
export function computeWinnerMarketId({ seasonId, player }) {
  const typeHash = keccak256(encodePacked(['string'], ['WINNER_PREDICTION']));
  const packed = encodePacked(
    ['uint256', 'address', 'bytes32'],
    [BigInt(seasonId), getAddress(player), typeHash]
  );
  return keccak256(packed);
}

// Enumerate season winner markets purely from chain
export async function listSeasonWinnerMarkets({ seasonId, networkKey = 'LOCAL' }) {
  // Prefer real market ids from MarketCreated events (uint256), fallback to synthetic if needed
  const byEvents = await listSeasonWinnerMarketsByEvents({ seasonId, networkKey });
  if (byEvents.length > 0) return byEvents;
  
  // Fallback: derive from players and read uint256 IDs from factory mapping
  const { publicClient } = buildClients(networkKey);
  const addrs = getContractAddresses(networkKey);
  const players = await getSeasonPlayersOnchain({ seasonId, networkKey });
  
  // Minimal ABI to read winnerPredictionMarketIds mapping
  const MarketIdMappingAbi = [{
    type: 'function',
    name: 'winnerPredictionMarketIds',
    stateMutability: 'view',
    inputs: [
      { name: 'seasonId', type: 'uint256' },
      { name: 'player', type: 'address' }
    ],
    outputs: [{ name: 'marketId', type: 'uint256' }]
  }];
  
  const markets = [];
  for (const p of players) {
    try {
      // Read the actual uint256 market ID from the factory mapping
      const marketId = await publicClient.readContract({
        address: addrs.INFOFI_FACTORY,
        abi: MarketIdMappingAbi,
        functionName: 'winnerPredictionMarketIds',
        args: [BigInt(seasonId), getAddress(p)]
      });
      
      markets.push({
        id: marketId.toString(), // Use uint256 ID
        seasonId: Number(seasonId),
        raffle_id: Number(seasonId),
        player: getAddress(p),
        market_type: 'WINNER_PREDICTION',
      });
    } catch (e) {
      // If reading fails, fall back to bytes32 ID
      markets.push({
        id: computeWinnerMarketId({ seasonId, player: p }),
        seasonId: Number(seasonId),
        raffle_id: Number(seasonId),
        player: getAddress(p),
        market_type: 'WINNER_PREDICTION',
      });
    }
  }
  
  return markets;
}

// Helper to get season start block for efficient log queries
async function getSeasonStartBlock({ seasonId, networkKey = 'LOCAL' }) {
  const { publicClient } = buildClients(networkKey);
  const addrs = getContractAddresses(networkKey);
  
  // Try to get season start time from Raffle contract
  try {
    const RaffleMinimalAbi = [
      {
        type: 'function',
        name: 'getSeasonDetails',
        stateMutability: 'view',
        inputs: [{ name: 'seasonId', type: 'uint256' }],
        outputs: [
          { name: 'config', type: 'tuple', components: [
            { name: 'startTime', type: 'uint256' },
            { name: 'endTime', type: 'uint256' },
            { name: 'bondingCurve', type: 'address' },
            { name: 'isActive', type: 'bool' }
          ]},
          { name: 'status', type: 'uint8' },
          { name: 'totalParticipants', type: 'uint256' },
          { name: 'totalTickets', type: 'uint256' },
          { name: 'totalPrizePool', type: 'uint256' }
        ]
      }
    ];
    
    const result = await publicClient.readContract({
      address: addrs.RAFFLE,
      abi: RaffleMinimalAbi,
      functionName: 'getSeasonDetails',
      args: [BigInt(seasonId)]
    });
    
    const config = result[0] || result?.config;
    const startTime = Number(config?.startTime || config?.[0] || 0);
    
    if (startTime > 0) {
      // Estimate block from timestamp (Base has ~2 sec block time)
      const avgBlockTime = networkKey?.toUpperCase() === 'LOCAL' ? 1 : 2;
      return await estimateBlockFromTimestamp(publicClient, startTime, avgBlockTime);
    }
  } catch (e) {
    // Failed to get season start time, will use fallback
    // Error details: e.message
  }
  
  // Fallback: use a reasonable recent block (last 100k blocks for Base, 10k for local)
  const currentBlock = await publicClient.getBlockNumber();
  const lookbackBlocks = networkKey?.toUpperCase() === 'LOCAL' ? 10000n : 100000n;
  return currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;
}

// Retrieve winner markets via factory events (real uint256 ids)
export async function listSeasonWinnerMarketsByEvents({ seasonId, networkKey = 'LOCAL' }) {
  const { publicClient } = buildClients(networkKey);
  const { factory } = getContracts(networkKey);
  if (!factory.address) throw new Error('INFOFI_FACTORY address missing');

  // Get season start block for efficient querying
  const fromBlock = await getSeasonStartBlock({ seasonId, networkKey });
  
  // Build event filter
  const eventAbi = InfoFiMarketFactoryABI.find((e) => e.type === 'event' && e.name === 'MarketCreated');
  
  // Use chunked query to avoid RPC limits
  const logs = await queryLogsInChunks(
    publicClient,
    {
      address: factory.address,
      event: {
        name: 'MarketCreated',
        type: 'event',
        inputs: eventAbi.inputs,
      },
      fromBlock,
      toBlock: 'latest',
    },
    10000n // Max 10k blocks per chunk (safe for most RPC providers)
  );

  // Minimal ABI to read winnerPredictionMarketIds mapping
  const MarketIdMappingAbi = [{
    type: 'function',
    name: 'winnerPredictionMarketIds',
    stateMutability: 'view',
    inputs: [
      { name: 'seasonId', type: 'uint256' },
      { name: 'player', type: 'address' }
    ],
    outputs: [{ name: 'marketId', type: 'uint256' }]
  }];

  const out = [];
  for (const log of logs) {
    const args = log.args || {};
    // Some ABIs name it `seasonId`; guard both cases
    const sid = Number(args.seasonId ?? args._seasonId ?? 0);
    if (sid !== Number(seasonId)) continue;
    // Market type filter (we only list winner prediction here)
    const mtype = String(args.marketType || args._marketType || 'WINNER_PREDICTION');
    if (mtype !== 'WINNER_PREDICTION') continue;
    const player = args.player || args._player || '0x0000000000000000000000000000000000000000';
    
    // Extract marketId from event (now emitted in the event)
    let marketId = args.marketId ?? args._marketId;
    
    // If not in event, read from factory's storage mapping as fallback
    if (!marketId || marketId === 0n || marketId === '0') {
      try {
        marketId = await publicClient.readContract({
          address: factory.address,
          abi: MarketIdMappingAbi,
          functionName: 'winnerPredictionMarketIds',
          args: [BigInt(sid), getAddress(player)]
        });
      } catch (e) {
        // Last resort: use 0
        marketId = 0n;
      }
    }
    
    // Normalize id to a plain decimal string when bigint, otherwise hex string
    let idNorm;
    if (typeof marketId === 'bigint') idNorm = marketId.toString();
    else if (typeof marketId === 'string') idNorm = marketId;
    else idNorm = String(marketId ?? '0');
    
    out.push({
      id: idNorm,
      seasonId: sid,
      raffle_id: sid,
      player: getAddress(player),
      market_type: 'WINNER_PREDICTION',
    });
  }
  return out;
}

// Read a user's bet position for a given marketId and side
export async function readBet({ marketId, account, prediction, networkKey = 'LOCAL' }) {
  const { publicClient } = buildClients(networkKey);
  const { market } = getContracts(networkKey);
  if (!market.address) throw new Error('INFOFI_MARKET address missing');
  const idB32 = toBytes32Id(marketId);
  const idU256 = toUint256Id(marketId);
  // Minimal ABI exactly matching cast: bets(uint256,address,bool) -> (bool exists, uint256 amount, ...)
  const BetsMiniAbiU256 = [
    {
      type: 'function',
      name: 'bets',
      stateMutability: 'view',
      inputs: [
        { name: 'marketId', type: 'uint256', internalType: 'uint256' },
        { name: 'user', type: 'address', internalType: 'address' },
        { name: 'isYes', type: 'bool', internalType: 'bool' }
      ],
      outputs: [
        { name: 'exists', type: 'bool', internalType: 'bool' },
        { name: 'amount', type: 'uint256', internalType: 'uint256' }
      ]
    }
  ];
  const BetsMiniAbiB32 = [
    {
      type: 'function',
      name: 'bets',
      stateMutability: 'view',
      inputs: [
        { name: 'marketId', type: 'bytes32', internalType: 'bytes32' },
        { name: 'user', type: 'address', internalType: 'address' },
        { name: 'isYes', type: 'bool', internalType: 'bool' }
      ],
      outputs: [
        { name: 'exists', type: 'bool', internalType: 'bool' },
        { name: 'amount', type: 'uint256', internalType: 'uint256' }
      ]
    }
  ];
  // Primary mapping name
  try {
    const out = await publicClient.readContract({ address: market.address, abi: BetsMiniAbiU256, functionName: 'bets', args: [idU256, getAddress(account), Boolean(prediction)] });
    // Normalize return
    if (typeof out === 'bigint') return { amount: out };
    if (out && typeof out === 'object') {
      if (typeof out.amount === 'bigint') return { amount: out.amount };
      if (Array.isArray(out)) {
        // Shapes:
        // [exists(bool), amount(uint256)] OR [exists(0/1 bigint), amount(uint256)]
        const a0 = out[0];
        const a1 = out[1];
        if (typeof a0 === 'boolean' && typeof a1 === 'bigint') return { amount: a1 };
        if (typeof a0 === 'bigint' && (a0 === 0n || a0 === 1n) && typeof a1 === 'bigint') return { amount: a1 };
        if (typeof out[0] === 'bigint') return { amount: out[0] };
      }
      if (typeof out['0'] === 'boolean' && typeof out['1'] === 'bigint') return { amount: out['1'] };
      if (typeof out['0'] === 'bigint' && typeof out['1'] === 'bigint' && (out['0'] === 0n || out['0'] === 1n)) return { amount: out['1'] };
      if (typeof out['0'] === 'bigint') return { amount: out['0'] };
    }
    return { amount: 0n };
  } catch (_) {
    // Fallback mapping name variants
    const altNames = ['positions', 'userBets'];
    for (const fn of altNames) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await publicClient.readContract({ address: market.address, abi: market.abi, functionName: fn, args: [idU256, getAddress(account), Boolean(prediction)] });
        if (typeof res === 'bigint') return { amount: res };
        if (res && typeof res === 'object') {
          if (typeof res.amount === 'bigint') return { amount: res.amount };
          if (Array.isArray(res)) {
            const a0 = res[0];
            const a1 = res[1];
            if (typeof a0 === 'boolean' && typeof a1 === 'bigint') return { amount: a1 };
            if (typeof a0 === 'bigint' && (a0 === 0n || a0 === 1n) && typeof a1 === 'bigint') return { amount: a1 };
            if (typeof res[0] === 'bigint') return { amount: res[0] };
          }
          if (typeof res['0'] === 'boolean' && typeof res['1'] === 'bigint') return { amount: res['1'] };
          if (typeof res['0'] === 'bigint' && typeof res['1'] === 'bigint' && (res['0'] === 0n || res['0'] === 1n)) return { amount: res['1'] };
          if (typeof res['0'] === 'bigint') return { amount: res['0'] };
        }
        return { amount: 0n };
      } catch (_) { /* try next */ }
    }
    // Try bytes32 id variants
    try {
      const res = await publicClient.readContract({ address: market.address, abi: BetsMiniAbiB32, functionName: 'bets', args: [idB32, getAddress(account), Boolean(prediction)] });
      if (typeof res === 'bigint') return { amount: res };
      if (res && typeof res === 'object') {
        if (typeof res.amount === 'bigint') return { amount: res.amount };
        if (Array.isArray(res)) {
          const a0 = res[0];
          const a1 = res[1];
          if (typeof a0 === 'boolean' && typeof a1 === 'bigint') return { amount: a1 };
          if (typeof a0 === 'bigint' && (a0 === 0n || a0 === 1n) && typeof a1 === 'bigint') return { amount: a1 };
          if (typeof res[0] === 'bigint') return { amount: res[0] };
        }
        if (typeof res['0'] === 'boolean' && typeof res['1'] === 'bigint') return { amount: res['1'] };
        if (typeof res['0'] === 'bigint' && typeof res['1'] === 'bigint' && (res['0'] === 0n || res['0'] === 1n)) return { amount: res['1'] };
        if (typeof res['0'] === 'bigint') return { amount: res['0'] };
      }
      return { amount: 0n };
    } catch (_) {
      for (const fn of ['positions', 'userBets']) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await publicClient.readContract({
            address: market.address,
            abi: market.abi,
            functionName: fn,
            args: [idB32, getAddress(account), Boolean(prediction)],
          });
          if (typeof res === 'bigint') return { amount: res };
          if (res && typeof res === 'object') {
            if (typeof res.amount === 'bigint') return { amount: res.amount };
            if (Array.isArray(res)) {
              const a0 = res[0];
              const a1 = res[1];
              if (typeof a0 === 'boolean' && typeof a1 === 'bigint') return { amount: a1 };
              if (typeof a0 === 'bigint' && (a0 === 0n || a0 === 1n) && typeof a1 === 'bigint') return { amount: a1 };
              if (typeof res[0] === 'bigint') return { amount: res[0] };
            }
            if (typeof res['0'] === 'boolean' && typeof res['1'] === 'bigint') return { amount: res['1'] };
            if (typeof res['0'] === 'bigint' && typeof res['1'] === 'bigint' && (res['0'] === 0n || res['0'] === 1n)) return { amount: res['1'] };
            if (typeof res['0'] === 'bigint') return { amount: res['0'] };
          }
          return { amount: 0n };
        } catch (_) { /* try next */ }
      }
    }
    // If unreadable, return zero amount shape compatible with UI
    return { amount: 0n };
  }
}

// Place a bet (buy position). Amount is SOF (18 decimals) as human string/number.
export async function placeBetTx({ marketId, prediction, amount, networkKey = 'LOCAL' }) {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No wallet available');
  const chain = getNetworkByKey(networkKey);
  const walletClient = createWalletClient({ chain: { id: chain.id }, transport: custom(window.ethereum) });
  const publicClient = createPublicClient({ chain: { id: chain.id }, transport: http(chain.rpcUrl) });
  const [from] = await walletClient.getAddresses();
  if (!from) throw new Error('Connect wallet first');
  const { market, sof } = getContracts(networkKey);
  if (!market.address) throw new Error('INFOFI_MARKET address missing');
  if (!sof.address) throw new Error('SOF address missing');

  const parsed = typeof amount === 'bigint' ? amount : parseUnits(String(amount ?? '0'), 18);

  // Ensure allowance
  const allowance = await publicClient.readContract({
    address: sof.address,
    abi: sof.abi.abi,
    functionName: 'allowance',
    args: [from, market.address],
  });
  if ((allowance ?? 0n) < parsed) {
    const approveHash = await walletClient.writeContract({
      address: sof.address,
      abi: sof.abi.abi,
      functionName: 'approve',
      args: [market.address, parsed],
      account: from,
    });
    // Wait for approval to be mined to avoid race with transferFrom in placeBet
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const idU256 = toUint256Id(marketId);
  const idB32 = toBytes32Id(marketId);

  // Candidate arg sets to try via simulation in order
  const candidates = [
    [idU256, Boolean(prediction), parsed],
    [idB32,  Boolean(prediction), parsed],
  ];

  // Also try last created id (nextMarketId - 1) as a rescue if above fail and marketId looks like bytes32 hash
  try {
    const nextId = await publicClient.readContract({ address: market.address, abi: market.abi, functionName: 'nextMarketId' });
    const lastId = (typeof nextId === 'bigint' && nextId > 0n) ? (nextId - 1n) : 0n;
    candidates.push([lastId, Boolean(prediction), parsed]);
  } catch (_) { /* optional view; ignore if missing */ }

  // Simulate each candidate and execute the first that succeeds
  for (const args of candidates) {
    try {
      const sim = await publicClient.simulateContract({
        address: market.address,
        abi: market.abi,
        functionName: 'placeBet',
        args,
        account: from,
      });
      const txHash = await walletClient.writeContract(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    } catch (_) { /* try next candidate */ }
  }
  throw new Error('placeBet simulation failed for all marketId candidates');
}

// Claim payout for a market. If prediction is provided, use the two-arg overload.
export async function claimPayoutTx({ marketId, prediction, networkKey = 'LOCAL' }) {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No wallet available');
  const chain = getNetworkByKey(networkKey);
  const walletClient = createWalletClient({ chain: { id: chain.id }, transport: custom(window.ethereum) });
  const publicClient = createPublicClient({ chain: { id: chain.id }, transport: http(chain.rpcUrl) });
  const [from] = await walletClient.getAddresses();
  if (!from) throw new Error('Connect wallet first');
  const { market } = getContracts(networkKey);
  if (!market.address) throw new Error('INFOFI_MARKET address missing');
  const idU256 = toUint256Id(marketId);
  const idB32 = toBytes32Id(marketId);
  if (typeof prediction === 'boolean') {
    try {
      const h = await walletClient.writeContract({ address: market.address, abi: market.abi, functionName: 'claimPayout', args: [idU256, prediction], account: from });
      await publicClient.waitForTransactionReceipt({ hash: h });
      return h;
    } catch (_) {
      const h2 = await walletClient.writeContract({ address: market.address, abi: market.abi, functionName: 'claimPayout', args: [idB32, prediction], account: from });
      await publicClient.waitForTransactionReceipt({ hash: h2 });
      return h2;
    }
  }
  try {
    const h = await walletClient.writeContract({ address: market.address, abi: market.abi, functionName: 'claimPayout', args: [idU256], account: from });
    await publicClient.waitForTransactionReceipt({ hash: h });
    return h;
  } catch (_) {
    const h2 = await walletClient.writeContract({ address: market.address, abi: market.abi, functionName: 'claimPayout', args: [idB32], account: from });
    await publicClient.waitForTransactionReceipt({ hash: h2 });
    return h2;
  }
}
