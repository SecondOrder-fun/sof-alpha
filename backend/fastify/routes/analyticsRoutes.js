import { analyticsService } from '../../shared/analyticsService.js';

export async function analyticsRoutes(fastify, options) {
  // options parameter required by Fastify plugin interface
  if (options) {
    // Intentionally empty - options parameter required by Fastify plugin interface
  }

  // Get strategy performance metrics
  fastify.get('/strategy/:playerAddress', async (request, reply) => {
    try {
      const { playerAddress } = request.params;
      const { timeframe, limit } = request.query;
      
      // Validate player address
      if (!playerAddress) {
        return reply.status(400).send({ error: 'Player address is required' });
      }
      
      const performance = await analyticsService.getStrategyPerformance(playerAddress, { timeframe, limit });
      return reply.send({ performance });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch strategy performance' });
    }
  });

  // Get arbitrage history
  fastify.get('/arbitrage/history', async (request, reply) => {
    try {
      const { limit, timeframe } = request.query;
      
      const history = await analyticsService.getArbitrageHistory({ limit, timeframe });
      return reply.send({ history });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch arbitrage history' });
    }
  });

  // Get user analytics
  fastify.get('/user/:playerAddress', async (request, reply) => {
    try {
      const { playerAddress } = request.params;
      
      // Validate player address
      if (!playerAddress) {
        return reply.status(400).send({ error: 'Player address is required' });
      }
      
      const analytics = await analyticsService.getUserAnalytics(playerAddress);
      return reply.send({ analytics });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch user analytics' });
    }
  });
}

export default analyticsRoutes;
