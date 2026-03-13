import { useWriteContract } from 'wagmi';
import { useMutation } from '@tanstack/react-query';
import { SOFExchangeAbi, ERC20Abi } from '@/utils/abis';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';

const ETH_SENTINEL = '0x0000000000000000000000000000000000000000';

export function useSwapTransaction(exchangeAddress) {
  const { writeContractAsync } = useWriteContract();
  const contracts = getContractAddresses(getStoredNetworkKey());

  const swapMutation = useMutation({
    mutationFn: async ({ tokenIn, tokenOut, amountIn }) => {
      const isBuyingSOF = tokenOut === contracts.SOF;

      if (isBuyingSOF && tokenIn === ETH_SENTINEL) {
        // ETH -> SOF
        return await writeContractAsync({
          address: exchangeAddress,
          abi: SOFExchangeAbi,
          functionName: 'swapETHForSOF',
          value: amountIn,
        });
      } else if (isBuyingSOF) {
        // ERC20 -> SOF (needs approve first)
        await writeContractAsync({
          address: tokenIn,
          abi: ERC20Abi,
          functionName: 'approve',
          args: [exchangeAddress, amountIn],
        });
        return await writeContractAsync({
          address: exchangeAddress,
          abi: SOFExchangeAbi,
          functionName: 'swapTokenForSOF',
          args: [tokenIn, amountIn],
        });
      } else if (tokenIn === contracts.SOF && tokenOut === ETH_SENTINEL) {
        // SOF -> ETH
        await writeContractAsync({
          address: contracts.SOF,
          abi: ERC20Abi,
          functionName: 'approve',
          args: [exchangeAddress, amountIn],
        });
        return await writeContractAsync({
          address: exchangeAddress,
          abi: SOFExchangeAbi,
          functionName: 'swapSOFForETH',
          args: [amountIn],
        });
      } else {
        // SOF -> ERC20
        await writeContractAsync({
          address: contracts.SOF,
          abi: ERC20Abi,
          functionName: 'approve',
          args: [exchangeAddress, amountIn],
        });
        return await writeContractAsync({
          address: exchangeAddress,
          abi: SOFExchangeAbi,
          functionName: 'swapSOFForToken',
          args: [tokenOut, amountIn],
        });
      }
    },
  });

  return swapMutation;
}
