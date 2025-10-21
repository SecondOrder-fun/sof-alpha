// backend/src/services/syncInfoFiMarkets.js
// Syncs existing on-chain InfoFi markets to database on startup

import { getPublicClient } from '../lib/viemClient.js';
import { getChainByKey } from '../config/chain.js';
import InfoFiMarketFactoryAbi from '../abis/InfoFiMarketFactoryAbi.js';
import { db } from '../../shared/supabaseClient.js';

/**
 * Sync all existing markets from blockchain to database
 * This ensures database is in sync with on-chain state
 * 
 * @param {string} networkKey - Network key (LOCAL/TESTNET)
 * @param {object} logger - Logger instance
 * @returns {Promise<number>} Number of markets synced
 */
export async function syncInfoFiMarkets(networkKey = 'LOCAL', logger = console) {
  const chain = getChainByKey(networkKey);
  if (!chain?.infofiFactory) {
    logger.warn(`[syncInfoFiMarkets] No infoFiFactory for ${networkKey}; sync skipped`);
    return 0;
  }

  const client = getPublicClient(networkKey);
  let syncedCount = 0;

  try {
    logger.info(`[syncInfoFiMarkets] Starting sync for ${networkKey}...`);
    logger.info(`[syncInfoFiMarkets] Factory address: ${chain.infofiFactory}`);

    // Get all past MarketCreated events
    // Use 0n instead of 'earliest' for better Anvil compatibility
    const logs = await client.getContractEvents({
      address: chain.infofiFactory,
      abi: InfoFiMarketFactoryAbi,
      eventName: 'MarketCreated',
      fromBlock: 0n,
      toBlock: 'latest',
    });

    logger.info(`[syncInfoFiMarkets] Found ${logs.length} MarketCreated events`);

    for (const log of logs) {
      try {
        logger.debug({ logArgs: log.args }, '[syncInfoFiMarkets] Processing event');
        const seasonId = Number(log.args.seasonId);
        const playerAddress = String(log.args.player);
        const probabilityBps = Number(log.args.probabilityBps);
        const MARKET_TYPE = 'WINNER_PREDICTION';
        logger.debug({ seasonId, playerAddress, probabilityBps, MARKET_TYPE }, '[syncInfoFiMarkets] Parsed event data');

        // Get or create player record FIRST (needed for foreign key)
        const playerId = await db.getOrCreatePlayerIdByAddress(playerAddress);
        logger.debug({ playerId, playerAddress }, '[syncInfoFiMarkets] Got player ID');

        // Check if already exists
        const exists = await db.hasInfoFiMarket(seasonId, playerId, MARKET_TYPE);
        if (exists) {
          logger.debug(`[syncInfoFiMarkets] Market already exists: season ${seasonId}, player ${playerId}`);
          continue;
        }

        // Create market
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
          logger.warn(`[syncInfoFiMarkets] Failed to initialize pricing cache for market ${market.id}:`, cacheErr.message);
        }

        syncedCount++;
        logger.debug(`[syncInfoFiMarkets] Synced market: season ${seasonId}, player ${playerAddress}`);
      } catch (err) {
        logger.error({
          err,
          seasonId: log.args?.seasonId,
          player: log.args?.player,
          marketType: log.args?.marketType
        }, '[syncInfoFiMarkets] Failed to sync market');
      }
    }

    logger.info(`[syncInfoFiMarkets] Sync complete: ${syncedCount} markets synced`);
    return syncedCount;
  } catch (err) {
    logger.error('[syncInfoFiMarkets] Sync failed:', err);
    throw err;
  }
}

/**
 * Clear database and re-sync from blockchain
 * Use this when restarting local Anvil to ensure consistency
 * 
 * @param {string} networkKey - Network key (LOCAL/TESTNET)
 * @param {object} logger - Logger instance
 * @returns {Promise<number>} Number of markets synced
 */
export async function resetAndSyncInfoFiMarkets(networkKey = 'LOCAL', logger = console) {
  try {
    logger.info(`[resetAndSyncInfoFiMarkets] Clearing database for ${networkKey}...`);
    
    // Clear all existing data
    await db.clearAllMarketPricingCache();
    await db.clearAllInfoFiMarkets();
    
    logger.info('[resetAndSyncInfoFiMarkets] Database cleared, starting sync...');
    
    // Re-sync from blockchain
    const count = await syncInfoFiMarkets(networkKey, logger);
    
    logger.info(`[resetAndSyncInfoFiMarkets] Reset complete: ${count} markets synced`);
    return count;
  } catch (err) {
    logger.error('[resetAndSyncInfoFiMarkets] Reset failed:', err);
    throw err;
  }
}
