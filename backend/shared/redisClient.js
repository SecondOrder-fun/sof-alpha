// backend/shared/redisClient.js
import Redis from 'ioredis';
import process from 'node:process';

/**
 * Redis Client Singleton
 * Supports both local development (redis://localhost:6379) and production (Upstash)
 */
class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize Redis connection
   */
  connect() {
    if (this.client) {
      return this.client;
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    try {
      this.client = new Redis(redisUrl, {
        // Enable TLS for production (Upstash uses rediss://)
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: false,
        enableReadyCheck: true,
      });

      this.client.on('connect', () => {
        console.log('[Redis] Connected successfully');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('[Redis] Connection closed');
        this.isConnected = false;
      });

      return this.client;
    } catch (error) {
      console.error('[Redis] Failed to initialize:', error.message);
      throw error;
    }
  }

  /**
   * Get the Redis client instance
   */
  getClient() {
    if (!this.client) {
      return this.connect();
    }
    return this.client;
  }

  /**
   * Gracefully disconnect
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      console.log('[Redis] Disconnected');
    }
  }

  /**
   * Health check
   */
  async ping() {
    try {
      const client = this.getClient();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('[Redis] Ping failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
