# Win Odds Display Update Issue - Fix Plan

## Problem Statement

When a new user buys tickets, only the logged-in player's win odds are updated. **All players' win probabilities need to update** because the total ticket count changes, affecting everyone's odds.

**Current Behavior**: 
- User A buys tickets → Only User A's odds update
- User B's displayed odds remain stale

**Expected Behavior**:
- User A buys tickets → ALL users' odds update (A, B, C, etc.)
- InfoFi markets also reflect updated probabilities

## Root Cause Analysis

### Current Implementation

1. **useRaffleHolders.js** - Fetches holder data from `PositionUpdate` events
   - ✅ Already includes `probabilityBps` in event data
   - ✅ Aggregates latest position per player
   - ⚠️ Uses 30-second polling interval (may be too slow)

2. **HoldersTab.jsx** - Displays holders with odds
   - ✅ Uses `useCurveEvents` to invalidate on `PositionUpdate`
   - ✅ Refetches data when events occur
   - ✅ Should work correctly

3. **Issue**: The `PositionUpdate` event includes `probabilityBps` but this is **per-player** at time of event
   - When User A buys, event shows User A's new probability
   - User B's probability changed too, but no new event for User B
   - **Need to recalculate ALL probabilities when total tickets change**

## Solution Design

### Option 1: Recalculate Client-Side (Recommended)

When `totalTickets` changes, recalculate all probabilities:

```javascript
// In useRaffleHolders.js
const holdersWithUpdatedOdds = holders.map(holder => ({
  ...holder,
  winProbabilityBps: (Number(holder.ticketCount) * 10000) / Number(totalTickets)
}));
```

**Pros**:
- No contract changes needed
- Instant updates
- Works with existing event system

**Cons**:
- Slight calculation overhead
- Must ensure totalTickets is always current

### Option 2: Enhanced Event Listening

Listen for ALL `PositionUpdate` events and recalculate:

```javascript
// When ANY PositionUpdate occurs:
1. Get latest totalTickets from event
2. Recalculate all holder probabilities
3. Update UI
```

### Option 3: Contract Enhancement (Future)

Emit batch update event with all probabilities:

```solidity
event AllProbabilitiesUpdated(
    uint256 indexed seasonId,
    uint256 totalTickets,
    address[] players,
    uint256[] probabilities
);
```

## Implementation Plan

### Step 1: Fix useRaffleHolders.js

Add real-time probability recalculation:

```javascript
// After aggregating positions
const latestTotalTickets = /* get from most recent event */;

const holdersWithCurrentOdds = holders.map(holder => ({
  ...holder,
  winProbabilityBps: holder.ticketCount > 0n 
    ? (Number(holder.ticketCount) * 10000) / Number(latestTotalTickets)
    : 0
}));
```

### Step 2: Ensure Real-Time Updates

Update polling/refetch strategy:

```javascript
// Reduce staleTime for more frequent updates
staleTime: 10000, // 10 seconds instead of 30
refetchInterval: 10000,

// Or use WebSocket/SSE for instant updates
```

### Step 3: Update InfoFi Markets

Ensure InfoFi markets also recalculate when odds change:

```javascript
// In useInfoFiMarket.js or similar
useEffect(() => {
  if (totalTicketsChanged) {
    // Recalculate market probabilities
    // Update hybrid pricing
  }
}, [totalTickets]);
```

### Step 4: Add Visual Feedback

Show when odds are updating:

```jsx
{isRefetching && (
  <Badge variant="outline">Updating odds...</Badge>
)}
```

## Files to Modify

1. **src/hooks/useRaffleHolders.js**
   - Add probability recalculation logic
   - Ensure totalTickets is always current
   - Reduce polling interval

2. **src/components/curve/HoldersTab.jsx**
   - Already has event invalidation ✅
   - May need visual feedback for updates

3. **src/hooks/useInfoFiMarket.js**
   - Sync with raffle probability updates
   - Recalculate hybrid pricing

4. **src/hooks/usePricingStream.js**
   - Ensure SSE updates include all player odds
   - Broadcast probability changes

## Testing Checklist

- [ ] User A buys tickets → User B sees updated odds
- [ ] Multiple users buy → All odds update correctly
- [ ] InfoFi markets reflect new probabilities
- [ ] Odds sum to 100% (10000 bps)
- [ ] Real-time updates work without refresh
- [ ] Performance acceptable with many holders

## Quick Fix (Immediate)

```javascript
// In useRaffleHolders.js, after line 105:
const currentTotalTickets = sortedHolders[0]?.totalTicketsAtTime || 0n;

const holdersWithLiveOdds = sortedHolders.map((holder, index) => ({
  ...holder,
  rank: index + 1,
  // Recalculate probability based on current total
  winProbabilityBps: currentTotalTickets > 0n
    ? Math.floor((Number(holder.ticketCount) * 10000) / Number(currentTotalTickets))
    : 0
}));

return holdersWithLiveOdds;
```

This ensures all displayed probabilities are calculated from the same `totalTickets` value, so they update together.
