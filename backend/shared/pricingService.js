
import { EventEmitter } from 'events';
import { db } from './supabaseClient.js';

/**
 * Real-Time Pricing Service
 * 
 * This service manages real-time pricing updates for InfoFi markets
 * and provides Server-Sent Events (SSE) functionality.
 */
export class PricingService extends EventEmitter {
  constructor() {
    super();
    this.pricingCache = new Map();
    this.subscribers = new Map();
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
      // Read current cache (bps-based)
      let cache = await db.getMarketPricingCache(marketId);
      if (!cache) {
        // Initialize cache from market if missing
        const market = await db.getInfoFiMarketById(marketId);
        if (!market) throw new Error(`Market with ID ${marketId} not found`);
        cache = await db.upsertMarketPricingCache({
          market_id: marketId,
          raffle_probability_bps: market.current_probability_bps ?? market.initial_probability_bps ?? 0,
          market_sentiment_bps: market.current_probability_bps ?? market.initial_probability_bps ?? 0,
          hybrid_price_bps: market.current_probability_bps ?? market.initial_probability_bps ?? 0,
          raffle_weight_bps: 7000,
          market_weight_bps: 3000,
          last_updated: new Date().toISOString()
        });
      }

      const raffleProbBps = Number(
        raffleUpdate.probabilityBps ?? cache.raffle_probability_bps
      );

      const newSentimentBps = (() => {
        if (typeof sentimentUpdate.sentimentBps === 'number') {
          return sentimentUpdate.sentimentBps;
        }
        const delta = Number(sentimentUpdate.deltaBps || 0);
        return cache.market_sentiment_bps + delta;
      })();

      const clampedSentimentBps = Math.max(0, Math.min(10000, Math.round(newSentimentBps)));

      // Calculate new hybrid price in bps
      const hybridPriceBps = this._calculateHybridPriceBps(
        raffleProbBps,
        clampedSentimentBps,
        cache.raffle_weight_bps ?? 7000,
        cache.market_weight_bps ?? 3000
      );

      const updated = await db.upsertMarketPricingCache({
        market_id: marketId,
        raffle_probability_bps: raffleProbBps,
        market_sentiment_bps: clampedSentimentBps,
        hybrid_price_bps: hybridPriceBps,
        raffle_weight_bps: cache.raffle_weight_bps ?? 7000,
        market_weight_bps: cache.market_weight_bps ?? 3000,
        last_updated: new Date().toISOString()
      });

      // Cache the updated pricing (bps)
      this.pricingCache.set(marketId, updated);

      // Emit price update event (bps)
      const evt = {
        market_id: marketId,
        raffle_probability_bps: updated.raffle_probability_bps,
        market_sentiment_bps: updated.market_sentiment_bps,
        hybrid_price_bps: updated.hybrid_price_bps,
        last_updated: updated.last_updated
      };
      this.emit('priceUpdate', evt);
      this._notifySubscribers(marketId, evt);

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
