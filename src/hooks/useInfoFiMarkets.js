// src/hooks/useInfoFiMarkets.js
// React Query hook for fetching InfoFi markets list directly from blockchain
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { listSeasonWinnerMarkets, enumerateAllMarkets } from '@/services/onchainInfoFi'
import { getStoredNetworkKey } from '@/lib/wagmi'

/**
 * Fetch markets directly from blockchain for all active seasons
 * @param {Array} seasons - Array of season objects with id property
 * @returns {Promise<Object>} markets grouped by seasonId
 */
async function fetchMarketsOnchain(seasons) {
  const networkKey = getStoredNetworkKey()
  const marketsBySeason = {}
  
  // If no seasons provided, try to enumerate all markets as fallback
  if (!seasons || seasons.length === 0) {
    try {
      const allMarkets = await enumerateAllMarkets({ networkKey })
      // Group by seasonId
      for (const market of allMarkets) {
        const seasonId = String(market.seasonId || market.raffle_id || '0')
        if (!marketsBySeason[seasonId]) {
          marketsBySeason[seasonId] = []
        }
        marketsBySeason[seasonId].push(market)
      }
      return marketsBySeason
    } catch (_error) {
      // Failed to enumerate markets, return empty object
      return {}
    }
  }
  
  // Fetch markets for each season
  for (const season of seasons) {
    const seasonId = String(season.id || season.seasonId || '0')
    try {
      const markets = await listSeasonWinnerMarkets({ 
        seasonId, 
        networkKey 
      })
      if (markets && markets.length > 0) {
        marketsBySeason[seasonId] = markets
      }
    } catch (_error) {
      // Failed to fetch markets for this season, continue with others
    }
  }
  
  return marketsBySeason
}

/**
 * useInfoFiMarkets
 * Wraps React Query to provide markets list with caching and refetching.
 * Now queries directly from blockchain instead of backend API.
 * 
 * @param {Array} seasons - Optional array of seasons to fetch markets for
 */
export function useInfoFiMarkets(seasons = []) {
  const query = useQuery({
    queryKey: ['infofi', 'markets', 'onchain', seasons.map(s => s.id).join(',')],
    queryFn: () => fetchMarketsOnchain(seasons),
    staleTime: 10_000,
    refetchInterval: 10_000,
    enabled: true, // Always enabled, will use fallback if no seasons
  })

  // Convert grouped markets object to flat array for backward compatibility
  const marketsArray = React.useMemo(() => {
    if (!query.data || typeof query.data !== 'object') return []
    return Object.values(query.data).flat()
  }, [query.data])

  return {
    markets: query.data || {}, // Keep grouped format for components that need it
    marketsArray, // Flat array for backward compatibility
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
