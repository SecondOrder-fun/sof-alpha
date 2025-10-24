// backend/src/services/bondingCurveListener.js
// Watches SOFBondingCurve.PositionUpdate events and triggers InfoFi market creation when threshold crossed

import { getPublicClient } from '../lib/viemClient.js';
import SOFBondingCurveAbi from '../abis/SOFBondingCurveAbi.js';
import { createMarketForPlayer } from './infoFiMarketCreator.js';
import { db } from '../../shared/supabaseClient.js';

const THRESHOLD_BPS = 100; // 1%
const processedEvents = new Map(); // seasonId-player -> timestamp

/**
 * Start watching PositionUpdate events from a specific bonding curve
 * @param {string} networkKey - Network key (LOCAL/TESTNET)
 * @param {string} bondingCurveAddress - Address of the bonding curve contract to watch
 * @param {number} seasonId - Season ID for logging and tracking
 * @param {object} logger - Logger instance
 * @returns {function} Unwatch function
 */
export function startBondingCurveListener(networkKey = 'LOCAL', bondingCurveAddress, seasonId, logger = console) {
  if (!bondingCurveAddress) {
    logger.error('[bondingCurveListener] No bonding curve address provided');
    return () => {};
  }

  const client = getPublicClient(networkKey);

  logger.info(`[bondingCurveListener] 🎯 Starting listener for season ${seasonId}`);
  logger.info(`[bondingCurveListener] 📍 Contract address: ${bondingCurveAddress}`);
  logger.info(`[bondingCurveListener] 🔧 Network: ${networkKey}`);
  logger.info(`[bondingCurveListener] ⏱️  Polling interval: 2000ms`);
  
  // Verify the contract exists
  client.getBytecode({ address: bondingCurveAddress })
    .then(code => {
      if (!code || code === '0x') {
        logger.error(`[bondingCurveListener] ⚠️  WARNING: No bytecode at ${bondingCurveAddress}!`);
      } else {
        logger.info(`[bondingCurveListener] ✅ Contract verified at ${bondingCurveAddress}`);
      }
    })
    .catch(err => logger.error(`[bondingCurveListener] Error verifying contract:`, err));
  
  let pollCount = 0;
  const startTime = Date.now();
  
  const unwatch = client.watchContractEvent({
    address: bondingCurveAddress,
    abi: SOFBondingCurveAbi,
    eventName: 'PositionUpdate',
    poll: true,
    pollingInterval: 2000,
    batch: false, // Process events immediately
    onLogs: async (logs) => {
      pollCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[bondingCurveListener] 🔥 Poll #${pollCount} (${elapsed}s): Received ${logs.length} PositionUpdate event(s)`);
      
      if (logs.length === 0) {
        logger.debug(`[bondingCurveListener] No new events in this poll`);
        return;
      }
      
      for (const log of logs) {
        try {
          logger.info(`[bondingCurveListener] 📦 Processing event from block ${log.blockNumber}`);
          const { seasonId, player, oldTickets, newTickets, totalTickets, probabilityBps } = log.args;
          
          const seasonIdNum = Number(seasonId);
          const playerAddr = String(player);
          const oldBps = totalTickets > 0n ? (oldTickets * 10000n) / totalTickets : 0n;
          const newBps = BigInt(probabilityBps);
          
          logger.debug(`[bondingCurveListener] PositionUpdate: season=${seasonIdNum}, player=${playerAddr}, oldBps=${oldBps}, newBps=${newBps}`);
          
          // Check threshold crossing
          if (newBps >= THRESHOLD_BPS && oldBps < THRESHOLD_BPS) {
            const eventKey = `${seasonIdNum}-${playerAddr}`;
            
            // Deduplication check
            const lastProcessed = processedEvents.get(eventKey);
            if (lastProcessed && Date.now() - lastProcessed < 60000) {
              logger.debug(`[bondingCurveListener] Recently processed ${eventKey}, skipping`);
              continue;
            }
            
            // Check if market already exists in DB
            const exists = await db.hasInfoFiMarket(seasonIdNum, playerAddr, 'WINNER_PREDICTION');
            
            if (exists) {
              logger.info(`[bondingCurveListener] Market already exists for ${eventKey}`);
              processedEvents.set(eventKey, Date.now());
              continue;
            }
            
            logger.info(`[bondingCurveListener] 🎯 Threshold crossed: season=${seasonIdNum}, player=${playerAddr}, bps=${newBps}`);
            
            processedEvents.set(eventKey, Date.now());
            
            // Trigger market creation
            await createMarketForPlayer(
              seasonIdNum,
              playerAddr,
              Number(oldTickets),
              Number(newTickets),
              Number(totalTickets),
              networkKey,
              logger
            );
            
            // Cleanup old entries after 1 hour
            setTimeout(() => processedEvents.delete(eventKey), 3600000);
          }
        } catch (error) {
          logger.error('[bondingCurveListener] ❌ Error processing PositionUpdate:');
          logger.error('[bondingCurveListener] Error message:', error.message);
          logger.error('[bondingCurveListener] Error name:', error.name);
          logger.error('[bondingCurveListener] Error stack:', error.stack);
          logger.error('[bondingCurveListener] Error details:', {
            message: error.message,
            name: error.name,
            code: error.code,
            cause: error.cause,
            stack: error.stack
          });
          
          // Log the event data that caused the error
          logger.error('[bondingCurveListener] Failed event data:', {
            seasonId: log.args?.seasonId?.toString(),
            player: log.args?.player,
            oldTickets: log.args?.oldTickets?.toString(),
            newTickets: log.args?.newTickets?.toString(),
            totalTickets: log.args?.totalTickets?.toString(),
            blockNumber: log.blockNumber?.toString(),
            transactionHash: log.transactionHash
          });
        }
      }
    },
    onError: (error) => {
      logger.error('[bondingCurveListener] ❌ Watch error:', error);
      logger.error('[bondingCurveListener] Error details:', JSON.stringify(error, null, 2));
    },
  });

  logger.info(`[bondingCurveListener] 👂 Listener active - waiting for events...`);
  
  // Log a heartbeat every 30 seconds to confirm the listener is still alive
  const heartbeat = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    logger.debug(`[bondingCurveListener] 💓 Heartbeat: ${pollCount} polls in ${elapsed}s for season ${seasonId}`);
  }, 30000);
  
  return () => {
    clearInterval(heartbeat);
    unwatch();
    logger.info(`[bondingCurveListener] 🛑 Stopped listener for season ${seasonId}`);
  };
}

