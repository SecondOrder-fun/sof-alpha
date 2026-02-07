/**
 * useBuySellTransactions Hook
 * Centralized buy/sell transaction logic with error handling and confirmations
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCurve } from "@/hooks/useCurve";
import { useSOFToken } from "@/hooks/useSOFToken";
import { getReadableContractError } from "@/utils/buysell/contractErrors";
import { applyMaxSlippage, applyMinSlippage } from "@/utils/buysell/slippage";
import { SOFBondingCurveAbi } from "@/utils/abis";

/**
 * Hook for executing buy/sell transactions
 * @param {string} bondingCurveAddress - Address of the bonding curve contract
 * @param {Object} client - Viem public client
 * @param {Function} onNotify - Notification callback
 * @param {Function} onSuccess - Success callback
 * @returns {Object} Transaction handlers { executeBuy, executeSell }
 */
export function useBuySellTransactions(
  bondingCurveAddress,
  client,
  onNotify,
  onSuccess
) {
  const { t } = useTranslation(["common", "transactions"]);
  const { buyTokens, sellTokens, approve } = useCurve(bondingCurveAddress);
  const { refetchBalance } = useSOFToken();

  /**
   * Execute buy transaction
   * @param {Object} params - Buy parameters
   * @param {bigint} params.tokenAmount - Amount of tokens to buy
   * @param {bigint} params.maxSofAmount - Maximum SOF to spend (with slippage)
   * @param {string} params.slippagePct - Slippage percentage
   * @param {Function} params.onComplete - Optional completion callback
   */
  const executeBuy = useCallback(
    async ({ tokenAmount, maxSofAmount, slippagePct, onComplete }) => {
      try {
        // Step 1: Approve maximum amount
        const maxUint = (1n << 255n) - 1n;
        const approvalTxHash = await approve.mutateAsync({ amount: maxUint });

        // Wait for approval confirmation
        if (client && approvalTxHash) {
          await client.waitForTransactionReceipt({
            hash: approvalTxHash,
            confirmations: 1,
          });
        }

        // Step 2: Execute buy with slippage protection
        const cap = applyMaxSlippage(maxSofAmount, slippagePct);
        const tx = await buyTokens.mutateAsync({
          tokenAmount,
          maxSofAmount: cap,
        });
        const hash = tx?.hash ?? tx ?? "";

        // Step 3: Wait for transaction confirmation
        if (client && hash) {
          try {
            const receipt = await client.waitForTransactionReceipt({
              hash,
              confirmations: 1,
            });

            if (receipt.status === "reverted") {
              onNotify?.({
                type: "error",
                message: "Transaction reverted",
                hash,
              });
              return { success: false, hash };
            }

            onNotify?.({
              type: "success",
              message: t("transactions:bought"),
              hash,
            });
            
            onSuccess?.();
            onComplete?.();
            void refetchBalance?.();
            
            return { success: true, hash };
          } catch (waitErr) {
            const waitMsg =
              waitErr instanceof Error
                ? waitErr.message
                : "Failed waiting for transaction receipt";
            onNotify?.({ type: "error", message: waitMsg, hash });
            
            // Still trigger refresh after delay if wait fails
            setTimeout(() => {
              onSuccess?.();
              onComplete?.();
            }, 2000);
            
            return { success: false, hash, error: waitMsg };
          }
        }

        // Fallback: no client available
        onNotify?.({
          type: "success",
          message: t("transactions:bought"),
          hash,
        });
        
        setTimeout(() => {
          onSuccess?.();
          onComplete?.();
        }, 2000);
        
        return { success: true, hash };
      } catch (err) {
        console.error("Buy transaction error:", err);
        const message = getReadableContractError(err, t);
        onNotify?.({ type: "error", message, hash: "" });
        return { success: false, error: message };
      }
    },
    [approve, buyTokens, client, onNotify, onSuccess, refetchBalance, t]
  );

  /**
   * Execute sell transaction
   * @param {Object} params - Sell parameters
   * @param {bigint} params.tokenAmount - Amount of tokens to sell
   * @param {bigint} params.minSofAmount - Minimum SOF to receive (with slippage)
   * @param {string} params.slippagePct - Slippage percentage
   * @param {Function} params.onComplete - Optional completion callback
   */
  const executeSell = useCallback(
    async ({ tokenAmount, minSofAmount, slippagePct, onComplete }) => {
      try {
        const floor = applyMinSlippage(minSofAmount, slippagePct);

        // Check curve reserves before selling
        if (client && bondingCurveAddress) {
          try {
            const cfg = await client.readContract({
              address: bondingCurveAddress,
              abi: SOFBondingCurveAbi,
              functionName: "curveConfig",
              args: [],
            });
            const reserves = cfg[1];
            const estimatedSell = minSofAmount; // Base amount before slippage

            if (reserves < estimatedSell) {
              const errorMsg = "Insufficient curve reserves - cannot sell this amount";
              onNotify?.({
                type: "error",
                message: errorMsg,
                hash: "",
              });
              return { success: false, error: errorMsg };
            }
          } catch (checkErr) {
            const message =
              checkErr instanceof Error
                ? checkErr.message
                : "Unable to verify curve reserves";
            onNotify?.({ type: "error", message, hash: "" });
            return { success: false, error: message };
          }
        }

        // Execute sell transaction
        const tx = await sellTokens.mutateAsync({
          tokenAmount,
          minSofAmount: floor,
        });
        const hash = tx?.hash ?? tx ?? "";

        // Notify immediately with transaction hash
        onNotify?.({
          type: "success",
          message: t("transactions:sold"),
          hash,
        });

        // Wait for confirmation in background
        if (client && hash) {
          try {
            const receipt = await client.waitForTransactionReceipt({
              hash,
              confirmations: 1,
            });

            if (receipt.status === "reverted") {
              onNotify?.({
                type: "error",
                message: "Transaction reverted",
                hash,
              });
              return { success: false, hash };
            }

            onSuccess?.();
            onComplete?.();
            void refetchBalance?.();
            
            return { success: true, hash };
          } catch (waitErr) {
            const waitMsg =
              waitErr instanceof Error
                ? waitErr.message
                : "Failed waiting for transaction receipt";
            onNotify?.({ type: "error", message: waitMsg, hash });
            
            // Still trigger refresh after delay
            setTimeout(() => {
              onSuccess?.();
              onComplete?.();
            }, 2000);
            
            return { success: false, hash, error: waitMsg };
          }
        }

        // Fallback: no client available
        setTimeout(() => {
          onSuccess?.();
          onComplete?.();
        }, 2000);
        
        return { success: true, hash };
      } catch (err) {
        console.error("Sell transaction error:", err);
        const message = getReadableContractError(err, t);
        onNotify?.({ type: "error", message, hash: "" });
        return { success: false, error: message };
      }
    },
    [sellTokens, client, bondingCurveAddress, onNotify, onSuccess, refetchBalance, t]
  );

  return {
    executeBuy,
    executeSell,
    isPending: buyTokens.isPending || sellTokens.isPending,
  };
}
