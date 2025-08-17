// Testable helper to normalize incoming SSE payload keys to *Bps fields
export function normalizePricingMessage(msg) {
  if (!msg || typeof msg !== 'object') return { hybridPriceBps: undefined, raffleProbabilityBps: undefined, marketSentimentBps: undefined };
  const hybrid = typeof msg.hybridPriceBps === 'number'
    ? msg.hybridPriceBps
    : (typeof msg.hybridPrice === 'number' ? msg.hybridPrice : undefined);
  const raffle = typeof msg.raffleProbabilityBps === 'number'
    ? msg.raffleProbabilityBps
    : (typeof msg.raffleProbability === 'number' ? msg.raffleProbability : undefined);
  const sentiment = typeof msg.marketSentimentBps === 'number'
    ? msg.marketSentimentBps
    : (typeof msg.marketSentiment === 'number' ? msg.marketSentiment : undefined);
  return {
    hybridPriceBps: hybrid,
    raffleProbabilityBps: raffle,
    marketSentimentBps: sentiment,
  };
}

// src/hooks/usePricingStream.js
import { useCallback, useMemo, useState } from 'react';
import { isValidMarketId } from '@/lib/marketId';
import { useSSE } from './useSSE';

/**
 * usePricingStream
 * Subscribes to hybrid pricing SSE for a given InfoFi market.
 * Returns live bps fields and connection status.
 *
 * @param {string|number|null} marketId
 * @returns {{
 *   data: {
 *     marketId: string|number|null,
 *     hybridPriceBps: number|null,
 *     raffleProbabilityBps: number|null,
 *     marketSentimentBps: number|null,
 *     lastUpdated: string|null,
 *   },
 *   isConnected: boolean,
 *   error: any,
 *   reconnect: () => void,
 * }}
 */
export const usePricingStream = (marketId) => {
  const [state, setState] = useState({
    marketId: marketId ?? null,
    hybridPriceBps: null,
    raffleProbabilityBps: null,
    marketSentimentBps: null,
    lastUpdated: null,
  });

  const onMessage = useCallback((msg) => {
    if (!msg) return;
    if (msg.type === 'heartbeat') return;

    // Accept both initial and update events
    if (
      msg.type === 'initial_price' ||
      msg.type === 'raffle_probability_update' ||
      msg.type === 'market_sentiment_update'
    ) {
      // Normalize keys: support either *Bps fields or raw names
      const { hybridPriceBps: hybrid, raffleProbabilityBps: raffle, marketSentimentBps: sentiment } = normalizePricingMessage(msg);

      setState((prev) => ({
        marketId: msg.marketId ?? prev.marketId ?? marketId ?? null,
        hybridPriceBps: typeof hybrid === 'number' ? hybrid : prev.hybridPriceBps,
        raffleProbabilityBps: typeof raffle === 'number' ? raffle : prev.raffleProbabilityBps,
        marketSentimentBps: typeof sentiment === 'number' ? sentiment : prev.marketSentimentBps,
        lastUpdated: msg.timestamp ?? prev.lastUpdated,
      }));
    }
  }, [marketId]);

  const url = useMemo(() => {
    if (!marketId && marketId !== 0) return null;
    if (!isValidMarketId(String(marketId))) return null;
    return `/api/pricing/stream/pricing/${marketId}`;
  }, [marketId]);

  const { isConnected, error, reconnect } = useSSE(url, onMessage, {
    withCredentials: false,
    maxRetries: 6,
    retryInterval: 2000,
    heartbeatInterval: 30000,
  });

  return {
    data: state,
    isConnected,
    error,
    reconnect,
  };
};
