// src/services/onchainRaffleDistributor.js
import { createPublicClient, createWalletClient, custom, http, getAddress } from 'viem';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';

// Minimal ABIs
const RaffleAbi = [
  { type: 'function', name: 'prizeDistributor', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
];

const DistributorAbi = [
  {
    type: 'function',
    name: 'getSeason',
    stateMutability: 'view',
    inputs: [{ name: 'seasonId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'token', type: 'address' },
          { name: 'grandWinner', type: 'address' },
          { name: 'grandAmount', type: 'uint256' },
          { name: 'consolationAmount', type: 'uint256' },
          { name: 'totalParticipants', type: 'uint256' },
          { name: 'funded', type: 'bool' },
          { name: 'grandClaimed', type: 'bool' },
        ],
      },
    ],
  },
  { type: 'function', name: 'claimGrand', stateMutability: 'nonpayable', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'claimConsolation', stateMutability: 'nonpayable', inputs: [
    { name: 'seasonId', type: 'uint256' }
  ], outputs: [] },
  { type: 'function', name: 'isConsolationClaimed', stateMutability: 'view', inputs: [
    { name: 'seasonId', type: 'uint256' }, { name: 'account', type: 'address' }
  ], outputs: [{ name: '', type: 'bool' }] },
];

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
  const data = await client.readContract({ address: distributor, abi: DistributorAbi, functionName: 'getSeason', args: [BigInt(seasonId)] });
  return { distributor, seasonId, data };
}

export async function claimGrand({ seasonId, networkKey = getStoredNetworkKey() }) {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No wallet available');
  const net = getNetworkByKey(networkKey);
  const wallet = createWalletClient({ chain: { id: net.chainId }, transport: custom(window.ethereum) });
  const [account] = await wallet.getAddresses();
  const distributor = await getPrizeDistributor({ networkKey });
  const hash = await wallet.writeContract({ address: distributor, abi: DistributorAbi, functionName: 'claimGrand', args: [BigInt(seasonId)], account });
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
    abi: DistributorAbi,
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
  const claimed = await client.readContract({ address: distributor, abi: DistributorAbi, functionName: 'isConsolationClaimed', args: [BigInt(seasonId), getAddress(account)] });
  return !!claimed;
}
