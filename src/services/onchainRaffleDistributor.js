// src/services/onchainRaffleDistributor.js
import { createPublicClient, createWalletClient, custom, http, getAddress } from 'viem';
import { RaffleAbi, RafflePrizeDistributorAbi } from '@/utils/abis';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';

function buildClient(networkKey) {
  const net = getNetworkByKey(networkKey);
  return createPublicClient({ chain: { id: net.chainId }, transport: http(net.rpcUrl) });
}

export async function getPrizeDistributor({ networkKey = getStoredNetworkKey() }) {
  const client = buildClient(networkKey);
  const { RAFFLE } = getContractAddresses(networkKey);
  if (!RAFFLE) throw new Error('RAFFLE address missing');
  const addr = await client.readContract({ address: RAFFLE, abi: RaffleAbi, functionName: 'prizeDistributor' });
  return addr;
}

export async function getSeasonPayouts({ seasonId, networkKey = getStoredNetworkKey() }) {
  const client = buildClient(networkKey);
  const distributor = await getPrizeDistributor({ networkKey });
  if (distributor === '0x0000000000000000000000000000000000000000') return null;
  const data = await client.readContract({ address: distributor, abi: RafflePrizeDistributorAbi, functionName: 'getSeason', args: [BigInt(seasonId)] });
  return { distributor, seasonId, data };
}

export async function claimGrand({ seasonId, networkKey = getStoredNetworkKey() }) {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No wallet available');
  const net = getNetworkByKey(networkKey);
  const wallet = createWalletClient({ chain: { id: net.chainId }, transport: custom(window.ethereum) });
  const [account] = await wallet.getAddresses();
  const distributor = await getPrizeDistributor({ networkKey });
  const hash = await wallet.writeContract({ address: distributor, abi: RafflePrizeDistributorAbi, functionName: 'claimGrand', args: [BigInt(seasonId)], account });
  return hash;
}

export async function claimConsolation({ seasonId, networkKey = getStoredNetworkKey() }) {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No wallet available');
  const net = getNetworkByKey(networkKey);
  const wallet = createWalletClient({ chain: { id: net.chainId }, transport: custom(window.ethereum) });
  const [account] = await wallet.getAddresses();
  const distributor = await getPrizeDistributor({ networkKey });
  const hash = await wallet.writeContract({
    address: distributor,
    abi: RafflePrizeDistributorAbi,
    functionName: 'claimConsolation',
    args: [BigInt(seasonId)],
    account,
  });
  return hash;
}

export async function isConsolationClaimed({ seasonId, account, networkKey = getStoredNetworkKey() }) {
  const client = buildClient(networkKey);
  const distributor = await getPrizeDistributor({ networkKey });
  if (distributor === '0x0000000000000000000000000000000000000000') return false;
  const claimed = await client.readContract({ address: distributor, abi: RafflePrizeDistributorAbi, functionName: 'isConsolationClaimed', args: [BigInt(seasonId), getAddress(account)] });
  return !!claimed;
}
