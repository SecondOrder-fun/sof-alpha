// backend/src/services/raffleListener.js
// Watches Raffle.PositionUpdate events and pushes RAFFLE_UPDATE over WS and to pricing service.

import { getPublicClient } from '../lib/viemClient.js';
import { getChainByKey } from '../config/chain.js';
import RaffleAbi from '../abis/RaffleAbi.js';
import { db } from '../../shared/supabaseClient.js';
import { pricingService } from '../../shared/pricingService.js';

/**
 * Start watching PositionUpdate events on Raffle for a given network key (LOCAL/TESTNET)
 * @param {string} networkKey
 * @param {Function} broadcastFn - function (messageObject) => void
 * @param {import('pino').BaseLogger|Console} logger
 * @returns {Function} unsubscribe
 */
export function startRaffleListener(networkKey = 'LOCAL', broadcastFn = () => {}, logger = console) {
  const chain = getChainByKey(networkKey);
  if (!chain?.raffle) {
    logger.warn(`[raffleListener] No raffle address for ${networkKey}; listener not started`);
    return () => {};
  }

  const client = getPublicClient(networkKey);

  // Subscribe to PositionUpdate(seasonId, player, oldTickets, newTickets, totalTickets)
  const unwatch = client.watchContractEvent({
    address: chain.raffle,
    abi: RaffleAbi,
    eventName: 'PositionUpdate',
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          const seasonId = Number(log.args.seasonId);
          const player = String(log.args.player);
          const oldTickets = BigInt(log.args.oldTickets || 0n);
          const newTickets = BigInt(log.args.newTickets || 0n);
          const totalTickets = BigInt(log.args.totalTickets || 0n);

          const probabilityBps = totalTickets > 0n ? Number((newTickets * 10000n) / totalTickets) : 0;

          // Broadcast RAFFLE_UPDATE over WS
          broadcastFn({
            type: 'RAFFLE_UPDATE',
            network: networkKey,
            payload: {
              seasonId,
              player,
              oldTickets: Number(oldTickets),
              newTickets: Number(newTickets),
              totalTickets: Number(totalTickets),
              probabilityBps,
              blockNumber: Number(log.blockNumber || 0),
              txHash: String(log.transactionHash || ''),
            },
          });

          // Resolve InfoFi market by (seasonId, player_address, market_type)
          // Then push raffle probability to pricing cache to update hybrid price
          try {
            // WINNER_PREDICTION market type is used for per-player winner markets
            const marketType = 'WINNER_PREDICTION';
            const market = await db.getInfoFiMarketByComposite(seasonId, player, marketType);

            if (market?.id) {
              await pricingService.updateHybridPricing(market.id, { probabilityBps });
              logger.debug?.(`[raffleListener] Updated pricing for market ${market.id}, player ${player}, bps=${probabilityBps}`);
            } else {
              // Smart contracts should handle market creation automatically via InfoFiMarketFactory
              // when players cross 1% threshold. If no market exists in DB, it means either:
              // 1. Player hasn't crossed 1% threshold yet (< 100 bps)
              // 2. InfoFi system isn't properly deployed/configured
              // 3. Market creation failed on-chain but wasn't recorded in DB
              if (probabilityBps >= 100) {
                logger.warn(`[raffleListener] Player ${player} at ${probabilityBps} bps (>= 1%) but no InfoFi market found for season ${seasonId}. This suggests InfoFi system may not be properly deployed.`);
              } else {
                logger.debug?.(`[raffleListener] No market for season ${seasonId}, player ${player}, probability: ${probabilityBps} bps (below 1% threshold)`);
              }
            }
          } catch (innerErr) {
            // Log and continue; do not break the event stream on DB/pricing errors
            logger.error?.('[raffleListener] Failed market resolution or pricing update', innerErr);
          }
        } catch (e) {
          logger.error('[raffleListener] Failed to handle PositionUpdate log', e);
        }
      }
    },
    onError: (e) => logger.error('[raffleListener] watchContractEvent error', e),
    pollingInterval: 3000,
  });

  logger.info(`[raffleListener] Listening on ${networkKey} at ${chain.raffle}`);
  return unwatch;
}
