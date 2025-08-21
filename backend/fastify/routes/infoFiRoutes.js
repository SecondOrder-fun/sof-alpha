import { db } from '../../shared/supabaseClient.js';
import { pricingService } from '../../shared/pricingService.js';
import { marketMakerService } from '../../shared/marketMakerService.js';
import { getPublicClient } from '../../src/lib/viemClient.js';
import RaffleAbi from '../../src/abis/RaffleAbi.js';
import { getChainByKey } from '../../src/config/chain.js';

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

  // Quote endpoint (fixed-odds, house market‑maker)
  fastify.get('/markets/:id/quote', async (request, reply) => {
    try {
      const { id } = request.params;
      if (!id) return reply.status(400).send({ error: 'Market ID is required' });

      const { side, amount } = request.query || {};
      if (!side || !['yes', 'no', 'YES', 'NO'].includes(String(side))) {
        return reply.status(400).send({ error: 'side must be yes|no' });
      }
      const amt = Number(amount || 0);
      if (!Number.isFinite(amt) || amt <= 0) {
        return reply.status(400).send({ error: 'amount must be > 0' });
      }

      const quote = await marketMakerService.quote(Number(id), String(side), amt);
      return reply.send({ quote });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to get quote' });
    }
  });

  // Buy (enter/increase position)
  fastify.post('/markets/:id/buy', async (request, reply) => {
    try {
      const { id } = request.params;
      if (!id) return reply.status(400).send({ error: 'Market ID is required' });

      const body = request.body || {};
      const side = body.side || body.outcome;
      const amount = Number(body.amount || body.size || 0);
      const user = body.user_address || body.address || body.player_address;

      if (!side || !['yes', 'no', 'YES', 'NO'].includes(String(side))) {
        return reply.status(400).send({ error: 'side must be yes|no' });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return reply.status(400).send({ error: 'amount must be > 0' });
      }
      if (!user) {
        return reply.status(400).send({ error: 'user_address is required' });
      }

      const exec = await marketMakerService.buy(Number(id), String(side), amount, String(user));
      if (exec?.error) {
        return reply.status(400).send({ error: exec.error });
      }
      return reply.send({ success: true, execution: exec });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to execute buy' });
    }
  });

  // Sell (reduce/close position)
  fastify.post('/markets/:id/sell', async (request, reply) => {
    try {
      const { id } = request.params;
      if (!id) return reply.status(400).send({ error: 'Market ID is required' });

      const body = request.body || {};
      const side = body.side || body.outcome;
      const amount = Number(body.amount || body.size || 0);
      const user = body.user_address || body.address || body.player_address;

      if (!side || !['yes', 'no', 'YES', 'NO'].includes(String(side))) {
        return reply.status(400).send({ error: 'side must be yes|no' });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return reply.status(400).send({ error: 'amount must be > 0' });
      }
      if (!user) {
        return reply.status(400).send({ error: 'user_address is required' });
      }

      const exec = await marketMakerService.sell(Number(id), String(side), amount, String(user));
      if (exec?.error) {
        return reply.status(400).send({ error: exec.error });
      }
      return reply.send({ success: true, execution: exec });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to execute sell' });
    }
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

  // Threshold sync: create InfoFi market if a player crosses ≥1% win probability (100 bps)
  fastify.post('/markets/sync-threshold', async (request, reply) => {
    try {
      const { seasonId, playerAddress, network } = request.body || {};
      fastify.log.info({ seasonId, playerAddress, network }, '[sync-threshold] request received');
      if (typeof seasonId === 'undefined' || !playerAddress) {
        return reply.status(400).send({ error: 'seasonId and playerAddress are required' });
      }

      const chain = getChainByKey(network);
      fastify.log.info({ chain }, '[sync-threshold] resolved chain');
      if (!chain?.raffle) {
        return reply.status(500).send({ error: 'Raffle address not configured for selected network' });
      }

      const client = getPublicClient(network);
      fastify.log.info({ raffle: chain.raffle }, '[sync-threshold] reading on-chain');

      let details, position;
      try {
        [details, position] = await Promise.all([
          client.readContract({ address: chain.raffle, abi: RaffleAbi, functionName: 'getSeasonDetails', args: [BigInt(seasonId)] }),
          client.readContract({ address: chain.raffle, abi: RaffleAbi, functionName: 'getParticipantPosition', args: [BigInt(seasonId), playerAddress] })
        ]);
      } catch (readErr) {
        fastify.log.error({ readErr }, '[sync-threshold] on-chain read failed');
        const debug = process.env.NODE_ENV === 'production' ? undefined : String(readErr?.message || readErr);
        return reply.status(502).send({ error: 'On-chain read failed', debug });
      }

      const totalTickets = Number(details?.[3]); // index 3 is totalTickets
      const ticketCount = Number((position && (position.ticketCount ?? position[0])) ?? 0);
      fastify.log.info({ totalTickets, ticketCount }, '[sync-threshold] on-chain values');
      if (!totalTickets || !ticketCount) {
        return reply.send({ created: false, reason: 'No tickets/total for player or season', totalTickets, ticketCount });
      }
      const bps = Math.floor((ticketCount * 10000) / totalTickets);
      fastify.log.info({ bps }, '[sync-threshold] computed probability bps');

      const MARKET_TYPE = 'WINNER_PREDICTION';
      // Resolve player_id from address (create if missing)
      let playerId;
      try {
        playerId = await db.getOrCreatePlayerIdByAddress(playerAddress);
        fastify.log.info({ playerId }, '[sync-threshold] resolved playerId');
      } catch (playerErr) {
        fastify.log.error({ playerErr }, '[sync-threshold] resolve/create player failed');
        const debug = process.env.NODE_ENV === 'production' ? undefined : String(playerErr?.message || playerErr);
        return reply.status(500).send({ error: 'Failed to resolve player', debug });
      }

      let exists = false;
      try {
        exists = await db.hasInfoFiMarket(seasonId, playerId, MARKET_TYPE);
      } catch (dbCheckErr) {
        fastify.log.error({ dbCheckErr }, '[sync-threshold] DB existence check failed');
        const debug = process.env.NODE_ENV === 'production' ? undefined : String(dbCheckErr?.message || dbCheckErr);
        return reply.status(500).send({ error: 'DB existence check failed', debug });
      }
      if (exists) {
        return reply.send({ created: false, reason: 'Market already exists', probabilityBps: bps });
      }

      if (bps < 100) {
        return reply.send({ created: false, reason: 'Below threshold', probabilityBps: bps });
      }

      let market;
      try {
        market = await db.createInfoFiMarket({
          raffle_id: seasonId,
          player_id: playerId,
          market_type: MARKET_TYPE,
          initial_probability: bps,
          current_probability: bps,
          is_active: true,
          is_settled: false
        });
        fastify.log.info({ marketId: market?.id }, '[sync-threshold] market row created');
      } catch (createErr) {
        fastify.log.error({ createErr }, '[sync-threshold] DB create market failed');
        const debug = process.env.NODE_ENV === 'production' ? undefined : String(createErr?.message || createErr);
        return reply.status(500).send({ error: 'Failed to create market row', debug });
      }

      try {
        await db.upsertMarketPricingCache({
          market_id: market.id,
          raffle_probability: bps,
          market_sentiment: bps,
          hybrid_price: bps,
          raffle_weight: 7000,
          market_weight: 3000,
          last_updated: new Date().toISOString()
        });
        fastify.log.info({ marketId: market.id, bps }, '[sync-threshold] pricing cache initialized');
      } catch (cacheErr) {
        fastify.log.error({ cacheErr }, '[sync-threshold] pricing cache upsert failed');
        const debug = process.env.NODE_ENV === 'production' ? undefined : String(cacheErr?.message || cacheErr);
        return reply.status(500).send({ error: 'Failed to initialize pricing cache', debug });
      }

      return reply.status(201).send({ created: true, market, probabilityBps: bps });
    } catch (error) {
      fastify.log.error(error);
      const debug = process.env.NODE_ENV === 'production' ? undefined : String(error?.message || error);
      return reply.status(500).send({ error: 'Failed to sync threshold', debug });
    }
  });

  // Pricing snapshot (bps) for a market
  fastify.get('/markets/:id/pricing', async (request, reply) => {
    try {
      const { id } = request.params;
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }

      const marketId = Number(id);
      // Try in-memory cache first
      const cached = pricingService.getCachedPricing(marketId);
      if (cached) {
        return reply.send({ pricing: cached });
      }

      // Fallback to DB snapshot
      const snapshot = await db.getMarketPricingCache(marketId);
      return reply.send({ pricing: snapshot });
    } catch (error) {
      fastify.log.error(error);
      const msg = String(error?.message || '');
      if (msg.includes('does not exist') || msg.includes('relation') || error?.code === '42P01') {
        return reply.send({ pricing: null });
      }
      return reply.status(500).send({ error: 'Failed to fetch pricing snapshot' });
    }
  });

  // Pricing SSE stream (bps) for a market
  fastify.get('/markets/:id/pricing-stream', async (request, reply) => {
    try {
      const { id } = request.params;
      if (!id) {
        return reply.status(400).send({ error: 'Market ID is required' });
      }

      const marketId = Number(id);

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Helper to push data
      const sendEvent = (payload) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch (e) {
          // If write fails, we'll rely on close handler to clean up
        }
      };

      // Initial snapshot
      try {
        const cached = pricingService.getCachedPricing(marketId);
        if (cached) {
          sendEvent({ type: 'initial', pricing: cached });
        } else {
          const snapshot = await db.getMarketPricingCache(marketId);
          if (snapshot) sendEvent({ type: 'initial', pricing: snapshot });
        }
      } catch (_) {
        // best-effort initial snapshot
      }

      // Subscribe to live updates
      const unsubscribe = pricingService.subscribeToMarket(marketId, (evt) => {
        // evt already in bps ({ raffle_probability_bps, market_sentiment_bps, hybrid_price_bps, last_updated })
        sendEvent({ type: 'update', pricing: evt });
      });

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(': hb\n\n');
        } catch (_) {
          // ignore
        }
      }, 30000);

      // Cleanup on client disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          reply.raw.end();
        } catch (_) {
          // ignore
        }
      });

      // Do not let Fastify auto-send a response body
      // We keep the connection open for SSE
      return reply; // explicit return to satisfy control flow
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to start pricing stream' });
    }
  });
}

export default infoFiRoutes;