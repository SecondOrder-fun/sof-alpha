import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { WebSocketServer } from 'ws';
import process from 'node:process';
import { startInfoFiMarketListener } from '../src/services/infofiListener.js';
import { startPositionTrackerListener } from '../src/services/positionTrackerListener.js';
import { startOracleListener } from '../src/services/oracleListener.js';
import { startRaffleListener } from '../src/services/raffleListener.js';
import { resetAndSyncInfoFiMarkets } from '../src/services/syncInfoFiMarkets.js';
import { pricingService } from '../shared/pricingService.js';
import { historicalOddsService } from '../shared/historicalOddsService.js';
import { loadChainEnv } from '../src/config/chain.js';
import { redisClient } from '../shared/redisClient.js';
import { db } from '../shared/supabaseClient.js';

// Create Fastify instance
const app = fastify({ logger: true });

// Ensure pricing service shares Fastify logger for consistent structured logs
pricingService.setLogger?.(app.log);

// Log every route as it is registered to diagnose mounting issues
app.addHook('onRoute', (routeOptions) => {
  try {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method.join(',') : routeOptions.method;
    app.log.info({ method: methods, url: routeOptions.url, prefix: routeOptions.prefix }, 'route added');
  } catch (e) {
    app.log.error({ e }, 'Failed to log route');
  }
});

// Register plugins
await app.register(cors, {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://secondorder.fun', 'https://www.secondorder.fun']
    : true, // Allow all origins in development
  credentials: true
});

await app.register(helmet);

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// Manually registered /api/health route removed; using healthRoutes plugin under prefix '/api'

// Register routes (use default export from dynamic import)
// Always register health first so /api/health is available even if other plugins fail
try {
  await app.register((await import('./routes/healthRoutes.js')).default, { prefix: '/api' });
  app.log.info('Mounted /api/health');
} catch (err) {
  app.log.error({ err }, 'Failed to mount /api/health');
}

