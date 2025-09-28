import { useReadContract, useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getContractAddresses } from '@/config/contracts';
import PrizeDistributorAbi from '@/contracts/abis/RafflePrizeDistributor.json';
import { getPrizeDistributor } from '@/services/onchainRaffleDistributor';
import RaffleAbi from '@/contracts/abis/Raffle.json';



export function useRafflePrizes(seasonId) {
  const netKey = getStoredNetworkKey();
  // Using on-chain distributor discovery; no direct RAFFLE usage here.
  const { address } = useAccount();
  const [isWinner, setIsWinner] = useState(false);
  const [claimableAmount, setClaimableAmount] = useState(0n);



  const distributorQuery = useQuery({
    queryKey: ['prize_distributor_addr', netKey],
    queryFn: () => getPrizeDistributor({ networkKey: netKey }),
    staleTime: 10_000,
  });

  // On-chain fallback: read prizeDistributor() from configured RAFFLE if service is unavailable
  const { RAFFLE } = getContractAddresses(netKey);
  const { data: distributorFromChain } = useReadContract({
    address: distributorQuery.data ? undefined : RAFFLE,
    abi: RaffleAbi,
    functionName: 'prizeDistributor',
    args: [],
    query: {
      enabled: !distributorQuery.data && Boolean(RAFFLE),
    },
  });

  const distributorAddress = distributorQuery.data || distributorFromChain;

  // Read distributor payouts snapshot
  const { data: seasonPayouts, isLoading: isLoadingPayouts } = useReadContract({
    address: distributorAddress,
    abi: PrizeDistributorAbi,
    functionName: 'getSeason',
    args: [BigInt(seasonId)],
    query: {
      enabled: !!seasonId && !!distributorAddress && distributorAddress !== '0x0000000000000000000000000000000000000000',
      refetchInterval: 5000, // Poll for updates
    },
  });

  // Read raffle season details to compare status/winner against distributor snapshot
  const { data: raffleDetails } = useReadContract({
    address: RAFFLE,
    abi: RaffleAbi,
    functionName: 'getSeasonDetails',
    args: [BigInt(seasonId)],
    query: {
      enabled: Boolean(RAFFLE) && Boolean(seasonId),
      refetchInterval: 5000,
    },
  });

  useEffect(() => {
    async function checkWinnerAndConsolation() {
      if (isLoadingPayouts || !seasonPayouts || !address) return;

      const grandWinner = seasonPayouts.grandWinner;
      if (grandWinner.toLowerCase() === address.toLowerCase()) {
        setIsWinner(true);
        setClaimableAmount(seasonPayouts.grandAmount || 0n);
      }
  }

  checkWinnerAndConsolation();
  }, [address, seasonId, seasonPayouts, isLoadingPayouts]);

  const { writeContractAsync: claimGrandPrize, data: claimGrandHash } = useWriteContract();

  const { isLoading: isConfirmingGrand, isSuccess: isConfirmedGrand } = useWaitForTransactionReceipt({ hash: claimGrandHash });

  const handleClaimGrandPrize = async () => {
    if (!distributorAddress) return;
    await claimGrandPrize({
      address: distributorAddress,
      abi: PrizeDistributorAbi,
      functionName: 'claimGrand',
      args: [BigInt(seasonId)],
    });
  };

  return {
    isWinner,
    claimableAmount: formatEther(claimableAmount),
    isLoading: isLoadingPayouts,
    isConfirming: isConfirmingGrand,
    isConfirmed: isConfirmedGrand,
    handleClaimGrandPrize,
    distributorAddress,
    hasDistributor: Boolean(distributorAddress && distributorAddress !== '0x0000000000000000000000000000000000000000'),
    grandWinner: seasonPayouts?.grandWinner,
    funded: Boolean(seasonPayouts?.funded),
    raffleWinner: Array.isArray(raffleDetails) ? raffleDetails[3] : raffleDetails?.winner,
    raffleStatus: Array.isArray(raffleDetails) ? Number(raffleDetails[1]) : raffleDetails?.status,
  };
}
