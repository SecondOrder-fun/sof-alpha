// src/hooks/useSeasonGating.js
// Hook for SeasonGating contract interactions

import { useMemo, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { keccak256, encodePacked } from 'viem';
import { getContractAddresses, SEASON_GATING_ABI } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';

/**
 * Hash a password for gating configuration
 * @param {string} password - The plaintext password
 * @returns {`0x${string}`} The keccak256 hash of the password
 */
export function hashPassword(password) {
  return keccak256(encodePacked(['string'], [password]));
}

/**
 * Gate types enum matching the contract
 */
export const GateType = {
  NONE: 0,
  PASSWORD: 1,
  ALLOWLIST: 2,
  TOKEN_GATE: 3,
  SIGNATURE: 4,
};

/**
 * Hook for reading and writing to the SeasonGating contract
 * @param {number|bigint} seasonId - The season ID to check gating for
 * @returns {Object} Gating state and actions
 */
export function useSeasonGating(seasonId) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const netKey = getStoredNetworkKey();
  const { SEASON_GATING } = getContractAddresses(netKey);

  const hasContract = Boolean(SEASON_GATING);
  const seasonIdBigInt = seasonId ? BigInt(seasonId) : 0n;

  // Read: Check if user is verified for the season
  const {
    data: isVerified,
    isLoading: isLoadingVerified,
    refetch: refetchVerified
  } = useReadContract({
    address: SEASON_GATING,
    abi: SEASON_GATING_ABI,
    functionName: 'isUserVerified',
    args: [seasonIdBigInt, address],
    query: {
      enabled: hasContract && !!address && seasonIdBigInt > 0n,
    },
  });

  // Read: Get season gates configuration
  const {
    data: gates,
    refetch: refetchGates
  } = useReadContract({
    address: SEASON_GATING,
    abi: SEASON_GATING_ABI,
    functionName: 'getSeasonGates',
    args: [seasonIdBigInt],
    query: {
      enabled: hasContract && seasonIdBigInt > 0n,
    },
  });

  // Read: Get gate count
  const { data: gateCount } = useReadContract({
    address: SEASON_GATING,
    abi: SEASON_GATING_ABI,
    functionName: 'getGateCount',
    args: [seasonIdBigInt],
    query: {
      enabled: hasContract && seasonIdBigInt > 0n,
    },
  });

  // Determine if season has gates configured
  const hasGates = useMemo(() => {
    return gates && gates.length > 0;
  }, [gates]);

  // Get enabled gates only
  const enabledGates = useMemo(() => {
    if (!gates) return [];
    return gates.filter(g => g.enabled);
  }, [gates]);

  // Write: Verify password mutation
  const verifyPasswordMutation = useMutation({
    mutationFn: async ({ gateIndex, password }) => {
      if (!hasContract) throw new Error('SeasonGating contract not configured');
      if (!password) throw new Error('Password is required');

      // Simulate first
      if (publicClient && address) {
        try {
          await publicClient.simulateContract({
            address: SEASON_GATING,
            abi: SEASON_GATING_ABI,
            functionName: 'verifyPassword',
            args: [seasonIdBigInt, BigInt(gateIndex), password],
            account: address,
          });
        } catch (simErr) {
          // Parse error message
          const msg = simErr?.shortMessage || simErr?.message || 'Verification failed';
          throw new Error(msg);
        }
      }

      return writeContractAsync({
        address: SEASON_GATING,
        abi: SEASON_GATING_ABI,
        functionName: 'verifyPassword',
        args: [seasonIdBigInt, BigInt(gateIndex), password],
      });
    },
    onSuccess: () => {
      // Invalidate queries to refresh state
      queryClient.invalidateQueries({ queryKey: ['readContract', { functionName: 'isUserVerified' }] });
      queryClient.invalidateQueries({ queryKey: ['readContract', { functionName: 'isGateVerified' }] });
    },
  });

  const verifyPasswordHash = verifyPasswordMutation.data;
  const {
    isLoading: isVerifyConfirming,
    isSuccess: isVerifyConfirmed
  } = useWaitForTransactionReceipt({ hash: verifyPasswordHash });

  // Refetch after confirmation
  if (isVerifyConfirmed) {
    refetchVerified();
  }

  // Callback to verify password
  const verifyPassword = useCallback(async (gateIndex, password) => {
    return verifyPasswordMutation.mutateAsync({ gateIndex, password });
  }, [verifyPasswordMutation]);

  return {
    // Contract state
    hasContract,

    // Read state
    isVerified: isVerified ?? true, // If no gates, user is verified
    isLoadingVerified,
    gates: gates || [],
    enabledGates,
    hasGates,
    gateCount: gateCount ? Number(gateCount) : 0,

    // Write state
    verifyPassword,
    isVerifying: verifyPasswordMutation.isPending,
    isVerifyConfirming,
    isVerifyConfirmed,
    verifyError: verifyPasswordMutation.error,

    // Refetch helpers
    refetchVerified,
    refetchGates,
  };
}

