// backend/src/services/oracleListener.js
// Listens to InfoFiPriceOracle.PriceUpdated and updates pricingService (bps)

import { getPublicClient } from '../lib/viemClient.js';
import { getChainByKey } from '../config/chain.js';
import InfoFiPriceOracleAbi from '../abis/InfoFiPriceOracleAbi.js';
import { db } from '../../shared/supabaseClient.js';
import { pricingService } from '../../shared/pricingService.js';

// Internal mapping from oracle marketKey (bytes32 hex) -> numeric market id
const keyToNumericId = new Map();
const REFRESH_MS = 15_000;

async function refreshMapping(logger) {
  try {
    // Pull active markets from DB and compute expected key: keccak(raffleId, player, WINNER_PREDICTION)
    const markets = await db.getActiveInfoFiMarkets();
    if (!Array.isArray(markets)) return;
    for (const m of markets) {
      try {
        // Expect fields: id, raffle_id, player_address
        const raffleId = Number(m.raffle_id ?? m.raffleId);
        const player = String(m.player_address ?? m.playerAddress ?? '');
        if (!raffleId || !/^0x[a-fA-F0-9]{40}$/.test(player)) continue;
        // Compute bytes32 as Solidity abi.encodePacked(raffleId, player, keccak256("WINNER_PREDICTION"))
        // We approximate using a server-side stored field if exists
        const mk = m.market_key || m.marketKey; // optional column; if present, best source
        if (mk && /^0x[a-f0-9]{64}$/.test(mk)) {
          keyToNumericId.set(mk.toLowerCase(), Number(m.id));
          continue;
        }
        // Fallback: try to derive with a helper in db if available
        if (typeof db.getOracleKeyForMarket === 'function') {
          const key = await db.getOracleKeyForMarket(Number(m.id));
          if (key && /^0x[a-f0-9]{64}$/.test(key)) {
            keyToNumericId.set(key.toLowerCase(), Number(m.id));
            continue;
          }
        }
        // As a last resort, leave unmapped; listener will still broadcast but may not hit numeric subscribers
      } catch (_) {
        // ignore individual mapping errors
      }
    }
    logger?.info({ size: keyToNumericId.size }, '[oracleListener] mapping refreshed');
  } catch (e) {
    logger?.warn({ e }, '[oracleListener] failed to refresh mapping');
  }
}

export function startOracleListener(networkKey = 'LOCAL', logger = console) {
  const chain = getChainByKey(networkKey);
  if (!chain?.infofiOracle) {
    logger.warn(`[oracleListener] No infofiOracle for ${networkKey}; listener not started`);
    return () => {};
  }

  const client = getPublicClient(networkKey);

  // Periodically refresh mapping
  const interval = setInterval(() => refreshMapping(logger), REFRESH_MS);
  refreshMapping(logger);

  const unwatch = client.watchContractEvent({
    address: chain.infofiOracle,
    abi: InfoFiPriceOracleAbi,
    eventName: 'PriceUpdated',
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          const mk = String(log.args.marketId).toLowerCase();
          const raffleBps = Number(log.args.raffleBps);
          const marketBps = Number(log.args.marketBps);
          const hybridBps = Number(log.args.hybridBps);
          const ts = Number(log.args.timestamp) * 1000 || Date.now();

          // Update cache via pricingService using numeric id if available; otherwise store by key
          const numericId = keyToNumericId.get(mk);
          const cacheKey = numericId ?? mk;

          // Update pricing cache and fan-out
          await pricingService.updateHybridPricing(
            cacheKey,
            { probabilityBps: raffleBps },
            { sentimentBps: marketBps }
          );
          // Ensure hybrid is set exactly (avoid rounding drift)
          const cached = pricingService.getCachedPricing(cacheKey) || {};
          cached.hybrid_price_bps = hybridBps;
          cached.last_updated = new Date(ts).toISOString();
        } catch (e) {
          logger.error('[oracleListener] Failed handling PriceUpdated', e);
        }
      }
    },
    onError: (e) => logger.error('[oracleListener] watchContractEvent error', e),
    pollingInterval: 3000,
  });

  logger.info(`[oracleListener] Listening on ${networkKey} at ${chain.infofiOracle}`);
  return () => {
    try { unwatch(); } catch (e) { logger?.warn({ e }, '[oracleListener] unwatch failed'); }
    clearInterval(interval);
  };
}
