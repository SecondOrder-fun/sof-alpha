
import { db } from './supabaseClient.js';

/**
 * Advanced Analytics Service
 * 
 * This service provides advanced analytics for InfoFi markets including
 * strategy performance, arbitrage history, and user analytics.
 */
export class AnalyticsService {
  /**
   * Get strategy performance metrics
   * 
   * @param {string} playerAddress - Player's wallet address
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Strategy performance metrics
   */
  async getStrategyPerformance(playerAddress, options = {}) {
    try {
      const { timeframe = 'all', limit = 50 } = options;
      
      // Get player's market positions
      const positions = await db.getPlayerMarketPositions(playerAddress, timeframe, limit);
      
      // Calculate performance metrics
      const metrics = this._calculatePerformanceMetrics(positions);
      
      return {
        player_address: playerAddress,
        total_positions: positions.length,
        ...metrics
      };
    } catch (error) {
      throw new Error(`Failed to get strategy performance: ${error.message}`);
    }
  }
  
  /**
   * Calculate performance metrics from market positions
   * 
   * @param {Array} positions - Market positions
   * @returns {Object} Performance metrics
   */
  _calculatePerformanceMetrics(positions) {
    if (positions.length === 0) {
      return {
        total_profit: 0,
        win_rate: 0,
        avg_return: 0,
        best_trade: 0,
        worst_trade: 0
      };
    }
    
    let totalProfit = 0;
    let wins = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;
    
    positions.forEach(position => {
      const profit = position.profit || 0;
      totalProfit += profit;
      
      if (profit > 0) wins++;
      
      if (profit > bestTrade) bestTrade = profit;
      if (profit < worstTrade) worstTrade = profit;
    });
    
    return {
      total_profit: parseFloat(totalProfit.toFixed(2)),
      win_rate: parseFloat(((wins / positions.length) * 100).toFixed(2)),
      avg_return: parseFloat((totalProfit / positions.length).toFixed(2)),
      best_trade: parseFloat(bestTrade.toFixed(2)),
      worst_trade: parseFloat(worstTrade.toFixed(2))
    };
  }
  
  /**
   * Get arbitrage history
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Arbitrage history
   */
  async getArbitrageHistory(options = {}) {
    try {
      const { limit = 50, timeframe = 'all' } = options;
      
      // Get arbitrage transactions
      const history = await db.getArbitrageHistory(limit, timeframe);
      
      return history;
    } catch (error) {
      throw new Error(`Failed to get arbitrage history: ${error.message}`);
    }
  }
  
  /**
   * Get user analytics
   * 
   * @param {string} playerAddress - Player's wallet address
   * @returns {Promise<Object>} User analytics
   */
  async getUserAnalytics(playerAddress) {
    try {
      // Get user data
      const user = await db.getUserById(playerAddress);
      if (!user) {
        throw new Error(`User with address ${playerAddress} not found`);
      }
      
      // Get user's market activity
      const marketActivity = await db.getUserMarketActivity(playerAddress);
      
      // Get user's arbitrage activity
      const arbitrageActivity = await db.getUserArbitrageActivity(playerAddress);
      
      return {
        user: {
          address: user.address,
          created_at: user.created_at
        },
        market_activity: {
          total_markets: marketActivity.totalMarkets,
          total_volume: marketActivity.totalVolume,
          favorite_markets: marketActivity.favoriteMarkets
        },
        arbitrage_activity: {
          total_arbitrages: arbitrageActivity.totalArbitrages,
          total_profit: arbitrageActivity.totalProfit,
          success_rate: arbitrageActivity.successRate
        }
      };
    } catch (error) {
      throw new Error(`Failed to get user analytics: ${error.message}`);
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
