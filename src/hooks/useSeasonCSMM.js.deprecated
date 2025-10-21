import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import SeasonCSMMAbi from '@/contracts/abis/SeasonCSMM.json';

/**
 * Hook to interact with SeasonCSMM contract
 * @param {string} csmmAddress - Address of the SeasonCSMM contract
 * @param {string} userAddress - Current user's address
 * @returns {object} CSMM contract interaction methods and data
 */
export function useSeasonCSMM(csmmAddress, userAddress) {
  // Read contract data
  const { data: seasonId } = useReadContract({
    address: csmmAddress,
    abi: SeasonCSMMAbi,
    functionName: 'seasonId',
    query: { enabled: !!csmmAddress }
  });

  const { data: totalLiquidity } = useReadContract({
    address: csmmAddress,
    abi: SeasonCSMMAbi,
    functionName: 'totalLiquidity',
    query: { enabled: !!csmmAddress }
  });

  const { data: activeMarketCount } = useReadContract({
    address: csmmAddress,
    abi: SeasonCSMMAbi,
    functionName: 'getActiveMarketCount',
    query: { enabled: !!csmmAddress }
  });

  // Write contract methods
  const { writeContract: buySharesWrite, data: buySharesHash } = useWriteContract();
  const { writeContract: sellSharesWrite, data: sellSharesHash } = useWriteContract();
  const { writeContract: claimPayoutWrite, data: claimPayoutHash } = useWriteContract();

  // Wait for transactions
  const { isLoading: isBuyingShares, isSuccess: buySharesSuccess } = useWaitForTransactionReceipt({
    hash: buySharesHash
  });

  const { isLoading: isSellingShares, isSuccess: sellSharesSuccess } = useWaitForTransactionReceipt({
    hash: sellSharesHash
  });

  const { isLoading: isClaimingPayout, isSuccess: claimPayoutSuccess } = useWaitForTransactionReceipt({
    hash: claimPayoutHash
  });

  /**
   * Get market state for a player
   * @param {string} playerAddress - Player address
   */
  const useMarketState = (playerAddress) => {
    const playerId = playerAddress ? BigInt(playerAddress) : 0n;
    
    return useReadContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'getMarketState',
      args: [playerId],
      query: { enabled: !!(csmmAddress && playerAddress) }
    });
  };

  /**
   * Get user's position in a market
   * @param {string} playerAddress - Player address
   */
  const useUserPosition = (playerAddress) => {
    const playerId = playerAddress ? BigInt(playerAddress) : 0n;
    
    return useReadContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'getUserPosition',
      args: [userAddress, playerId],
      query: { enabled: !!(csmmAddress && userAddress && playerAddress) }
    });
  };

  /**
   * Get current price for a market
   * @param {string} playerAddress - Player address
   * @param {boolean} isYes - True for YES price, false for NO price
   */
  const usePrice = (playerAddress, isYes) => {
    const playerId = playerAddress ? BigInt(playerAddress) : 0n;
    
    return useReadContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'getPrice',
      args: [playerId, isYes],
      query: { enabled: !!(csmmAddress && playerAddress) }
    });
  };

  /**
   * Calculate buy cost for shares
   * @param {string} playerAddress - Player address
   * @param {boolean} isYes - True for YES shares, false for NO shares
   * @param {string} amount - Amount in SOF (string to avoid precision issues)
   */
  const useCalcBuyCost = (playerAddress, isYes, amount) => {
    const playerId = playerAddress ? BigInt(playerAddress) : 0n;
    const amountWei = amount ? parseUnits(amount, 18) : 0n;
    
    return useReadContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'calcBuyCost',
      args: [playerId, isYes, amountWei],
      query: { enabled: !!(csmmAddress && playerAddress && amount) }
    });
  };

  /**
   * Calculate sell revenue for shares
   * @param {string} playerAddress - Player address
   * @param {boolean} isYes - True for YES shares, false for NO shares
   * @param {string} amount - Amount in SOF (string to avoid precision issues)
   */
  const useCalcSellRevenue = (playerAddress, isYes, amount) => {
    const playerId = playerAddress ? BigInt(playerAddress) : 0n;
    const amountWei = amount ? parseUnits(amount, 18) : 0n;
    
    return useReadContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'calcSellRevenue',
      args: [playerId, isYes, amountWei],
      query: { enabled: !!(csmmAddress && playerAddress && amount) }
    });
  };

  /**
   * Buy shares in a market
   * @param {string} playerAddress - Player address
   * @param {boolean} isYes - True for YES shares, false for NO shares
   * @param {string} amount - Amount in SOF
   * @param {string} maxCost - Maximum cost willing to pay (for slippage protection)
   */
  const buyShares = async (playerAddress, isYes, amount, maxCost) => {
    if (!csmmAddress || !playerAddress) return;
    
    const playerId = BigInt(playerAddress);
    const amountWei = parseUnits(amount, 18);
    const maxCostWei = parseUnits(maxCost, 18);
    
    return buySharesWrite({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'buyShares',
      args: [playerId, isYes, amountWei, maxCostWei]
    });
  };

  /**
   * Sell shares in a market
   * @param {string} playerAddress - Player address
   * @param {boolean} isYes - True for YES shares, false for NO shares
   * @param {string} amount - Amount in SOF
   * @param {string} minRevenue - Minimum revenue expected (for slippage protection)
   */
  const sellShares = async (playerAddress, isYes, amount, minRevenue) => {
    if (!csmmAddress || !playerAddress) return;
    
    const playerId = BigInt(playerAddress);
    const amountWei = parseUnits(amount, 18);
    const minRevenueWei = parseUnits(minRevenue, 18);
    
    return sellSharesWrite({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'sellShares',
      args: [playerId, isYes, amountWei, minRevenueWei]
    });
  };

  /**
   * Claim payout after market resolution
   * @param {string} playerAddress - Player address
   */
  const claimPayout = async (playerAddress) => {
    if (!csmmAddress || !playerAddress) return;
    
    const playerId = BigInt(playerAddress);
    
    return claimPayoutWrite({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'claimPayout',
      args: [playerId]
    });
  };

  /**
   * Format price from basis points to percentage
   * @param {bigint} priceBps - Price in basis points
   * @returns {string} Formatted percentage (e.g., "65.5%")
   */
  const formatPrice = (priceBps) => {
    if (!priceBps) return '0%';
    return `${(Number(priceBps) / 100).toFixed(1)}%`;
  };

  /**
   * Format amount from wei to SOF
   * @param {bigint} amountWei - Amount in wei
   * @returns {string} Formatted SOF amount
   */
  const formatAmount = (amountWei) => {
    if (!amountWei) return '0';
    return formatUnits(amountWei, 18);
  };

  return {
    // Contract data
    seasonId,
    totalLiquidity: totalLiquidity ? formatUnits(totalLiquidity, 18) : '0',
    activeMarketCount: activeMarketCount ? Number(activeMarketCount) : 0,
    
    // Read hooks
    useMarketState,
    useUserPosition,
    usePrice,
    useCalcBuyCost,
    useCalcSellRevenue,
    
    // Write methods
    buyShares,
    sellShares,
    claimPayout,
    
    // Transaction states
    isBuyingShares,
    buySharesSuccess,
    isSellingShares,
    sellSharesSuccess,
    isClaimingPayout,
    claimPayoutSuccess,
    
    // Utility functions
    formatPrice,
    formatAmount
  };
}
