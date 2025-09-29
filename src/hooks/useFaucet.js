// src/hooks/useFaucet.js
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits } from 'viem';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';
import SOFFaucetAbi from '@/contracts/abis/SOFFaucet.json';
import ERC20Abi from '@/contracts/abis/ERC20.json';

/**
 * Hook for interacting with the SOF Faucet contract
 */
export function useFaucet() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);
  
  const [error, setError] = useState('');
  
  // Query for SOF balance
  const { 
    data: sofBalance = '0',
    isLoading: isLoadingBalance,
    refetch: refetchBalance
  } = useQuery({
    queryKey: ['sofBalance', address, contracts.SOF],
    queryFn: async () => {
      if (!address || !isConnected || !contracts.SOF) return '0';
      
      try {
        const balance = await publicClient.readContract({
          address: contracts.SOF,
          abi: ERC20Abi.abi || ERC20Abi,
          functionName: 'balanceOf',
          args: [address],
        });
        
        return formatUnits(balance, 18);
      } catch (err) {
        // Silent error handling, returning default value
        return '0';
      }
    },
    enabled: Boolean(address && isConnected && contracts.SOF),
    staleTime: 15000, // 15 seconds
  });
  
  // Query for faucet data
  const {
    data: faucetData,
    isLoading: isLoadingFaucet,
    refetch: refetchFaucet
  } = useQuery({
    queryKey: ['faucetData', address, contracts.SOF_FAUCET],
    queryFn: async () => {
      if (!address || !isConnected || !contracts.SOF_FAUCET) return null;
      
      try {
        const [lastClaimTime, cooldownPeriod, amountPerRequest] = await Promise.all([
          publicClient.readContract({
            address: contracts.SOF_FAUCET,
            abi: SOFFaucetAbi,
            functionName: 'lastClaimTime',
            args: [address],
          }),
          publicClient.readContract({
            address: contracts.SOF_FAUCET,
            abi: SOFFaucetAbi,
            functionName: 'cooldownPeriod',
          }),
          publicClient.readContract({
            address: contracts.SOF_FAUCET,
            abi: SOFFaucetAbi,
            functionName: 'amountPerRequest',
          }),
        ]);
        
        return {
          lastClaimTime: Number(lastClaimTime),
          cooldownPeriod: Number(cooldownPeriod),
          amountPerRequest: formatUnits(amountPerRequest, 18),
          canClaim: Number(lastClaimTime) === 0 || 
                    Date.now() / 1000 > Number(lastClaimTime) + Number(cooldownPeriod)
        };
      } catch (err) {
        // Silent error handling, returning null
        return null;
      }
    },
    enabled: Boolean(address && isConnected && contracts.SOF_FAUCET),
    staleTime: 15000, // 15 seconds
  });
  
  // Mutation for claiming tokens
  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!isConnected || !walletClient || !contracts.SOF_FAUCET) {
        throw new Error('Wallet not connected or faucet not configured');
      }
      
      setError('');
      
      const hash = await walletClient.writeContract({
        address: contracts.SOF_FAUCET,
        abi: SOFFaucetAbi,
        functionName: 'claim',
        account: address,
      });
      
      // Wait for transaction to be mined
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['sofBalance'] });
      queryClient.invalidateQueries({ queryKey: ['faucetData'] });
    },
    onError: (err) => {
      setError(err.message || 'Failed to claim tokens');
    }
  });
  
  // Mutation for contributing karma (returning tokens to the faucet)
  const karmaMutation = useMutation({
    mutationFn: async (amount) => {
      if (!isConnected || !walletClient || !contracts.SOF_FAUCET || !contracts.SOF) {
        throw new Error('Wallet not connected or faucet not configured');
      }
      
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      
      setError('');
      
      // First approve the faucet to spend tokens
      const approveHash = await walletClient.writeContract({
        address: contracts.SOF,
        abi: ERC20Abi.abi || ERC20Abi,
        functionName: 'approve',
        args: [contracts.SOF_FAUCET, BigInt(parseFloat(amount) * 10**18)],
        account: address,
      });
      
      // Wait for approval transaction to be mined
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      
      // Then contribute karma
      const karmaHash = await walletClient.writeContract({
        address: contracts.SOF_FAUCET,
        abi: SOFFaucetAbi,
        functionName: 'contributeKarma',
        args: [BigInt(parseFloat(amount) * 10**18)],
        account: address,
      });
      
      // Wait for karma transaction to be mined
      const receipt = await publicClient.waitForTransactionReceipt({ hash: karmaHash });
      return { hash: karmaHash, receipt };
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['sofBalance'] });
      queryClient.invalidateQueries({ queryKey: ['faucetData'] });
    },
    onError: (err) => {
      setError(err.message || 'Failed to contribute karma');
    }
  });
  
  // Calculate time remaining until next claim
  const getTimeRemaining = () => {
    if (!faucetData) return '';
    
    const { lastClaimTime, cooldownPeriod } = faucetData;
    if (lastClaimTime === 0) return '';
    
    const now = Math.floor(Date.now() / 1000);
    const nextClaimTime = lastClaimTime + cooldownPeriod;
    const remaining = nextClaimTime - now;
    
    if (remaining <= 0) return '';
    
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    
    return `${hours}h ${minutes}m ${seconds}s`;
  };
  
  return {
    sofBalance,
    faucetData,
    isLoading: isLoadingBalance || isLoadingFaucet || claimMutation.isPending || karmaMutation.isPending,
    error,
    claim: claimMutation.mutate,
    contributeKarma: karmaMutation.mutate,
    refetch: () => {
      refetchBalance();
      refetchFaucet();
    },
    getTimeRemaining,
    isClaimable: faucetData?.canClaim || false
  };
}
