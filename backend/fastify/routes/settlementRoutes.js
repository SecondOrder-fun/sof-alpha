import { fastifyPlugin } from 'fastify-plugin';
import { settlementService } from '../../shared/settlementService.js';

export async function settlementRoutes(fastify, options) {
  // options parameter required by Fastify plugin interface
  if (options) {
    // Intentionally empty - options parameter required by Fastify plugin interface
  }

  // Get settlement status for a market
  fastify.get('/status/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Validate market ID
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }
      
      const status = await settlementService.getSettlementStatus(id);
      return reply.send({ status });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch settlement status' });
    }
  });

  // Trigger settlement for a market
  fastify.post('/trigger/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const { outcome } = request.body;
      
      // Validate required parameters
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }
      
      if (!outcome) {
        return reply.status(400).send({ error: 'Outcome is required' });
      }
      
      const result = await settlementService.triggerSettlement(id, outcome);
      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to trigger settlement' });
    }
  });
}

export default fastifyPlugin(settlementRoutes);
