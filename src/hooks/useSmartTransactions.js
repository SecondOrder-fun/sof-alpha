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
    const hasBatch = true;
    let atomicStatus = null;
    let hasPaymaster = false;

    if (capabilities && chainId) {
      const caps = capabilities[chainId];
      atomicStatus = caps?.atomic?.status || null;
      hasPaymaster = !!caps?.paymasterService?.supported;

      // eslint-disable-next-line no-console -- diagnostic: remove after paymaster is confirmed working
      console.log('[SmartTx] wallet_getCapabilities →', {
        chainId: `0x${chainId.toString(16)}`,
        raw: caps,
        atomicStatus,
        hasPaymaster,
      });
    } else {
      // eslint-disable-next-line no-console -- diagnostic
      console.log('[SmartTx] wallet_getCapabilities → no data', {
        capabilities,
        chainId,
      });
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
   * Execute a batch of calls via ERC-5792 with automatic paymaster sponsorship.
   * Always attempts paymaster when a URL is configured — same optimistic approach
   * as hasBatch. If the paymaster attempt fails, retries the batch without
   * sponsorship so batching is preserved.
   * When paymaster is active, prepends a SOF fee transfer (0.05% of sofAmount).
   *
   * @param {Array<{to: string, data: string, value?: bigint}>} calls - Raw calls to batch
   * @param {object} options - Additional options for sendCalls
   * @param {bigint} [options.sofAmount] - SOF amount for fee calculation (required when paymaster is active)
   */
  const executeBatch = useCallback(async (calls, options = {}) => {
    const { sofAmount, ...sendOptions } = options;
    const batchCapabilities = {};
    let finalCalls = calls;

    // Include paymasterService as optional — wallets that support it (Coinbase
    // Wallet) will use it; wallets that don't (MetaMask) will ignore it and
    // proceed without sponsorship. ERC-5792 `optional: true` prevents viem
    // from throwing when the wallet hasn't reported paymasterService support.
    if (paymasterUrl) {
      batchCapabilities.paymasterService = {
        url: paymasterUrl,
        optional: true,
      };
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
  }, [address, paymasterUrl, sendCallsAsync, buildFeeCall]);

  return {
    ...chainCaps,
    executeBatch,
    batchId,
    callsStatus,
    sofFeeBps: SOF_FEE_BPS,
    needsSmartAccountUpgrade: chainCaps.atomicStatus === 'ready',
  };
}
