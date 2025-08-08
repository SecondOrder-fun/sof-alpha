import { fastifyPlugin } from 'fastify-plugin';
import { pricingService } from '../../shared/pricingService.js';

export async function pricingRoutes(fastify, options) {
  // options parameter required by Fastify plugin interface
  if (options) {
    // Intentionally empty - options parameter required by Fastify plugin interface
  }

  // SSE endpoint for real-time market price updates
  fastify.get('/markets/:id/pricing-stream', async (request, reply) => {
    const { id } = request.params;
    
    // Validate market ID
    if (!id) {
      return reply.status(400).send({ error: 'Market ID is required' });
    }
    
    // Set SSE headers
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('Access-Control-Allow-Origin', '*');
    
    // Send initial connection message
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
    
    // Subscribe to price updates
    const unsubscribe = pricingService.subscribeToMarket(id, (priceUpdate) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(priceUpdate)}\n\n`);
      } catch (error) {
        fastify.log.error('Error sending SSE update:', error);
      }
    });
    
    // Handle client disconnect
    request.socket.on('close', () => {
      unsubscribe();
    });
    
    // Send periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      try {
        reply.raw.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
      } catch (error) {
        fastify.log.error('Error sending SSE heartbeat:', error);
        clearInterval(heartbeatInterval);
      }
    }, 30000);
    
    // Cleanup on close
    request.socket.on('close', () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
    });
  });
}

export default fastifyPlugin(pricingRoutes);
