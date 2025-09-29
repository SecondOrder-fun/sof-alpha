import { useReadContract, useAccount, useWaitForTransactionReceipt, useWriteContract, useWatchContractEvent } from 'wagmi';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getContractAddresses } from '@/config/contracts';
import PrizeDistributorAbi from '@/contracts/abis/RafflePrizeDistributor.json';
import { getPrizeDistributor } from '@/services/onchainRaffleDistributor';
import RaffleAbi from '@/contracts/abis/Raffle.json';
import { useToast } from '@/hooks/useToast';


export function useRafflePrizes(seasonId) {
  const netKey = getStoredNetworkKey();
  // Using on-chain distributor discovery; no direct RAFFLE usage here.
  const { address } = useAccount();
  const [isWinner, setIsWinner] = useState(false);
  const [claimableAmount, setClaimableAmount] = useState(0n);
  const [claimStatus, setClaimStatus] = useState('unclaimed'); // 'unclaimed', 'claiming', 'completed'
  const { toast } = useToast();


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

  // Update claim status when transaction is confirmed
  useEffect(() => {
    if (isConfirmedGrand) {
      setClaimStatus('completed');
    }
  }, [isConfirmedGrand]);

  // Watch for GrandClaimed events
  useWatchContractEvent({
    address: distributorAddress,
    abi: PrizeDistributorAbi,
    eventName: 'GrandClaimed',
    onLogs: (logs) => {
      // Check if this event is for our season and address
      logs.forEach(log => {
        if (log.args && 
            log.args.seasonId && 
            BigInt(log.args.seasonId) === BigInt(seasonId) && 
            log.args.winner && 
            log.args.winner.toLowerCase() === address?.toLowerCase()) {
          
          setClaimStatus('completed');
          toast({
            title: "Prize Claimed!",
            description: `You've successfully claimed ${formatEther(log.args.amount)} SOF!`,
            variant: "success",
          });
        }
      });
    },
    enabled: Boolean(distributorAddress && address && seasonId && claimStatus !== 'completed'),
  });

  const handleClaimGrandPrize = async () => {
    if (!distributorAddress) return;
    try {
      setClaimStatus('claiming');
      await claimGrandPrize({
        address: distributorAddress,
        abi: PrizeDistributorAbi,
        functionName: 'claimGrand',
        args: [BigInt(seasonId)],
      });
    } catch (error) {
      setClaimStatus('unclaimed');
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim prize",
        variant: "destructive",
      });
    }
  };

  // Check if the prize has already been claimed when the component mounts or seasonPayouts changes
  useEffect(() => {
    if (seasonPayouts?.grandClaimed) {
      setClaimStatus('completed');
    }
  }, [seasonPayouts]);

  return {
    isWinner,
    claimableAmount: formatEther(claimableAmount),
    isLoading: isLoadingPayouts,
    isConfirming: isConfirmingGrand || claimStatus === 'claiming',
    isConfirmed: isConfirmedGrand || claimStatus === 'completed',
    handleClaimGrandPrize,
    distributorAddress,
    hasDistributor: Boolean(distributorAddress && distributorAddress !== '0x0000000000000000000000000000000000000000'),
    grandWinner: seasonPayouts?.grandWinner,
    funded: Boolean(seasonPayouts?.funded),
    raffleWinner: Array.isArray(raffleDetails) ? raffleDetails[3] : raffleDetails?.winner,
    raffleStatus: Array.isArray(raffleDetails) ? Number(raffleDetails[1]) : raffleDetails?.status,
    claimStatus,
  };
}
