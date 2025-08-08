import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { parseEther } from 'viem';

// TODO: Replace with actual contract address and ABI after deployment
const RAFFLE_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';

// TODO: Replace with actual ABI after contract deployment
const RAFFLE_ABI = [
  // Example function signatures
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'raffleId',
        type: 'uint256',
      },
    ],
    name: 'joinRaffle',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'raffleId',
        type: 'uint256',
      },
    ],
    name: 'getRaffleInfo',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'endTime',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'ticketPrice',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'totalTickets',
            type: 'uint256',
          },
        ],
        internalType: 'struct Raffle.RaffleInfo',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

export const useRaffleContract = () => {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const joinRaffle = async (raffleId, amount) => {
    await writeContract({
      address: RAFFLE_CONTRACT_ADDRESS,
      abi: RAFFLE_ABI,
      functionName: 'joinRaffle',
      args: [raffleId],
      value: parseEther(amount.toString()),
    });
  };

  return {
    joinRaffle,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
};

// Read-only contract hooks
export const useRaffleInfo = (raffleId) => {
  return useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: RAFFLE_ABI,
    functionName: 'getRaffleInfo',
    args: [raffleId],
    enabled: !!raffleId,
  });
};

export const useUserPosition = (raffleId, userAddress) => {
  return useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: RAFFLE_ABI,
    functionName: 'getUserPosition',
    args: [raffleId, userAddress],
    enabled: !!(raffleId && userAddress),
  });
};
