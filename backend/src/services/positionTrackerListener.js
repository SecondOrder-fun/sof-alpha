// backend/src/services/positionTrackerListener.js
// Watches RafflePositionTracker.PositionSnapshot events and syncs infofi_markets in DB.

import { getPublicClient } from '../lib/viemClient.js';
import { getChainByKey } from '../config/chain.js';
import RafflePositionTrackerAbi from '../abis/RafflePositionTrackerAbi.js';
import { db } from '../../shared/supabaseClient.js';

/**
 * Start watching PositionSnapshot events for a given network key (LOCAL/TESTNET)
 * Returns an unsubscribe function.
 */
export function startPositionTrackerListener(networkKey = 'LOCAL', logger = console) {
  const chain = getChainByKey(networkKey);
  if (!chain?.positionTracker) {
    logger.warn(`[positionTrackerListener] No positionTracker for ${networkKey}; listener not started`);
    return () => {};
  }

  const client = getPublicClient(networkKey);

  // Subscribe to PositionSnapshot
  const unwatch = client.watchContractEvent({
    address: chain.positionTracker,
    abi: RafflePositionTrackerAbi,
    eventName: 'PositionSnapshot',
    onLogs: async (logs) => {
      logger.info(`[positionTrackerListener] Received ${logs.length} PositionSnapshot event(s)`);
      for (const log of logs) {
        try {
          const player = String(log.args.player);
          const winProbabilityBps = Number(log.args.winProbabilityBps);
          const seasonId = Number(log.args.seasonId);
          const MARKET_TYPE = 'WINNER_PREDICTION';

          logger.info(`[positionTrackerListener] Processing PositionSnapshot: season=${seasonId}, player=${player}, bps=${winProbabilityBps}`);

          // Get or create player record
          const playerId = await db.getOrCreatePlayerIdByAddress(player);

          // NOTE: We no longer create markets here - that's handled by infofiListener
          // when it sees MarketCreated events from the on-chain InfoFiMarketFactory.
          // This listener only updates probabilities for existing markets.

          // Check if market exists for this player
          const exists = await db.hasInfoFiMarket(seasonId, playerId, MARKET_TYPE);

          if (exists) {
            // Market exists - update probability
            const updated = await db.updateInfoFiMarketProbability(seasonId, playerId, MARKET_TYPE, winProbabilityBps);
            
            if (updated) {
              logger.info(`[positionTrackerListener] ✅ Updated probability for season ${seasonId}, player ${player}, bps=${winProbabilityBps}`);
            } else {
              logger.warn(`[positionTrackerListener] Failed to update probability for season ${seasonId}, player ${player}`);
            }
          } else {
            // Market doesn't exist yet - it will be created by infofiListener when
            // InfoFiMarketFactory emits MarketCreated event (if player crosses 1% threshold)
            logger.debug(`[positionTrackerListener] No market yet for season ${seasonId}, player ${player}, bps=${winProbabilityBps}`);
          }
        } catch (e) {
          logger.error('[positionTrackerListener] Failed to handle PositionSnapshot log', e);
        }
      }
    },
    onError: (e) => logger.error('[positionTrackerListener] PositionSnapshot watchContractEvent error', e),
    pollingInterval: 3000,
  });

  logger.info(`[positionTrackerListener] Listening on ${networkKey} at ${chain.positionTracker}`);
  
  return unwatch;
}
