// src/services/onchainRaffleDistributor.js
import { createWalletClient, custom, getAddress } from "viem";
import { RaffleAbi, RafflePrizeDistributorAbi } from "@/utils/abis";
import { getNetworkByKey } from "@/config/networks";
import { getContractAddresses } from "@/config/contracts";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { buildPublicClient } from "@/lib/viemClient";

/**
 * Build a proper chain config object for viem
 * @param {Object} net - Network config from getNetworkByKey
 * @returns {Object} - Viem-compatible chain config
 */
function buildChainConfig(net) {
  return {
    id: net.id,
    name: net.name,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [net.rpcUrl] },
      public: { http: [net.rpcUrl] },
    },
  };
}

function buildClient(networkKey) {
  const client = buildPublicClient(networkKey);
  if (!client) {
    throw new Error("RPC URL missing for network");
  }
  return client;
}

export async function getPrizeDistributor({
  networkKey = getStoredNetworkKey(),
}) {
  const client = buildClient(networkKey);
  const { RAFFLE } = getContractAddresses(networkKey);
  if (!RAFFLE) throw new Error("RAFFLE address missing");
  const addr = await client.readContract({
    address: RAFFLE,
    abi: RaffleAbi,
    functionName: "prizeDistributor",
  });
  return addr;
}

export async function getSeasonPayouts({
  seasonId,
  networkKey = getStoredNetworkKey(),
}) {
  const client = buildClient(networkKey);
  const distributor = await getPrizeDistributor({ networkKey });
  if (distributor === "0x0000000000000000000000000000000000000000") return null;
  const data = await client.readContract({
    address: distributor,
    abi: RafflePrizeDistributorAbi,
    functionName: "getSeason",
    args: [BigInt(seasonId)],
  });
  return { distributor, seasonId, data };
}

export async function claimGrand({
  seasonId,
  networkKey = getStoredNetworkKey(),
}) {
  if (typeof window === "undefined" || !window.ethereum)
    throw new Error("No wallet available");
  const net = getNetworkByKey(networkKey);
  const wallet = createWalletClient({
    chain: buildChainConfig(net),
    transport: custom(window.ethereum),
  });
  const [account] = await wallet.getAddresses();
  const distributor = await getPrizeDistributor({ networkKey });
  const hash = await wallet.writeContract({
    address: distributor,
    abi: RafflePrizeDistributorAbi,
    functionName: "claimGrand",
    args: [BigInt(seasonId)],
    account,
  });
  return hash;
}

export async function claimConsolation({
  seasonId,
  networkKey = getStoredNetworkKey(),
}) {
  if (typeof window === "undefined" || !window.ethereum)
    throw new Error("No wallet available");
  const net = getNetworkByKey(networkKey);
  const wallet = createWalletClient({
    chain: buildChainConfig(net),
    transport: custom(window.ethereum),
  });
  const [account] = await wallet.getAddresses();
  const distributor = await getPrizeDistributor({ networkKey });
  const hash = await wallet.writeContract({
    address: distributor,
    abi: RafflePrizeDistributorAbi,
    functionName: "claimConsolation",
    args: [BigInt(seasonId)],
    account,
  });
  return hash;
}

export async function isConsolationClaimed({
  seasonId,
  account,
  networkKey = getStoredNetworkKey(),
}) {
  const client = buildClient(networkKey);
  const distributor = await getPrizeDistributor({ networkKey });
  if (distributor === "0x0000000000000000000000000000000000000000")
    return false;
  const claimed = await client.readContract({
    address: distributor,
    abi: RafflePrizeDistributorAbi,
    functionName: "isConsolationClaimed",
    args: [BigInt(seasonId), getAddress(account)],
  });
  return !!claimed;
}

/**
 * Check if an account was a participant in a given season.
 * A participant is someone who has ticketCount > 0.
 * @param {Object} params
 * @param {number|string} params.seasonId - The season ID
 * @param {string} params.account - The account address to check
 * @param {string} [params.networkKey] - Network key
 * @returns {Promise<boolean>} - True if the account participated
 */
export async function isSeasonParticipant({
  seasonId,
  account,
  networkKey = getStoredNetworkKey(),
}) {
  const client = buildClient(networkKey);
  const { RAFFLE } = getContractAddresses(networkKey);
  if (!RAFFLE) return false;

  try {
    const position = await client.readContract({
      address: RAFFLE,
      abi: RaffleAbi,
      functionName: "getParticipantPosition",
      args: [BigInt(seasonId), getAddress(account)],
    });
    // A participant has ticketCount > 0
    return position && BigInt(position.ticketCount) > 0n;
  } catch {
    return false;
  }
}
