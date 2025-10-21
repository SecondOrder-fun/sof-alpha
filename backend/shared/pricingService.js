
import { EventEmitter } from 'events';
import { db } from './supabaseClient.js';
import { historicalOddsService } from './historicalOddsService.js';

/**
 * Real-Time Pricing Service
 * 
 * This service manages real-time pricing updates for InfoFi markets
 * and provides Server-Sent Events (SSE) functionality.
 */
export class PricingService extends EventEmitter {
  constructor(logger = console) {
    super();
    this.pricingCache = new Map();
    this.subscribers = new Map();
    this.logger = logger;
  }

  setLogger(logger) {
    this.logger = logger || console;
  }
  
  /**
   * Update hybrid pricing for a market
   * 
   * @param {number} marketId - InfoFi market ID
   * @param {Object} raffleUpdate - Raffle price update
   * @param {Object} sentimentUpdate - Sentiment update
   * @returns {Promise<Object>} Updated pricing
   */
  async updateHybridPricing(marketId, raffleUpdate = {}, sentimentUpdate = {}) {
    try {
      // Read current cache (supports both legacy and new shapes)
      let cache = await db.getMarketPricingCache(marketId);
      if (!cache) {
        // Initialize cache from market if missing
        const market = await db.getInfoFiMarketById(marketId);
        if (!market) throw new Error(`Market with ID ${marketId} not found`);
        // Derive initial probability in bps from available fields
        const initProbBps = (
          (typeof market.current_probability_bps === 'number' && market.current_probability_bps) ||
          (typeof market.current_probability === 'number' && market.current_probability) ||
          (typeof market.initial_probability_bps === 'number' && market.initial_probability_bps) ||
          (typeof market.initial_probability === 'number' && market.initial_probability) ||
          0
        );
        cache = await db.upsertMarketPricingCache({
          // Columns must match Supabase schema (no _bps suffix)
          market_id: marketId,
          raffle_probability: initProbBps,
          market_sentiment: initProbBps,
          hybrid_price: initProbBps,
          raffle_weight: 7000,
          market_weight: 3000,
          last_updated: new Date().toISOString()
        });
      }

      // Normalize raffle probability (bps)
      const raffleProbBps = Number(
        raffleUpdate.probabilityBps ??
          cache.raffle_probability_bps ??
          cache.raffle_probability ??
          0
      );

      // Normalize market sentiment (bps)
      const newSentimentBps = (() => {
        if (typeof sentimentUpdate.sentimentBps === 'number') {
          return sentimentUpdate.sentimentBps;
        }
        const delta = Number(sentimentUpdate.deltaBps || 0);
        const base =
          (typeof cache.market_sentiment_bps === 'number' && cache.market_sentiment_bps) ||
          (typeof cache.market_sentiment === 'number' && cache.market_sentiment) ||
          0;
        return base + delta;
      })();

      const clampedSentimentBps = Math.max(0, Math.min(10000, Math.round(newSentimentBps)));

      // Calculate new hybrid price in bps
      const hybridPriceBps = this._calculateHybridPriceBps(
        raffleProbBps,
        clampedSentimentBps,
        (typeof cache.raffle_weight_bps === 'number' ? cache.raffle_weight_bps : (cache.raffle_weight ?? 7000)),
        (typeof cache.market_weight_bps === 'number' ? cache.market_weight_bps : (cache.market_weight ?? 3000))
      );

      // Persist using current DB schema column names (no _bps suffix)
      const updated = await db.upsertMarketPricingCache({
        market_id: marketId,
        raffle_probability: raffleProbBps,
        market_sentiment: clampedSentimentBps,
        hybrid_price: hybridPriceBps,
        raffle_weight: (typeof cache.raffle_weight_bps === 'number' ? cache.raffle_weight_bps : (cache.raffle_weight ?? 7000)),
        market_weight: (typeof cache.market_weight_bps === 'number' ? cache.market_weight_bps : (cache.market_weight ?? 3000)),
        last_updated: new Date().toISOString()
      });

      // Sync core market row so UI queries stay consistent with live odds
      const numericMarketId = Number(marketId);
      if (Number.isFinite(numericMarketId) && Number.isInteger(numericMarketId)) {
        const yesPrice = hybridPriceBps / 10000;
        const noPrice = Math.max(0, 1 - yesPrice);
        try {
          await db.updateInfoFiMarket(numericMarketId, {
            current_probability: raffleProbBps,
            yes_price: Number(yesPrice.toFixed(4)),
            no_price: Number(noPrice.toFixed(4)),
            updated_at: new Date().toISOString(),
          });
        } catch (updateErr) {
          // Swallow update errors so pricing stream continues; surfaced via logs when backend logger attached
          const log = this.logger;
          if (log && typeof log.warn === 'function') {
            log.warn('[pricingService] Failed to sync infofi_market odds', updateErr);
          }
        }
      }

      // Cache the updated pricing (store both normalized and schema keys for compatibility)
      const cachedPayload = {
        ...updated,
        raffle_probability_bps: updated.raffle_probability ?? updated.raffle_probability_bps,
        market_sentiment_bps: updated.market_sentiment ?? updated.market_sentiment_bps,
        hybrid_price_bps: updated.hybrid_price ?? updated.hybrid_price_bps,
        raffle_weight_bps: updated.raffle_weight ?? updated.raffle_weight_bps,
        market_weight_bps: updated.market_weight ?? updated.market_weight_bps,
      };
      this.pricingCache.set(marketId, cachedPayload);

      // Emit price update event (bps)
      const evt = {
        market_id: marketId,
        raffle_probability_bps: cachedPayload.raffle_probability_bps,
        market_sentiment_bps: cachedPayload.market_sentiment_bps,
        hybrid_price_bps: cachedPayload.hybrid_price_bps,
        last_updated: cachedPayload.last_updated ?? new Date().toISOString(),
      };
      this.emit('priceUpdate', evt);
      this._notifySubscribers(marketId, evt);

      // Record to historical storage (non-blocking)
      try {
        // Get season ID from cache or fetch from DB
        const market = cache || await db.getInfoFiMarketById(marketId);
        const seasonId = market?.season_id || market?.raffle_id || 0;
        
        await historicalOddsService.recordOddsUpdate(
          seasonId,
          marketId,
          {
            timestamp: Date.now(),
            yes_bps: evt.hybrid_price_bps,
            no_bps: 10000 - evt.hybrid_price_bps,
            hybrid_bps: evt.hybrid_price_bps,
            raffle_bps: evt.raffle_probability_bps,
            sentiment_bps: evt.market_sentiment_bps
          }
        );
      } catch (histErr) {
        // Log but don't fail the price update
        const log = this.logger;
        if (log && typeof log.warn === 'function') {
          log.warn('[pricingService] Failed to record historical odds', histErr);
        }
      }

      return updated;
    } catch (error) {
      throw new Error(`Failed to update hybrid pricing: ${error.message}`);
    }
  }
  
