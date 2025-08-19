import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { WebSocketServer } from 'ws';
import process from 'node:process';

// Create Fastify instance
const app = fastify({ logger: true });

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

// Register routes (use default export from dynamic import)
await app.register((await import('./routes/raffleRoutes.js')).default, { prefix: '/api/raffles' });
await app.register((await import('./routes/infoFiRoutes.js')).default, { prefix: '/api/infofi' });
await app.register((await import('./routes/userRoutes.js')).default, { prefix: '/api/users' });
await app.register((await import('./routes/arbitrageRoutes.js')).default, { prefix: '/api/arbitrage' });
await app.register((await import('./routes/pricingRoutes.js')).default, { prefix: '/api/pricing' });
await app.register((await import('./routes/settlementRoutes.js')).default, { prefix: '/api/settlement' });
await app.register((await import('./routes/analyticsRoutes.js')).default, { prefix: '/api/analytics' });
await app.register((await import('./routes/healthRoutes.js')).default, { prefix: '/api' });

// Basic root healthcheck (avoid duplicating /api/health)
app.get('/healthz', async (_request, reply) => {
  reply.send({ status: 'OK', timestamp: new Date().toISOString() });
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

// Start server
const PORT = process.env.PORT || 3000;

try {
  await app.listen({ port: Number(PORT), host: '0.0.0.0' });
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
    // app.server is closed by app.close()
  } finally {
    app.log.info('Server closed');
    process.exit(0);
  }
});

export { app };