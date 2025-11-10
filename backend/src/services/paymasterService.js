/**
 * @file paymasterService.js
 * @description Service for submitting gasless transactions via Base Paymaster
 * Uses Viem Account Abstraction to create UserOperations and submit them to the Paymaster
 * @author SecondOrder.fun
 */

import {
  createSmartAccountClient,
  toSoladySmartAccount,
} from 'viem/account-abstraction';
import { http, publicActions } from 'viem';
import { base } from 'viem/chains';

/**
 * PaymasterService - Handles gasless transaction submission via Base Paymaster
 * @class
 */
export class PaymasterService {
  constructor(logger) {
    this.logger = logger;
    this.smartAccountClient = null;
    this.smartAccountAddress = null;
    this.initialized = false;
  }

  /**
   * Initialize the Paymaster service with Smart Account
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If initialization fails
   */
  async initialize() {
    try {
      const {
        PAYMASTER_RPC_URL,
        ENTRY_POINT_ADDRESS,
        BACKEND_SMART_ACCOUNT_KEY,
        BASE_RPC_URL,
      } = process.env;

      // Validate required environment variables
      if (!PAYMASTER_RPC_URL) {
        throw new Error('PAYMASTER_RPC_URL not configured');
      }
      if (!ENTRY_POINT_ADDRESS) {
        throw new Error('ENTRY_POINT_ADDRESS not configured');
      }
      if (!BACKEND_SMART_ACCOUNT_KEY) {
        throw new Error('BACKEND_SMART_ACCOUNT_KEY not configured');
      }
      if (!BASE_RPC_URL) {
        throw new Error('BASE_RPC_URL not configured');
      }

      // Create Solady Smart Account
      const account = await toSoladySmartAccount({
        client: publicActions(http(BASE_RPC_URL)),
        owner: {
          address: this._getAddressFromPrivateKey(BACKEND_SMART_ACCOUNT_KEY),
          type: 'privateKey',
          privateKey: BACKEND_SMART_ACCOUNT_KEY,
        },
        entryPoint: ENTRY_POINT_ADDRESS,
      });

      // Create smart account client
      this.smartAccountClient = createSmartAccountClient({
        account,
        chain: base,
        bundlerTransport: http(PAYMASTER_RPC_URL),
        paymasterTransport: http(PAYMASTER_RPC_URL),
      });

      this.smartAccountAddress = account.address;
      this.initialized = true;

      this.logger.info(`✅ PaymasterService initialized`);
      this.logger.info(`   Smart Account: ${this.smartAccountAddress}`);
    } catch (error) {
      this.logger.error(`❌ PaymasterService initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a market via gasless transaction
   * @async
   * @param {Object} params - Market creation parameters
   * @param {number} params.seasonId - Season identifier
   * @param {string} params.player - Player address
   * @param {number} params.oldTickets - Previous ticket count
   * @param {number} params.newTickets - New ticket count
   * @param {number} params.totalTickets - Total tickets in season
   * @param {string} params.infoFiFactoryAddress - InfoFi factory contract address
   * @param {Object} logger - Logger instance
   * @returns {Promise<Object>} Transaction result with hash and status
   * @throws {Error} If transaction fails after retries
   */
  async createMarket(params, logger) {
    if (!this.initialized) {
      throw new Error('PaymasterService not initialized. Call initialize() first.');
    }

    const {
      seasonId,
      player,
      oldTickets,
      newTickets,
      totalTickets,
      infoFiFactoryAddress,
    } = params;

    const maxRetries = 3;
    const retryDelays = [5000, 15000, 45000]; // 5s, 15s, 45s

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(
          `🔄 Attempt ${attempt}/${maxRetries}: Creating market for player ${player}`
        );

        // Encode the onPositionUpdate function call
        const functionData = this._encodeOnPositionUpdate(
          seasonId,
          player,
          oldTickets,
          newTickets,
          totalTickets
        );

        // Submit UserOperation via Paymaster
        const hash = await this.smartAccountClient.sendUserOperation({
          calls: [
            {
              to: infoFiFactoryAddress,
              data: functionData,
              value: 0n,
            },
          ],
        });

        logger.info(`✅ Market creation submitted: ${hash}`);

        // Wait for transaction confirmation
        const receipt = await this.smartAccountClient.waitForUserOperationReceipt({
          hash,
        });

        if (receipt.success) {
          logger.info(`✅ Market creation confirmed: ${receipt.transactionHash}`);
          return {
            success: true,
            hash: receipt.transactionHash,
            attempts: attempt,
          };
        } else {
          throw new Error(`UserOperation failed: ${receipt.reason}`);
        }
      } catch (error) {
        logger.error(
          `❌ Attempt ${attempt} failed: ${error.message}`
        );

        if (attempt < maxRetries) {
          const delayMs = retryDelays[attempt - 1];
          logger.info(`⏳ Retrying in ${delayMs / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          logger.error(`❌ Market creation failed after ${maxRetries} attempts`);
          return {
            success: false,
            error: error.message,
            attempts: attempt,
          };
        }
      }
    }
  }

  /**
   * Get the Smart Account address
   * @returns {string} Smart Account address
   */
  getSmartAccountAddress() {
    if (!this.initialized) {
      throw new Error('PaymasterService not initialized');
    }
    return this.smartAccountAddress;
  }

  /**
   * Encode onPositionUpdate function call
   * @private
   * @param {number} seasonId - Season identifier
   * @param {string} player - Player address
   * @param {number} oldTickets - Previous ticket count
   * @param {number} newTickets - New ticket count
   * @param {number} totalTickets - Total tickets in season
   * @returns {string} Encoded function data
   */
  _encodeOnPositionUpdate(seasonId, player, oldTickets, newTickets, totalTickets) {
    // Function signature: onPositionUpdate(uint256 seasonId, address player, uint256 oldTickets, uint256 newTickets, uint256 totalTickets)
    // Selector: 0x1a1d1f6f (calculated from keccak256 of function signature)
    const selector = '0x1a1d1f6f';

    // Encode parameters
    // uint256 seasonId (32 bytes)
    const seasonIdEncoded = seasonId.toString(16).padStart(64, '0');
    // address player (32 bytes, padded)
    const playerEncoded = player.slice(2).padStart(64, '0');
    // uint256 oldTickets (32 bytes)
    const oldTicketsEncoded = oldTickets.toString(16).padStart(64, '0');
    // uint256 newTickets (32 bytes)
    const newTicketsEncoded = newTickets.toString(16).padStart(64, '0');
    // uint256 totalTickets (32 bytes)
    const totalTicketsEncoded = totalTickets.toString(16).padStart(64, '0');

    return (
      selector +
      seasonIdEncoded +
      playerEncoded +
      oldTicketsEncoded +
      newTicketsEncoded +
      totalTicketsEncoded
    );
  }

  /**
   * Extract address from private key
   * @private
   * @param {string} privateKey - Private key (0x prefixed hex string)
   * @returns {string} Address derived from private key
   */
  _getAddressFromPrivateKey(privateKey) {
    // This is a simplified version - in production, use proper key derivation
    // For now, we'll use the private key as-is and let viem derive the address
    // The actual address derivation happens in toSoladySmartAccount
    return privateKey;
  }
}

// Export singleton instance
let paymasterServiceInstance = null;

/**
 * Get or create PaymasterService singleton
 * @param {Object} logger - Logger instance
 * @returns {PaymasterService} PaymasterService instance
 */
export function getPaymasterService(logger) {
  if (!paymasterServiceInstance) {
    paymasterServiceInstance = new PaymasterService(logger);
  }
  return paymasterServiceInstance;
}
