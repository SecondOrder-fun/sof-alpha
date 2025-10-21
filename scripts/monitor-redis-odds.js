#!/usr/bin/env node
// scripts/monitor-redis-odds.js

/**
 * Redis Historical Odds Monitoring Script
 * 
 * Monitors Redis memory usage, key counts, and data statistics
 * for the historical odds storage system.
 * 
 * Usage:
 *   node scripts/monitor-redis-odds.js           # One-time check
 *   node scripts/monitor-redis-odds.js --watch   # Continuous monitoring
 */

import { historicalOddsService } from '../backend/shared/historicalOddsService.js';
import { redisClient } from '../backend/shared/redisClient.js';

const WATCH_INTERVAL_MS = 30000; // 30 seconds

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format duration to human-readable format
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted string
 */
function formatDuration(seconds) {
  if (seconds < 0) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

/**
 * Get Redis memory info
 * @returns {Promise<Object>} Memory statistics
 */
async function getRedisMemoryInfo() {
  const redis = redisClient.getClient();
  const info = await redis.info('memory');
  
  const lines = info.split('\r\n');
  const memoryStats = {};
  
  for (const line of lines) {
    if (line.includes(':')) {
      const [key, value] = line.split(':');
      memoryStats[key] = value;
    }
  }
  
  return {
    usedMemory: parseInt(memoryStats.used_memory || 0),
    usedMemoryHuman: memoryStats.used_memory_human || 'N/A',
    usedMemoryPeak: parseInt(memoryStats.used_memory_peak || 0),
    usedMemoryPeakHuman: memoryStats.used_memory_peak_human || 'N/A',
    totalSystemMemory: parseInt(memoryStats.total_system_memory || 0),
    maxMemory: parseInt(memoryStats.maxmemory || 0),
    memoryFragmentation: parseFloat(memoryStats.mem_fragmentation_ratio || 0),
  };
}

/**
 * Get all historical odds keys
 * @returns {Promise<Array>} Array of key names
 */
async function getHistoricalOddsKeys() {
  const redis = redisClient.getClient();
  return await redis.keys('odds:history:*');
}

/**
 * Parse season and market IDs from key
 * @param {string} key - Redis key
 * @returns {Object} Parsed IDs
 */
function parseKey(key) {
  const match = key.match(/odds:history:(\d+):(\d+)/);
  if (match) {
    return {
      seasonId: parseInt(match[1]),
      marketId: parseInt(match[2]),
    };
  }
  return null;
}

/**
 * Get statistics for all markets
 * @returns {Promise<Array>} Array of market statistics
 */
async function getAllMarketStats() {
  const keys = await getHistoricalOddsKeys();
  const stats = [];
  
  for (const key of keys) {
    const parsed = parseKey(key);
    if (parsed) {
      const marketStats = await historicalOddsService.getStats(
        parsed.seasonId,
        parsed.marketId
      );
      stats.push({
        ...parsed,
        ...marketStats,
      });
    }
  }
  
  return stats;
}

/**
 * Calculate total memory usage for historical odds
 * @param {Array} marketStats - Array of market statistics
 * @returns {number} Estimated memory usage in bytes
 */
function estimateMemoryUsage(marketStats) {
  // Rough estimate: ~150 bytes per data point
  const bytesPerPoint = 150;
  const totalPoints = marketStats.reduce((sum, stat) => sum + stat.count, 0);
  return totalPoints * bytesPerPoint;
}

/**
 * Display monitoring dashboard
 * @param {Object} data - Monitoring data
 */
function displayDashboard(data) {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📊 Historical Odds Redis Monitoring Dashboard');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Time: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────');
  
  // Redis Memory Info
  console.log('\n🔧 Redis Memory Usage:');
  console.log(`  Current:     ${data.memory.usedMemoryHuman} (${formatBytes(data.memory.usedMemory)})`);
  console.log(`  Peak:        ${data.memory.usedMemoryPeakHuman} (${formatBytes(data.memory.usedMemoryPeak)})`);
  if (data.memory.maxMemory > 0) {
    const usagePercent = ((data.memory.usedMemory / data.memory.maxMemory) * 100).toFixed(1);
    console.log(`  Max:         ${formatBytes(data.memory.maxMemory)} (${usagePercent}% used)`);
  }
  console.log(`  Fragmentation: ${data.memory.memoryFragmentation.toFixed(2)}`);
  
  // Historical Odds Keys
  console.log('\n📈 Historical Odds Storage:');
  console.log(`  Total Markets:    ${data.marketCount}`);
  console.log(`  Total Data Points: ${data.totalPoints.toLocaleString()}`);
  console.log(`  Estimated Size:   ${formatBytes(data.estimatedSize)}`);
  console.log(`  Avg Points/Market: ${data.avgPointsPerMarket.toFixed(0)}`);
  
  // Top Markets by Data Points
  if (data.topMarkets.length > 0) {
    console.log('\n🏆 Top Markets by Data Points:');
    data.topMarkets.slice(0, 5).forEach((market, idx) => {
      const duration = market.newestTimestamp && market.oldestTimestamp
        ? formatDuration((market.newestTimestamp - market.oldestTimestamp) / 1000)
        : 'N/A';
      console.log(`  ${idx + 1}. Season ${market.seasonId}, Market ${market.marketId}`);
      console.log(`     Points: ${market.count.toLocaleString()}, Duration: ${duration}, TTL: ${formatDuration(market.ttl)}`);
    });
  }
  
  // Alerts
  console.log('\n⚠️  Alerts:');
  const alerts = [];
  
  if (data.memory.maxMemory > 0) {
    const usagePercent = (data.memory.usedMemory / data.memory.maxMemory) * 100;
    if (usagePercent > 80) {
      alerts.push(`  🔴 Memory usage critical: ${usagePercent.toFixed(1)}%`);
    } else if (usagePercent > 60) {
      alerts.push(`  🟡 Memory usage high: ${usagePercent.toFixed(1)}%`);
    }
  }
  
  if (data.memory.memoryFragmentation > 1.5) {
    alerts.push(`  🟡 High memory fragmentation: ${data.memory.memoryFragmentation.toFixed(2)}`);
  }
  
  const marketsWithLowTTL = data.marketStats.filter(m => m.ttl > 0 && m.ttl < 86400);
  if (marketsWithLowTTL.length > 0) {
    alerts.push(`  🟡 ${marketsWithLowTTL.length} market(s) expiring within 24h`);
  }
  
  if (alerts.length === 0) {
    console.log('  ✅ No alerts - system healthy');
  } else {
    alerts.forEach(alert => console.log(alert));
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  if (data.watching) {
    console.log('  Press Ctrl+C to stop monitoring');
  }
  console.log('═══════════════════════════════════════════════════════════\n');
}

/**
 * Collect monitoring data
 * @returns {Promise<Object>} Monitoring data
 */
async function collectData() {
  const memory = await getRedisMemoryInfo();
  const marketStats = await getAllMarketStats();
  
  const totalPoints = marketStats.reduce((sum, stat) => sum + stat.count, 0);
  const estimatedSize = estimateMemoryUsage(marketStats);
  const avgPointsPerMarket = marketStats.length > 0 ? totalPoints / marketStats.length : 0;
  
  // Sort by data point count
  const topMarkets = [...marketStats].sort((a, b) => b.count - a.count);
  
  return {
    memory,
    marketCount: marketStats.length,
    marketStats,
    totalPoints,
    estimatedSize,
    avgPointsPerMarket,
    topMarkets,
  };
}

/**
 * Main monitoring function
 */
async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch') || args.includes('-w');
  
  try {
    // Initialize Redis connection
    historicalOddsService.init();
    
    if (watchMode) {
      console.log('Starting continuous monitoring...\n');
      
      // Initial display
      const data = await collectData();
      displayDashboard({ ...data, watching: true });
      
      // Update every 30 seconds
      setInterval(async () => {
        try {
          const data = await collectData();
          displayDashboard({ ...data, watching: true });
        } catch (error) {
          console.error('Error updating dashboard:', error.message);
        }
      }, WATCH_INTERVAL_MS);
      
    } else {
      // One-time check
      const data = await collectData();
      displayDashboard({ ...data, watching: false });
      
      console.log('💡 Tip: Use --watch flag for continuous monitoring');
      console.log('   Example: node scripts/monitor-redis-odds.js --watch\n');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Monitoring failed:', error);
    console.error('\nTroubleshooting:');
    console.error('  1. Ensure Redis is running: redis-cli ping');
    console.error('  2. Check REDIS_URL in .env file');
    console.error('  3. Verify Redis connection: redis-cli INFO');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Monitoring stopped');
  process.exit(0);
});

// Run monitoring
main();
