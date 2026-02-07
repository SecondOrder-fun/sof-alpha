/**
 * useFormatSOF Hook
 * Formats SOF token amounts from wei to human-readable decimal format
 */

import { useCallback } from "react";
import { formatUnits } from "viem";

/**
 * Hook to format SOF amounts
 * @param {number} decimals - Token decimals
 * @returns {Function} Formatter function that converts wei to decimal string
 */
export function useFormatSOF(decimals) {
  return useCallback(
    (amountWei) => {
      try {
        return Number(formatUnits(amountWei ?? 0n, decimals)).toFixed(4);
      } catch {
        return "0.0000";
      }
    },
    [decimals]
  );
}
