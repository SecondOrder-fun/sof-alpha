// src/hooks/useRaffleAdmin.js
// Admin write helpers for the Raffle contract.

import { useWriteContract } from 'wagmi';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getContractAddresses, RAFFLE_ABI } from '@/config/contracts';

/**
 * @notice Hook for Raffle contract administrative write functions.
 * @returns {object} An object containing mutation functions for admin actions.
 */
export function useRaffleAdmin() {
  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const raffleContractConfig = {
    address: contracts.RAFFLE,
    abi: RAFFLE_ABI,
  };

  /**
   * @notice Starts a raffle season.
   * @param {object} params - The parameters for starting a season.
   * @param {number} params.seasonId - The ID of the season to start.
   */
  const startSeasonMutation = useMutation({
    mutationFn: async ({ seasonId }) => {
      return await writeContractAsync({
        ...raffleContractConfig,
        functionName: 'startSeason',
        args: [seasonId],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'season', seasonId] });
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
    },
  });

  /**
   * @notice Requests the end of a raffle season.
   * @param {object} params - The parameters for ending a season.
   * @param {number} params.seasonId - The ID of the season to end.
   */
  const requestSeasonEndMutation = useMutation({
    mutationFn: async ({ seasonId }) => {
      return await writeContractAsync({
        ...raffleContractConfig,
        functionName: 'requestSeasonEnd',
        args: [seasonId],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'season', seasonId] });
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
    },
  });

  /**
   * @notice Creates a new raffle season.
   * @param {object} params - The parameters for creating a season.
   * @param {object} params.config - The SeasonConfig struct.
   * @param {Array} params.bondSteps - An array of BondStep structs.
   */
  const createSeasonMutation = useMutation({
    mutationFn: async ({ config, bondSteps }) => {
      return await writeContractAsync({
        ...raffleContractConfig,
        functionName: 'createSeason',
        args: [config, bondSteps],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raffle', netKey, 'currentSeasonId'] });
    },
  });

  return {
    createSeason: createSeasonMutation,
    startSeason: startSeasonMutation,
    requestSeasonEnd: requestSeasonEndMutation,
  };
}
