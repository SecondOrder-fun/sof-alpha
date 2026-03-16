import { useMemo, useCallback } from 'react';
import { useAccount, useChainId, useCapabilities, useSendCalls, useCallsStatus } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { ERC20Abi } from '@/utils/abis';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';

/**
 * SOF fee rate charged per sponsored transaction batch (0.05%).
 * Fee = sofAmount * SOF_FEE_BPS / 10_000
 * Transferred to treasury as the first call in every ERC-5792 batch.
 */
const SOF_FEE_BPS = 5n; // 0.05% (5 basis points)

export function useSmartTransactions() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: capabilities } = useCapabilities({ account: address });
  const { sendCallsAsync, data: batchId } = useSendCalls();

  const { data: callsStatus } = useCallsStatus({
    id: batchId,
    query: {
      enabled: !!batchId,
      refetchInterval: (data) =>
        data?.state?.data?.status === 'CONFIRMED' ? false : 1000,
    },
  });

  const chainCaps = useMemo(() => {
    // Always attempt wallet_sendCalls (ERC-5792) for batching — callers
    // wrap executeBatch in try/catch and fall back to sequential if it fails.
    // We don't gate on wallet_getCapabilities because some wallets (e.g.
    // Farcaster) support wallet_sendCalls but don't implement getCapabilities.
    const hasBatch = true;

    // Paymaster requires explicit capability reporting — wallets that don't
    // support it would error if we pass a paymasterService URL in the batch.
    let hasPaymaster = false;

    // MetaMask reports atomic batch status via `atomic.status`:
    //   "supported" = Smart Account already active, batch executes atomically
    //   "ready"     = Smart Account available but not enabled — wallet_sendCalls
    //                 will auto-prompt the user to upgrade their EOA via EIP-7702
    //   null        = wallet doesn't report atomic capability (Farcaster, old wallets)
    let atomicStatus = null;

    if (capabilities && chainId) {
      const caps = capabilities[chainId];
      hasPaymaster = !!caps?.paymasterService?.supported;
      atomicStatus = caps?.atomic?.status || null;
    }

    return { hasBatch, hasPaymaster, atomicStatus };
  }, [capabilities, chainId]);

  const paymasterUrl = import.meta.env.VITE_PAYMASTER_PROXY_URL || '';

  /**
   * Build the SOF fee transfer call that gets prepended to every sponsored batch.
   * Fee is 0.05% of the SOF amount involved in the transaction.
   * @param {bigint} sofAmount - SOF amount to calculate fee from
   */
  const buildFeeCall = useCallback((sofAmount) => {
    const contracts = getContractAddresses(getStoredNetworkKey());
    const treasury = import.meta.env.VITE_TREASURY_ADDRESS || contracts.SOF_EXCHANGE;
    const fee = (sofAmount * SOF_FEE_BPS) / 10_000n;
    return {
      to: contracts.SOF,
      data: encodeFunctionData({
        abi: ERC20Abi,
        functionName: 'transfer',
        args: [treasury, fee],
      }),
    };
  }, []);

  /**
   * Execute a batch of calls via ERC-5792 with optional paymaster sponsorship.
   * When paymaster is active, prepends a SOF fee transfer (0.05% of sofAmount).
   *
   * @param {Array<{to: string, data: string, value?: bigint}>} calls - Raw calls to batch
   * @param {object} options - Additional options for sendCalls
   * @param {bigint} [options.sofAmount] - SOF amount for fee calculation (required when paymaster is active)
   */
  const executeBatch = useCallback(async (calls, options = {}) => {
    const { sofAmount, usePaymaster = false, ...sendOptions } = options;
    const batchCapabilities = {};
    let finalCalls = calls;

    if (usePaymaster && chainCaps.hasPaymaster && paymasterUrl) {
      batchCapabilities.paymasterService = { url: paymasterUrl };
      if (sofAmount && sofAmount > 0n) {
        finalCalls = [buildFeeCall(sofAmount), ...calls];
      }
    }

    return await sendCallsAsync({
      account: address,
      calls: finalCalls,
      capabilities: batchCapabilities,
      ...sendOptions,
    });
  }, [address, chainCaps, paymasterUrl, sendCallsAsync, buildFeeCall]);

  return {
    ...chainCaps,
    executeBatch,
    batchId,
    callsStatus,
    sofFeeBps: SOF_FEE_BPS,
    // True when wallet needs Smart Account upgrade (MetaMask EIP-7702).
    // wallet_sendCalls will auto-prompt the upgrade — no manual action needed.
    needsSmartAccountUpgrade: chainCaps.atomicStatus === 'ready',
  };
}
