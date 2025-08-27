// tests/hooks/useHybridPriceLive.test.jsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/hooks/useInfoFiSocket', () => ({
  useInfoFiSocket: vi.fn(),
}))

vi.mock('@/hooks/usePricingStream', () => ({
  usePricingStream: vi.fn().mockReturnValue({
    data: {
      marketId: 1,
      hybridPriceBps: 1200,
      raffleProbabilityBps: 3000,
      marketSentimentBps: 4000,
      lastUpdated: 'sse',
    },
    isConnected: true,
  }),
  normalizePricingMessage: (msg) => {
    // minimal passthrough used by the hook
    const p = msg?.pricing || msg || {}
    return {
      hybridPriceBps: p.hybrid_price_bps ?? p.hybridPriceBps ?? p.hybridPrice,
      raffleProbabilityBps: p.raffle_probability_bps ?? p.raffleProbabilityBps ?? p.raffleProbability,
      marketSentimentBps: p.market_sentiment_bps ?? p.marketSentimentBps ?? p.marketSentiment,
      lastUpdated: p.last_updated ?? msg?.timestamp,
    }
  },
}))

const { useInfoFiSocket } = await import('@/hooks/useInfoFiSocket')
const { usePricingStream } = await import('@/hooks/usePricingStream')

// Component to surface hook return for assertions
function HookProbe({ marketId, useHook }) {
  const { data, isLive, source } = useHook(marketId)
  return (
    <div>
      <div data-testid="source">{source}</div>
      <div data-testid="isLive">{String(isLive)}</div>
      <div data-testid="hybrid">{String(data.hybridPriceBps)}</div>
      <div data-testid="raffle">{String(data.raffleProbabilityBps)}</div>
      <div data-testid="sentiment">{String(data.marketSentimentBps)}</div>
      <div data-testid="updated">{String(data.lastUpdated)}</div>
    </div>
  )
}

describe('useHybridPriceLive', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('prefers WS payload when WS is open', async () => {
    const wsPayload = {
      market_id: 1,
      hybrid_price_bps: 5555,
      raffle_probability_bps: 2222,
      market_sentiment_bps: 3333,
      last_updated: 'ws',
    }

    useInfoFiSocket.mockReturnValue({
      status: 'open',
      getMarketUpdate: () => wsPayload,
      getRaffleUpdate: () => null,
    })

    const { useHybridPriceLive } = await import('@/hooks/useHybridPriceLive')

    render(<HookProbe marketId={1} useHook={useHybridPriceLive} />)

    expect(screen.getByTestId('source').textContent).toBe('ws')
    expect(screen.getByTestId('hybrid').textContent).toBe('5555')
    expect(screen.getByTestId('raffle').textContent).toBe('2222')
    expect(screen.getByTestId('sentiment').textContent).toBe('3333')
    expect(screen.getByTestId('updated').textContent).toBe('ws')
  })

  it('falls back to SSE when WS is not open', async () => {
    useInfoFiSocket.mockReturnValue({
      status: 'closed',
      getMarketUpdate: () => null,
      getRaffleUpdate: () => null,
    })

    usePricingStream.mockReturnValue({
      data: {
        marketId: 2,
        hybridPriceBps: 1200,
        raffleProbabilityBps: 3000,
        marketSentimentBps: 4000,
        lastUpdated: 'sse',
      },
      isConnected: true,
    })

    const { useHybridPriceLive } = await import('@/hooks/useHybridPriceLive')

    render(<HookProbe marketId={2} useHook={useHybridPriceLive} />)

    expect(screen.getByTestId('source').textContent).toBe('sse')
    expect(screen.getByTestId('hybrid').textContent).toBe('1200')
    expect(screen.getByTestId('raffle').textContent).toBe('3000')
    expect(screen.getByTestId('sentiment').textContent).toBe('4000')
    expect(screen.getByTestId('updated').textContent).toBe('sse')
  })
})
