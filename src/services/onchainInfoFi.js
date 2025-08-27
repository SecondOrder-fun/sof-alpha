// src/services/onchainInfoFi.js
// Lightweight viem helpers to read/write InfoFi on-chain state without relying on DB.

import { createPublicClient, createWalletClient, getAddress, http, webSocket, custom, keccak256, encodePacked } from 'viem';
import InfoFiMarketFactoryABI from '@/contracts/abis/InfoFiMarketFactory.json';
import InfoFiPriceOracleABI from '@/contracts/abis/InfoFiPriceOracle.json';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';

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
  // marketId must be 0x-prefixed 32-byte value
  const id = typeof marketId === 'string' ? marketId : `0x${marketId.toString(16).padStart(64, '0')}`;
  const price = await publicClient.readContract({
    address: oracle.address,
    abi: oracle.abi,
    functionName: 'getPrice',
    args: [id],
  });
  // Returns struct PriceData { raffleProbabilityBps, marketSentimentBps, hybridPriceBps, lastUpdate, active }
  return price;
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
  const players = await getSeasonPlayersOnchain({ seasonId, networkKey });
  const list = [];
  for (const p of players) {
    let created = false;
    try {
      created = await hasWinnerMarketOnchain({ seasonId, player: p, networkKey });
    } catch (_) {
      created = false;
    }
    if (created) {
      list.push({
        id: computeWinnerMarketId({ seasonId, player: p }),
        seasonId: Number(seasonId),
        raffle_id: Number(seasonId),
        player: getAddress(p),
        market_type: 'WINNER_PREDICTION',
      });
    }
  }
  return list;
}
