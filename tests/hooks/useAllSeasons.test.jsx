// tests/hooks/useAllSeasons.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mocks
vi.mock('@/lib/wagmi', () => ({ getStoredNetworkKey: () => 'LOCAL' }))
vi.mock('@/config/contracts', () => ({
  getContractAddresses: () => ({ RAFFLE: '0x0000000000000000000000000000000000000002' }),
  RAFFLE_ABI: [],
}))

// Mock wagmi usePublicClient
const readContract = vi.fn()
vi.mock('wagmi', () => ({ usePublicClient: () => ({ readContract }) }))

// Mock useRaffleRead to provide currentSeasonId
vi.mock('@/hooks/useRaffleRead', () => ({
  useRaffleRead: () => ({ currentSeasonQuery: { isSuccess: true, data: 2 } })
}))

import { useAllSeasons } from '@/hooks/useAllSeasons'

function withClient() {
  const client = new QueryClient()
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useAllSeasons', () => {
  beforeEach(() => {
    readContract.mockReset()
  })

  it('returns normalized seasons and filters ghost/default ones', async () => {
    // Prepare three seasons: 0 ghost, 1 valid, 2 valid
    const zeroAddr = '0x0000000000000000000000000000000000000000'
    readContract
      // season 0 (ghost)
      .mockResolvedValueOnce([{ startTime: 0, endTime: 0, bondingCurve: zeroAddr }, 1, 0, 0, 0])
      // season 1 (valid)
      .mockResolvedValueOnce([{ startTime: 100, endTime: 200, bondingCurve: '0xBEEF...' }, 1, 10n, 100n, 1000n])
      // season 2 (valid)
      .mockResolvedValueOnce([{ startTime: 150, endTime: 300, bondingCurve: '0xCAFE...' }, 1, 20n, 200n, 2000n])

    const wrapper = withClient()
    const { result } = renderHook(() => useAllSeasons(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const seasons = result.current.data

    // Should include only season ids 1 and 2
    expect(seasons.map(s => s.id)).toEqual([1, 2])
    expect(seasons[0]).toMatchObject({ totalParticipants: 10n, totalTickets: 100n, totalPrizePool: 1000n })
  })

  it('returns empty when RAFFLE missing (edge)', async () => {
    vi.doMock('@/config/contracts', () => ({ getContractAddresses: () => ({ RAFFLE: '' }), RAFFLE_ABI: [] }))
    const wrapper = withClient()
    const { result } = renderHook(() => useAllSeasons(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([]))
  })
})
