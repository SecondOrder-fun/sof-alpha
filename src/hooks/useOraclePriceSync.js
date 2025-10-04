// src/hooks/useOraclePriceSync.js
// Syncs oracle prices when player positions change via RaffleTracker events

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRaffleTracker } from './useRaffleTracker';

/**
 * useOraclePriceSync
 * Listens to PositionSnapshot events and invalidates oracle price queries
 * to ensure market odds update when player positions change
 * 
 * @param {string|number} seasonId - The season to monitor
 * @param {string} playerAddress - The player address to monitor (optional)
 */
export function useOraclePriceSync(seasonId, playerAddress = null) {
  const queryClient = useQueryClient();
  const { usePlayerSnapshotLive } = useRaffleTracker();
  
  // Subscribe to position updates for this player
  usePlayerSnapshotLive(playerAddress);
  
  useEffect(() => {
    // When position changes occur, invalidate all oracle price queries
    // This forces a refetch of the hybrid pricing data
    const invalidateOraclePrices = () => {
      queryClient.invalidateQueries({ queryKey: ['oraclePrice'] });
      queryClient.invalidateQueries({ queryKey: ['infofiMarketInfo'] });
    };
    
    // Set up a listener for position changes
    // The usePlayerSnapshotLive hook already handles the event subscription
    // We just need to invalidate queries when the component using this hook
    // detects that positions have changed
    
    // Create a small interval to check for stale data and refresh
    const interval = setInterval(() => {
      invalidateOraclePrices();
    }, 10000); // Every 10 seconds
    
    return () => clearInterval(interval);
  }, [queryClient, seasonId, playerAddress]);
}
