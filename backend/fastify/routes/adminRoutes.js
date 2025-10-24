// backend/fastify/routes/adminRoutes.js
// Admin routes for backend wallet management and manual market creation

import { getPublicClient } from '../../src/lib/viemClient.js';
import { getChainByKey } from '../../src/config/chain.js';
import { createMarketForPlayer } from '../../src/services/infoFiMarketCreator.js';
import { db } from '../../shared/supabaseClient.js';

export default async function adminRoutes(fastify) {
  
  /**
   * GET /api/admin/backend-wallet
   * Get backend wallet information (address, balance, etc.)
   */
  fastify.get('/backend-wallet', async (request, reply) => {
    try {
      const networkKey = process.env.NETWORK_KEY || 'LOCAL';
      const chain = getChainByKey(networkKey);
      const publicClient = getPublicClient(networkKey);
      
      const backendAddress = process.env.BACKEND_WALLET_ADDRESS || process.env.ACCOUNT0_ADDRESS;
      
      if (!backendAddress) {
        return reply.code(500).send({ error: 'Backend wallet not configured' });
      }
      
      // Get ETH balance
      const balance = await publicClient.getBalance({ address: backendAddress });
      const balanceEth = Number(balance) / 1e18;
      
      // Get SOF balance if SOF token is configured
      let sofBalance = 0;
      if (chain?.sofToken) {
        try {
          const sofBalanceRaw = await publicClient.readContract({
            address: chain.sofToken,
            abi: [
              {
                name: 'balanceOf',
                type: 'function',
                stateMutability: 'view',
                inputs: [{ name: 'account', type: 'address' }],
                outputs: [{ name: '', type: 'uint256' }],
              },
            ],
            functionName: 'balanceOf',
            args: [backendAddress],
          });
          sofBalance = Number(sofBalanceRaw) / 1e18;
        } catch (err) {
          fastify.log.warn({ err }, 'Failed to get SOF balance');
        }
      }
      
      return {
        address: backendAddress,
        balance: balance.toString(),
        balanceEth,
        sofBalance,
        network: networkKey,
        chainId: chain?.id,
      };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to get backend wallet info');
      return reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * GET /api/admin/market-creation-stats
   * Get statistics about market creation (success rate, gas costs, etc.)
   */
  fastify.get('/market-creation-stats', async (request, reply) => {
    try {
      // Query database for market creation statistics
      const { data: markets, error } = await db.client
        .from('infofi_markets')
        .select('id, created_at, contract_address')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) {
        fastify.log.error({ error }, 'Failed to query markets');
        return reply.code(500).send({ error: error.message });
      }
      
      const totalCreated = markets?.length || 0;
      const successfulMarkets = markets?.filter(m => m.contract_address).length || 0;
      const successRate = totalCreated > 0 ? (successfulMarkets / totalCreated) * 100 : 0;
      
      // TODO: Track actual gas costs in a separate table
      // For now, estimate based on typical costs
      const estimatedGasPerMarket = 300000;
      const estimatedGasPriceGwei = 30;
      const totalGasEth = (totalCreated * estimatedGasPerMarket * estimatedGasPriceGwei) / 1e9;
      
      const failedAttempts = totalCreated - successfulMarkets;
      
      return {
        totalCreated,
        successRate: successRate.toFixed(2),
        totalGasEth: totalGasEth.toFixed(4),
        failedAttempts,
        recentMarkets: markets?.slice(0, 10).map(m => ({
          id: m.id,
          createdAt: m.created_at,
          hasContract: !!m.contract_address,
        })),
      };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to get market creation stats');
      return reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * POST /api/admin/create-market
   * Manually create an InfoFi market for a player
   */
  fastify.post('/create-market', async (request, reply) => {
    try {
      const { seasonId, playerAddress } = request.body;
      
      // Validate inputs
      if (!seasonId || !playerAddress) {
        return reply.code(400).send({ error: 'Missing required fields: seasonId, playerAddress' });
      }
      
      if (!/^0x[a-fA-F0-9]{40}$/.test(playerAddress)) {
        return reply.code(400).send({ error: 'Invalid player address format' });
      }
      
      const networkKey = process.env.NETWORK_KEY || 'LOCAL';
      const chain = getChainByKey(networkKey);
      const publicClient = getPublicClient(networkKey);
      
      // Check if market already exists
      const playerId = await db.getOrCreatePlayerIdByAddress(playerAddress);
      const exists = await db.hasInfoFiMarket(seasonId, playerId, 'WINNER_PREDICTION');
      
      if (exists) {
        return reply.code(409).send({ error: 'Market already exists for this player' });
      }
      
      // Get player position from raffle contract
      let position;
      try {
        if (!chain?.raffle) {
          return reply.code(500).send({ error: 'Raffle contract not configured' });
        }
        
        position = await publicClient.readContract({
          address: chain.raffle,
          abi: [
            {
              name: 'getParticipantPosition',
              type: 'function',
              stateMutability: 'view',
              inputs: [
                { name: 'seasonId', type: 'uint256' },
                { name: 'participant', type: 'address' },
              ],
              outputs: [
                {
                  name: '',
                  type: 'tuple',
                  components: [
                    { name: 'ticketCount', type: 'uint256' },
                    { name: 'entryBlock', type: 'uint256' },
                    { name: 'lastUpdateBlock', type: 'uint256' },
                    { name: 'isActive', type: 'bool' },
                  ],
                },
              ],
            },
          ],
          functionName: 'getParticipantPosition',
          args: [BigInt(seasonId), playerAddress],
        });
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get player position');
        return reply.code(500).send({ error: 'Failed to get player position from contract' });
      }
      
      const ticketCount = Number(position.ticketCount);
      
      if (ticketCount === 0) {
        return reply.code(400).send({ error: 'Player has no tickets in this season' });
      }
      
      // Get total tickets in season
      let totalTickets;
      try {
        const seasonDetails = await publicClient.readContract({
          address: chain.raffle,
          abi: [
            {
              name: 'getSeasonDetails',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: 'seasonId', type: 'uint256' }],
              outputs: [
                { name: 'config', type: 'tuple', components: [] },
                { name: 'status', type: 'uint8' },
                { name: 'totalParticipants', type: 'uint256' },
                { name: 'totalTickets', type: 'uint256' },
                { name: 'totalPrizePool', type: 'uint256' },
              ],
            },
          ],
          functionName: 'getSeasonDetails',
          args: [BigInt(seasonId)],
        });
        totalTickets = Number(seasonDetails[3]); // totalTickets is 4th return value
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get season details');
        return reply.code(500).send({ error: 'Failed to get season details from contract' });
      }
      
      // Call market creator service
      fastify.log.info({ seasonId, playerAddress, ticketCount, totalTickets }, 'Manually creating market');
      
      const result = await createMarketForPlayer(
        seasonId,
        playerAddress,
        0, // oldTickets (unknown for manual creation)
        ticketCount,
        totalTickets,
        networkKey,
        fastify.log
      );
      
      if (result.success) {
        return {
          success: true,
          message: 'Market created successfully',
          transactionHash: result.hash,
          gasUsed: result.gasUsed,
          gasCostEth: result.gasCostEth,
        };
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error,
          message: 'Failed to create market',
        });
      }
    } catch (error) {
      fastify.log.error({ error }, 'Failed to create market');
      return reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * GET /api/admin/failed-market-attempts
   * Get list of failed market creation attempts
   */
  fastify.get('/failed-market-attempts', async (request, reply) => {
    try {
      // Query markets that don't have contract addresses (failed to create on-chain)
      const { data: failedMarkets, error } = await db.client
        .from('infofi_markets')
        .select('id, season_id, player_address, created_at, is_active')
        .is('contract_address', null)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        fastify.log.error({ error }, 'Failed to query failed markets');
        return reply.code(500).send({ error: error.message });
      }
      
      return {
        failedAttempts: failedMarkets || [],
        count: failedMarkets?.length || 0,
      };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to get failed market attempts');
      return reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * GET /api/admin/active-seasons
   * Get list of active seasons for market creation form
   */
  fastify.get('/active-seasons', async (request, reply) => {
    try {
      const { data: seasons, error } = await db.client
        .from('seasons')
        .select('id, name, start_time, end_time, status')
        .in('status', ['active', 'pending'])
        .order('start_time', { ascending: false })
        .limit(20);
      
      if (error) {
        fastify.log.error({ error }, 'Failed to query active seasons');
        return reply.code(500).send({ error: error.message });
      }
      
      return {
        seasons: seasons || [],
        count: seasons?.length || 0,
      };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to get active seasons');
      return reply.code(500).send({ error: error.message });
    }
  });
}
