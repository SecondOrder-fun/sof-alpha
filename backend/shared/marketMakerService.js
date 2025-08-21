// backend/shared/marketMakerService.js
// Simple Onit-style house market-maker with in-memory fallback
// Anchor quotes to hybrid price (bps) from pricingService, apply spread and inventory skew

import { pricingService } from './pricingService.js';
import { db, hasSupabase } from './supabaseClient.js';

// In-memory stores (used if Supabase tables are missing/unavailable)
const memory = {
  inventory: new Map(), // key: `${marketId}:${side}` => { net: number }
  trades: [], // { marketId, user, side, amount, priceBps, feeBps, ts }
  positions: new Map(), // key: `${marketId}:${user}:${side}` => { amount, avgPriceBps }
};

// Config
const DEFAULT_SPREAD_BPS = 100; // 1% total spread around mid
const MAX_SKEW_ADJ_BPS = 50; // up to 0.5% inventory skew adjustment
const FEE_BPS = 10; // 0.10% fee on notional

function invKey(marketId, side) { return `${marketId}:${side.toUpperCase()}`; }
function posKey(marketId, user, side) { return `${marketId}:${(user || '').toLowerCase()}:${side.toUpperCase()}`; }

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function getAnchorBpsFromCache(marketId) {
  const cached = pricingService.getCachedPricing(marketId);
  if (cached && typeof cached.hybrid_price_bps === 'number') {
    return cached.hybrid_price_bps;
  }
  if (cached && typeof cached.hybridPriceBps === 'number') {
    return cached.hybridPriceBps;
  }
  // fallback compute if parts exist
  const rp = cached?.raffle_probability_bps ?? cached?.raffleProbabilityBps;
  const ms = cached?.market_sentiment_bps ?? cached?.marketSentimentBps;
  const rw = cached?.raffle_weight_bps ?? cached?.raffleWeightBps ?? 7000;
  const mw = cached?.market_weight_bps ?? cached?.marketWeightBps ?? 3000;
  if (typeof rp === 'number' && typeof ms === 'number') {
    return Math.round((rw * rp + mw * ms) / 10000);
  }
  return null;
}

async function getAnchorBps(marketId) {
  const val = getAnchorBpsFromCache(marketId);
  if (typeof val === 'number') return val;
  try {
    const snapshot = await db.getMarketPricingCache(marketId);
    if (snapshot?.hybrid_price_bps != null) return snapshot.hybrid_price_bps;
    const rp = snapshot?.raffle_probability_bps;
    const ms = snapshot?.market_sentiment_bps;
    const rw = snapshot?.raffle_weight_bps ?? 7000;
    const mw = snapshot?.market_weight_bps ?? 3000;
    if (typeof rp === 'number' && typeof ms === 'number') {
      return Math.round((rw * rp + mw * ms) / 10000);
    }
  } catch (err) {
    // Reason: fall back to neutral anchor if DB snapshot is unavailable (e.g., local dev without Supabase)
    // Log once per call path to aid debugging without crashing the maker
    console.warn('[marketMakerService] getAnchorBps fallback to neutral (could not load cache):', err?.message || err);
  }
  return 5000; // neutral 50%
}

function getInventory(marketId, side) {
  const k = invKey(marketId, side);
  return memory.inventory.get(k) || { net: 0 };
}

function setInventory(marketId, side, inv) {
  memory.inventory.set(invKey(marketId, side), inv);
}

function applySkew(anchorBps, marketId, side) {
  const inv = getInventory(marketId, side);
  // Simple linear skew: more net sold on a side widens/worsens price up to MAX_SKEW_ADJ_BPS
  const skew = clamp(Math.round(inv.net / 1000), -MAX_SKEW_ADJ_BPS, MAX_SKEW_ADJ_BPS); // 1 unit per 1000 notional
  return clamp(anchorBps + (side.toUpperCase() === 'YES' ? skew : -skew), 1, 9999);
}

