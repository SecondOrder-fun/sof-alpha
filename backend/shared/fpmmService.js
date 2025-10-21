/**
 * @fileoverview FPMM Service for InfoFi Markets
 * @description Handles FPMM market interactions, price calculations, and liquidity operations
 */

import { createPublicClient, http, formatUnits, parseUnits } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load ABIs
const SimpleFPMMAbi = JSON.parse(
  readFileSync(join(__dirname, '../../src/contracts/abis/SimpleFPMM.json'), 'utf-8')
);
const InfoFiFPMMV2Abi = JSON.parse(
  readFileSync(join(__dirname, '../../src/contracts/abis/InfoFiFPMMV2.json'), 'utf-8')
);
const SOLPTokenAbi = JSON.parse(
  readFileSync(join(__dirname, '../../src/contracts/abis/SOLPToken.json'), 'utf-8')
);

// Chain configuration
const getChain = () => {
  const chainId = process.env.CHAIN_ID || '8453';
  return chainId === '84532' ? baseSepolia : base;
};

// Create public client for reading contract state
const publicClient = createPublicClient({
  chain: getChain(),
  transport: http(process.env.RPC_URL || 'http://127.0.0.1:8545'),
});

/**
 * Get FPMM market address for a player
 * @param {string} fpmmManagerAddress - InfoFiFPMMV2 contract address
 * @param {number} seasonId - Season ID
 * @param {string} playerAddress - Player address
 * @returns {Promise<string>} FPMM market address
 */
export async function getMarketAddress(fpmmManagerAddress, seasonId, playerAddress) {
  try {
    const marketAddress = await publicClient.readContract({
      address: fpmmManagerAddress,
      abi: InfoFiFPMMV2Abi,
      functionName: 'getMarket',
      args: [BigInt(seasonId), playerAddress],
    });

    return marketAddress;
  } catch (error) {
    console.error('Error getting market address:', error);
    throw error;
  }
}

/**
 * Get LP token address for a player market
 * @param {string} fpmmManagerAddress - InfoFiFPMMV2 contract address
 * @param {number} seasonId - Season ID
 * @param {string} playerAddress - Player address
 * @returns {Promise<string>} SOLP token address
 */
export async function getLpTokenAddress(fpmmManagerAddress, seasonId, playerAddress) {
  try {
    const lpTokenAddress = await publicClient.readContract({
      address: fpmmManagerAddress,
      abi: InfoFiFPMMV2Abi,
      functionName: 'getLpToken',
      args: [BigInt(seasonId), playerAddress],
    });

    return lpTokenAddress;
  } catch (error) {
    console.error('Error getting LP token address:', error);
    throw error;
  }
}

/**
 * Get current market prices (YES/NO)
 * @param {string} fpmmAddress - SimpleFPMM contract address
 * @returns {Promise<{yesPrice: number, noPrice: number}>} Prices in basis points (0-10000)
 */
export async function getMarketPrices(fpmmAddress) {
  try {
    const prices = await publicClient.readContract({
      address: fpmmAddress,
      abi: SimpleFPMMAbi,
      functionName: 'getPrices',
    });

    return {
      yesPrice: Number(prices[0]),
      noPrice: Number(prices[1]),
    };
  } catch (error) {
    console.error('Error getting market prices:', error);
    throw error;
  }
}

/**
 * Get market reserves
 * @param {string} fpmmAddress - SimpleFPMM contract address
 * @returns {Promise<{yesReserve: string, noReserve: string}>} Reserves in SOF (formatted)
 */
export async function getMarketReserves(fpmmAddress) {
  try {
    const [yesReserve, noReserve] = await Promise.all([
      publicClient.readContract({
        address: fpmmAddress,
        abi: SimpleFPMMAbi,
        functionName: 'yesReserve',
      }),
      publicClient.readContract({
        address: fpmmAddress,
        abi: SimpleFPMMAbi,
        functionName: 'noReserve',
      }),
    ]);

    return {
      yesReserve: formatUnits(yesReserve, 18),
      noReserve: formatUnits(noReserve, 18),
    };
  } catch (error) {
    console.error('Error getting market reserves:', error);
    throw error;
  }
}

/**
 * Calculate buy amount for given input
 * @param {string} fpmmAddress - SimpleFPMM contract address
 * @param {boolean} buyYes - True for YES, false for NO
 * @param {string} amountIn - Amount of SOF to spend (in SOF units, e.g., "10")
 * @returns {Promise<string>} Amount of outcome tokens to receive (formatted)
 */
export async function calcBuyAmount(fpmmAddress, buyYes, amountIn) {
  try {
    const amountInWei = parseUnits(amountIn, 18);
    
    const amountOut = await publicClient.readContract({
      address: fpmmAddress,
      abi: SimpleFPMMAbi,
      functionName: 'calcBuyAmount',
      args: [buyYes, amountInWei],
    });

    return formatUnits(amountOut, 18);
  } catch (error) {
    console.error('Error calculating buy amount:', error);
    throw error;
  }
}

/**
 * Get LP token balance for an address
 * @param {string} lpTokenAddress - SOLP token address
 * @param {string} userAddress - User address
 * @returns {Promise<string>} LP token balance (formatted)
 */
