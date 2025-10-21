/**
 * @fileoverview FPMM Routes for InfoFi Markets
 * @description API endpoints for FPMM market data, pricing, and liquidity operations
 */

import fpmmService from '../../shared/fpmmService.js';

/**
 * Register FPMM routes
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function fpmmRoutes(fastify) {
  const FPMM_MANAGER_ADDRESS = process.env.INFOFI_FPMM_MANAGER_ADDRESS;

  /**
   * GET /api/fpmm/market/:seasonId/:playerAddress
   * Get complete market data for a player
   */
  fastify.get('/market/:seasonId/:playerAddress', async (request, reply) => {
    try {
      const { seasonId, playerAddress } = request.params;

      if (!FPMM_MANAGER_ADDRESS) {
        return reply.code(500).send({
          error: 'FPMM manager address not configured',
        });
      }

      const marketData = await fpmmService.getCompleteMarketData(
        FPMM_MANAGER_ADDRESS,
        parseInt(seasonId),
        playerAddress
      );

      return reply.send(marketData);
    } catch (error) {
      fastify.log.error('Error fetching market data:', error);
      return reply.code(500).send({
        error: 'Failed to fetch market data',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/fpmm/prices/:seasonId/:playerAddress
   * Get current market prices
   */
  fastify.get('/prices/:seasonId/:playerAddress', async (request, reply) => {
    try {
      const { seasonId, playerAddress } = request.params;

      if (!FPMM_MANAGER_ADDRESS) {
        return reply.code(500).send({
          error: 'FPMM manager address not configured',
        });
      }

      const marketAddress = await fpmmService.getMarketAddress(
        FPMM_MANAGER_ADDRESS,
        parseInt(seasonId),
        playerAddress
      );

      if (marketAddress === '0x0000000000000000000000000000000000000000') {
        return reply.code(404).send({
          error: 'Market not found',
        });
      }

      const prices = await fpmmService.getMarketPrices(marketAddress);

      return reply.send({
        seasonId: parseInt(seasonId),
        playerAddress,
        marketAddress,
        ...prices,
      });
    } catch (error) {
      fastify.log.error('Error fetching prices:', error);
      return reply.code(500).send({
        error: 'Failed to fetch prices',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/fpmm/reserves/:seasonId/:playerAddress
   * Get market reserves
   */
  fastify.get('/reserves/:seasonId/:playerAddress', async (request, reply) => {
    try {
      const { seasonId, playerAddress } = request.params;

      if (!FPMM_MANAGER_ADDRESS) {
        return reply.code(500).send({
          error: 'FPMM manager address not configured',
        });
      }

      const marketAddress = await fpmmService.getMarketAddress(
        FPMM_MANAGER_ADDRESS,
        parseInt(seasonId),
        playerAddress
      );

      if (marketAddress === '0x0000000000000000000000000000000000000000') {
        return reply.code(404).send({
          error: 'Market not found',
        });
      }

      const reserves = await fpmmService.getMarketReserves(marketAddress);

      return reply.send({
        seasonId: parseInt(seasonId),
        playerAddress,
        marketAddress,
        ...reserves,
      });
    } catch (error) {
      fastify.log.error('Error fetching reserves:', error);
      return reply.code(500).send({
        error: 'Failed to fetch reserves',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/fpmm/calculate-buy
   * Calculate buy amount and price impact
   * Body: { seasonId, playerAddress, buyYes, amountIn }
   */
  fastify.post('/calculate-buy', async (request, reply) => {
    try {
      const { seasonId, playerAddress, buyYes, amountIn } = request.body;

      if (!seasonId || !playerAddress || buyYes === undefined || !amountIn) {
        return reply.code(400).send({
          error: 'Missing required parameters',
        });
      }

      if (!FPMM_MANAGER_ADDRESS) {
        return reply.code(500).send({
          error: 'FPMM manager address not configured',
        });
      }

      const marketAddress = await fpmmService.getMarketAddress(
        FPMM_MANAGER_ADDRESS,
        parseInt(seasonId),
        playerAddress
      );

      if (marketAddress === '0x0000000000000000000000000000000000000000') {
        return reply.code(404).send({
          error: 'Market not found',
        });
      }

      const [amountOut, priceImpact] = await Promise.all([
        fpmmService.calcBuyAmount(marketAddress, buyYes, amountIn),
        fpmmService.calculatePriceImpact(marketAddress, buyYes, amountIn),
      ]);

      return reply.send({
        seasonId: parseInt(seasonId),
        playerAddress,
        marketAddress,
        buyYes,
        amountIn,
        amountOut,
        ...priceImpact,
      });
    } catch (error) {
      fastify.log.error('Error calculating buy:', error);
      return reply.code(500).send({
        error: 'Failed to calculate buy',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/fpmm/lp-position/:seasonId/:playerAddress/:userAddress
   * Get user's LP position for a market
   */
  fastify.get('/lp-position/:seasonId/:playerAddress/:userAddress', async (request, reply) => {
    try {
      const { seasonId, playerAddress, userAddress } = request.params;

      if (!FPMM_MANAGER_ADDRESS) {
        return reply.code(500).send({
          error: 'FPMM manager address not configured',
        });
      }

      const [marketAddress, lpTokenAddress] = await Promise.all([
        fpmmService.getMarketAddress(FPMM_MANAGER_ADDRESS, parseInt(seasonId), playerAddress),
        fpmmService.getLpTokenAddress(FPMM_MANAGER_ADDRESS, parseInt(seasonId), playerAddress),
      ]);

      if (marketAddress === '0x0000000000000000000000000000000000000000') {
        return reply.code(404).send({
          error: 'Market not found',
        });
      }

      const lpPosition = await fpmmService.getUserLpPosition(
        lpTokenAddress,
        userAddress,
        marketAddress
      );

      return reply.send({
        seasonId: parseInt(seasonId),
        playerAddress,
        userAddress,
        marketAddress,
        lpTokenAddress,
        ...lpPosition,
      });
    } catch (error) {
      fastify.log.error('Error fetching LP position:', error);
      return reply.code(500).send({
        error: 'Failed to fetch LP position',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/fpmm/lp-balance/:lpTokenAddress/:userAddress
   * Get user's SOLP token balance
   */
  fastify.get('/lp-balance/:lpTokenAddress/:userAddress', async (request, reply) => {
    try {
      const { lpTokenAddress, userAddress } = request.params;

      const balance = await fpmmService.getLpTokenBalance(lpTokenAddress, userAddress);

      return reply.send({
        lpTokenAddress,
        userAddress,
        balance,
      });
    } catch (error) {
      fastify.log.error('Error fetching LP balance:', error);
      return reply.code(500).send({
        error: 'Failed to fetch LP balance',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/fpmm/health
   * Health check endpoint
   */
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      service: 'fpmm',
      fpmmManagerConfigured: !!FPMM_MANAGER_ADDRESS,
    });
  });
}
