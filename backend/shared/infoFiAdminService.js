// backend/shared/infoFiAdminService.js
import { supabase } from './supabaseClient.js';

/**
 * Service for InfoFi markets admin operations
 */
class InfoFiAdminService {
  /**
   * Get comprehensive admin summary of all InfoFi markets
   * Includes market details, season info, player info, and liquidity metrics
   * 
   * @returns {Promise<Object>} Markets grouped by season with aggregate stats
   */
  async getMarketsAdminSummary() {
    try {
      // Query infofi_markets with joins to raffles, players, and hybrid_pricing_cache
      const { data: markets, error } = await supabase
        .from('infofi_markets')
        .select(`
          id,
          raffle_id,
          market_type,
          total_volume,
          is_active,
          is_settled,
          created_at,
          updated_at,
          raffles!inner (
            season_id
          ),
          players!inner (
            address
          ),
          hybrid_pricing_cache (
            volume_24h,
            hybrid_price,
            price_change_24h,
            last_updated
          )
        `)
        .order('raffle_id', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        // If tables don't exist yet (local dev), return empty data
        if (error.message?.includes('does not exist') || 
            error.message?.includes('relationship') ||
            error.code === '42P01') {
          return {
            success: true,
            data: {
              seasons: [],
              totalMarkets: 0,
              totalActiveMarkets: 0,
            },
          };
        }
        throw new Error(`Failed to fetch markets: ${error.message}`);
      }

      // Transform data: convert snake_case to camelCase and group by season
      const transformedMarkets = (markets || []).map(market => ({
        id: market.id,
        raffleId: market.raffle_id,
        seasonId: market.raffles?.season_id,
        marketType: market.market_type,
        playerAddress: market.players?.address,
        totalVolume: market.total_volume || '0',
        volume24h: market.hybrid_pricing_cache?.volume_24h || '0',
        priceChange24h: market.hybrid_pricing_cache?.price_change_24h || '0',
        hybridPrice: market.hybrid_pricing_cache?.hybrid_price || '0',
        isActive: market.is_active,
        isSettled: market.is_settled,
        createdAt: market.created_at,
        updatedAt: market.updated_at,
        lastPriceUpdate: market.hybrid_pricing_cache?.last_updated,
      }));

      // Group markets by season
      const groupedBySeasonMap = transformedMarkets.reduce((acc, market) => {
        const seasonId = market.seasonId || 0;
        if (!acc[seasonId]) {
          acc[seasonId] = {
            seasonId,
            markets: [],
            totalMarkets: 0,
            activeMarkets: 0,
            totalVolume: 0,
          };
        }

        acc[seasonId].markets.push(market);
        acc[seasonId].totalMarkets += 1;
        if (market.isActive) {
          acc[seasonId].activeMarkets += 1;
        }
        acc[seasonId].totalVolume += parseFloat(market.totalVolume) || 0;

        return acc;
      }, {});

      // Convert to array and sort by season ID descending
      const groupedBySeason = Object.values(groupedBySeasonMap).sort(
        (a, b) => b.seasonId - a.seasonId
      );

      return {
        success: true,
        data: {
          seasons: groupedBySeason,
          totalMarkets: transformedMarkets.length,
          totalActiveMarkets: transformedMarkets.filter(m => m.isActive).length,
        },
      };
    } catch (error) {
      // Log error for debugging
      if (typeof error === 'object' && error !== null) {
        // Error object - extract message
      }
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Get liquidity metrics for a specific market
   * 
   * @param {number} marketId - Market ID
   * @returns {Promise<Object>} Liquidity metrics
   */
  async getMarketLiquidity(marketId) {
    try {
      const { data, error } = await supabase
        .from('hybrid_pricing_cache')
        .select('volume_24h, price_change_24h, last_updated')
        .eq('market_id', marketId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch liquidity: ${error.message}`);
      }

      return {
        success: true,
        data: {
          volume24h: data?.volume_24h || '0',
          priceChange24h: data?.price_change_24h || '0',
          lastUpdated: data?.last_updated,
        },
      };
    } catch (error) {
      // Error handled - return error response
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }
}

export const infoFiAdminService = new InfoFiAdminService();
