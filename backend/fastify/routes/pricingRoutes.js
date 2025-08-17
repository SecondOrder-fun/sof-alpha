import { fastifyPlugin } from 'fastify-plugin';
import { pricingService } from '../../shared/pricingService.js';
import { isValidMarketId } from '../../shared/marketId.js';

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

  // New SSE endpoint (alias) using documented path and bps payload
  fastify.get('/stream/pricing/:marketId', async (request, reply) => {
    const { marketId } = request.params;
    if (!marketId) {
      return reply.status(400).send({ error: 'marketId is required' });
    }
    if (!isValidMarketId(marketId)) {
      return reply.status(400).send({ error: 'invalid marketId format' });
    }

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('Access-Control-Allow-Origin', '*');

    // Send initial snapshot if available
    try {
      const cached = pricingService.getCachedPricing(marketId);
      if (cached) {
        const hybridPriceBps = Math.round((cached.yes_price ?? 0) * 10000);
        const initial = {
          type: 'initial_price',
          marketId,
          raffleProbabilityBps: cached.raffleProbabilityBps ?? null,
          marketSentimentBps: cached.marketSentimentBps ?? null,
          hybridPriceBps,
          timestamp: cached.updated_at || new Date().toISOString(),
        };
        reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);
      }
    } catch (e) {
      fastify.log.warn({ err: e }, 'Failed to load initial pricing snapshot');
    }

    // Bridge updates from legacy pricingService to bps format
    const unsubscribe = pricingService.subscribeToMarket(marketId, (priceUpdate) => {
      try {
        const yes = priceUpdate?.yes_price ?? priceUpdate?.hybridPrice ?? 0;
        const evt = {
          type: 'market_sentiment_update', // best-effort mapping
          marketId,
          raffleProbabilityBps: priceUpdate.raffleProbabilityBps ?? null,
          marketSentimentBps: priceUpdate.marketSentimentBps ?? null,
          hybridPriceBps: Math.round(yes * 10000),
          timestamp: priceUpdate.timestamp || new Date().toISOString(),
        };
        reply.raw.write(`data: ${JSON.stringify(evt)}\n\n`);
      } catch (error) {
        fastify.log.error('Error sending SSE update:', error);
      }
    });

    const heartbeatInterval = setInterval(() => {
      try {
        reply.raw.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
      } catch (error) {
        fastify.log.error('Error sending SSE heartbeat:', error);
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    request.socket.on('close', () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
    });
  });

  // Current pricing snapshot (REST)
  fastify.get('/stream/pricing/:marketId/current', async (request, reply) => {
    const { marketId } = request.params;
    if (!marketId) {
      return reply.status(400).send({ error: 'marketId is required' });
    }
    if (!isValidMarketId(marketId)) {
      return reply.status(400).send({ error: 'invalid marketId format' });
    }
    const cached = pricingService.getCachedPricing(marketId);
    if (!cached) {
      return reply.status(404).send({ error: 'Market pricing not found' });
    }
    const res = {
      marketId,
      raffleProbabilityBps: cached.raffleProbabilityBps ?? null,
      marketSentimentBps: cached.marketSentimentBps ?? null,
      hybridPriceBps: Math.round((cached.yes_price ?? 0) * 10000),
      raffleWeightBps: cached.raffleWeightBps ?? 7000,
      marketWeightBps: cached.marketWeightBps ?? 3000,
      lastUpdated: cached.updated_at || new Date().toISOString(),
    };
    return reply.send(res);
  });
}

export default fastifyPlugin(pricingRoutes);
