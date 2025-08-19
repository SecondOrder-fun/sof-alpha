// fastify-plugin removed; export the route function directly
import { arbitrageService } from '../../shared/arbitrageService.js';

export async function arbitrageRoutes(fastify, options) {
  // options parameter required by Fastify plugin interface
  if (options) {
    // Intentionally empty - options parameter required by Fastify plugin interface
  }

  // Get arbitrage opportunities
  fastify.get('/opportunities', async (_request, reply) => {
    try {
      const opportunities = await arbitrageService.detectArbitrageOpportunities();
      // Normalize: return empty array when service returns null/undefined/falsy
      if (!opportunities || !Array.isArray(opportunities)) {
        return reply.send({ opportunities: [] });
      }
      return reply.send({ opportunities });
    } catch (error) {
      fastify.log.error(error);
      // Normalize: on transient errors, expose empty list instead of 500 to avoid noisy UI failures
      return reply.send({ opportunities: [] });
    }
  });

  // Execute arbitrage strategy
  fastify.post('/execute', async (request, reply) => {
    try {
      const { opportunity_id, player_address } = request.body;
      
      // Validate required parameters
      if (!opportunity_id || !player_address) {
        return reply.status(400).send({ error: 'Opportunity ID and player address are required' });
      }
      
      const result = await arbitrageService.executeArbitrageStrategy(opportunity_id, player_address);
      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to execute arbitrage strategy' });
    }
  });
}

export default arbitrageRoutes;
