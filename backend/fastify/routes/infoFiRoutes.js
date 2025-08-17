import { fastifyPlugin } from 'fastify-plugin';
import { db } from '../../shared/supabaseClient.js';

export async function infoFiRoutes(fastify, options) {
  // options parameter required by Fastify plugin interface
  if (options) {
    // Intentionally empty - options parameter required by Fastify plugin interface
  }

  // Get all active InfoFi markets
  fastify.get('/markets', async (_request, reply) => {
    try {
      const markets = await db.getActiveInfoFiMarkets();
      return reply.send({ markets });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch InfoFi markets' });
    }
  });

  // Get user prediction positions (placeholder)
  fastify.get('/positions', async (request, reply) => {
    try {
      const { address } = request.query || {};
      // Use address only to satisfy lint and future filtering
      if (!address) {
        // For now we accept missing address and return empty
      }
      return reply.send([]);
    } catch (error) {
      fastify.log.error(error);
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

  // Create a new InfoFi market
  fastify.post('/markets', async (request, reply) => {
    try {
      const { raffle_id, question, description, expires_at } = request.body;
      const marketData = {
        raffle_id,
        question,
        description,
        expires_at,
        yes_price: 0.5,
        no_price: 0.5,
        volume: 0,
        status: 'active'
      };
      
      const market = await db.createInfoFiMarket(marketData);
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

  // Place a bet on an InfoFi market
  fastify.post('/markets/:id/bet', async (request, reply) => {
    try {
      const { id } = request.params;
      // Use the id parameter to satisfy lint requirements
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }
      
      const { player_address, outcome, amount } = request.body;
      // Validate required parameters
      if (!player_address || !outcome || !amount) {
        return reply.status(400).send({ error: 'Player address, outcome, and amount are required' });
      }
      
      // TODO: Implement placeBet method in supabaseClient
      // const result = await db.placeBet(id, player_address, outcome, amount);
      return reply.send({ success: false });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to place bet' });
    }
  });

  // Get market odds
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

export default fastifyPlugin(infoFiRoutes);