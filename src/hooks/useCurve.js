// src/hooks/useCurve.js
// Hook for interacting with the SOFBondingCurve contract.

import { useWriteContract } from 'wagmi';
import { useMutation } from '@tanstack/react-query';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getContractAddresses } from '@/config/contracts';
import SOFBondingCurveAbi from '@/contracts/abis/SOFBondingCurve.json';
import ERC20Abi from '@/contracts/abis/ERC20.json'; // Assuming a standard ERC20 ABI is available

/**
 * @notice Hook for SOFBondingCurve contract interactions.
 * @param {string} bondingCurveAddress - The address of the season-specific bonding curve contract.
 * @returns {object} An object containing mutation functions for curve actions.
 */
export function useCurve(bondingCurveAddress) {
  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);
  const { writeContractAsync } = useWriteContract();

  const curveContractConfig = {
    address: bondingCurveAddress,
    abi: SOFBondingCurveAbi.abi,
  };

  /**
   * @notice Approves the bonding curve to spend the user's SOF tokens.
   */
  const approveMutation = useMutation({
    mutationFn: async ({ amount }) => {
      return await writeContractAsync({
        address: contracts.SOF_TOKEN, // Address of the main SOF token
        abi: ERC20Abi.abi, // Generic ERC20 ABI
        functionName: 'approve',
        args: [bondingCurveAddress, amount],
      });
    },
  });

  /**
   * @notice Buys raffle tickets from the bonding curve.
   */
  const buyTokensMutation = useMutation({
    mutationFn: async ({ tokenAmount, maxSofAmount }) => {
      return await writeContractAsync({
        ...curveContractConfig,
        functionName: 'buyTokens',
        args: [tokenAmount, maxSofAmount],
      });
    },
  });

  return {
    approve: approveMutation,
    buyTokens: buyTokensMutation,
  };
}
