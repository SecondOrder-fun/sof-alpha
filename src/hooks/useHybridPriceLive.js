// src/hooks/useHybridPriceLive.js
// Combines WebSocket MARKET_UPDATE feed with SSE fallback for a given marketId
import { useEffect, useMemo, useState } from 'react';
import { useInfoFiSocket } from './useInfoFiSocket';
import { usePricingStream, normalizePricingMessage } from './usePricingStream';

/**
 * useHybridPriceLive
 * - Uses WS MARKET_UPDATE when available
 * - Falls back to SSE pricing stream when WS not live
 */
export function useHybridPriceLive(marketId) {
  const { status, getMarketUpdate } = useInfoFiSocket();
  const wsLive = status === 'open';
  const sse = usePricingStream(marketId);
  const [data, setData] = useState({
    marketId: marketId ?? null,
    hybridPriceBps: null,
    raffleProbabilityBps: null,
    marketSentimentBps: null,
    lastUpdated: null,
  });

  // Prefer WS payload when available; otherwise take SSE state
  useEffect(() => {
    if (wsLive) {
      const upd = getMarketUpdate(marketId);
      if (upd) {
        const normalized = normalizePricingMessage({
          pricing: {
            hybrid_price_bps: upd.hybrid_price_bps ?? upd.hybridPriceBps,
            raffle_probability_bps: upd.raffle_probability_bps ?? upd.raffleProbabilityBps,
            market_sentiment_bps: upd.market_sentiment_bps ?? upd.marketSentimentBps,
            last_updated: upd.last_updated ?? upd.lastUpdated,
          },
        });
        setData((prev) => ({
          marketId: marketId ?? prev.marketId,
          hybridPriceBps: normalized.hybridPriceBps ?? prev.hybridPriceBps,
          raffleProbabilityBps: normalized.raffleProbabilityBps ?? prev.raffleProbabilityBps,
          marketSentimentBps: normalized.marketSentimentBps ?? prev.marketSentimentBps,
          lastUpdated: normalized.lastUpdated ?? prev.lastUpdated,
        }));
        return; // do not apply SSE in same tick
      }
    }
    // Fallback to SSE state
    setData(sse.data);
  }, [wsLive, marketId, getMarketUpdate, sse.data]);

  const isLive = useMemo(() => wsLive || sse.isConnected, [wsLive, sse.isConnected]);

  return { data, isLive, source: wsLive ? 'ws' : 'sse' };
}
