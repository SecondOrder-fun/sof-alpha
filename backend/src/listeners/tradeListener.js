/**
 * @file tradeListener.js
 * @description Listens to Trade events from SimpleFPMM contracts and updates market sentiment on oracle
 * @date Oct 26, 2025
 *
 * Handles:
 * - Real-time Trade event detection from SimpleFPMM contracts
 * - Market sentiment calculation based on trade volume/direction
 * - Oracle sentiment updates via oracleCallService
 * - Graceful error handling and logging
 */

import { publicClient } from '../lib/viemClient.js';
import { oracleCallService } from '../services/oracleCallService.js';

/**
 * Starts listening for Trade events from SimpleFPMM contracts
 * Updates market sentiment on oracle when trades occur
 *
 * @param {string[]} fpmmAddresses - Array of SimpleFPMM contract addresses to monitor
 * @param {object} fpmmAbi - SimpleFPMM contract ABI
 * @param {object} logger - Fastify logger instance (app.log)
 * @returns {Promise<function[]>} Array of unwatch functions to stop listening
 */
export async function startTradeListener(fpmmAddresses, fpmmAbi, logger) {
  // Validate inputs
  if (!fpmmAddresses || !Array.isArray(fpmmAddresses) || fpmmAddresses.length === 0) {
    throw new Error('fpmmAddresses must be a non-empty array');
  }

  if (!fpmmAbi) {
    throw new Error('fpmmAbi is required');
  }

  if (!logger) {
    throw new Error('logger instance is required');
  }

  const unwatchFunctions = [];

  // Start listening for Trade events on each FPMM contract
  for (const fpmmAddress of fpmmAddresses) {
    try {
      logger.debug(`🎧 Setting up Trade listener for FPMM: ${fpmmAddress}`);

      const unwatch = publicClient.watchContractEvent({
        address: fpmmAddress,
        abi: fpmmAbi,
        eventName: 'Trade',
        onLogs: async (logs) => {
          for (const log of logs) {
            try {
              // Extract trade data from event
              const { trader, collateralAmount, isLong } = log.args;

              logger.debug(
                `📊 Trade Event: FPMM ${fpmmAddress}, Trader ${trader}, ` +
                `Amount: ${collateralAmount}, IsLong: ${isLong}`
              );

              // Calculate sentiment from trade
              // Sentiment increases for long positions, decreases for short positions
              const sentiment = calculateSentiment(
                collateralAmount,
                isLong,
                logger
              );

              // Update oracle with new sentiment
              const result = await oracleCallService.updateMarketSentiment(
                fpmmAddress,
                sentiment,
                logger
              );

              if (result.success) {
                logger.info(
                  `✅ Trade: FPMM ${fpmmAddress}, Sentiment updated to ${sentiment} bps (${result.hash})`
                );
              } else {
                logger.warn(
                  `⚠️  Trade sentiment update failed for ${fpmmAddress}: ${result.error}`
                );
              }
            } catch (tradeError) {
              logger.warn(
                `⚠️  Error processing Trade event for ${fpmmAddress}: ${tradeError.message}`
              );
            }
          }
        },
        onError: (error) => {
          try {
            const errorDetails = {
              type: error?.name || 'Unknown',
              message: error?.message || String(error),
              code: error?.code || undefined,
              details: error?.details || undefined,
            };

            logger.error(
              { errorDetails },
              `❌ Trade Listener Error for ${fpmmAddress}`
            );
          } catch (logError) {
            logger.error(
              `❌ Trade Listener Error for ${fpmmAddress}: ${String(error)}`
            );
          }
        },
        poll: true,
        pollingInterval: 3000, // Check every 3 seconds
      });

      unwatchFunctions.push(unwatch);
      logger.info(`🎧 Listening for Trade events on ${fpmmAddress}`);
    } catch (error) {
      logger.error(
        `❌ Failed to start Trade listener for ${fpmmAddress}: ${error.message}`
      );
    }
  }

  return unwatchFunctions;
}

/**
 * Calculate market sentiment from trade data
 *
 * @param {bigint|number} collateralAmount - Amount of collateral traded
 * @param {boolean} isLong - Whether this is a long position (true) or short (false)
 * @param {object} logger - Logger instance
 * @returns {number} Sentiment in basis points (0-10000)
 */
function calculateSentiment(collateralAmount, isLong, logger) {
  try {
    // Convert to number if BigInt
    const amount = typeof collateralAmount === 'bigint'
      ? Number(collateralAmount)
      : collateralAmount;

    // Simple sentiment calculation:
    // - Long positions increase sentiment (bullish)
    // - Short positions decrease sentiment (bearish)
    // - Larger amounts have more impact
    // - Capped at 0-10000 basis points

    // Base sentiment: 5000 (neutral)
    let sentiment = 5000;

    // Adjust based on position direction and size
    // Scale: 1 unit of collateral = 1 basis point change (capped)
    const adjustment = Math.min(Math.max(amount, -5000), 5000);

    if (isLong) {
      // Long positions increase sentiment
      sentiment = Math.min(10000, 5000 + adjustment);
    } else {
      // Short positions decrease sentiment
      sentiment = Math.max(0, 5000 - adjustment);
    }

    logger.debug(
      `   Sentiment calculation: amount=${amount}, isLong=${isLong}, ` +
      `sentiment=${sentiment} bps`
    );

    return sentiment;
  } catch (error) {
    logger.warn(`⚠️  Error calculating sentiment: ${error.message}, defaulting to 5000`);
    return 5000; // Default to neutral
  }
}

export default startTradeListener;
