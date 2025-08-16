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
  const seasonDetailsQuery = useSeasonDetailsQuery(currentSeasonId);

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
