import { useReadContract, useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';
import PrizeDistributorAbi from '@/contracts/abis/RafflePrizeDistributor.json';
import RaffleAbi from '@/contracts/abis/Raffle.json';



export function useRafflePrizes(seasonId) {
  const netKey = getStoredNetworkKey();
  const { RAFFLE_ADDRESS, PRIZE_DISTRIBUTOR_ADDRESS } = getContractAddresses(netKey);
  const { address } = useAccount();
  const [isWinner, setIsWinner] = useState(false);
  const [isConsolationWinner, setIsConsolationWinner] = useState(false);
  const [claimableAmount, setClaimableAmount] = useState(0n);
  const [merkleProof, setMerkleProof] = useState(null);
  const [merkleIndex, setMerkleIndex] = useState(0);



  const { data: seasonPayouts, isLoading: isLoadingPayouts } = useReadContract({
    address: PRIZE_DISTRIBUTOR_ADDRESS,
    abi: PrizeDistributorAbi,
    functionName: 'getSeason',
    args: [seasonId],
    query: {
      enabled: !!seasonId,
      refetchInterval: 5000, // Poll for updates
    },
  });

  useEffect(() => {
    async function checkWinnerAndConsolation() {
      if (isLoadingPayouts || !seasonPayouts || !address) return;

      const grandWinner = seasonPayouts.grandWinner;
      if (grandWinner.toLowerCase() === address.toLowerCase()) {
        setIsWinner(true);
        setClaimableAmount(seasonPayouts.grandAmount || 0n);
      } else {
        // Check for consolation prize only if not the grand winner
        try {
          const response = await fetch(`/merkle/season-${seasonId}.json`);
          if (!response.ok) {
            // If the file doesn't exist, there are no consolation prizes for this season.
            setIsConsolationWinner(false);
            return;
          }
          const merkleData = await response.json();
          const leaf = merkleData.leaves.find(l => l.account.toLowerCase() === address.toLowerCase());

          if (leaf) {
            setIsConsolationWinner(true);
            setClaimableAmount(BigInt(leaf.amount));
            setMerkleProof(leaf.proof);
            setMerkleIndex(leaf.index);
          }
        } catch (error) {
          // Could not fetch Merkle proof file, which is fine if it doesn't exist.
          setIsConsolationWinner(false);
        }
      }
  }

  checkWinnerAndConsolation();
  }, [address, seasonId, seasonPayouts]);

  const { writeContractAsync: claimGrandPrize, data: claimGrandHash } = useWriteContract();
  const { writeContractAsync: claimConsolationPrize, data: claimConsolationHash } = useWriteContract();

  const { isLoading: isConfirmingGrand, isSuccess: isConfirmedGrand } = useWaitForTransactionReceipt({ hash: claimGrandHash });
  const { isLoading: isConfirmingConsolation, isSuccess: isConfirmedConsolation } = useWaitForTransactionReceipt({ hash: claimConsolationHash });

  const handleClaimGrandPrize = async () => {
    await claimGrandPrize({
      address: PRIZE_DISTRIBUTOR_ADDRESS,
      abi: PrizeDistributorAbi,
      functionName: 'claimGrand',
      args: [seasonId],
    });
  };

  const handleClaimConsolationPrize = async () => {
    if (!merkleProof) return;
    await claimConsolationPrize({
      address: PRIZE_DISTRIBUTOR_ADDRESS,
      abi: PrizeDistributorAbi,
      functionName: 'claimConsolation',
      args: [seasonId, merkleIndex, address, claimableAmount, merkleProof],
    });
  };

  return {
    isWinner,
    isConsolationWinner,
    claimableAmount: formatEther(claimableAmount),
    isLoading: isLoadingPayouts,
    isConfirming: isConfirmingGrand || isConfirmingConsolation,
    isConfirmed: isConfirmedGrand || isConfirmedConsolation,
    handleClaimGrandPrize,
    handleClaimConsolationPrize,
  };
}
