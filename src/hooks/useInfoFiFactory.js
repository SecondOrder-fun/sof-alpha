import { useReadContract } from 'wagmi';
import InfoFiMarketFactoryAbi from '@/contracts/abis/InfoFiMarketFactory.json';

/**
 * Hook to interact with InfoFiMarketFactory contract
 * @param {string} factoryAddress - Address of the InfoFiMarketFactory contract
 * @returns {object} Factory contract interaction methods and data
 */
export function useInfoFiFactory(factoryAddress) {
  /**
   * Get SeasonCSMM address for a season
   * @param {number} seasonId - Season ID
   */
  const useSeasonCSMM = (seasonId) => {
    return useReadContract({
      address: factoryAddress,
      abi: InfoFiMarketFactoryAbi,
      functionName: 'getSeasonCSMM',
      args: [BigInt(seasonId)],
      query: { enabled: !!(factoryAddress && seasonId) }
    });
  };

  /**
   * Check if a player has a market
   * @param {number} seasonId - Season ID
   * @param {string} playerAddress - Player address
   */
  const useHasWinnerMarket = (seasonId, playerAddress) => {
    return useReadContract({
      address: factoryAddress,
      abi: InfoFiMarketFactoryAbi,
      functionName: 'hasWinnerMarket',
      args: [BigInt(seasonId), playerAddress],
      query: { enabled: !!(factoryAddress && seasonId && playerAddress) }
    });
  };

  /**
   * Get all players with markets in a season
   * @param {number} seasonId - Season ID
   */
  const useSeasonPlayers = (seasonId) => {
    return useReadContract({
      address: factoryAddress,
      abi: InfoFiMarketFactoryAbi,
      functionName: 'getSeasonPlayers',
      args: [BigInt(seasonId)],
      query: { enabled: !!(factoryAddress && seasonId) }
    });
  };

  /**
   * Get market count for a season
   * @param {number} seasonId - Season ID
   */
  const useMarketCount = (seasonId) => {
    return useReadContract({
      address: factoryAddress,
      abi: InfoFiMarketFactoryAbi,
      functionName: 'getMarketCount',
      args: [BigInt(seasonId)],
      query: { enabled: !!(factoryAddress && seasonId) }
    });
  };

  /**
   * Get liquidity per season setting
   */
  const { data: liquidityPerSeason } = useReadContract({
    address: factoryAddress,
    abi: InfoFiMarketFactoryAbi,
    functionName: 'liquidityPerSeason',
    query: { enabled: !!factoryAddress }
  });

  return {
    // Read hooks
    useSeasonCSMM,
    useHasWinnerMarket,
    useSeasonPlayers,
    useMarketCount,
    
    // Contract data
    liquidityPerSeason
  };
}
