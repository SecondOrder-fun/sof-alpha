import { pricingService } from '../../shared/pricingService.js';
import { isValidMarketId, parseMarketId } from '../../shared/marketId.js';
import { db } from '../../shared/supabaseClient.js';

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
      // Resolve composite -> numeric market id
      const { seasonId, marketType, subject } = parseMarketId(marketId);
      const player = await db.getPlayerByAddress(subject);
      const marketRow = player
        ? await db.getInfoFiMarketByComposite(Number(seasonId), player.id, marketType)
        : null;
      const numericId = marketRow?.id ?? null;

      const cached = numericId != null ? pricingService.getCachedPricing(numericId) : null;
      if (cached) {
        const initial = {
          type: 'initial_price',
          marketId,
          raffleProbabilityBps: cached.raffle_probability_bps ?? cached.raffle_probability ?? null,
          marketSentimentBps: cached.market_sentiment_bps ?? cached.market_sentiment ?? null,
          hybridPriceBps: cached.hybrid_price_bps ?? cached.hybrid_price ?? null,
          timestamp: cached.last_updated || new Date().toISOString(),
        };
        reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);
      } else if (numericId != null) {
        // Fallback: read from DB cache directly
        try {
          const dbCache = await db.getMarketPricingCache(numericId);
          if (dbCache) {
            const initial = {
              type: 'initial_price',
              marketId,
              raffleProbabilityBps: dbCache.raffle_probability_bps ?? dbCache.raffle_probability ?? null,
              marketSentimentBps: dbCache.market_sentiment_bps ?? dbCache.market_sentiment ?? null,
              hybridPriceBps: dbCache.hybrid_price_bps ?? dbCache.hybrid_price ?? null,
              timestamp: dbCache.last_updated || new Date().toISOString(),
            };
            reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);
          }
        } catch (e) {
          fastify.log.warn({ err: e }, 'Failed to load DB pricing snapshot');
        }
      }
    } catch (e) {
      fastify.log.warn({ err: e }, 'Failed to load initial pricing snapshot');
    }

    // Bridge updates from legacy pricingService to bps format
    let unsubscribe = () => {};
    try {
      const { seasonId, marketType, subject } = parseMarketId(marketId);
      const player = await db.getPlayerByAddress(subject);
      const marketRow = player
        ? await db.getInfoFiMarketByComposite(Number(seasonId), player.id, marketType)
        : null;
      const numericId = marketRow?.id ?? marketId;

      unsubscribe = pricingService.subscribeToMarket(numericId, (priceUpdate) => {
        try {
          // pricingService now emits bps-based events directly
          const evt = {
            type: 'price_update',
            marketId,
            raffleProbabilityBps: priceUpdate.raffle_probability_bps ?? priceUpdate.raffle_probability ?? null,
            marketSentimentBps: priceUpdate.market_sentiment_bps ?? priceUpdate.market_sentiment ?? null,
            hybridPriceBps: priceUpdate.hybrid_price_bps ?? priceUpdate.hybrid_price ?? null,
            timestamp: priceUpdate.last_updated || new Date().toISOString(),
          };
          reply.raw.write(`data: ${JSON.stringify(evt)}\n\n`);
        } catch (error) {
          fastify.log.error('Error sending SSE update:', error);
        }
      });
    } catch (e) {
      fastify.log.warn({ err: e }, 'Failed to subscribe with numeric market id, falling back');
      unsubscribe = pricingService.subscribeToMarket(marketId, (priceUpdate) => {
        try {
          const evt = {
            type: 'price_update',
            marketId,
            raffleProbabilityBps: priceUpdate.raffle_probability_bps ?? priceUpdate.raffle_probability ?? null,
            marketSentimentBps: priceUpdate.market_sentiment_bps ?? priceUpdate.market_sentiment ?? null,
            hybridPriceBps: priceUpdate.hybrid_price_bps ?? priceUpdate.hybrid_price ?? null,
            timestamp: priceUpdate.last_updated || new Date().toISOString(),
          };
          reply.raw.write(`data: ${JSON.stringify(evt)}\n\n`);
        } catch (error) {
          fastify.log.error('Error sending SSE update:', error);
        }
      });
    }

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
    // Resolve composite -> numeric ID
    let numericId = null;
    try {
      const { seasonId, marketType, subject } = parseMarketId(marketId);
      const player = await db.getPlayerByAddress(subject);
      const marketRow = player
        ? await db.getInfoFiMarketByComposite(Number(seasonId), player.id, marketType)
        : null;
      numericId = marketRow?.id ?? null;
    } catch (e) {
      // proceed without numeric id if resolution fails
    }

    // Try in-memory cache first (using numeric id if available)
    const cached = pricingService.getCachedPricing(numericId ?? marketId);
    let source = cached;
    if (!source && numericId != null) {
      // Fallback to DB cache
      try {
        source = await db.getMarketPricingCache(numericId);
      } catch (_) {
        // ignore
      }
    }
    if (!source) {
      return reply.status(404).send({ error: 'Market pricing not found' });
    }
    // Normalize various possible cache shapes (legacy and new)
    const raffleProbabilityBps =
      source.raffle_probability_bps ??
      source.raffle_probability ??
      source.raffleProbabilityBps ??
      (typeof source.probabilityBps === 'number' ? source.probabilityBps : null);

    const marketSentimentBps =
      source.market_sentiment_bps ??
      source.market_sentiment ??
      source.marketSentimentBps ??
      (typeof source.sentimentBps === 'number' ? source.sentimentBps : null);

    const raffleWeightBps = source.raffle_weight_bps ?? source.raffle_weight ?? source.raffleWeightBps ?? 7000;
    const marketWeightBps = source.market_weight_bps ?? source.market_weight ?? source.marketWeightBps ?? 3000;

    // Prefer directly provided hybrid price (bps). Fallbacks:
    // - compute from raffle+market components with weights when available
    // - convert legacy decimal price (yes_price in [0,1]) to bps
    let hybridPriceBps =
      source.hybrid_price_bps ??
      source.hybrid_price ??
      source.hybridPriceBps ??
      null;

    if (hybridPriceBps == null) {
      if (typeof raffleProbabilityBps === 'number' && typeof marketSentimentBps === 'number') {
        hybridPriceBps = Math.round(
          (raffleWeightBps * raffleProbabilityBps + marketWeightBps * marketSentimentBps) / 10000
        );
      } else if (typeof source.yes_price === 'number') {
        // legacy float price (0..1)
        hybridPriceBps = Math.round(source.yes_price * 10000);
      }
    }

    const lastUpdated = source.last_updated || source.updated_at || source.lastUpdate || new Date().toISOString();

    const res = {
      marketId,
      raffleProbabilityBps,
      marketSentimentBps,
      hybridPriceBps: typeof hybridPriceBps === 'number' ? hybridPriceBps : 0,
      raffleWeightBps,
      marketWeightBps,
      lastUpdated,
    };
    return reply.send(res);
  });

  // DEV-ONLY: SSE stream by oracleKey (bytes32 hex) – bypasses DB completely
  // Mount path: /api/pricing/stream/pricing-by-key/:oracleKey
  fastify.get('/stream/pricing-by-key/:oracleKey', async (request, reply) => {
    const { oracleKey } = request.params;
    if (!oracleKey) {
      return reply.status(400).send({ error: 'oracleKey is required' });
    }

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('Access-Control-Allow-Origin', '*');

    // Send initial cached value if any
    const cached = pricingService.getCachedPricing(oracleKey);
    if (cached) {
      const initial = {
        type: 'initial_price',
        marketKey: oracleKey,
        raffleProbabilityBps: cached.raffle_probability_bps ?? null,
        marketSentimentBps: cached.market_sentiment_bps ?? null,
        hybridPriceBps: cached.hybrid_price_bps ?? null,
        timestamp: cached.last_updated || new Date().toISOString(),
      };
      reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);
    }

    // Subscribe to key directly
    const unsubscribe = pricingService.subscribeToMarket(oracleKey, (priceUpdate) => {
      try {
        const evt = {
          type: 'price_update',
          marketKey: oracleKey,
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

    // Heartbeat
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

  // DEV-ONLY: Current snapshot by oracleKey (no DB)
  fastify.get('/stream/pricing-by-key/:oracleKey/current', async (request, reply) => {
    const { oracleKey } = request.params;
    if (!oracleKey) {
      return reply.status(400).send({ error: 'oracleKey is required' });
    }
    const cached = pricingService.getCachedPricing(oracleKey);
    if (!cached) {
      return reply.status(404).send({ error: 'Pricing not found for oracleKey' });
    }
    return reply.send({
      marketKey: oracleKey,
      raffleProbabilityBps: cached.raffle_probability_bps ?? null,
      marketSentimentBps: cached.market_sentiment_bps ?? null,
      hybridPriceBps: cached.hybrid_price_bps ?? null,
      lastUpdated: cached.last_updated || new Date().toISOString(),
    });
  });

  // DEV-ONLY: Set pricing by oracleKey (disabled in production)
  fastify.post('/debug/pricing/update-by-key', async (request, reply) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return reply.status(403).send({ error: 'Forbidden in production' });
      }
      const { oracleKey, raffleProbabilityBps, marketSentimentBps, hybridPriceBps } = request.body || {};
      if (!oracleKey) {
        return reply.status(400).send({ error: 'oracleKey is required' });
      }

      const payload = {
        raffle_probability_bps: typeof raffleProbabilityBps === 'number' ? raffleProbabilityBps : undefined,
        market_sentiment_bps: typeof marketSentimentBps === 'number' ? marketSentimentBps : undefined,
        hybrid_price_bps: typeof hybridPriceBps === 'number' ? hybridPriceBps : undefined,
      };
      // If hybrid not provided, compute from raffle/sentiment with default weights in client
      if (payload.hybrid_price_bps == null && typeof payload.raffle_probability_bps === 'number' && typeof payload.market_sentiment_bps === 'number') {
        payload.hybrid_price_bps = Math.round((7000 * payload.raffle_probability_bps + 3000 * payload.market_sentiment_bps) / 10000);
      }

      const updated = pricingService.setPricingForKey(oracleKey, payload);
      return reply.send({ success: true, marketKey: oracleKey, pricing: updated });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to update pricing by key');
      return reply.status(500).send({ error: 'Failed to update pricing by key' });
    }
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
