// backend/src/services/infofiListener.js
// Watches InfoFiMarketFactory.MarketCreated and ProbabilityUpdated events and syncs infofi_markets in DB.

import { getPublicClient } from '../lib/viemClient.js';
import { getChainByKey } from '../config/chain.js';
import InfoFiMarketFactoryAbi from '../abis/InfoFiMarketFactoryAbi.js';
import { db } from '../../shared/supabaseClient.js';

/**
 * Start watching MarketCreated and ProbabilityUpdated events for a given network key (LOCAL/TESTNET)
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
  const unwatchMarketCreated = client.watchContractEvent({
    address: chain.infofiFactory,
    abi: InfoFiMarketFactoryAbi,
    eventName: 'MarketCreated',
    onLogs: async (logs) => {
      logger.info(`[infofiListener] Received ${logs.length} MarketCreated event(s)`);
      for (const log of logs) {
        try {
          const seasonId = Number(log.args.seasonId);
          const player = String(log.args.player);
          const conditionId = String(log.args.conditionId);
          const fpmmAddress = String(log.args.fpmmAddress);
          const probabilityBps = Number(log.args.probabilityBps);
          // marketType is bytes32; we treat winner prediction as constant string
          const MARKET_TYPE = 'WINNER_PREDICTION';

          logger.info(`[infofiListener] Processing MarketCreated: season=${seasonId}, player=${player}, fpmm=${fpmmAddress}, bps=${probabilityBps}`);

          // Get or create player record FIRST (needed for foreign key)
          const playerId = await db.getOrCreatePlayerIdByAddress(player);

          // Idempotency: skip if exists (using player_id as primary identifier)
          const exists = await db.hasInfoFiMarket(seasonId, playerId, MARKET_TYPE);
          if (exists) {
            logger.info(`[infofiListener] Market already exists for season ${seasonId}, player ${player} - skipping`);
            continue;
          }

          // Create market using player_id and contract address from event
          const market = await db.createInfoFiMarket({
            season_id: seasonId,
            player_id: playerId,
            player_address: player.toLowerCase(),
            market_type: MARKET_TYPE,
            contract_address: fpmmAddress.toLowerCase(),
            initial_probability_bps: probabilityBps,
            current_probability_bps: probabilityBps,
            is_active: true,
            is_settled: false
          });

          // Initialize pricing cache
          try {
            await db.upsertMarketPricingCache({
              market_id: market.id,
              raffle_probability_bps: probabilityBps,
              market_sentiment_bps: probabilityBps,
              hybrid_price_bps: probabilityBps,
              raffle_weight_bps: 7000,
              market_weight_bps: 3000,
              last_updated: new Date().toISOString()
            });
          } catch (cacheErr) {
            logger.warn(`[infofiListener] Failed to initialize pricing cache for market ${market.id}:`, cacheErr.message);
          }

          logger.info(`[infofiListener] ✅ Created DB market for season ${seasonId}, player ${player}, bps=${probabilityBps}`);
        } catch (e) {
          logger.error('[infofiListener] Failed to handle MarketCreated log', e);
        }
      }
    },
    onError: (e) => logger.error('[infofiListener] MarketCreated watchContractEvent error', e),
    pollingInterval: 3000,
  });

  // Subscribe to ProbabilityUpdated
  const unwatchProbabilityUpdated = client.watchContractEvent({
    address: chain.infofiFactory,
    abi: InfoFiMarketFactoryAbi,
    eventName: 'ProbabilityUpdated',
    onLogs: async (logs) => {
      logger.info(`[infofiListener] Received ${logs.length} ProbabilityUpdated event(s)`);
      for (const log of logs) {
        try {
          const seasonId = Number(log.args.seasonId);
          const player = String(log.args.player);
          const newProbabilityBps = Number(log.args.newProbabilityBps);
          const MARKET_TYPE = 'WINNER_PREDICTION';

          logger.info(`[infofiListener] Processing ProbabilityUpdated: season=${seasonId}, player=${player}, newBps=${newProbabilityBps}`);

          // Get player ID
          const playerId = await db.getOrCreatePlayerIdByAddress(player);

          // Update current_probability in database
          const updated = await db.updateInfoFiMarketProbability(seasonId, playerId, MARKET_TYPE, newProbabilityBps);
          
          if (updated) {
            logger.info(`[infofiListener] ✅ Updated probability for season ${seasonId}, player ${player}, newBps=${newProbabilityBps}`);
          } else {
            logger.warn(`[infofiListener] Failed to update probability for season ${seasonId}, player ${player} - market may not exist`);
          }
        } catch (e) {
          logger.error('[infofiListener] Failed to handle ProbabilityUpdated log', e);
        }
      }
    },
    onError: (e) => logger.error('[infofiListener] ProbabilityUpdated watchContractEvent error', e),
    pollingInterval: 3000,
  });

  logger.info(`[infofiListener] Listening on ${networkKey} at ${chain.infofiFactory}`);
  
  // Return combined unsubscribe function
  return () => {
    unwatchMarketCreated();
    unwatchProbabilityUpdated();
  };
}
