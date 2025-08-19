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
        const initial = {
          type: 'initial_price',
          marketId,
          raffleProbabilityBps: cached.raffle_probability_bps ?? null,
          marketSentimentBps: cached.market_sentiment_bps ?? null,
          hybridPriceBps: cached.hybrid_price_bps ?? null,
          timestamp: cached.last_updated || new Date().toISOString(),
        };
        reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);
      }
    } catch (e) {
      fastify.log.warn({ err: e }, 'Failed to load initial pricing snapshot');
    }

    // Bridge updates from legacy pricingService to bps format
    const unsubscribe = pricingService.subscribeToMarket(marketId, (priceUpdate) => {
      try {
        // pricingService now emits bps-based events directly
        const evt = {
          type: 'price_update',
          marketId,
          raffleProbabilityBps: priceUpdate.raffle_probability_bps ?? null,
          marketSentimentBps: priceUpdate.market_sentiment_bps ?? null,
          hybridPriceBps: priceUpdate.hybrid_price_bps ?? null,
          timestamp: priceUpdate.last_updated || new Date().toISOString(),
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
      raffleProbabilityBps: cached.raffle_probability_bps ?? null,
      marketSentimentBps: cached.market_sentiment_bps ?? null,
      hybridPriceBps: cached.hybrid_price_bps ?? null,
      raffleWeightBps: cached.raffle_weight_bps ?? 7000,
      marketWeightBps: cached.market_weight_bps ?? 3000,
      lastUpdated: cached.last_updated || new Date().toISOString(),
    };
    return reply.send(res);
  });

  // DEV-ONLY: Trigger a manual hybrid pricing update for SSE demo/testing
  // Refuses to run in production mode.
  fastify.post('/debug/pricing/update', async (request, reply) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return reply.status(403).send({ error: 'Forbidden in production' });
      }

      const { marketId, raffleProbability, sentiment } = request.body || {};
      if (typeof marketId === 'undefined' || marketId === null) {
        return reply.status(400).send({ error: 'marketId is required' });
      }

      // Coerce numeric inputs safely; default to neutral values if missing
      const raffleProb = typeof raffleProbability === 'number' ? raffleProbability : 0.5;
      const sentimentVal = typeof sentiment === 'number' ? sentiment : 0; // expected range [-1,1]

      // Pricing service expects numeric market id (legacy path); if marketId is the
      // composite ID (e.g. `1:WINNER_PREDICTION:0x...`), we still forward it since
      // pricingService caches by key; DB fetch in pricingService uses numeric IDs.
      const updated = await pricingService.updateHybridPricing(
        marketId,
        { probabilityBps: Math.round(raffleProb * 10000) },
        { sentimentBps: Math.round((sentimentVal + 1) / 2 * 10000) }
      );

      return reply.send({ success: true, market: updated });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to trigger debug pricing update');
      return reply.status(500).send({ error: 'Failed to update pricing' });
    }
  });
}

export default pricingRoutes;