  /**
   * Calculate hybrid price based on raffle and sentiment weights
   * 
   * @param {number} rafflePrice - Raffle probability
   * @param {number} sentiment - Sentiment score
   * @param {number} raffleWeight - Weight for raffle price (0-10000)
   * @param {number} sentimentWeight - Weight for sentiment (0-10000)
   * @returns {number} Calculated hybrid price
   */
  _calculateHybridPriceBps(raffleBps, sentimentBps, raffleWeightBps, sentimentWeightBps) {
    const total = raffleWeightBps + sentimentWeightBps;
    const weighted = (raffleWeightBps * raffleBps) + (sentimentWeightBps * sentimentBps);
    return Math.round(weighted / total);
  }
  
  /**
   * Subscribe to price updates for a market
   * 
   * @param {number} marketId - InfoFi market ID
   * @param {Function} callback - Callback function for price updates
   * @returns {Function} Unsubscribe function
   */
  subscribeToMarket(marketId, callback) {
    if (!this.subscribers.has(marketId)) {
      this.subscribers.set(marketId, new Set());
    }
    
    const subscribers = this.subscribers.get(marketId);
    subscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.subscribers.delete(marketId);
      }
    };
  }
  
  /**
   * Get cached pricing for a market
   * 
   * @param {number} marketId - InfoFi market ID
   * @returns {Object|null} Cached pricing or null if not found
   */
  getCachedPricing(marketId) {
    return this.pricingCache.get(marketId) || null;
  }

  /**
   * Dev-only: directly set pricing payload by arbitrary key (e.g., oracle marketKey)
   * without any DB interaction. Useful for local SSE smoke tests when DB is absent.
   *
   * @param {string|number} key
   * @param {{
   *   raffle_probability_bps?: number,
   *   market_sentiment_bps?: number,
   *   hybrid_price_bps?: number,
   *   last_updated?: string
   * }} payload
   */
  setPricingForKey(key, payload) {
    const nowIso = new Date().toISOString();
    const cachedPayload = {
      raffle_probability_bps: typeof payload.raffle_probability_bps === 'number' ? payload.raffle_probability_bps : 0,
      market_sentiment_bps: typeof payload.market_sentiment_bps === 'number' ? payload.market_sentiment_bps : 0,
      hybrid_price_bps: typeof payload.hybrid_price_bps === 'number' ? payload.hybrid_price_bps : 0,
      last_updated: payload.last_updated || nowIso
    };
    this.pricingCache.set(key, cachedPayload);

    const evt = {
      market_id: key,
      raffle_probability_bps: cachedPayload.raffle_probability_bps,
      market_sentiment_bps: cachedPayload.market_sentiment_bps,
      hybrid_price_bps: cachedPayload.hybrid_price_bps,
      last_updated: cachedPayload.last_updated,
    };
    this.emit('priceUpdate', evt);
    this._notifySubscribers(key, evt);
    return cachedPayload;
  }

  /**
   * Internal: notify all SSE subscribers for a given market id
   * @param {string|number} marketId
   * @param {object} payload
   */
  _notifySubscribers(marketId, payload) {
    const subs = this.subscribers.get(marketId);
    if (!subs || subs.size === 0) return;
    for (const cb of subs) {
      try {
        cb(payload);
      } catch (_) {
        // best-effort; ignore subscriber errors
      }
    }
  }
}

// Export singleton instance
export const pricingService = new PricingService();
