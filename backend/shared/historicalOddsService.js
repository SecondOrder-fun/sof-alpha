// backend/shared/historicalOddsService.js
import { redisClient } from './redisClient.js';

/**
 * Historical Odds Service
 * 
 * Manages storage and retrieval of historical odds data in Redis using Sorted Sets.
 * Each market's historical data is stored in a sorted set with timestamp as score.
 * 
 * Key Pattern: odds:history:{seasonId}:{marketId}
 * Data Structure: Sorted Set (timestamp → JSON data point)
 * Retention: 90 days
 * Max Points: Auto-trimmed to prevent unbounded growth
 */
class HistoricalOddsService {
  constructor() {
    this.redis = null;
    this.retentionDays = 90; // Keep 90 days of history
    this.maxPointsPerMarket = 100000; // Prevent unbounded growth
  }

  /**
   * Initialize Redis connection
   */
  init() {
    if (!this.redis) {
      this.redis = redisClient.getClient();
    }
  }

  /**
   * Generate Redis key for market odds history
   * @param {number|string} seasonId - Season/raffle ID
   * @param {number|string} marketId - Market ID
   * @returns {string} Redis key
   */
  _getKey(seasonId, marketId) {
    return `odds:history:${seasonId}:${marketId}`;
  }

  /**
   * Record a new odds data point
   * @param {number|string} seasonId - Season/raffle ID
   * @param {number|string} marketId - Market ID
   * @param {Object} oddsData - Odds data to store
   * @param {number} oddsData.timestamp - Unix timestamp in milliseconds
   * @param {number} oddsData.yes_bps - YES odds in basis points (0-10000)
   * @param {number} oddsData.no_bps - NO odds in basis points (0-10000)
   * @param {number} oddsData.hybrid_bps - Hybrid price in basis points
   * @param {number} oddsData.raffle_bps - Raffle probability in basis points
   * @param {number} oddsData.sentiment_bps - Market sentiment in basis points
   * @returns {Promise<void>}
   */
  async recordOddsUpdate(seasonId, marketId, oddsData) {
    if (!this.redis) this.init();
    
    const key = this._getKey(seasonId, marketId);
    const timestamp = oddsData.timestamp || Date.now();
    
    // Create data point
    const member = JSON.stringify({
      timestamp,
      yes_bps: oddsData.yes_bps || 0,
      no_bps: oddsData.no_bps || 0,
      hybrid_bps: oddsData.hybrid_bps || 0,
      raffle_bps: oddsData.raffle_bps || 0,
      sentiment_bps: oddsData.sentiment_bps || 0
    });

    try {
      // Add to sorted set with timestamp as score
      await this.redis.zadd(key, timestamp, member);

      // Trim to max points (keep most recent)
      const count = await this.redis.zcard(key);
      if (count > this.maxPointsPerMarket) {
        // Remove oldest entries
        const removeCount = count - this.maxPointsPerMarket;
        await this.redis.zremrangebyrank(key, 0, removeCount - 1);
      }

      // Set expiration on key (90 days)
      await this.redis.expire(key, this.retentionDays * 24 * 60 * 60);
    } catch (error) {
      // Log error but don't throw - historical data is non-critical
      console.error('[historicalOddsService] Failed to record odds:', error.message);
    }
  }

  /**
   * Get historical odds for a time range
   * @param {number|string} seasonId - Season/raffle ID
   * @param {number|string} marketId - Market ID
   * @param {string} timeRange - Time range (1H, 6H, 1D, 1W, 1M, ALL)
   * @returns {Promise<Object>} Historical odds data with metadata
   */
  async getHistoricalOdds(seasonId, marketId, timeRange = 'ALL') {
    if (!this.redis) this.init();
    
    const key = this._getKey(seasonId, marketId);
    const now = Date.now();
    
    // Calculate start time based on range
    const ranges = {
      '1H': now - 60 * 60 * 1000,
      '6H': now - 6 * 60 * 60 * 1000,
      '1D': now - 24 * 60 * 60 * 1000,
      '1W': now - 7 * 24 * 60 * 60 * 1000,
      '1M': now - 30 * 24 * 60 * 60 * 1000,
      'ALL': 0
    };

    const startTime = ranges[timeRange] || 0;

    try {
      // Query sorted set by score range
      const members = await this.redis.zrangebyscore(
        key,
        startTime,
        now,
        'WITHSCORES'
      );

      // Parse results (members come as [value, score, value, score, ...])
      const dataPoints = [];
      for (let i = 0; i < members.length; i += 2) {
        try {
          const data = JSON.parse(members[i]);
          dataPoints.push(data);
        } catch (e) {
          // Skip malformed data
          console.warn('[historicalOddsService] Skipping malformed data point');
        }
      }

      // Downsample if too many points
      const maxPoints = 500;
      const downsampled = dataPoints.length > maxPoints;
      const finalData = downsampled 
        ? this._downsampleData(dataPoints, maxPoints)
        : dataPoints;

      return {
        dataPoints: finalData,
        count: finalData.length,
        downsampled
      };
    } catch (error) {
      console.error('[historicalOddsService] Failed to retrieve odds:', error.message);
      return {
        dataPoints: [],
        count: 0,
        downsampled: false,
        error: error.message
      };
    }
  }