/**
 * Hook for admin gating configuration
 * @returns {Object} Admin configuration functions
 */
export function useSeasonGatingAdmin() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const netKey = getStoredNetworkKey();
  const { SEASON_GATING } = getContractAddresses(netKey);

  const hasContract = Boolean(SEASON_GATING);

  // Write: Configure gates mutation
  const configureGatesMutation = useMutation({
    mutationFn: async ({ seasonId, gates }) => {
      if (!hasContract) throw new Error('SeasonGating contract not configured');

      const seasonIdBigInt = BigInt(seasonId);

      // Format gates for contract
      const formattedGates = gates.map(g => ({
        gateType: g.gateType,
        enabled: g.enabled,
        configHash: g.configHash,
      }));

      // Simulate first
      if (publicClient && address) {
        try {
          await publicClient.simulateContract({
            address: SEASON_GATING,
            abi: SEASON_GATING_ABI,
            functionName: 'configureGates',
            args: [seasonIdBigInt, formattedGates],
            account: address,
          });
        } catch (simErr) {
          const msg = simErr?.shortMessage || simErr?.message || 'Configuration failed';
          throw new Error(msg);
        }
      }

      return writeContractAsync({
        address: SEASON_GATING,
        abi: SEASON_GATING_ABI,
        functionName: 'configureGates',
        args: [seasonIdBigInt, formattedGates],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readContract', { functionName: 'getSeasonGates' }] });
      queryClient.invalidateQueries({ queryKey: ['readContract', { functionName: 'getGateCount' }] });
    },
  });

  const configureGatesHash = configureGatesMutation.data;
  const {
    isLoading: isConfigureConfirming,
    isSuccess: isConfigureConfirmed
  } = useWaitForTransactionReceipt({ hash: configureGatesHash });

  // Write: Clear gates mutation
  const clearGatesMutation = useMutation({
    mutationFn: async ({ seasonId }) => {
      if (!hasContract) throw new Error('SeasonGating contract not configured');

      const seasonIdBigInt = BigInt(seasonId);

      if (publicClient && address) {
        try {
          await publicClient.simulateContract({
            address: SEASON_GATING,
            abi: SEASON_GATING_ABI,
            functionName: 'clearGates',
            args: [seasonIdBigInt],
            account: address,
          });
        } catch (simErr) {
          const msg = simErr?.shortMessage || simErr?.message || 'Clear failed';
          throw new Error(msg);
        }
      }

      return writeContractAsync({
        address: SEASON_GATING,
        abi: SEASON_GATING_ABI,
        functionName: 'clearGates',
        args: [seasonIdBigInt],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readContract', { functionName: 'getSeasonGates' }] });
      queryClient.invalidateQueries({ queryKey: ['readContract', { functionName: 'getGateCount' }] });
    },
  });

  return {
    hasContract,

    // Configure gates
    configureGates: configureGatesMutation.mutateAsync,
    isConfiguring: configureGatesMutation.isPending,
    isConfigureConfirming,
    isConfigureConfirmed,
    configureError: configureGatesMutation.error,

    // Clear gates
    clearGates: clearGatesMutation.mutateAsync,
    isClearing: clearGatesMutation.isPending,
    clearError: clearGatesMutation.error,

    // Helper to create password gate config
    createPasswordGate: (password, enabled = true) => ({
      gateType: GateType.PASSWORD,
      enabled,
      configHash: hashPassword(password),
    }),
  };
}

export default useSeasonGating;
