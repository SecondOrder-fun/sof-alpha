// tests/hooks/useRaffleRead.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock network and contracts to avoid env dependencies
vi.mock('@/config/networks', () => ({
  getNetworkByKey: () => ({ id: 31337, name: 'Local Anvil', rpcUrl: 'http://127.0.0.1:8545' }),
  getDefaultNetworkKey: () => 'LOCAL',
}))
vi.mock('@/config/contracts', () => ({
  getContractAddresses: () => ({ RAFFLE: '0x0000000000000000000000000000000000000001' }),
  RAFFLE_ABI: [],
}))

// Mock viem public client
const readContract = vi.fn()
const mockClient = { readContract }
vi.mock('viem', async (importOriginal) => {
  const orig = await importOriginal()
  return {
    ...orig,
    createPublicClient: () => mockClient,
    http: vi.fn(() => ({})),
  }
})

import { useRaffleRead, useSeasonDetailsQuery } from '@/hooks/useRaffleRead'

function withClient() {
  const client = new QueryClient()
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useRaffleRead', () => {
  beforeEach(() => {
    readContract.mockReset()
  })

  it('fetches currentSeasonId successfully', async () => {
    readContract.mockResolvedValueOnce(3n)
    const wrapper = withClient()
    const { result } = renderHook(() => useRaffleRead(), { wrapper })
    await waitFor(() => expect(result.current.currentSeasonQuery.isSuccess).toBe(true))
    expect(result.current.currentSeasonQuery.data).toBe(3)
  })

  it('returns NaN when RAFFLE address missing (edge)', async () => {
    // Override contracts mock for this test
    vi.doMock('@/config/contracts', () => ({ getContractAddresses: () => ({ RAFFLE: '' }), RAFFLE_ABI: [] }))
    const wrapper = withClient()
    const { result } = renderHook(() => useRaffleRead(), { wrapper })
    await waitFor(() => expect(Number.isNaN(result.current.currentSeasonQuery.data)).toBe(true))
  })
})

describe('useSeasonDetailsQuery', () => {
  beforeEach(() => {
    readContract.mockReset()
  })

  it('reads season details for provided seasonId', async () => {
    readContract.mockResolvedValueOnce(['cfg', 1, 2, 3, 4])
    const wrapper = withClient()
    const { result } = renderHook(() => useSeasonDetailsQuery(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['cfg', 1, 2, 3, 4])
  })

  it('disabled when seasonId null (edge)', async () => {
    const wrapper = withClient()
    const { result } = renderHook(() => useSeasonDetailsQuery(null), { wrapper })
    expect(result.current.status).toBe('pending')
  })
})
