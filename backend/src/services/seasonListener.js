// backend/src/services/seasonListener.js
// Watches Raffle.SeasonCreated events and dynamically starts bonding curve listeners

import { getPublicClient } from '../lib/viemClient.js';
import { getChainByKey } from '../config/chain.js';
import RaffleAbi from '../abis/RaffleAbi.js';
import { startBondingCurveListener } from './bondingCurveListener.js';

// Track active bonding curve listeners by season ID
const activeBondingCurveListeners = new Map(); // seasonId -> unwatch function

/**
 * Start watching SeasonCreated events and manage bonding curve listeners
 * @param {string} networkKey - Network key (LOCAL/TESTNET)
 * @param {object} logger - Logger instance
 * @returns {function} Unwatch function
 */
export function startSeasonListener(networkKey = 'LOCAL', logger = console) {
  const chain = getChainByKey(networkKey);
  
  if (!chain?.raffle) {
    logger.warn(`[seasonListener] No raffle address for ${networkKey}; listener not started`);
    return () => {};
  }

  const client = getPublicClient(networkKey);

  const unwatch = client.watchContractEvent({
    address: chain.raffle,
    abi: RaffleAbi,
    eventName: 'SeasonCreated',
    onLogs: async (logs) => {
      logger.info(`[seasonListener] Received ${logs.length} SeasonCreated event(s)`);
      
      for (const log of logs) {
        try {
          const { seasonId, name, bondingCurve } = log.args;
          const seasonIdNum = Number(seasonId);
          const bondingCurveAddr = String(bondingCurve);
          
          logger.info(`[seasonListener] 🎉 New season created: ${name} (ID: ${seasonIdNum}) with bonding curve at ${bondingCurveAddr}`);
          
          // Check if we're already listening to this bonding curve
          if (activeBondingCurveListeners.has(seasonIdNum)) {
            logger.debug(`[seasonListener] Already listening to bonding curve for season ${seasonIdNum}`);
            continue;
          }
          
          // Start bonding curve listener for this season
          const stopBondingCurve = startBondingCurveListener(
            networkKey,
            bondingCurveAddr,
            seasonIdNum,
            logger
          );
          
          // Store unwatch function
          activeBondingCurveListeners.set(seasonIdNum, stopBondingCurve);
          
          logger.info(`[seasonListener] ✅ Started bonding curve listener for season ${seasonIdNum}`);
        } catch (error) {
          logger.error('[seasonListener] Error processing SeasonCreated:', error);
        }
      }
    },
    onError: (error) => logger.error('[seasonListener] Watch error:', error),
    pollingInterval: 3000,
  });

  logger.info(`[seasonListener] 👂 Listening for SeasonCreated events on ${networkKey} at ${chain.raffle}`);
  
  // Return combined unwatch function
  return () => {
    // Stop season listener
    unwatch();
    
    // Stop all bonding curve listeners
    for (const [seasonId, stopListener] of activeBondingCurveListeners.entries()) {
      try {
        stopListener();
        logger.debug(`[seasonListener] Stopped bonding curve listener for season ${seasonId}`);
      } catch (error) {
        logger.error(`[seasonListener] Error stopping listener for season ${seasonId}:`, error);
      }
    }
    
    activeBondingCurveListeners.clear();
    logger.info('[seasonListener] All listeners stopped');
  };
}

/**
 * Discover existing seasons and start bonding curve listeners
 * @param {string} networkKey - Network key (LOCAL/TESTNET)
 * @param {object} logger - Logger instance
 * @returns {Promise<number>} Number of seasons discovered
 */
export async function discoverExistingSeasons(networkKey = 'LOCAL', logger = console) {
  const chain = getChainByKey(networkKey);
  
  if (!chain?.raffle) {
    logger.warn(`[seasonListener] No raffle address for ${networkKey}; discovery skipped`);
    return 0;
  }

  const client = getPublicClient(networkKey);
  
  try {
    logger.info(`[seasonListener] 🔍 Discovering existing seasons on ${networkKey}...`);
    
    // Get current season ID
    const currentSeasonId = await client.readContract({
      address: chain.raffle,
      abi: RaffleAbi,
      functionName: 'currentSeasonId',
    });
    
    const currentSeasonIdNum = Number(currentSeasonId);
    logger.info(`[seasonListener] Current season ID: ${currentSeasonIdNum}`);
    
    if (currentSeasonIdNum === 0) {
      logger.info('[seasonListener] No seasons exist yet');
      return 0;
    }
    
    // Discover all seasons
    let discoveredCount = 0;
    
    for (let i = 1; i <= currentSeasonIdNum; i++) {
      try {
        // Get season details
        const season = await client.readContract({
          address: chain.raffle,
          abi: RaffleAbi,
          functionName: 'seasons',
          args: [BigInt(i)],
        });
        
        // Extract bonding curve address (index 6 in the tuple)
        // SeasonConfig struct: name, startTime, endTime, winnerCount, grandPrizeBps, raffleToken, bondingCurve, isActive, isCompleted
        const bondingCurveAddr = season[6];
        
        if (!bondingCurveAddr || bondingCurveAddr === '0x0000000000000000000000000000000000000000') {
          logger.warn(`[seasonListener] Season ${i} has no bonding curve address`);
          continue;
        }
        
        logger.info(`[seasonListener] Discovered season ${i} with bonding curve at ${bondingCurveAddr}`);
        
        // Check if already listening
        if (activeBondingCurveListeners.has(i)) {
          logger.debug(`[seasonListener] Already listening to season ${i}`);
          continue;
        }
        
        // Start bonding curve listener
        const stopBondingCurve = startBondingCurveListener(
          networkKey,
          bondingCurveAddr,
          i,
          logger
        );
        
        activeBondingCurveListeners.set(i, stopBondingCurve);
        discoveredCount++;
        
        logger.info(`[seasonListener] ✅ Started listener for season ${i}`);
      } catch (error) {
        logger.error(`[seasonListener] Error discovering season ${i}:`, error);
      }
    }
    
    logger.info(`[seasonListener] Discovery complete: ${discoveredCount} bonding curve listeners started`);
    return discoveredCount;
  } catch (error) {
    logger.error('[seasonListener] Discovery failed:', error);
    return 0;
  }
}

/**
 * Stop bonding curve listener for a specific season
 * @param {number} seasonId - Season ID
 * @param {object} logger - Logger instance
 */
export function stopBondingCurveListenerForSeason(seasonId, logger = console) {
  const stopListener = activeBondingCurveListeners.get(seasonId);
  
  if (stopListener) {
    try {
      stopListener();
      activeBondingCurveListeners.delete(seasonId);
      logger.info(`[seasonListener] Stopped bonding curve listener for season ${seasonId}`);
    } catch (error) {
      logger.error(`[seasonListener] Error stopping listener for season ${seasonId}:`, error);
    }
  } else {
    logger.warn(`[seasonListener] No active listener found for season ${seasonId}`);
  }
}

/**
 * Get count of active bonding curve listeners
 * @returns {number} Number of active listeners
 */
export function getActiveListenerCount() {
  return activeBondingCurveListeners.size;
}
