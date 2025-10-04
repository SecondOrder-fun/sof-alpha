#!/usr/bin/env node

/**
 * Start Backend with Redis
 * Checks if Redis is running, starts it if needed, then starts the backend server
 */

import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Check if Redis is running
 */
async function isRedisRunning() {
  try {
    await execAsync('redis-cli ping');
    return true;
  } catch {
    return false;
  }
}

/**
 * Start Redis via Homebrew
 */
async function startRedis() {
  console.log('⚠️  Redis is not running. Starting Redis...');
  
  try {
    // Check if Redis is installed via Homebrew
    await execAsync('brew list redis');
    console.log('📦 Starting Redis via Homebrew...');
    await execAsync('brew services start redis');
    
    // Wait for Redis to be ready
    console.log('⏳ Waiting for Redis to be ready...');
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (await isRedisRunning()) {
        console.log('✅ Redis is ready!');
        return true;
      }
    }
    
    console.error('❌ Redis failed to start after 10 seconds');
    return false;
  } catch (error) {
    console.error('❌ Redis is not installed via Homebrew.');
    console.error('📝 Install Redis with: brew install redis');
    console.error('📝 Or manually start Redis: redis-server');
    return false;
  }
}

/**
 * Start the backend server
 */
function startBackend() {
  console.log('🚀 Starting backend server...');
  
  // Spawn the backend process
  const backend = spawn('node', ['-r', 'dotenv/config', 'backend/fastify/server.js'], {
    stdio: 'inherit',
    shell: false
  });
  
  backend.on('error', (error) => {
    console.error('❌ Failed to start backend:', error);
    process.exit(1);
  });
  
  backend.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    process.exit(code || 0);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    backend.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    backend.kill('SIGTERM');
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Checking Redis status...');
  
  const redisRunning = await isRedisRunning();
  
  if (redisRunning) {
    console.log('✅ Redis is already running');
  } else {
    const started = await startRedis();
    if (!started) {
      console.error('❌ Cannot start Redis. Please start it manually and try again.');
      process.exit(1);
    }
  }
  
  // Verify Redis connection
  console.log('🔗 Testing Redis connection...');
  if (await isRedisRunning()) {
    console.log('✅ Redis connection verified');
  } else {
    console.error('❌ Cannot connect to Redis');
    process.exit(1);
  }
  
  // Start backend
  startBackend();
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
