// backend/src/services/diagnostics/testBondingCurveListener.js
// Diagnostic script to test bonding curve event listening

import { getPublicClient } from '../../lib/viemClient.js';
import { getChainByKey } from '../../config/chain.js';
import SOFBondingCurveAbi from '../../abis/SOFBondingCurveAbi.js';
import RaffleAbi from '../../abis/RaffleAbi.js';

async function testBondingCurveListener() {
  console.log('🔍 Testing Bonding Curve Listener Configuration\n');
  
  const networkKey = 'LOCAL';
  const chain = getChainByKey(networkKey);
  const client = getPublicClient(networkKey);
  
  console.log('📋 Chain Configuration:');
  console.log(`  Network: ${networkKey}`);
  console.log(`  RPC URL: ${chain.rpcUrl}`);
  console.log(`  Raffle: ${chain.raffle}`);
  console.log(`  InfoFi Factory: ${chain.infofiFactory}\n`);
  
  // Step 1: Get current season ID
  console.log('📊 Step 1: Checking current season...');
  try {
    const currentSeasonId = await client.readContract({
      address: chain.raffle,
      abi: RaffleAbi,
      functionName: 'currentSeasonId',
    });
    console.log(`  ✅ Current season ID: ${currentSeasonId}\n`);
    
    if (currentSeasonId === 0n) {
      console.log('⚠️  No seasons exist yet. Create a season first.\n');
      return;
    }
    
    // Step 2: Get season details
    console.log('📊 Step 2: Getting season details...');
    const season = await client.readContract({
      address: chain.raffle,
      abi: RaffleAbi,
      functionName: 'seasons',
      args: [currentSeasonId],
    });
    
    // SeasonConfig struct: name, startTime, endTime, winnerCount, grandPrizeBps, raffleToken, bondingCurve, isActive, isCompleted
    const bondingCurveAddr = season[6];
    console.log(`  ✅ Bonding curve address: ${bondingCurveAddr}\n`);
    
    // Step 3: Get current block
    const currentBlock = await client.getBlockNumber();
    console.log(`📊 Step 3: Current block: ${currentBlock}\n`);
    
    // Step 4: Scan for PositionUpdate events
    console.log('📊 Step 4: Scanning for PositionUpdate events...');
    const fromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;
    
    const logs = await client.getContractEvents({
      address: bondingCurveAddr,
      abi: SOFBondingCurveAbi,
      eventName: 'PositionUpdate',
      fromBlock,
      toBlock: currentBlock,
    });
    
    console.log(`  ✅ Found ${logs.length} PositionUpdate events\n`);
    
    if (logs.length > 0) {
      console.log('📋 Event Details:');
      logs.forEach((log, idx) => {
        console.log(`\n  Event #${idx + 1}:`);
        console.log(`    Block: ${log.blockNumber}`);
        console.log(`    Transaction: ${log.transactionHash}`);
        console.log(`    Args:`, log.args);
      });
      console.log('');
      
      // Check if any events cross the 1% threshold
      console.log('🎯 Checking for threshold crossings (1% = 100 bps)...');
      let thresholdCrossings = 0;
      
      for (const log of logs) {
        const { seasonId, player, oldTickets, newTickets, totalTickets, probabilityBps } = log.args;
        const oldBps = totalTickets > 0n ? (oldTickets * 10000n) / totalTickets : 0n;
        const newBps = BigInt(probabilityBps);
        
        if (newBps >= 100n && oldBps < 100n) {
          thresholdCrossings++;
          console.log(`  ✅ Threshold crossed!`);
          console.log(`    Season: ${seasonId}`);
          console.log(`    Player: ${player}`);
          console.log(`    Old probability: ${oldBps} bps (${Number(oldBps) / 100}%)`);
          console.log(`    New probability: ${newBps} bps (${Number(newBps) / 100}%)`);
          console.log(`    Block: ${log.blockNumber}`);
        }
      }
      
      if (thresholdCrossings === 0) {
        console.log('  ⚠️  No threshold crossings found in recent events\n');
      } else {
        console.log(`\n  ✅ Found ${thresholdCrossings} threshold crossing(s)\n`);
      }
    } else {
      console.log('⚠️  No PositionUpdate events found. Try buying tickets first.\n');
    }
    
    // Step 5: Test event watching
    console.log('📊 Step 5: Testing real-time event watching...');
    console.log('  Setting up watcher for 10 seconds...\n');
    
    let watchedEvents = 0;
    const unwatch = client.watchContractEvent({
      address: bondingCurveAddr,
      abi: SOFBondingCurveAbi,
      eventName: 'PositionUpdate',
      onLogs: (logs) => {
        watchedEvents += logs.length;
        console.log(`  📥 Received ${logs.length} event(s) in real-time`);
        logs.forEach(log => {
          console.log(`    Season: ${log.args.seasonId}, Player: ${log.args.player}`);
          console.log(`    Probability: ${log.args.probabilityBps} bps`);
        });
      },
      onError: (error) => {
        console.error('  ❌ Watch error:', error);
      },
      pollingInterval: 3000,
    });
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    unwatch();
    
    if (watchedEvents === 0) {
      console.log('  ℹ️  No events received during watch period (this is normal if no transactions occurred)\n');
    } else {
      console.log(`  ✅ Watched ${watchedEvents} event(s) successfully\n`);
    }
    
    console.log('✅ Diagnostic complete!\n');
    console.log('📝 Summary:');
    console.log(`  - Bonding curve address: ${bondingCurveAddr}`);
    console.log(`  - Historical events found: ${logs.length}`);
    console.log(`  - Threshold crossings: ${thresholdCrossings || 0}`);
    console.log(`  - Real-time events: ${watchedEvents}`);
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error during diagnostic:', error);
    console.error('\nStack trace:', error.stack);
  }
}

// Run diagnostic
testBondingCurveListener()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
