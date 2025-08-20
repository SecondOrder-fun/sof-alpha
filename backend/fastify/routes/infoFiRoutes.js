import { db } from '../../shared/supabaseClient.js';
import { pricingService } from '../../shared/pricingService.js';

export async function infoFiRoutes(fastify, options) {
  // options parameter required by Fastify plugin interface
  if (options) {
    // Intentionally empty - options parameter required by Fastify plugin interface
  }

  // Mount log to confirm plugin registration
  fastify.log.info('infoFiRoutes mounted');

  // Namespaced ping to verify correct prefix: GET /api/infofi/__ping
  fastify.get('/__ping', async (_request, reply) => {
    return reply.send({ ok: true, ns: 'infofi' });
  });

  // Get InfoFi markets (optionally filter by raffle/season)
  fastify.get('/markets', async (request, reply) => {
    try {
      const { raffleId } = request.query || {};
      const markets = raffleId
        ? await db.getInfoFiMarketsByRaffleId(raffleId)
        : await db.getActiveInfoFiMarkets();
      return reply.send({ markets });
    } catch (error) {
      fastify.log.error(error);
      const msg = String(error?.message || '');
      // If table doesn't exist yet in Supabase, return empty list instead of 500
      if (msg.includes('does not exist') || msg.includes('relation') || error?.code === '42P01') {
        return reply.send({ markets: [] });
      }
      return reply.status(500).send({ error: 'Failed to fetch InfoFi markets' });
    }
  });

  // Get user prediction positions
  fastify.get('/positions', async (request, reply) => {
    try {
      const { address } = request.query || {};
      if (!address) {
        return reply.status(400).send({ error: 'address is required' });
      }
      const positions = await db.getPositionsByAddress(address);
      return reply.send({ positions });
    } catch (error) {
      fastify.log.error(error);
      const msg = String(error?.message || '');
      // If the table(s) aren't created yet locally, return empty list instead of 500
      if (msg.includes('does not exist') || msg.includes('relation') || error?.code === '42P01') {
        return reply.send({ positions: [] });
      }
      return reply.status(500).send({ error: 'Failed to fetch positions' });
    }
  });

  // Get a specific InfoFi market by ID
  fastify.get('/markets/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const market = await db.getInfoFiMarketById(id);
      return reply.send({ market });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch InfoFi market' });
    }
  });

  // Create a new InfoFi market (bps-based)
  fastify.post('/markets', async (request, reply) => {
    try {
      const { seasonId, playerAddress, marketType, initialProbabilityBps } = request.body || {};
      if (
        typeof seasonId === 'undefined' ||
        !marketType ||
        typeof initialProbabilityBps !== 'number'
      ) {
        return reply.status(400).send({ error: 'seasonId, marketType, initialProbabilityBps are required' });
      }

      const market = await db.createInfoFiMarket({
        season_id: seasonId,
        player_address: playerAddress || null,
        market_type: marketType,
        initial_probability_bps: initialProbabilityBps,
        current_probability_bps: initialProbabilityBps,
        is_active: true,
        is_settled: false
      });

      // Initialize pricing cache to the initial bps
      await db.upsertMarketPricingCache({
        market_id: market.id,
        raffle_probability_bps: initialProbabilityBps,
        market_sentiment_bps: initialProbabilityBps,
        hybrid_price_bps: initialProbabilityBps,
        raffle_weight_bps: 7000,
        market_weight_bps: 3000,
        last_updated: new Date().toISOString()
      });

      return reply.status(201).send({ market });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to create InfoFi market' });
    }
  });

  // Update an InfoFi market
  fastify.put('/markets/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      // Use the id parameter to satisfy lint requirements
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }
      
      const { question, description } = request.body;
      
      const marketData = {};
      if (question) marketData.question = question;
      if (description) marketData.description = description;
      
      const market = await db.updateInfoFiMarket(id, marketData);
      return reply.send({ market });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to update InfoFi market' });
    }
  });

  // Delete an InfoFi market
  fastify.delete('/markets/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      // Use the id parameter to satisfy lint requirements
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }
      
      await db.deleteInfoFiMarket(id);
      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to delete InfoFi market' });
    }
  });

  // Place a bet on an InfoFi market (MVP mock)
  fastify.post('/markets/:id/bet', async (request, reply) => {
    try {
      const { id } = request.params;
      // Use the id parameter to satisfy lint requirements
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }
      
      const { player_address, outcome, amount } = request.body || {};
      // Validate required parameters
      if (!player_address || !outcome || !amount) {
        return reply.status(400).send({ error: 'Player address, outcome, and amount are required' });
      }

      // Record the position
      const position = await db.createInfoFiPosition({
        market_id: Number(id),
        user_address: player_address,
        outcome: String(outcome).toUpperCase(),
        amount: String(amount)
      });

      // Update sentiment in pricing cache (simple delta: proportional to amount)
      const deltaBps = Math.max(1, Math.min(200, Math.round(Number(amount) * 10))); // clamp [1,200]
      const sentimentUpdate = {
        deltaBps: position.outcome === 'YES' ? deltaBps : -deltaBps
      };
      // Keep raffle probability unchanged here
      await pricingService.updateHybridPricing(Number(id), {}, sentimentUpdate);

      return reply.send({ success: true, position });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to place bet' });
    }
  });

  // Get market odds (bps-based from cache)
  fastify.get('/markets/:id/odds', async (request, reply) => {
    try {
      const { id } = request.params;
      // Use the id parameter to satisfy lint requirements
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }
      
      const odds = await db.getMarketOdds(id);
      return reply.send({ odds });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch odds' });
    }
  });
}

export default infoFiRoutes;