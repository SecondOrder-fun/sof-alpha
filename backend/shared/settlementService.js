
import { db } from './supabaseClient.js';

/**
 * Cross-Layer Settlement Coordination Service
 * 
 * This service manages the coordination of settlements across different layers
 * including VRF-triggered settlements and cross-layer profit distribution.
 */
export class SettlementService {
  /**
   * Get settlement status for a market
   * 
   * @param {number} marketId - InfoFi market ID
   * @returns {Promise<Object>} Settlement status
   */
  async getSettlementStatus(marketId) {
    try {
      // Get market details
      const market = await db.getInfoFiMarketById(marketId);
      if (!market) {
        throw new Error(`Market with ID ${marketId} not found`);
      }
      
      // Get associated raffle
      const raffle = await db.getRaffleById(market.raffle_id);
      if (!raffle) {
        throw new Error(`Raffle with ID ${market.raffle_id} not found`);
      }
      
      // Determine settlement status
      const status = this._determineSettlementStatus(market, raffle);
      
      return {
        market_id: marketId,
        raffle_id: raffle.id,
        market_status: market.status,
        raffle_status: raffle.status,
        settlement_status: status.settlementStatus,
        vrf_request_id: status.vrfRequestId,
        estimated_settlement_time: status.estimatedSettlementTime,
        is_settled: status.isSettled
      };
    } catch (error) {
      throw new Error(`Failed to get settlement status: ${error.message}`);
    }
  }
  
  /**
   * Determine settlement status based on market and raffle states
   * 
   * @param {Object} market - InfoFi market object
   * @param {Object} raffle - Raffle object
   * @returns {Object} Settlement status details
   */
  _determineSettlementStatus(market, raffle) {
    // If market is already settled, return settled status
    if (market.status === 'settled') {
      return {
        settlementStatus: 'settled',
        isSettled: true,
        vrfRequestId: market.vrf_request_id || null,
        estimatedSettlementTime: market.settled_at || null
      };
    }
    
    // If raffle is completed but market is not settled, settlement is pending
    if (raffle.status === 'completed' && market.status === 'active') {
      return {
        settlementStatus: 'pending_vrf',
        isSettled: false,
        vrfRequestId: market.vrf_request_id || null,
        estimatedSettlementTime: this._estimateVRFCompletionTime()
      };
    }
    
    // If raffle is active, settlement is not yet triggered
    if (raffle.status === 'active') {
      return {
        settlementStatus: 'not_triggered',
        isSettled: false,
        vrfRequestId: null,
        estimatedSettlementTime: null
      };
    }
    
    // Default case
    return {
      settlementStatus: 'unknown',
      isSettled: false,
      vrfRequestId: null,
      estimatedSettlementTime: null
    };
  }
  
  /**
   * Estimate VRF completion time (30 seconds from now)
   * 
   * @returns {string} ISO timestamp
   */
  _estimateVRFCompletionTime() {
    const now = new Date();
    const estimatedTime = new Date(now.getTime() + 30000); // 30 seconds
    return estimatedTime.toISOString();
  }
  
  /**
   * Trigger settlement for a market
   * 
   * @param {number} marketId - InfoFi market ID
   * @param {string} outcome - Settlement outcome
   * @returns {Promise<Object>} Settlement result
   */
  async triggerSettlement(marketId, outcome) {
    try {
      // Get market details
      const market = await db.getInfoFiMarketById(marketId);
      if (!market) {
        throw new Error(`Market with ID ${marketId} not found`);
      }
      
      // Update market status to settled
      const updatedMarket = await db.updateInfoFiMarket(marketId, {
        status: 'settled',
        settled_at: new Date().toISOString(),
        settlement_outcome: outcome
      });
      
      // Get associated raffle
      const raffle = await db.getRaffleById(market.raffle_id);
      if (!raffle) {
        throw new Error(`Raffle with ID ${market.raffle_id} not found`);
      }
      
      // Update raffle status if needed
      if (raffle.status === 'active') {
        await db.updateRaffle(market.raffle_id, {
          status: 'completed',
          winner_address: outcome === 'yes' ? '0xWinnerAddress' : null
        });
      }
      
      return {
        success: true,
        market_id: marketId,
        raffle_id: raffle.id,
        outcome: outcome,
        settled_at: updatedMarket.settled_at
      };
    } catch (error) {
      throw new Error(`Failed to trigger settlement: ${error.message}`);
    }
  }
}

// Export singleton instance
export const settlementService = new SettlementService();
