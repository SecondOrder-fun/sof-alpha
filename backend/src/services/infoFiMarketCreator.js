// backend/src/services/infoFiMarketCreator.js
// Handles calling InfoFiMarketFactory.onPositionUpdate() from backend wallet

import { getWalletClient, getPublicClient } from '../lib/viemClient.js';
import { getChainByKey } from '../config/chain.js';
import InfoFiMarketFactoryAbi from '../abis/InfoFiMarketFactoryAbi.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const MAX_GAS_PRICE_GWEI = 100n;

/**
 * Create InfoFi market for a player by calling InfoFiMarketFactory
 * @param {number} seasonId - Season ID
 * @param {string} player - Player address
 * @param {number} oldTickets - Old ticket count
 * @param {number} newTickets - New ticket count
 * @param {number} totalTickets - Total tickets in season
 * @param {string} networkKey - Network key
 * @param {object} logger - Logger instance
 * @returns {object} Result object with success status
 */
export async function createMarketForPlayer(
  seasonId,
  player,
  oldTickets,
  newTickets,
  totalTickets,
  networkKey,
  logger
) {
  const chain = getChainByKey(networkKey);
  const walletClient = getWalletClient(networkKey);
  const publicClient = getPublicClient(networkKey);
  
  if (!chain.infofiFactory) {
    logger.error('[infoFiMarketCreator] ❌ No InfoFi factory address configured');
    return { success: false, error: 'No factory address' };
  }

  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      logger.info(`[infoFiMarketCreator] 🚀 Creating market (attempt ${attempt}/${MAX_RETRIES}): season=${seasonId}, player=${player}`);
      
      // Check gas price
      const gasPrice = await publicClient.getGasPrice();
      const gasPriceGwei = gasPrice / 1000000000n;
      
      if (gasPriceGwei > MAX_GAS_PRICE_GWEI) {
        logger.warn(`[infoFiMarketCreator] ⚠️ Gas price too high: ${gasPriceGwei} gwei, waiting...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
      
      logger.info(`[infoFiMarketCreator] Gas price: ${gasPriceGwei} gwei`);
      
      // Call InfoFiMarketFactory.onPositionUpdate
      const hash = await walletClient.writeContract({
        address: chain.infofiFactory,
        abi: InfoFiMarketFactoryAbi,
        functionName: 'onPositionUpdate',
        args: [
          BigInt(seasonId),
          player,
          BigInt(oldTickets),
          BigInt(newTickets),
          BigInt(totalTickets)
        ],
        account: walletClient.account,
      });
      
      logger.info(`[infoFiMarketCreator] 📝 Transaction submitted: ${hash}`);
      
      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash,
        timeout: 60000 // 60 second timeout
      });
      
      if (receipt.status === 'success') {
        const gasUsed = receipt.gasUsed;
        const effectiveGasPrice = receipt.effectiveGasPrice || gasPrice;
        const gasCostEth = Number(gasUsed * effectiveGasPrice) / 1e18;
        
        logger.info(`[infoFiMarketCreator] ✅ Market created successfully: ${hash}`);
        logger.info(`[infoFiMarketCreator] Gas used: ${gasUsed}, Cost: ${gasCostEth.toFixed(6)} ETH`);
        
        return { 
          success: true, 
          hash, 
          receipt, 
          gasUsed: Number(gasUsed),
          gasCostEth 
        };
      } else {
        logger.error(`[infoFiMarketCreator] ❌ Transaction failed: ${hash}`);
        throw new Error('Transaction reverted');
      }
      
    } catch (error) {
      logger.error(`[infoFiMarketCreator] ⚠️ Attempt ${attempt} failed:`, error.message);
      
      // Check if it's a "market already exists" error (idempotent)
      if (error.message.includes('MarketAlreadyCreated') || error.message.includes('already exists')) {
        logger.info(`[infoFiMarketCreator] ℹ️ Market already exists, skipping`);
        return { success: true, alreadyExists: true };
      }
      
      // Check if it's an access control error
      if (error.message.includes('OnlyBackend') || error.message.includes('AccessControl')) {
        logger.error(`[infoFiMarketCreator] ❌ Access control error - backend wallet may not have BACKEND_ROLE`);
        return { success: false, error: 'Access denied', seasonId, player };
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        logger.info(`[infoFiMarketCreator] ⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(`[infoFiMarketCreator] ❌ All attempts exhausted for season=${seasonId}, player=${player}`);
        
        // TODO: Store failed attempt in database for manual retry
        return { success: false, error: error.message, seasonId, player };
      }
    }
  }
  
  return { success: false, error: 'Max retries exceeded', seasonId, player };
}
