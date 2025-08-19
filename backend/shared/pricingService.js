
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
  async updateHybridPricing(marketId, raffleUpdate, sentimentUpdate) {
    try {
      // Get current market data
      const market = await db.getInfoFiMarketById(marketId);
      if (!market) {
        throw new Error(`Market with ID ${marketId} not found`);
      }
      
      // Calculate new hybrid price (70% raffle + 30% sentiment)
      const newHybridPrice = this._calculateHybridPrice(
        raffleUpdate.probability || market.yes_price,
        sentimentUpdate.sentiment || 0.5,
        7000, // 70% raffle weight
        3000 // 30% sentiment weight
      );
      
      // Update market prices
      const updatedMarket = await db.updateInfoFiMarket(marketId, {
        yes_price: newHybridPrice,
        no_price: 1 - newHybridPrice,
        volume: market.volume + (raffleUpdate.volume || 0)
      });
      
      // Cache the updated pricing
      this.pricingCache.set(marketId, updatedMarket);
      
      // Emit price update event
      const evt = {
        market_id: marketId,
        yes_price: updatedMarket.yes_price,
        no_price: updatedMarket.no_price,
        timestamp: new Date().toISOString()
      };
      this.emit('priceUpdate', evt);

      // Also notify SSE subscribers registered via subscribeToMarket
      this._notifySubscribers(marketId, evt);
      
      return updatedMarket;
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
  _calculateHybridPrice(rafflePrice, sentiment, raffleWeight, sentimentWeight) {
    // Normalize weights
    const totalWeight = raffleWeight + sentimentWeight;
    const raffleWeightNorm = raffleWeight / totalWeight;
    const sentimentWeightNorm = sentimentWeight / totalWeight;
    
    // Calculate weighted average
    // For sentiment, we map it from -1..1 to 0..1 range
    const normalizedSentiment = (sentiment + 1) / 2;
    
    return (rafflePrice * raffleWeightNorm) + (normalizedSentiment * sentimentWeightNorm);
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
