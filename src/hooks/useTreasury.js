import { useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import SOFTokenAbi from '@/contracts/abis/SOFToken.json';
import SOFBondingCurveAbi from '@/contracts/abis/SOFBondingCurve.json';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';

/**
 * Hook for treasury management operations
 * @param {string} seasonId - The season ID to manage treasury for
 * @returns {Object} Treasury management functions and state
 */
export function useTreasury(seasonId) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const networkKey = getStoredNetworkKey();
  const contracts = getContractAddresses(networkKey);

  // Get bonding curve address for the season
  const { data: bondingCurveAddress } = useReadContract({
    address: contracts.RAFFLE,
    abi: [
      {
        inputs: [{ name: 'seasonId', type: 'uint256' }],
        name: 'seasons',
        outputs: [
          { name: 'name', type: 'string' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'winnerCount', type: 'uint16' },
          { name: 'grandPrizeBps', type: 'uint16' },
          { name: 'bondingCurve', type: 'address' },
          { name: 'raffleToken', type: 'address' },
          { name: 'isActive', type: 'bool' },
          { name: 'isCompleted', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'seasons',
    args: [BigInt(seasonId)],
    query: {
      enabled: !!seasonId,
      select: (data) => {
        if (!data) return undefined;
        if (typeof data.bondingCurve === 'string') return data.bondingCurve;
        if (Array.isArray(data) && data.length > 6) return data[6];
        return undefined;
      },
    },
  });

  // Get accumulated fees from bonding curve
  const { data: accumulatedFees, refetch: refetchAccumulatedFees } = useReadContract({
    address: bondingCurveAddress,
    abi: SOFBondingCurveAbi,
    functionName: 'accumulatedFees',
    query: {
      enabled: !!bondingCurveAddress,
    },
  });

  // Get SOF reserves from bonding curve
  const { data: sofReserves } = useReadContract({
    address: bondingCurveAddress,
    abi: SOFBondingCurveAbi,
    functionName: 'getSofReserves',
    query: {
      enabled: !!bondingCurveAddress,
    },
  });

  // Get SOF token contract balance (accumulated fees in treasury system)
  const { data: treasuryBalance, refetch: refetchTreasuryBalance } = useReadContract({
    address: contracts.SOF,
    abi: SOFTokenAbi,
    functionName: 'getContractBalance',
  });

  // Get treasury address
  const { data: treasuryAddress } = useReadContract({
    address: contracts.SOF,
    abi: SOFTokenAbi,
    functionName: 'treasuryAddress',
  });

  // Get total fees collected (cumulative)
  const { data: totalFeesCollected } = useReadContract({
    address: contracts.SOF,
    abi: SOFTokenAbi,
    functionName: 'totalFeesCollected',
  });

  // Check if user has RAFFLE_MANAGER_ROLE on bonding curve
  const { data: hasManagerRole } = useReadContract({
    address: bondingCurveAddress,
    abi: SOFBondingCurveAbi,
    functionName: 'hasRole',
    args: [
      '0x03b4459c543e7fe245e8e148c6cab46a28e66bba7ee09988335c0dc88457fac2', // RAFFLE_MANAGER_ROLE
      address,
    ],
    query: {
      enabled: !!(bondingCurveAddress && address),
      staleTime: 0,
      refetchInterval: 5000,
    },
    watch: true,
  });

  // Check if user has TREASURY_ROLE on SOF token
  const { data: hasTreasuryRole } = useReadContract({
    address: contracts.SOF,
    abi: SOFTokenAbi,
    functionName: 'hasRole',
    args: [
      '0xe1dcbdb91df27212a29bc27177c840cf2f819ecf2187432e1fac86c2dd5dfca9', // TREASURY_ROLE
      address,
    ],
    query: {
      enabled: !!address,
      staleTime: 0,
      refetchInterval: 5000,
    },
    watch: true,
  });

  // Extract fees from bonding curve to SOF token
  const {
    writeContract: extractFees,
    data: extractHash,
    isPending: isExtracting,
    error: extractError,
  } = useWriteContract();

  const { isLoading: isExtractConfirming, isSuccess: isExtractConfirmed } =
    useWaitForTransactionReceipt({
      hash: extractHash,
    });

  // Transfer fees from SOF token to treasury
  const {
    writeContract: transferToTreasury,
    data: transferHash,
    isPending: isTransferring,
    error: transferError,
  } = useWriteContract();

  const { isLoading: isTransferConfirming, isSuccess: isTransferConfirmed } =
    useWaitForTransactionReceipt({
      hash: transferHash,
    });

  // Extract fees from bonding curve
  const handleExtractFees = async () => {
    if (!bondingCurveAddress || !address) return;

    try {
      await extractFees({
        address: bondingCurveAddress,
        abi: SOFBondingCurveAbi,
        functionName: 'extractFeesToTreasury',
        account: address,
      });

      queryClient.setQueryData(
        ['readContract', { address: bondingCurveAddress, functionName: 'accumulatedFees' }],
        0n,
      );
    } catch (error) {
      // Error is handled by wagmi
      return;
    }
  };

  // Transfer fees to treasury
  const handleTransferToTreasury = async (amount) => {
    if (!address) return;

    try {
      await transferToTreasury({
        address: contracts.SOF,
        abi: SOFTokenAbi,
        functionName: 'transferToTreasury',
        args: [amount],
        account: address,
      });

      queryClient.setQueryData(
        ['readContract', { address: contracts.SOF, functionName: 'getContractBalance' }],
        0n,
      );
    } catch (error) {
      // Error is handled by wagmi
      return;
    }
  };

  useEffect(() => {
    if (!isExtractConfirmed) return;
    void Promise.all([
      refetchAccumulatedFees(),
      refetchTreasuryBalance(),
      queryClient.invalidateQueries({ queryKey: ['sofBalance'] }),
    ]);
  }, [isExtractConfirmed, refetchAccumulatedFees, refetchTreasuryBalance, queryClient]);

  useEffect(() => {
    if (!isTransferConfirmed) return;
    void Promise.all([
      refetchTreasuryBalance(),
      refetchAccumulatedFees(),
      queryClient.invalidateQueries({ queryKey: ['sofBalance'] }),
    ]);
  }, [isTransferConfirmed, refetchTreasuryBalance, refetchAccumulatedFees, queryClient]);

  useEffect(() => {
    if (!bondingCurveAddress) return;
    if (import.meta?.env?.DEV) {
      // Reason: surface live on-chain fee/reserve readings for debugging discrepancies in UI
      // eslint-disable-next-line no-console
      console.debug('[Treasury] season', seasonId, {
        bondingCurveAddress,
        accumulatedFees: accumulatedFees?.toString?.() ?? '0',
        sofReserves: sofReserves?.toString?.() ?? '0',
        treasuryBalance: treasuryBalance?.toString?.() ?? '0',
        totalFeesCollected: totalFeesCollected?.toString?.() ?? '0',
      });
    }
  }, [seasonId, bondingCurveAddress, accumulatedFees, sofReserves, treasuryBalance, totalFeesCollected]);

  return {
    // Balances
    accumulatedFees: accumulatedFees ? formatEther(accumulatedFees) : '0',
    accumulatedFeesRaw: accumulatedFees,
    sofReserves: sofReserves ? formatEther(sofReserves) : '0',
    sofReservesRaw: sofReserves,
    treasuryBalance: treasuryBalance !== undefined ? formatEther(treasuryBalance) : '0',
    treasuryBalanceRaw: treasuryBalance,
    totalFeesCollected: totalFeesCollected ? formatEther(totalFeesCollected) : '0',
    treasuryAddress,

    // Permissions
    hasManagerRole: hasManagerRole || false,
    hasTreasuryRole: hasTreasuryRole || false,
    canExtractFees: hasManagerRole && accumulatedFees > 0n,
    canTransferToTreasury: hasTreasuryRole && treasuryBalance > 0n,

    // Actions
    extractFees: handleExtractFees,
    transferToTreasury: handleTransferToTreasury,

    // States
    isExtracting: isExtracting || isExtractConfirming,
    isExtractConfirmed,
    extractError,
    isTransferring: isTransferring || isTransferConfirming,
    isTransferConfirmed,
    transferError,

    // Refetch functions
    refetchAccumulatedFees,
    refetchTreasuryBalance,
    bondingCurveAddress,
  };
}