/**
 * Scan historical PositionUpdate events for missed market creations
 * @param {string} networkKey - Network key
 * @param {string} bondingCurveAddress - Address of bonding curve to scan
 * @param {number} fromBlock - Starting block number
 * @param {number} toBlock - Ending block number
 * @param {object} logger - Logger instance
 */
export async function scanHistoricalPositionUpdates(networkKey, bondingCurveAddress, fromBlock, toBlock, logger = console) {
  if (!bondingCurveAddress) {
    logger.warn('[bondingCurveListener] No bonding curve address provided for historical scan');
    return;
  }

  const client = getPublicClient(networkKey);
  
  logger.info(`[bondingCurveListener] 🔍 Scanning blocks ${fromBlock} to ${toBlock} for missed events at ${bondingCurveAddress}`);
  
  try {
    // Get all PositionUpdate events in range
    const logs = await client.getContractEvents({
      address: bondingCurveAddress,
      abi: SOFBondingCurveAbi,
      eventName: 'PositionUpdate',
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });
    
    logger.info(`[bondingCurveListener] Found ${logs.length} historical PositionUpdate events`);
    
    // Process each event
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      try {
        logger.info(`[bondingCurveListener] 📋 Processing historical event ${i + 1}/${logs.length} from block ${log.blockNumber}`);
        
        const { seasonId, player, probabilityBps, oldTickets, newTickets, totalTickets } = log.args;
        const newBps = Number(probabilityBps);
        
        logger.info(`[bondingCurveListener] Event details: season=${seasonId}, player=${player}, probability=${newBps}bps, tickets=${newTickets}/${totalTickets}`);
        
        if (newBps >= THRESHOLD_BPS) {
          logger.info(`[bondingCurveListener] ✅ Threshold crossed (${newBps} >= ${THRESHOLD_BPS})`);
          
          logger.info(`[bondingCurveListener] Checking if market exists for player ${player}...`);
          const exists = await db.hasInfoFiMarket(Number(seasonId), String(player), 'WINNER_PREDICTION');
          logger.info(`[bondingCurveListener] Market exists: ${exists}`);
          
          if (!exists) {
            logger.info(`[bondingCurveListener] 🔧 Creating missed market for season=${seasonId}, player=${player}`);
            await createMarketForPlayer(
              Number(seasonId),
              String(player),
              Number(oldTickets),
              Number(newTickets),
              Number(totalTickets),
              networkKey,
              logger
            );
            logger.info(`[bondingCurveListener] ✅ Market created successfully`);
          } else {
            logger.info(`[bondingCurveListener] ⏭️  Market already exists, skipping`);
          }
        } else {
          logger.info(`[bondingCurveListener] ⏭️  Below threshold (${newBps} < ${THRESHOLD_BPS}), skipping`);
        }
      } catch (eventError) {
        logger.error(`[bondingCurveListener] ❌ Error processing event ${i + 1}:`, eventError);
        logger.error(`[bondingCurveListener] Error message: ${eventError.message}`);
        logger.error(`[bondingCurveListener] Error stack: ${eventError.stack}`);
        logger.error(`[bondingCurveListener] Event data:`, JSON.stringify(log, null, 2));
      }
    }
    
    logger.info(`[bondingCurveListener] ✅ Historical scan complete`);
  } catch (error) {
    logger.error('[bondingCurveListener] ❌ Historical scan error:', error);
    logger.error('[bondingCurveListener] Error message:', error.message);
    logger.error('[bondingCurveListener] Error stack:', error.stack);
    logger.error('[bondingCurveListener] Error name:', error.name);
    if (error.cause) {
      logger.error('[bondingCurveListener] Error cause:', error.cause);
    }
  }
}
