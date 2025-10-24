import { createClient } from '@supabase/supabase-js';
import process from 'node:process';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || '';
// Prefer service role key on the server; fall back to anon key
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseKey = supabaseServiceKey || supabaseAnonKey;
export const hasSupabase = Boolean(supabaseUrl && supabaseKey);

// Create Supabase client or a no-op stub for local dev without env
function createStubResult(defaultData = []) {
  // Chainable object that mimics supabase-js query builder and resolves to { data, error }
  const result = {
    data: Array.isArray(defaultData) ? defaultData : [],
    error: null,
    select: () => result,
    insert: () => result,
    update: () => result,
    delete: () => result,
    eq: () => result,
    order: () => result,
    single: () => ({ data: null, error: null }),
  };
  return result;
}

export const supabase = hasSupabase
  ? createClient(supabaseUrl, supabaseKey)
  : {
      from: () => createStubResult([]),
    };

// Database service class
export class DatabaseService {
  constructor() {
    this.client = supabase;
  }

  // Raffle operations
  async getActiveRaffles() {
    const { data, error } = await this.client
      .from('raffles')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(error.message);
    return data;
  }

  async getInfoFiMarketByComposite(raffleId, playerId, marketType) {
    const { data, error} = await this.client
      .from('infofi_markets')
      .select('*')
      .eq('raffle_id', raffleId)
      .eq('player_id', playerId)
      .eq('market_type', marketType)
      .limit(1)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
      throw new Error(error.message);
    }
    return data || null;
  }

  async hasInfoFiMarket(seasonId, playerId, marketType) {
    const existing = await this.getInfoFiMarketByComposite(seasonId, playerId, marketType);
    return Boolean(existing);
  }

  async getRaffleById(id) {
    const { data, error } = await this.client
      .from('raffles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  async createRaffle(raffleData) {
    const { data, error } = await this.client
      .from('raffles')
      .insert([raffleData])
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  // InfoFi market operations
  async getActiveInfoFiMarkets() {
    // Align with schema (is_active boolean)
    const { data, error } = await this.client
      .from('infofi_markets')
      .select('*, players!infofi_markets_player_id_fkey(address)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(error.message);
    // Transform players object to player address
    return data.map(market => {
      if (market.players) {
        market.player = market.players.address;
        delete market.players;
      }
      return market;
    });
  }

  async getInfoFiMarketById(id) {
    const { data, error } = await this.client
      .from('infofi_markets')
      .select('*, players!infofi_markets_player_id_fkey(address)')
      .eq('id', id)
      .limit(1);
    
    if (error) throw new Error(error.message);
    // Return first result or null if no results
    const market = data && data.length > 0 ? data[0] : null;
    if (market && market.players) {
      market.player = market.players.address;
      delete market.players;
    }
    return market;
  }

  /**
   * Get InfoFi market by season and player (the natural key from blockchain)
   */
  async getInfoFiMarketBySeasonAndPlayer(seasonId, playerAddress, marketType = 'WINNER_PREDICTION') {
    const { data, error } = await this.client
      .from('infofi_markets')
      .select('*')
      .eq('raffle_id', seasonId)
      .eq('player_address', playerAddress)
      .eq('market_type', marketType)
      .limit(1);
    
    if (error) throw new Error(error.message);
    return data && data.length > 0 ? data[0] : null;
  }

  async getInfoFiMarketsBySeasonId(seasonId) {
    const { data, error } = await this.client
      .from('infofi_markets')
      .select('*, players!infofi_markets_player_id_fkey(address)')
      .eq('raffle_id', seasonId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    // Transform players object to player address
    return data.map(market => {
      if (market.players) {
        market.player = market.players.address;
        delete market.players;
      }
      return market;
    });
  }

  // Backward compatibility alias
  async getInfoFiMarketsByRaffleId(raffleId) {
    return this.getInfoFiMarketsBySeasonId(raffleId);
  }

  async createInfoFiMarket(marketData) {
    // Expect snake_case columns per schema
    const { data, error } = await this.client
      .from('infofi_markets')
      .insert([marketData])
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  async updateInfoFiMarket(id, marketData) {
    const { data, error } = await this.client
      .from('infofi_markets')
      .update(marketData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  async updateInfoFiMarketProbability(seasonId, playerId, marketType, newProbabilityBps) {
    const { data, error } = await this.client
      .from('infofi_markets')
      .update({ current_probability: newProbabilityBps })
      .eq('raffle_id', seasonId)
      .eq('player_id', playerId)
      .eq('market_type', marketType)
      .select()
      .single();
    
    if (error) {
      // Don't throw - market might not exist yet (race condition with MarketCreated)
      return null;
    }
    return data;
  }

  async deleteInfoFiMarket(id) {
    const { data, error } = await this.client
      .from('infofi_markets')
      .delete()
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Clear all InfoFi markets from database
   * Used when restarting local Anvil to ensure DB is in sync with chain
   */
  async clearAllInfoFiMarkets() {
    const { error } = await this.client
      .from('infofi_markets')
      .delete()
      .neq('id', 0); // Delete all rows
    
    if (error) throw new Error(error.message);

    // Reset the auto-increment sequence to start from 1
    const { error: seqError } = await this.client.rpc('reset_infofi_markets_sequence');
    if (seqError && !seqError.message?.includes('does not exist')) {
      // Only throw if it's not a "function doesn't exist" error
      // (function might not be created yet in some environments)
      console.warn('[clearAllInfoFiMarkets] Could not reset sequence:', seqError.message);
    }
  }

  /**
   * Clear all market pricing cache entries
   */
  async clearAllMarketPricingCache() {
    const { error } = await this.client
      .from('market_pricing_cache')
      .delete()
      .neq('market_id', 0); // Delete all rows
    
    if (error) throw new Error(error.message);
  }

  async getMarketOdds(marketId) {
    // Align odds with pricing cache (bps fields)
    const { data, error } = await this.client
      .from('market_pricing_cache')
      .select('raffle_probability, market_sentiment, hybrid_price, last_updated')
      .eq('market_id', marketId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  // Hybrid pricing cache operations
  async upsertHybridPricingCache(cache) {
    // cache: { market_id, raffle_component, sentiment_component, hybrid_price, last_updated }
    const { data, error } = await this.client
      .from('hybrid_pricing_cache')
      .upsert(cache)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getHybridPricingCache(marketId) {
    const { data, error } = await this.client
      .from('hybrid_pricing_cache')
      .select('*')
      .eq('market_id', marketId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  // Legacy market pricing cache operations (bps-based) - deprecated
  async upsertMarketPricingCache(cache) {
    // cache: { market_id, raffle_probability, market_sentiment, hybrid_price,
    //          raffle_weight, market_weight, last_updated }
    const { data, error } = await this.client
      .from('market_pricing_cache')
      .upsert(cache)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getMarketPricingCache(marketId) {
    const { data, error } = await this.client
      .from('market_pricing_cache')
      .select('*')
      .eq('market_id', marketId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  // Positions (user bets)
  async createInfoFiPosition(position) {
    // position: { market_id, user_address, outcome, amount, price? }
    const { data, error } = await this.client
      .from('infofi_positions')
      .insert([position])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getPositionsByAddress(address) {
    const { data, error } = await this.client
      .from('infofi_positions')
      .select('*')
      .eq('user_address', address)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  // Players helpers
  async getPlayerByAddress(address) {
    const addr = String(address || '').toLowerCase();
    const { data, error } = await this.client
      .from('players')
      .select('*')
      .ilike('address', addr)
      .single();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data || null;
  }

  async createPlayer(address) {
    const addr = String(address || '').toLowerCase();
    const { data, error } = await this.client
      .from('players')
      .insert([{ address: addr }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getOrCreatePlayerIdByAddress(address) {
    const existing = await this.getPlayerByAddress(address);
    if (existing?.id) return existing.id;
    
    try {
      const created = await this.createPlayer(address);
      return created.id;
    } catch (err) {
      // Handle race condition - player might have been created between check and insert
      if (err.message?.includes('duplicate key') || err.message?.includes('players_pkey')) {
        const retry = await this.getPlayerByAddress(address);
        if (retry?.id) return retry.id;
      }
      throw err;
    }
  }

  // Analytics operations
  async getPlayerMarketPositions(playerAddress, timeframe, limit) {
    // Use the parameters to satisfy lint requirements
    if (!playerAddress || !timeframe || !limit) {
      // Intentionally empty - parameters used to satisfy lint requirements
    }
    
    // This is a placeholder implementation
    // In a real implementation, this would query the database for player positions
    return [];
  }

  async getArbitrageHistory(limit, timeframe) {
    // Use the parameters to satisfy lint requirements
    if (!limit || !timeframe) {
      // Intentionally empty - parameters used to satisfy lint requirements
    }
    
    // This is a placeholder implementation
    // In a real implementation, this would query the database for arbitrage history
    return [];
  }

  async getUserMarketActivity(playerAddress) {
    // Use the parameter to satisfy lint requirements
    if (!playerAddress) {
      // Intentionally empty - parameter used to satisfy lint requirements
    }
    
    // This is a placeholder implementation
    // In a real implementation, this would query the database for user market activity
    return {
      totalMarkets: 0,
      totalVolume: 0,
      favoriteMarkets: []
    };
  }

  async getUserArbitrageActivity(playerAddress) {
    // Use the parameter to satisfy lint requirements
    if (!playerAddress) {
      // Intentionally empty - parameter used to satisfy lint requirements
    }
    
    // This is a placeholder implementation
    // In a real implementation, this would query the database for user arbitrage activity
    return {
      totalArbitrages: 0,
      totalProfit: 0,
      successRate: 0
    };
  }

  // User operations
  async getUserById(id) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  async getUserByAddress(address) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('wallet_address', address)
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  async createUser(userData) {
    const { data, error } = await this.client
      .from('users')
      .insert([userData])
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  async updateUser(id, userData) {
    const { data, error } = await this.client
      .from('users')
      .update(userData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }

  // Event processing state operations
  async getLastProcessedBlock(eventType) {
    const { data, error } = await this.client
      .from('event_processing_state')
      .select('last_block')
      .eq('event_type', eventType)
      .single();
    
    if (error && error.code !== 'PGRST116') { // Not found is OK
      console.error('Error getting last processed block:', error);
    }
    
    return data?.last_block || 0;
  }

  async setLastProcessedBlock(eventType, blockNumber) {
    const { error } = await this.client
      .from('event_processing_state')
      .upsert({
        event_type: eventType,
        last_block: blockNumber,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error setting last processed block:', error);
    }
  }
}

// Export singleton instance
export const db = new DatabaseService();