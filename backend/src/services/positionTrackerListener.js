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
          const ticketCount = Number(log.args.ticketCount);
          const totalTickets = Number(log.args.totalTickets);
          const winProbabilityBps = Number(log.args.winProbabilityBps);
          const seasonId = Number(log.args.seasonId);
          const MARKET_TYPE = 'WINNER_PREDICTION';

          logger.info(`[positionTrackerListener] Processing PositionSnapshot: season=${seasonId}, player=${player}, bps=${winProbabilityBps}`);

          // Get or create player record
          const playerId = await db.getOrCreatePlayerIdByAddress(player);

          // Check if market exists for this player
          const exists = await db.hasInfoFiMarket(seasonId, playerId, MARKET_TYPE);

          if (!exists) {
            // Market doesn't exist yet - this player just crossed the threshold
            // Create the market
            const market = await db.createInfoFiMarket({
              raffle_id: seasonId,
              player_id: playerId,
              market_type: MARKET_TYPE,
              initial_probability: winProbabilityBps,
              current_probability: winProbabilityBps,
              is_active: true,
              is_settled: false
            });

            // Initialize pricing cache
            try {
              await db.upsertMarketPricingCache({
                market_id: market.id,
                raffle_probability: winProbabilityBps,
                market_sentiment: winProbabilityBps,
                hybrid_price: winProbabilityBps / 10000,
                raffle_weight: 7000,
                market_weight: 3000,
                last_updated: new Date().toISOString()
              });
            } catch (cacheErr) {
              logger.warn(`[positionTrackerListener] Failed to initialize pricing cache for market ${market.id}:`, cacheErr.message);
            }

            logger.info(`[positionTrackerListener] ✅ Created new market for season ${seasonId}, player ${player}, bps=${winProbabilityBps}`);
          } else {
            // Market exists - update probability
            const updated = await db.updateInfoFiMarketProbability(seasonId, playerId, MARKET_TYPE, winProbabilityBps);
            
            if (updated) {
              logger.info(`[positionTrackerListener] ✅ Updated probability for season ${seasonId}, player ${player}, bps=${winProbabilityBps}`);
            } else {
              logger.warn(`[positionTrackerListener] Failed to update probability for season ${seasonId}, player ${player}`);
            }
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
