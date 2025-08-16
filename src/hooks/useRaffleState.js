// src/hooks/useRaffleState.js
// Consolidates raffle state and actions into a single hook.

import { useRaffleRead, useSeasonDetailsQuery } from './useRaffleRead';
import { useRaffleAdmin } from './useRaffleAdmin';
import { useAccessControl } from './useAccessControl';

/**
 * @notice A unified hook to manage all state and actions for the raffle.
 * @returns {object} An object containing queries, mutations, and role-checking functions.
 */
export function useRaffleState() {
  // Read hooks
  const { currentSeasonQuery } = useRaffleRead();
  const currentSeasonId = currentSeasonQuery.data;
  const rawSeasonDetailsQuery = useSeasonDetailsQuery(currentSeasonId);

  const seasonDetailsQuery = {
    ...rawSeasonDetailsQuery,
    data: rawSeasonDetailsQuery.data
      ? {
          config: rawSeasonDetailsQuery.data[0],
          status: rawSeasonDetailsQuery.data[1],
          totalParticipants: rawSeasonDetailsQuery.data[2],
          totalTickets: rawSeasonDetailsQuery.data[3],
          totalPrizePool: rawSeasonDetailsQuery.data[4],
        }
      : null,
  };

  // Admin write hooks
  const { createSeason, startSeason, requestSeasonEnd } = useRaffleAdmin();

  // Access control
  const { hasRole } = useAccessControl();

  return {
    // Queries
    currentSeasonQuery,
    seasonDetailsQuery,

    // Mutations
    createSeason,
    startSeason,
    requestSeasonEnd,

    // Functions
    hasRole,
  };
}
