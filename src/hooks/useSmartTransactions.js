import { useMemo, useCallback } from 'react';
import { useAccount, useChainId, useCapabilities, useSendCalls, useCallsStatus } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { ERC20Abi } from '@/utils/abis';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';

/**
 * SOF fee amount charged per sponsored transaction batch.
 * This fee is transferred to treasury as the first call in every ERC-5792 batch.
 * Phase 1: fixed fee. Phase 2: dynamic fee based on gas estimate * SOF/ETH rate.
 */
const SOF_GAS_FEE = 100n * 10n ** 18n; // 100 SOF per batch

export function useSmartTransactions() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: capabilities } = useCapabilities({ account: address });
  const { sendCallsAsync, data: batchId, isPending: isBatchPending } = useSendCalls();

  const { data: callsStatus } = useCallsStatus({
    id: batchId,
    query: {
      enabled: !!batchId,
      refetchInterval: (data) =>
        data?.state?.data?.status === 'CONFIRMED' ? false : 1000,
    },
  });

  const chainCaps = useMemo(() => {
    if (!capabilities || !chainId) return { hasBatch: false, hasPaymaster: false };
    const caps = capabilities[chainId];
    return {
      hasBatch: !!caps?.atomicBatch?.supported,
      hasPaymaster: !!caps?.paymasterService?.supported,
    };
  }, [capabilities, chainId]);

  const paymasterUrl = import.meta.env.VITE_PAYMASTER_PROXY_URL || '';

  /**
   * Build the SOF fee transfer call that gets prepended to every sponsored batch.
   * Transfers SOF_GAS_FEE from user to treasury (deployer wallet for now).
   */
  const buildFeeCall = useCallback(() => {
    const contracts = getContractAddresses(getStoredNetworkKey());
    const treasury = import.meta.env.VITE_TREASURY_ADDRESS || contracts.SOF_EXCHANGE;
    return {
      to: contracts.SOF,
      data: encodeFunctionData({
        abi: ERC20Abi,
        functionName: 'transfer',
        args: [treasury, SOF_GAS_FEE],
      }),
    };
  }, []);

  /**
   * Execute a batch of calls via ERC-5792 with optional paymaster sponsorship.
   * When paymaster is active, prepends a SOF fee transfer as the first call.
   *
   * @param {Array<{to: string, data: string, value?: bigint}>} calls - Raw calls to batch
   * @param {object} options - Additional options for sendCalls
   */
  const executeBatch = useCallback(async (calls, options = {}) => {
    const batchCapabilities = {};
    let finalCalls = calls;

    if (chainCaps.hasPaymaster && paymasterUrl) {
      batchCapabilities.paymasterService = { url: paymasterUrl };
      // Prepend SOF fee transfer when gas is sponsored
      finalCalls = [buildFeeCall(), ...calls];
    }

    return await sendCallsAsync({
      calls: finalCalls,
      capabilities: batchCapabilities,
      ...options,
    });
  }, [chainCaps, paymasterUrl, sendCallsAsync, buildFeeCall]);

  return {
    ...chainCaps,
    executeBatch,
    batchId,
    callsStatus,
    isBatchPending,
    sofGasFee: SOF_GAS_FEE,
  };
}
