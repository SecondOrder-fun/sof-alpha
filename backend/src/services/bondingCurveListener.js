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

  const unwatch = client.watchContractEvent({
    address: bondingCurveAddress,
    abi: SOFBondingCurveAbi,
    eventName: 'PositionUpdate',
    onLogs: async (logs) => {
      logger.info(`[bondingCurveListener] Received ${logs.length} PositionUpdate event(s)`);
      
      for (const log of logs) {
        try {
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
            const playerId = await db.getOrCreatePlayerIdByAddress(playerAddr);
            const exists = await db.hasInfoFiMarket(seasonIdNum, playerId, 'WINNER_PREDICTION');
            
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
          logger.error('[bondingCurveListener] Error processing PositionUpdate:', error);
        }
      }
    },
    onError: (error) => logger.error('[bondingCurveListener] Watch error:', error),
    pollingInterval: 3000,
  });

  logger.info(`[bondingCurveListener] 👂 Listening for PositionUpdate events on ${networkKey} for season ${seasonId} at ${bondingCurveAddress}`);
  return unwatch;
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
    for (const log of logs) {
      const { seasonId, player, probabilityBps, oldTickets, newTickets, totalTickets } = log.args;
      const newBps = Number(probabilityBps);
      
      if (newBps >= THRESHOLD_BPS) {
        const playerId = await db.getOrCreatePlayerIdByAddress(String(player));
        const exists = await db.hasInfoFiMarket(Number(seasonId), playerId, 'WINNER_PREDICTION');
        
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
        }
      }
    }
    
    logger.info(`[bondingCurveListener] ✅ Historical scan complete`);
  } catch (error) {
    logger.error('[bondingCurveListener] Historical scan error:', error);
  }
}
