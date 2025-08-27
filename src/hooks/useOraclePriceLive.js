// src/hooks/useOraclePriceLive.js
// Read InfoFi oracle price on-chain and subscribe to PriceUpdated events (no backend)
import { useEffect, useMemo, useState } from 'react'
import { readOraclePrice, subscribeOraclePriceUpdated } from '@/services/onchainInfoFi'

/**
 * useOraclePriceLive
 * @param {string} marketId bytes32 id (0x...)
 * @param {string} networkKey 'LOCAL' | 'TESTNET'
 */
export function useOraclePriceLive(marketId, networkKey = 'LOCAL') {
  const id = useMemo(() => (marketId ? String(marketId) : null), [marketId])
  const [state, setState] = useState({
    hybridPriceBps: null,
    raffleProbabilityBps: null,
    marketSentimentBps: null,
    lastUpdated: null,
    active: false,
  })
  const [live, setLive] = useState(false)

  // Initial fetch and on-change refetch
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      try {
        const p = await readOraclePrice({ marketId: id, networkKey })
        if (cancelled) return
        setState({
          hybridPriceBps: p.hybridPriceBps,
          raffleProbabilityBps: p.raffleProbabilityBps,
          marketSentimentBps: p.marketSentimentBps,
          lastUpdated: Number(p.lastUpdate || 0) * 1000,
          active: Boolean(p.active),
        })
      } catch (_) {
        if (!cancelled) {
          setState((s) => ({ ...s, active: false }))
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, networkKey])

  // Subscribe to on-chain PriceUpdated via WS when available
  useEffect(() => {
    if (!id) return () => {}
    const unsub = subscribeOraclePriceUpdated({ networkKey, onEvent: (log) => {
      try {
        const { marketId: evId, raffleBps, marketBps, hybridBps, timestamp } = log?.args || {}
        if (!evId) return
        // Only update if this event matches our market id
        if (String(evId).toLowerCase() !== String(id).toLowerCase()) return
        setState({
          hybridPriceBps: Number(hybridBps),
          raffleProbabilityBps: Number(raffleBps),
          marketSentimentBps: Number(marketBps),
          lastUpdated: Number(timestamp || Date.now()),
          active: true,
        })
        setLive(true)
      } catch (_) { /* ignore malformed log */ }
    }})
    return () => { setLive(false); unsub?.() }
  }, [id, networkKey])

  return { data: state, isLive: live }
}
