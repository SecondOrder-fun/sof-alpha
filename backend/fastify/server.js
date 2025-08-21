import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { WebSocketServer } from 'ws';
import process from 'node:process';
import { startInfoFiMarketListener } from '../src/services/infofiListener.js';
import { loadChainEnv } from '../src/config/chain.js';

// Create Fastify instance
const app = fastify({ logger: true });

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
    : ['http://localhost:3000', 'http://localhost:5173'],
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

  // Start InfoFi listeners for networks that have factory configured
  try {
    const chains = loadChainEnv();
    const candidates = [
      { key: 'LOCAL', cfg: chains.LOCAL },
      { key: 'TESTNET', cfg: chains.TESTNET },
    ];
    for (const c of candidates) {
      if (c?.cfg?.infofiFactory) {
        const stop = startInfoFiMarketListener(c.key, app.log);
        stopListeners.push(stop);
        app.log.info({ network: c.key, factory: c.cfg.infofiFactory }, 'InfoFi listener started');
      }
    }
  } catch (e) {
    app.log.error({ e }, 'Failed to start InfoFi listeners');
  }
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
    // app.server is closed by app.close()
  } finally {
    app.log.info('Server closed');
    process.exit(0);
  }
});

export { app };