import { db } from "../../shared/supabaseClient.js";
import { publicClient } from "../lib/viemClient.js";
import simpleFpmmAbi from "../abis/SimpleFPMMAbi.js";

/**
 * Service for managing InfoFi positions
 * Handles recording trades, historical sync, and position queries
 */
class InfoFiPositionService {
  /**
   * Record a position from a Trade event (idempotent via tx_hash)
   * @param {Object} params
   * @param {string} params.fpmmAddress - FPMM contract address
   * @param {string} params.trader - User address
   * @param {boolean} params.buyYes - true for YES, false for NO
   * @param {bigint} params.amountIn - SOF amount spent
   * @param {bigint} params.amountOut - Shares received
   * @param {string} params.txHash - Transaction hash
   * @returns {Promise<Object>} Result with success status
   */
  async recordPosition({
    fpmmAddress,
    trader,
    buyYes,
    amountIn,
    amountOut,
    txHash,
  }) {
    try {
      // 1. Check if already recorded (idempotency)
      const { data: existing } = await db.client
        .from("infofi_positions")
        .select("id")
        .eq("tx_hash", txHash)
        .maybeSingle();

      if (existing) {
        return { alreadyRecorded: true, id: existing.id };
      }

      // 2. Get market_id from FPMM address
      const marketId = await this.getMarketIdFromFpmm(fpmmAddress);
      if (!marketId) {
        throw new Error(`No market found for FPMM: ${fpmmAddress}`);
      }

      // 3. Calculate price per share
      const amountInNum = Number(amountIn);
      const amountOutNum = Number(amountOut);
      const price = amountOutNum > 0 ? amountInNum / amountOutNum : 0;

      // 4. Map outcome
      const outcome = buyYes ? "YES" : "NO";

      // 5. Insert position (player_id auto-populated by trigger)
      const { data, error } = await db.client
        .from("infofi_positions")
        .insert({
          market_id: marketId,
          user_address: trader.toLowerCase(),
          outcome,
          amount: amountInNum.toString(),
          price: price.toString(),
          tx_hash: txHash,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error recording position:", error);
      throw error;
    }
  }

  /**
   * Sync historical trades for a market from blockchain
   * @param {string} fpmmAddress - FPMM contract address
   * @param {bigint} [fromBlock] - Starting block (optional, uses last_synced_block if not provided)
   * @returns {Promise<Object>} Sync results
   */
  async syncMarketPositions(fpmmAddress, fromBlock = null) {
    try {
      const marketId = await this.getMarketIdFromFpmm(fpmmAddress);
      if (!marketId) {
        return { error: "Market not found", fpmmAddress };
      }

      // Get market's last synced block
      const { data: market } = await db.client
        .from("infofi_markets")
        .select("last_synced_block, contract_address")
        .eq("id", marketId)
        .single();

      const startBlock =
        fromBlock !== null ? fromBlock : BigInt(market?.last_synced_block || 0);

      const latestBlock = await publicClient.getBlockNumber();

      // Skip if already synced
      if (startBlock >= latestBlock) {
        return {
          success: true,
          recorded: 0,
          skipped: 0,
          totalEvents: 0,
          message: "Already up to date",
        };
      }

      // Get all Trade events from contract
      const logs = await publicClient.getContractEvents({
        address: fpmmAddress,
        abi: simpleFpmmAbi,
        eventName: "Trade",
        fromBlock: startBlock,
        toBlock: latestBlock,
      });

      let recorded = 0;
      let skipped = 0;
      let errors = 0;

      for (const log of logs) {
        const { trader, buyYes, amountIn, amountOut } = log.args;

        try {
          const result = await this.recordPosition({
            fpmmAddress,
            trader,
            buyYes,
            amountIn,
            amountOut,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });

          if (result.alreadyRecorded) {
            skipped++;
          } else {
            recorded++;
          }
        } catch (error) {
          console.error(
            `Failed to record trade ${log.transactionHash}:`,
            error.message
          );
          errors++;
        }
      }

      // Update last synced block
      await db.client
        .from("infofi_markets")
        .update({
          last_synced_block: latestBlock.toString(),
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", marketId);

      return {
        success: true,
        recorded,
        skipped,
        errors,
        totalEvents: logs.length,
        fromBlock: startBlock.toString(),
        toBlock: latestBlock.toString(),
      };
    } catch (error) {
      console.error("Error syncing market positions:", error);
      throw error;
    }
  }

  /**
   * Get market_id from FPMM contract address
   * @param {string} fpmmAddress - FPMM contract address
   * @returns {Promise<number|null>} Market ID or null
   */
  async getMarketIdFromFpmm(fpmmAddress) {
    const { data } = await db.client
      .from("infofi_markets")
      .select("id")
      .eq("contract_address", fpmmAddress.toLowerCase())
      .maybeSingle();

    return data?.id || null;
  }

  /**
   * Get all positions for a user
   * @param {string} userAddress - User wallet address
   * @param {number} [marketId] - Optional market filter
   * @returns {Promise<Array>} Array of positions
   */
  async getUserPositions(userAddress, marketId = null) {
    let query = db.client
      .from("infofi_positions")
      .select("*")
      .eq("user_address", userAddress.toLowerCase());

    if (marketId) {
      query = query.eq("market_id", marketId);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get aggregated position for user in a market
   * Uses the user_market_positions view for efficient aggregation
   * @param {string} userAddress - User wallet address
   * @param {number} marketId - Market ID
   * @returns {Promise<Array>} Array of aggregated positions by outcome
   */
  async getAggregatedPosition(userAddress, marketId) {
    const { data, error } = await db.client
      .from("user_market_positions")
      .select("*")
      .eq("user_address", userAddress.toLowerCase())
      .eq("market_id", marketId);

    if (error) throw error;

    // Returns array of positions grouped by outcome
    // Example: [{ outcome: 'YES', total_amount: 125, ... }, { outcome: 'NO', total_amount: 50, ... }]
    return data || [];
  }

  /**
   * Get user's net position for binary markets
   * @param {string} userAddress - User wallet address
   * @param {number} marketId - Market ID
   * @returns {Promise<Object>} Net position with YES/NO totals
   */
  async getNetPosition(userAddress, marketId) {
    const positions = await this.getAggregatedPosition(userAddress, marketId);

    const yesPosition = positions.find((p) => p.outcome === "YES");
    const noPosition = positions.find((p) => p.outcome === "NO");

    const yesAmount = parseFloat(yesPosition?.total_amount || 0);
    const noAmount = parseFloat(noPosition?.total_amount || 0);

    return {
      yes: yesPosition?.total_amount || "0",
      no: noPosition?.total_amount || "0",
      net: (yesAmount - noAmount).toString(),
      isHedged: !!(yesPosition && noPosition),
      numTradesYes: yesPosition?.num_trades || 0,
      numTradesNo: noPosition?.num_trades || 0,
    };
  }

  /**
   * Check if user has positions on multiple outcomes (hedging detection)
   * @param {string} userAddress - User wallet address
   * @param {number} marketId - Market ID
   * @returns {Promise<boolean>} True if user is hedging
   */
  async isUserHedging(userAddress, marketId) {
    const positions = await this.getAggregatedPosition(userAddress, marketId);
    return positions.length > 1; // More than one outcome = hedging
  }

  /**
   * Sync all active markets
   * @returns {Promise<Object>} Summary of sync results
   */
  async syncAllActiveMarkets() {
    try {
      const { data: markets } = await db.client
        .from("infofi_markets")
        .select("id, contract_address")
        .eq("is_active", true);

      if (!markets || markets.length === 0) {
        return { success: true, message: "No active markets to sync" };
      }

      const results = [];

      for (const market of markets) {
        try {
          const result = await this.syncMarketPositions(
            market.contract_address
          );
          results.push({
            marketId: market.id,
            address: market.contract_address,
            ...result,
          });
        } catch (error) {
          results.push({
            marketId: market.id,
            address: market.contract_address,
            error: error.message,
          });
        }
      }

      const totalRecorded = results.reduce(
        (sum, r) => sum + (r.recorded || 0),
        0
      );
      const totalSkipped = results.reduce(
        (sum, r) => sum + (r.skipped || 0),
        0
      );
      const totalErrors = results.reduce((sum, r) => sum + (r.errors || 0), 0);

      return {
        success: true,
        markets: results.length,
        totalRecorded,
        totalSkipped,
        totalErrors,
        details: results,
      };
    } catch (error) {
      console.error("Error syncing all markets:", error);
      throw error;
    }
  }
}

export const infoFiPositionService = new InfoFiPositionService();
