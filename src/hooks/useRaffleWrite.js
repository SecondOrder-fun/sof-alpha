// src/hooks/useRaffleWrite.js
// Admin write helpers for the Raffle contract.

import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useAccount } from 'wagmi';
import { decodeErrorResult } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getContractAddresses, RAFFLE_ABI } from '@/config/contracts';

/**
 * @notice A helper hook to manage the lifecycle of a contract write operation.
 * @param {object} mutationOptions - Options for the useMutation hook.
 * @returns {object} The mutation object and transaction hash.
 */
function useContractWriteWithFeedback(mutationOptions) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { address } = useAccount();

  /**
   * Decode a revert error using the ABI and raw error data.
   * Returns a friendly string or null if decoding fails.
   */
  const decodeRevert = (abi, err) => {
    try {
      // viem errors often carry data on the deepest cause
      const data = err?.cause?.data || err?.data || err?.cause?.cause?.data;
      if (!data) return null;
      const decoded = decodeErrorResult({ abi, data });
      const name = decoded?.errorName || 'Error';
      const args = decoded?.args ? decoded.args.map((a) => String(a)).join(', ') : '';
      return args ? `${name}(${args})` : name;
    } catch (_) {
      return null;
    }
  };

  const buildFriendlyMessage = (abi, err, fallback = 'Transaction failed') => {
    const decoded = decodeRevert(abi, err);
    if (decoded) return decoded;
    // viem provides shortMessage/metaMessages frequently
    if (err?.shortMessage) return err.shortMessage;
    if (Array.isArray(err?.metaMessages) && err.metaMessages.length > 0) return err.metaMessages.join('\n');
    if (err?.message) return err.message;
    return fallback;
  };

  const mutation = useMutation({
    ...mutationOptions,
    mutationFn: async (params) => {
      const config = mutationOptions.contractConfig(params);
      // Pre-simulate to catch reverts early (if we have a public client and account)
      try {
        if (publicClient && address) {
          await publicClient.simulateContract({
            ...config,
            account: address,
          });
        }
      } catch (simErr) {
        // Bubble a decoded, friendly error
        const msg = buildFriendlyMessage(config.abi, simErr, 'Simulation failed');
        throw new Error(msg);
      }

      try {
        return await writeContractAsync(config);
      } catch (writeErr) {
        const msg = buildFriendlyMessage(config.abi, writeErr, 'Write failed');
        throw new Error(msg);
      }
    },
    onError: (error, variables, context) => {
      // Surface errors to caller if provided
      if (typeof mutationOptions.onError === 'function') {
        mutationOptions.onError(error, variables, context);
      }
    },
  });

  const hash = mutation.data;
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // When confirmed, allow caller to react (e.g., refetch)
  if (isConfirmed && typeof mutationOptions.onConfirmed === 'function') {
    try {
      mutationOptions.onConfirmed({ hash, receipt });
    } catch (e) {
      // no-op: downstream handler errors should not break hook lifecycle
    }
  }

  return { ...mutation, hash, receipt, isConfirming, isConfirmed };
}

/**
 * @notice Hook for Raffle contract administrative write functions.
 * @returns {object} An object containing mutation functions for admin actions.
 */
export function useRaffleWrite() {
  const queryClient = useQueryClient();
  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);
  const publicClient = usePublicClient();

  const raffleContractConfig = {
    address: contracts.RAFFLE,
    abi: RAFFLE_ABI,
  };
  const hasAddress = Boolean(raffleContractConfig.address);

  const createSeason = useContractWriteWithFeedback({
    contractConfig: ({ config, bondSteps, buyFeeBps, sellFeeBps }) => {
      if (!hasAddress) throw new Error('Raffle contract address not configured');
      return {
        ...raffleContractConfig,
        functionName: 'createSeason',
        args: [config, bondSteps, buyFeeBps, sellFeeBps],
      };
    },
    // Preflight check: ensure RAFFLE address has code on current chain
    onMutate: async () => {
      if (publicClient && raffleContractConfig.address) {
        const code = await publicClient.getCode({ address: raffleContractConfig.address });
        if (!code || code === '0x') {
          throw new Error(
            `No contract code found at RAFFLE address ${raffleContractConfig.address}. Check you are on the correct network and that addresses are up to date.`
          );
        }
      }
    },
    onSuccess: async () => {
      // Proactively refetch so UI updates immediately
      await queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
      await queryClient.refetchQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
      await queryClient.invalidateQueries({ queryKey: ['allSeasons'] });
      await queryClient.refetchQueries({ queryKey: ['allSeasons'] });
    },
    onConfirmed: async () => {
      // Invalidate + refetch queries; components will fetch fresh state
      await queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
      await queryClient.invalidateQueries({ queryKey: ['allSeasons'] });
      await queryClient.refetchQueries({ queryKey: ['allSeasons'] });
    },
  });

  const startSeason = useContractWriteWithFeedback({
    contractConfig: ({ seasonId }) => {
      if (!hasAddress) throw new Error('Raffle contract address not configured');
      return {
        ...raffleContractConfig,
        functionName: 'startSeason',
        args: [typeof seasonId === 'bigint' ? seasonId : BigInt(seasonId)],
      };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'season', variables.seasonId] });
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
      queryClient.invalidateQueries({ queryKey: ['allSeasons'] });
    },
    onConfirmed: () => {
      queryClient.invalidateQueries({ queryKey: ['raffle'] });
      queryClient.invalidateQueries({ queryKey: ['allSeasons'] });
    },
  });

  const requestSeasonEnd = useContractWriteWithFeedback({
    contractConfig: ({ seasonId }) => {
      if (!hasAddress) throw new Error('Raffle contract address not configured');
      return {
        ...raffleContractConfig,
        functionName: 'requestSeasonEnd',
        args: [typeof seasonId === 'bigint' ? seasonId : BigInt(seasonId)],
      };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'season', variables.seasonId] });
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
      queryClient.invalidateQueries({ queryKey: ['allSeasons'] });
    },
  });

  // Emergency-only early end (skips time check). Requires EMERGENCY_ROLE on-chain.
  const requestSeasonEndEarly = useContractWriteWithFeedback({
    contractConfig: ({ seasonId }) => {
      if (!hasAddress) throw new Error('Raffle contract address not configured');
      return {
        ...raffleContractConfig,
        functionName: 'requestSeasonEndEarly',
        args: [typeof seasonId === 'bigint' ? seasonId : BigInt(seasonId)],
      };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'season', variables.seasonId] });
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
      queryClient.invalidateQueries({ queryKey: ['allSeasons'] });
    },
  });

  return {
    createSeason,
    startSeason,
    requestSeasonEnd,
    requestSeasonEndEarly,
  };
}
