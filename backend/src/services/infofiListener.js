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

          // Ensure we have a canonical player id for downstream lookups
          const playerId = await db.getOrCreatePlayerIdByAddress(player);

          // Idempotency: skip if exists
          const exists = await db.hasInfoFiMarket(seasonId, playerId, MARKET_TYPE);
          if (exists) {
            continue;
          }

          const market = await db.createInfoFiMarket({
            season_id: seasonId,
            player_id: playerId,
            player_address: player,
            market_type: MARKET_TYPE,
            initial_probability_bps: probabilityBps,
            current_probability_bps: probabilityBps,
            is_active: true,
            is_settled: false
          });

          await db.upsertMarketPricingCache({
            market_id: market.id,
            raffle_probability_bps: probabilityBps,
            market_sentiment_bps: probabilityBps,
            hybrid_price_bps: probabilityBps,
            raffle_weight_bps: 7000,
            market_weight_bps: 3000,
            last_updated: new Date().toISOString()
          });

          logger.info(`[infofiListener] Created DB market for season ${seasonId}, player ${player} (id ${playerId}), bps=${probabilityBps}`);
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