export const marketMakerService = {
  /**
   * Quote a buy/sell for a given side and amount.
   * side: 'yes' | 'no'
   * amount: number (notional in token units, off-chain accounting)
   */
  async quote(marketId, side, amount) {
    const anchor = await getAnchorBps(Number(marketId));
    const mid = clamp(Math.round(anchor), 1, 9999);
    const half = Math.floor(DEFAULT_SPREAD_BPS / 2);

    // Apply inventory skew per side
    const skewed = applySkew(mid, marketId, side);

    // For YES: bid = skewed - half, ask = skewed + half
    // For NO: invert around 10000
    let bid, ask;
    if (side.toUpperCase() === 'YES') {
      bid = clamp(skewed - half, 1, 9998);
      ask = clamp(skewed + half, 2, 9999);
    } else {
      const yesBid = clamp(skewed - half, 1, 9998);
      const yesAsk = clamp(skewed + half, 2, 9999);
      // NO price in bps is (1 - YES price)
      ask = clamp(10000 - yesBid, 2, 9999); // buying NO at best offer
      bid = clamp(10000 - yesAsk, 1, 9998); // selling NO at best bid
    }

    const feeBps = FEE_BPS;
    const priceBps = ask; // quote to buy from maker at ask (sell would use bid)
    const notional = Math.max(0, Number(amount || 0));
    const fee = Math.round((notional * feeBps) / 10000);

    return { anchorBps: mid, bidBps: bid, askBps: ask, priceBps, feeBps, notional, fee };
  },

  /**
   * Execute a buy (open/increase) position. Returns execution details.
   */
  async buy(marketId, side, amount, user) {
    const q = await this.quote(marketId, side, amount);
    const priceBps = q.priceBps;
    const feeBps = q.feeBps;

    // Update memory trades and positions
    memory.trades.push({ marketId: Number(marketId), user, side: side.toUpperCase(), amount: Number(amount), priceBps, feeBps, ts: Date.now() });

    const key = posKey(marketId, user, side);
    const cur = memory.positions.get(key) || { amount: 0, avgPriceBps: 0 };
    const newAmt = cur.amount + Number(amount);
    const newAvg = newAmt > 0 ? Math.round((cur.avgPriceBps * cur.amount + priceBps * Number(amount)) / newAmt) : priceBps;
    memory.positions.set(key, { amount: newAmt, avgPriceBps: newAvg });

    // Update simple inventory (maker is short what users buy)
    const inv = getInventory(marketId, side);
    inv.net -= Number(amount);
    setInventory(marketId, side, inv);

    // Persist basic position row for UI using existing table (no price column stored to avoid schema error)
    try {
      if (hasSupabase) {
        await db.createInfoFiPosition({
          market_id: Number(marketId),
          user_address: user,
          outcome: String(side).toUpperCase() === 'YES' ? 'YES' : 'NO',
          amount: String(amount),
        });
      }
    } catch (err) {
      // Reason: DB might be missing locally; we still maintain in-memory state for UX
      console.warn('[marketMakerService] createInfoFiPosition failed (continuing with memory state):', err?.message || err);
    }

    return { executedPriceBps: priceBps, feeBps, amount: Number(amount) };
  },

  /**
   * Execute a sell (reduce/close) position. Returns execution details.
   */
  async sell(marketId, side, amount, user) {
    const q = await this.quote(marketId, side, amount);
    const priceBps = q.bidBps; // selling to maker at bid
    const feeBps = q.feeBps;

    const key = posKey(marketId, user, side);
    const cur = memory.positions.get(key) || { amount: 0, avgPriceBps: 0 };
    const amt = Math.min(Number(amount), cur.amount);
    if (amt <= 0) {
      return { error: 'INSUFFICIENT_POSITION' };
    }

    // Record trade
    memory.trades.push({ marketId: Number(marketId), user, side: side.toUpperCase(), amount: -amt, priceBps, feeBps, ts: Date.now() });

    // Update position
    const remaining = cur.amount - amt;
    if (remaining === 0) memory.positions.delete(key); else memory.positions.set(key, { amount: remaining, avgPriceBps: cur.avgPriceBps });

    // Update inventory (maker buys back what user sells)
    const inv = getInventory(marketId, side);
    inv.net += amt;
    setInventory(marketId, side, inv);

    // Persist a negative trade as position (optional): skip to avoid confusing UI
    try {
      if (hasSupabase) {
        await db.createInfoFiPosition({
          market_id: Number(marketId),
          user_address: user,
          outcome: String(side).toUpperCase() === 'YES' ? 'YES' : 'NO',
          amount: String(-amt),
        });
      }
    } catch (err) {
      // Reason: DB might be missing locally; we still maintain in-memory state for UX
      console.warn('[marketMakerService] createInfoFiPosition (sell) failed (continuing with memory state):', err?.message || err);
    }

    return { executedPriceBps: priceBps, feeBps, amount: -amt };
  },

  /** Get aggregated in-memory positions for a user (used only as fallback/debug). */
  getUserPositions(user) {
    const out = [];
    for (const [k, v] of memory.positions.entries()) {
      if (k.includes(`:${(user || '').toLowerCase()}:`)) {
        const [marketId, , side] = k.split(':');
        out.push({ marketId: Number(marketId), side, amount: v.amount, avgPriceBps: v.avgPriceBps });
      }
    }
    return out;
  },
};