// Mount remaining route plugins defensively so one failure doesn't block others
try {
  await app.register((await import('./routes/raffleRoutes.js')).default, { prefix: '/api/raffles' });
  app.log.info('Mounted /api/raffles');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/raffles'); }

try {
  await app.register((await import('./routes/infoFiRoutes.js')).default, { prefix: '/api/infofi' });
  app.log.info('Mounted /api/infofi');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/infofi'); }

try {
  await app.register((await import('./routes/userRoutes.js')).default, { prefix: '/api/users' });
  app.log.info('Mounted /api/users');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/users'); }

try {
  await app.register((await import('./routes/usernameRoutes.js')).default, { prefix: '/api/usernames' });
  app.log.info('Mounted /api/usernames');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/usernames'); }

try {
  await app.register((await import('./routes/fpmmRoutes.js')).default, { prefix: '/api/fpmm' });
  app.log.info('Mounted /api/fpmm');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/fpmm'); }

try {
  await app.register((await import('./routes/arbitrageRoutes.js')).default, { prefix: '/api/arbitrage' });
  app.log.info('Mounted /api/arbitrage');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/arbitrage'); }

try {
  await app.register((await import('./routes/pricingRoutes.js')).default, { prefix: '/api/pricing' });
  app.log.info('Mounted /api/pricing');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/pricing'); }

try {
  await app.register((await import('./routes/settlementRoutes.js')).default, { prefix: '/api/settlement' });
  app.log.info('Mounted /api/settlement');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/settlement'); }

try {
  await app.register((await import('./routes/analyticsRoutes.js')).default, { prefix: '/api/analytics' });
  app.log.info('Mounted /api/analytics');
} catch (err) { app.log.error({ err }, 'Failed to mount /api/analytics'); }

// Removed legacy /healthz to standardize on /api/health

// Debug: print all mounted routes
app.ready(() => {
  try {
    app.log.info('Route tree start');
    app.log.info('\n' + app.printRoutes());
    app.log.info('Route tree end');
  } catch (e) {
    app.log.error({ e }, 'Failed to print routes');
  }
});

// Error handling
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.status(500).send({ error: 'Internal Server Error' });
});

// 404 handler
app.setNotFoundHandler((_request, reply) => {
  reply.status(404).send({ error: 'Not Found' });
});

// WebSocket server (will attach after app starts and app.server exists)
let wss;
let stopListeners = [];

// Broadcast helper (fan-out to all clients)
function wsBroadcast(obj) {
  if (!wss) return;
  const msg = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    try {
      if (client.readyState === 1) {
        client.send(msg);
      }
    } catch (_) {
      // ignore individual client errors
    }
  });
}

// Start server
const PORT = process.env.PORT || 3000;

try {
  await app.listen({ port: Number(PORT), host: '127.0.0.1' });
  // Attach WebSocket server to Fastify's underlying Node server
  wss = new WebSocketServer({ server: app.server });

  wss.on('connection', (ws) => {
    app.log.info('New WebSocket connection');
    ws.on('message', (message) => {
      app.log.info('Received message:', message.toString());
    });
    ws.on('close', () => {
      app.log.info('WebSocket connection closed');
    });
    ws.on('error', (error) => {
      app.log.error('WebSocket error:', error);
    });
  });

  app.log.info(`HTTP server listening on port ${PORT}`);
  app.log.info(`WebSocket server bound on the same port ${PORT}`);

  // Initialize Redis connection
  try {
    redisClient.connect();
    const pingResult = await redisClient.ping();
    if (pingResult) {
      app.log.info('Redis connection established and verified');
    } else {
      app.log.warn('Redis connection established but ping failed');
    }
  } catch (e) {
    app.log.error({ e }, 'Failed to connect to Redis - username features may not work');
  }

  // Sync InfoFi markets from blockchain to database
  try {
    const chains = loadChainEnv();
    const candidates = [
      { key: 'LOCAL', cfg: chains.LOCAL },
      { key: 'TESTNET', cfg: chains.TESTNET },
    ];
    
    for (const c of candidates) {
      if (c?.cfg?.infofiFactory) {
        // For LOCAL network, reset database and sync from blockchain
        // This ensures database is in sync with Anvil on restart
        if (c.key === 'LOCAL') {
          try {
            app.log.info({ network: c.key }, 'Resetting and syncing InfoFi markets from blockchain...');
            const syncedCount = await resetAndSyncInfoFiMarkets(c.key, app.log);
            app.log.info({ network: c.key, syncedCount }, 'InfoFi markets synced from blockchain');
          } catch (syncErr) {
            app.log.error({ syncErr }, 'Failed to sync InfoFi markets - continuing with listener only');
          }
        }
        
        // Start listener for new markets (legacy - kept for backward compatibility)
        const stop = startInfoFiMarketListener(c.key, app.log);
        stopListeners.push(stop);
        app.log.info({ network: c.key, factory: c.cfg.infofiFactory }, 'InfoFi listener started');
      }
      // Start position tracker listener if configured (primary source for market probability updates)
      if (c?.cfg?.positionTracker) {
        const stopTracker = startPositionTrackerListener(c.key, app.log);
        stopListeners.push(stopTracker);
        app.log.info({ network: c.key, tracker: c.cfg.positionTracker }, 'Position tracker listener started');
      }
      // Start oracle listener if oracle configured (feeds pricingService from on-chain)
      if (c?.cfg?.infofiOracle) {
        const stopOracle = startOracleListener(c.key, app.log);
        stopListeners.push(stopOracle);
        app.log.info({ network: c.key, oracle: c.cfg.infofiOracle }, 'Oracle listener started');
      }
      // Start raffle PositionUpdate listener if raffle is configured
      if (c?.cfg?.raffle) {
        const stopRaffle = startRaffleListener(c.key, wsBroadcast, app.log);
        stopListeners.push(stopRaffle);
        app.log.info({ network: c.key, raffle: c.cfg.raffle }, 'Raffle listener started');
      }
    }
  } catch (e) {
    app.log.error({ e }, 'Failed to start InfoFi listeners');
  }

  // Forward pricingService price updates to WS as MARKET_UPDATE
  try {
    pricingService.on('priceUpdate', (evt) => {
      wsBroadcast({ type: 'MARKET_UPDATE', payload: evt });
    });
    app.log.info('PricingService -> WS MARKET_UPDATE bridge ready');
  } catch (e) {
    app.log.error({ e }, 'Failed to connect pricingService to WS');
  }

  // Schedule daily cleanup of old historical odds data
  const cleanupIntervalHours = parseInt(process.env.ODDS_CLEANUP_INTERVAL_HOURS || '24', 10);
  const cleanupIntervalMs = cleanupIntervalHours * 60 * 60 * 1000;
  
  const cleanupHistoricalOdds = async () => {
    try {
      app.log.info('Starting scheduled historical odds cleanup...');
      
      // Get all active markets
      const markets = await db.getActiveInfoFiMarkets();
      let totalRemoved = 0;
      
      for (const market of markets) {
        const seasonId = market.season_id || market.raffle_id || 0;
        const removed = await historicalOddsService.cleanupOldData(seasonId, market.id);
        totalRemoved += removed;
      }
      
      app.log.info({ totalRemoved, marketCount: markets.length }, 'Historical odds cleanup completed');
    } catch (error) {
      app.log.error({ error }, 'Failed to cleanup historical odds');
    }
  };
  
  // Run cleanup immediately on startup, then schedule
  cleanupHistoricalOdds();
  const cleanupInterval = setInterval(cleanupHistoricalOdds, cleanupIntervalMs);
  app.log.info({ intervalHours: cleanupIntervalHours }, 'Historical odds cleanup scheduler started');
  
  // Store interval for cleanup on shutdown
  stopListeners.push(() => clearInterval(cleanupInterval));
  
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  app.log.info('Shutting down server...');
  await app.close();
  try {
    if (wss) {
      wss.close();
    }
    // Stop InfoFi listeners
    for (const stop of stopListeners) {
      try { stop(); } catch (_) { /* ignore */ }
    }
    // Disconnect Redis
    await redisClient.disconnect();
    // app.server is closed by app.close()
  } finally {
    app.log.info('Server closed');
    process.exit(0);
  }
});

export { app };