// backend/src/services/infofiListener.js
// Watches InfoFiMarketFactory.MarketCreated events and syncs infofi_markets in DB.

import { getPublicClient } from '../lib/viemClient.js';
import { getChainByKey } from '../config/chain.js';
import InfoFiMarketFactoryAbi from '../abis/InfoFiMarketFactoryAbi.js';
import { db } from '../../shared/supabaseClient.js';

/**
 * Start watching MarketCreated events for a given network key (LOCAL/TESTNET)
 * Returns an unsubscribe function.
 */
export function startInfoFiMarketListener(networkKey = 'LOCAL', logger = console) {
  const chain = getChainByKey(networkKey);
  if (!chain?.infofiFactory) {
    logger.warn(`[infofiListener] No infoFiFactory for ${networkKey}; listener not started`);
    return () => {};
  }

  const client = getPublicClient(networkKey);

  // Subscribe to MarketCreated
  const unwatch = client.watchContractEvent({
    address: chain.infofiFactory,
    abi: InfoFiMarketFactoryAbi,
    eventName: 'MarketCreated',
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          const seasonId = Number(log.args.seasonId);
          const player = String(log.args.player);
          const probabilityBps = Number(log.args.probabilityBps);
          // marketType is bytes32; we treat winner prediction as constant string
          const MARKET_TYPE = 'WINNER_PREDICTION';

          // Get or create player record FIRST (needed for foreign key)
          const playerId = await db.getOrCreatePlayerIdByAddress(player);

          // Idempotency: skip if exists (using player_id as primary identifier)
          const exists = await db.hasInfoFiMarket(seasonId, playerId, MARKET_TYPE);
          if (exists) {
            logger.debug(`[infofiListener] Market already exists for season ${seasonId}, player ${player}`);
            continue;
          }

          // Create market using player_id
          const market = await db.createInfoFiMarket({
            raffle_id: seasonId,
            player_id: playerId,
            market_type: MARKET_TYPE,
            initial_probability: probabilityBps,
            current_probability: probabilityBps,
            is_active: true,
            is_settled: false
          });

          // Initialize pricing cache
          try {
            await db.upsertMarketPricingCache({
              market_id: market.id,
              raffle_probability: probabilityBps,
              market_sentiment: probabilityBps,
              hybrid_price: probabilityBps / 10000,
              raffle_weight: 7000,
              market_weight: 3000,
              last_updated: new Date().toISOString()
            });
          } catch (cacheErr) {
            logger.warn(`[infofiListener] Failed to initialize pricing cache for market ${market.id}:`, cacheErr.message);
          }

          logger.info(`[infofiListener] Created DB market for season ${seasonId}, player ${player}, bps=${probabilityBps}`);
        } catch (e) {
          logger.error('[infofiListener] Failed to handle MarketCreated log', e);
        }
      }
    },
    onError: (e) => logger.error('[infofiListener] watchContractEvent error', e),
    pollingInterval: 3000,
  });

  logger.info(`[infofiListener] Listening on ${networkKey} at ${chain.infofiFactory}`);
  return unwatch;
}
