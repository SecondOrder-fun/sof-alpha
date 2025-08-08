/* eslint-env node */
import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createServer } from 'http';
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

// Register routes
await app.register(import('./routes/raffleRoutes.js'), { prefix: '/api/raffles' });
await app.register(import('./routes/infoFiRoutes.js'), { prefix: '/api/infofi' });
await app.register(import('./routes/userRoutes.js'), { prefix: '/api/users' });
await app.register(import('./routes/arbitrageRoutes.js'), { prefix: '/api/arbitrage' });
await app.register(import('./routes/pricingRoutes.js'), { prefix: '/api/pricing' });
await app.register(import('./routes/settlementRoutes.js'), { prefix: '/api/settlement' });
await app.register(import('./routes/analyticsRoutes.js'), { prefix: '/api/analytics' });

// Health check endpoint
app.get('/health', async (_request, reply) => {
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

// Create HTTP server
const server = createServer(app.server);

// Set up WebSocket server for real-time updates
const wss = new WebSocketServer({ server });

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

// Start server
const PORT = process.env.PORT || 3001;

server.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening on port ${PORT}`);
  app.log.info(`WebSocket server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  app.log.info('Shutting down server...');
  await app.close();
  server.close(() => {
    app.log.info('Server closed');
    process.exit(0);
  });
});

export { app, wss };