export async function getLpTokenBalance(lpTokenAddress, userAddress) {
  try {
    const balance = await publicClient.readContract({
      address: lpTokenAddress,
      abi: SOLPTokenAbi,
      functionName: 'balanceOf',
      args: [userAddress],
    });

    return formatUnits(balance, 18);
  } catch (error) {
    console.error('Error getting LP token balance:', error);
    throw error;
  }
}

/**
 * Get LP token total supply
 * @param {string} lpTokenAddress - SOLP token address
 * @returns {Promise<string>} Total supply (formatted)
 */
export async function getLpTokenTotalSupply(lpTokenAddress) {
  try {
    const totalSupply = await publicClient.readContract({
      address: lpTokenAddress,
      abi: SOLPTokenAbi,
      functionName: 'totalSupply',
    });

    return formatUnits(totalSupply, 18);
  } catch (error) {
    console.error('Error getting LP token total supply:', error);
    throw error;
  }
}

/**
 * Get complete market data for a player
 * @param {string} fpmmManagerAddress - InfoFiFPMMV2 contract address
 * @param {number} seasonId - Season ID
 * @param {string} playerAddress - Player address
 * @returns {Promise<Object>} Complete market data
 */
export async function getCompleteMarketData(fpmmManagerAddress, seasonId, playerAddress) {
  try {
    // Get market and LP token addresses
    const [marketAddress, lpTokenAddress] = await Promise.all([
      getMarketAddress(fpmmManagerAddress, seasonId, playerAddress),
      getLpTokenAddress(fpmmManagerAddress, seasonId, playerAddress),
    ]);

    // Check if market exists
    if (marketAddress === '0x0000000000000000000000000000000000000000') {
      return {
        exists: false,
        seasonId,
        playerAddress,
      };
    }

    // Get market data in parallel
    const [prices, reserves, lpTotalSupply] = await Promise.all([
      getMarketPrices(marketAddress),
      getMarketReserves(marketAddress),
      getLpTokenTotalSupply(lpTokenAddress),
    ]);

    return {
      exists: true,
      seasonId,
      playerAddress,
      marketAddress,
      lpTokenAddress,
      prices,
      reserves,
      lpTotalSupply,
      totalLiquidity: (parseFloat(reserves.yesReserve) + parseFloat(reserves.noReserve)).toFixed(4),
    };
  } catch (error) {
    console.error('Error getting complete market data:', error);
    throw error;
  }
}

/**
 * Calculate price impact for a trade
 * @param {string} fpmmAddress - SimpleFPMM contract address
 * @param {boolean} buyYes - True for YES, false for NO
 * @param {string} amountIn - Amount of SOF to spend
 * @returns {Promise<{priceImpact: number, expectedPrice: number}>} Price impact in %
 */
export async function calculatePriceImpact(fpmmAddress, buyYes, amountIn) {
  try {
    // Get current prices
    const currentPrices = await getMarketPrices(fpmmAddress);
    const currentPrice = buyYes ? currentPrices.yesPrice : currentPrices.noPrice;

    // Calculate expected output
    const amountOut = await calcBuyAmount(fpmmAddress, buyYes, amountIn);
    
    // Calculate effective price
    const effectivePrice = (parseFloat(amountIn) / parseFloat(amountOut)) * 10000;
    
    // Calculate price impact
    const priceImpact = ((effectivePrice - currentPrice) / currentPrice) * 100;

    return {
      priceImpact: priceImpact.toFixed(2),
      expectedPrice: effectivePrice.toFixed(0),
      currentPrice,
      amountOut,
    };
  } catch (error) {
    console.error('Error calculating price impact:', error);
    throw error;
  }
}

/**
 * Get user's LP position
 * @param {string} lpTokenAddress - SOLP token address
 * @param {string} userAddress - User address
 * @param {string} fpmmAddress - SimpleFPMM contract address
 * @returns {Promise<Object>} User's LP position data
 */
export async function getUserLpPosition(lpTokenAddress, userAddress, fpmmAddress) {
  try {
    const [userBalance, totalSupply, reserves] = await Promise.all([
      getLpTokenBalance(lpTokenAddress, userAddress),
      getLpTokenTotalSupply(lpTokenAddress),
      getMarketReserves(fpmmAddress),
    ]);

    const userBalanceFloat = parseFloat(userBalance);
    const totalSupplyFloat = parseFloat(totalSupply);
    
    if (totalSupplyFloat === 0) {
      return {
        lpTokenBalance: '0',
        shareOfPool: 0,
        claimableSOF: '0',
      };
    }

    const shareOfPool = (userBalanceFloat / totalSupplyFloat) * 100;
    const totalLiquidity = parseFloat(reserves.yesReserve) + parseFloat(reserves.noReserve);
    const claimableSOF = (totalLiquidity * shareOfPool / 100).toFixed(4);

    return {
      lpTokenBalance: userBalance,
      shareOfPool: shareOfPool.toFixed(2),
      claimableSOF,
    };
  } catch (error) {
    console.error('Error getting user LP position:', error);
    throw error;
  }
}

export default {
  getMarketAddress,
  getLpTokenAddress,
  getMarketPrices,
  getMarketReserves,
  calcBuyAmount,
  getLpTokenBalance,
  getLpTokenTotalSupply,
  getCompleteMarketData,
  calculatePriceImpact,
  getUserLpPosition,
};