  /**
   * Downsample data points using averaging
   * Reduces the number of points while preserving overall shape
   * @param {Array} dataPoints - Array of data points
   * @param {number} maxPoints - Maximum number of points to return
   * @returns {Array} Downsampled data points
   */
  _downsampleData(dataPoints, maxPoints) {
    if (dataPoints.length <= maxPoints) return dataPoints;

    const bucketSize = Math.ceil(dataPoints.length / maxPoints);
    const downsampled = [];

    for (let i = 0; i < dataPoints.length; i += bucketSize) {
      const bucket = dataPoints.slice(i, i + bucketSize);
      
      // Use middle timestamp and average values
      const avg = {
        timestamp: bucket[Math.floor(bucket.length / 2)].timestamp,
        yes_bps: Math.round(bucket.reduce((sum, p) => sum + p.yes_bps, 0) / bucket.length),
        no_bps: Math.round(bucket.reduce((sum, p) => sum + p.no_bps, 0) / bucket.length),
        hybrid_bps: Math.round(bucket.reduce((sum, p) => sum + p.hybrid_bps, 0) / bucket.length),
        raffle_bps: Math.round(bucket.reduce((sum, p) => sum + p.raffle_bps, 0) / bucket.length),
        sentiment_bps: Math.round(bucket.reduce((sum, p) => sum + p.sentiment_bps, 0) / bucket.length)
      };
      
      downsampled.push(avg);
    }

    return downsampled;
  }

  /**
   * Cleanup old data beyond retention period
   * Should be called periodically (e.g., daily) to remove expired data
   * @param {number|string} seasonId - Season/raffle ID
   * @param {number|string} marketId - Market ID
   * @returns {Promise<number>} Number of entries removed
   */
  async cleanupOldData(seasonId, marketId) {
    if (!this.redis) this.init();
    
    const key = this._getKey(seasonId, marketId);
    const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);

    try {
      // Remove all entries older than retention period
      const removed = await this.redis.zremrangebyscore(key, 0, cutoffTime);
      return removed;
    } catch (error) {
      console.error('[historicalOddsService] Failed to cleanup old data:', error.message);
      return 0;
    }
  }

  /**
   * Clear all historical data for a market
   * Use with caution - this is destructive
   * @param {number|string} seasonId - Season/raffle ID
   * @param {number|string} marketId - Market ID
   * @returns {Promise<boolean>} Success status
   */
  async clearMarketHistory(seasonId, marketId) {
    if (!this.redis) this.init();
    
    const key = this._getKey(seasonId, marketId);

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('[historicalOddsService] Failed to clear market history:', error.message);
      return false;
    }
  }

  /**
   * Get statistics about stored historical data
   * @param {number|string} seasonId - Season/raffle ID
   * @param {number|string} marketId - Market ID
   * @returns {Promise<Object>} Statistics about the data
   */
  async getStats(seasonId, marketId) {
    if (!this.redis) this.init();
    
    const key = this._getKey(seasonId, marketId);

    try {
      const count = await this.redis.zcard(key);
      const ttl = await this.redis.ttl(key);
      
      let oldestTimestamp = null;
      let newestTimestamp = null;
      
      if (count > 0) {
        // Get oldest entry
        const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        if (oldest.length >= 2) {
          oldestTimestamp = Number(oldest[1]);
        }
        
        // Get newest entry
        const newest = await this.redis.zrange(key, -1, -1, 'WITHSCORES');
        if (newest.length >= 2) {
          newestTimestamp = Number(newest[1]);
        }
      }

      return {
        count,
        ttl,
        oldestTimestamp,
        newestTimestamp,
        key
      };
    } catch (error) {
      console.error('[historicalOddsService] Failed to get stats:', error.message);
      return {
        count: 0,
        ttl: -1,
        oldestTimestamp: null,
        newestTimestamp: null,
        key,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const historicalOddsService = new HistoricalOddsService();
