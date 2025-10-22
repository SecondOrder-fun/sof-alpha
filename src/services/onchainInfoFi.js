// src/services/onchainInfoFi.js
// Lightweight viem helpers to read/write InfoFi on-chain state without relying on DB.

import { createPublicClient, createWalletClient, getAddress, http, webSocket, custom, keccak256, encodePacked, parseUnits } from 'viem';
import { 
  InfoFiMarketFactoryAbi, 
  InfoFiPriceOracleAbi, 
  InfoFiMarketAbi,
  RaffleAbi,
  ERC20Abi 
} from '@/utils/abis';
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
  
  // Try explicit overload when prediction is provided
  if (typeof prediction === 'boolean') {
    try {
      const bet = await publicClient.readContract({ address: market.address, abi: market.abi, functionName: 'getBet', args: [idU256, getAddress(account), prediction] });
      const arr = Array.isArray(bet) ? bet : [bet.prediction, bet.amount, bet.claimed, bet.payout];
      return { prediction: Boolean(arr[0]), amount: BigInt(arr[1] ?? 0), claimed: Boolean(arr[2]), payout: BigInt(arr[3] ?? 0) };
    } catch (_) { /* fall through */ }
  }
  // Fallback to two-arg overload
  try {
    const bet = await publicClient.readContract({ address: market.address, abi: market.abi, functionName: 'getBet', args: [idU256, getAddress(account)] });
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
  
  const nextId = await publicClient.readContract({ address: market.address, abi: market.abi, functionName: 'nextMarketId', args: [] });
  const count = typeof nextId === 'bigint' ? Number(nextId) : Number(nextId || 0);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const info = await publicClient.readContract({ address: market.address, abi: market.abi, functionName: 'getMarket', args: [BigInt(i)] });
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
      abi: InfoFiMarketFactoryAbi,
    },
    oracle: {
      address: addrs.INFOFI_ORACLE,
      abi: InfoFiPriceOracleAbi,
    },
    market: {
      address: addrs.INFOFI_MARKET,
      abi: InfoFiMarketAbi,
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

// Helper to safely convert BigInt to Number for basis points
function bpsToNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') {
    const num = Number(value);
    // Sanity check: basis points should be 0-10000
    return (num >= 0 && num <= 10000) ? num : null;
  }
  // Try parsing string
  const parsed = Number(value);
  return (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 10000) ? parsed : null;
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
    // Normalize BigInt values to Numbers
    const normalized = {
      raffleProbabilityBps: bpsToNumber(price.raffleProbabilityBps ?? price[0]),
      marketSentimentBps: bpsToNumber(price.marketSentimentBps ?? price[1]),
      hybridPriceBps: bpsToNumber(price.hybridPriceBps ?? price[2]),
      lastUpdate: Number(price.lastUpdate ?? price[3] ?? 0),
      active: Boolean(price.active ?? price[4] ?? false),
    };
    return normalized;
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
        hybridPriceBps: bpsToNumber(hybrid),
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
        const normalized = {
          raffleProbabilityBps: bpsToNumber(price.raffleProbabilityBps ?? price[0]),
          marketSentimentBps: bpsToNumber(price.marketSentimentBps ?? price[1]),
          hybridPriceBps: bpsToNumber(price.hybridPriceBps ?? price[2]),
          lastUpdate: Number(price.lastUpdate ?? price[3] ?? 0),
          active: Boolean(price.active ?? price[4] ?? false),
        };
        return normalized;
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
  
  // Enrich markets with oracle probability data
  if (byEvents.length > 0) {
    const marketsWithProbability = await Promise.all(
      byEvents.map(async (market) => {
        try {
          const priceData = await readOraclePrice({ 
            marketId: market.id, 
            networkKey 
          });
          
          return {
            ...market,
            current_probability: priceData.hybridPriceBps,
            raffle_probability: priceData.raffleProbabilityBps,
            market_sentiment: priceData.marketSentimentBps,
          };
        } catch (_error) {
          // If oracle read fails, return market without probability
          return market;
        }
      })
    );
    
    return marketsWithProbability;
  }
  
  // Fallback: derive from players and read uint256 IDs from factory mapping
  const { publicClient } = buildClients(networkKey);
  const { factory } = getContracts(networkKey);
  const players = await getSeasonPlayersOnchain({ seasonId, networkKey });
  
  const markets = [];
  for (const p of players) {
    try {
      // Read the actual uint256 market ID from the factory mapping
      const marketId = await publicClient.readContract({
        address: factory.address,
        abi: factory.abi,
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
    const result = await publicClient.readContract({
      address: addrs.RAFFLE,
      abi: RaffleAbi,
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
  const eventAbi = InfoFiMarketFactoryAbi.find((e) => e.type === 'event' && e.name === 'MarketCreated');
  
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
          abi: factory.abi,
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
  
  // Primary mapping name
  try {
    const out = await publicClient.readContract({ address: market.address, abi: market.abi, functionName: 'bets', args: [idU256, getAddress(account), Boolean(prediction)] });
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
      const res = await publicClient.readContract({ address: market.address, abi: market.abi, functionName: 'bets', args: [idB32, getAddress(account), Boolean(prediction)] });
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

// Place a bet (buy position) using FPMM system. Amount is SOF (18 decimals) as human string/number.
export async function placeBetTx({ marketId, prediction, amount, networkKey = 'LOCAL', seasonId, player }) {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No wallet available');
  const chain = getNetworkByKey(networkKey);
  const walletClient = createWalletClient({ chain: { id: chain.id }, transport: custom(window.ethereum) });
  const publicClient = createPublicClient({ chain: { id: chain.id }, transport: http(chain.rpcUrl) });
  const [from] = await walletClient.getAddresses();
  if (!from) throw new Error('Connect wallet first');
  
  const addrs = getContractAddresses(networkKey);
  if (!addrs.INFOFI_FPMM) throw new Error('INFOFI_FPMM address missing');
  if (!addrs.SOF) throw new Error('SOF address missing');

  const parsed = typeof amount === 'bigint' ? amount : parseUnits(String(amount ?? '0'), 18);

  // Get the FPMM contract address for this player/season
  // SimpleFPMM ABI for buy function
  const fpmmAbi = [
    {
      "type": "function",
      "name": "buy",
      "inputs": [
        {"name": "buyYes", "type": "bool"},
        {"name": "amountIn", "type": "uint256"},
        {"name": "minAmountOut", "type": "uint256"}
      ],
      "outputs": [{"name": "amountOut", "type": "uint256"}],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "calcBuyAmount",
      "inputs": [
        {"name": "buyYes", "type": "bool"},
        {"name": "amountIn", "type": "uint256"}
      ],
      "outputs": [{"name": "amountOut", "type": "uint256"}],
      "stateMutability": "view"
    }
  ];

  // InfoFiFPMMV2 ABI for getMarket
  const fpmmManagerAbi = [
    {
      "type": "function",
      "name": "getMarket",
      "inputs": [
        {"name": "seasonId", "type": "uint256"},
        {"name": "player", "type": "address"}
      ],
      "outputs": [{"name": "", "type": "address"}],
      "stateMutability": "view"
    }
  ];

  // Get FPMM address for this player
  let fpmmAddress;
  try {
    fpmmAddress = await publicClient.readContract({
      address: addrs.INFOFI_FPMM,
      abi: fpmmManagerAbi,
      functionName: 'getMarket',
      args: [BigInt(seasonId), getAddress(player)],
    });
  } catch (e) {
    throw new Error(`Failed to get FPMM address: ${e.message}`);
  }

  if (!fpmmAddress || fpmmAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('No FPMM market exists for this player yet');
  }

  // Calculate minimum amount out (allow 2% slippage)
  let minAmountOut = 0n;
  try {
    const expectedOut = await publicClient.readContract({
      address: fpmmAddress,
      abi: fpmmAbi,
      functionName: 'calcBuyAmount',
      args: [Boolean(prediction), parsed],
    });
    minAmountOut = (expectedOut * 98n) / 100n; // 2% slippage tolerance
  } catch (_) {
    // If calculation fails, use 0 (no slippage protection)
    minAmountOut = 0n;
  }

  // Ensure SOF allowance for FPMM contract
  const allowance = await publicClient.readContract({
    address: addrs.SOF,
    abi: ERC20Abi.abi,
    functionName: 'allowance',
    args: [from, fpmmAddress],
  });
  
  if ((allowance ?? 0n) < parsed) {
    const approveHash = await walletClient.writeContract({
      address: addrs.SOF,
      abi: ERC20Abi.abi,
      functionName: 'approve',
      args: [fpmmAddress, parsed],
      account: from,
    });
    // Wait for approval to be mined
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  // Execute buy on FPMM
  try {
    const sim = await publicClient.simulateContract({
      address: fpmmAddress,
      abi: fpmmAbi,
      functionName: 'buy',
      args: [Boolean(prediction), parsed, minAmountOut],
      account: from,
    });
    const txHash = await walletClient.writeContract(sim.request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  } catch (e) {
    throw new Error(`FPMM buy failed: ${e.message}`);
  }
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
