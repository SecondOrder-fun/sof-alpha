// src/hooks/useInfoFiMarkets.js
// React Query hook for fetching InfoFi markets list
import { useQuery } from '@tanstack/react-query'

/**
 * Fetch markets from backend
 * @returns {Promise<any>} parsed JSON
 */
async function fetchMarkets() {
  const res = await fetch('/api/infofi/markets')
  if (!res.ok) throw new Error(`Failed to fetch markets (${res.status})`)
  const data = await res.json()
  return data?.markets || []
}

/**
 * useInfoFiMarkets
 * Wraps React Query to provide markets list with caching and refetching.
 */
export function useInfoFiMarkets() {
  const query = useQuery({
    queryKey: ['infofi', 'markets'],
    queryFn: fetchMarkets,
    staleTime: 30_000,
    refetchInterval: 10_000,
  })
  return {
    markets: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
