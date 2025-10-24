# InfoFi Market Creation Fix - Array Index Bug

## Problem Summary

InfoFi markets were not being created when users bought tickets because the backend was listening to the **wrong contract address** for `PositionUpdate` events.

## Root Cause

**File**: `backend/src/services/seasonListener.js`
**Line**: 140 (now 141)

The code was reading the wrong index from the `SeasonConfig` tuple:

```javascript
// WRONG - This gets raffleToken, not bondingCurve
const bondingCurveAddr = season[5];
```

### SeasonConfig Struct Layout

From `contracts/src/lib/RaffleTypes.sol`:

```solidity
struct SeasonConfig {
    string name;              // Index 0
    uint256 startTime;        // Index 1
    uint256 endTime;          // Index 2
    uint16 winnerCount;       // Index 3
    uint16 grandPrizeBps;     // Index 4
    address raffleToken;      // Index 5 ← Backend was reading this
    address bondingCurve;     // Index 6 ← Should have been reading this
    bool isActive;            // Index 7
    bool isCompleted;         // Index 8
}
```

## Impact

- Backend was listening to raffleToken address: `0x94099942864ea81ccf197e9d71ac53310b1468d8`
- Actual bonding curve address: `0x06b1d212b8da92b83af328de5eef4e211da02097`
- When users bought tickets through bonding curve, events were emitted from `0x06b1...02097`
- Backend never saw these events because it was watching `0x9409...68d8`
- Result: No InfoFi markets were created despite threshold crossings

## Evidence

Transaction `0x31074fb38255814a5f949721ab1c5d8142487f960d8e65ccd2e2d28cdaaf2808`:

- Called `buyTokens()` on bonding curve at `0x06b1d212b8da92b83af328de5eef4e211da02097`
- Emitted `PositionUpdate` event from bonding curve (log index 3)
- Event data: seasonId=1, player=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, newTickets=2000, probabilityBps=10000
- Backend missed this event because it was listening to wrong address

## Fix Applied

**File**: `backend/src/services/seasonListener.js`

```javascript
// BEFORE (WRONG)
const bondingCurveAddr = season[5];

// AFTER (CORRECT)
const bondingCurveAddr = season[6];
```

Added comment for clarity:

```javascript
// Extract bonding curve address (index 6 in the tuple)
// SeasonConfig struct: name, startTime, endTime, winnerCount, grandPrizeBps, raffleToken, bondingCurve, isActive, isCompleted
const bondingCurveAddr = season[6];
```

## Testing Instructions

1. **Restart the backend**:

   ```bash
   npm run dev:backend
   ```

2. **Verify correct discovery** in logs:

   ```text
   [seasonListener] Discovered season 1 with bonding curve at 0x06b1d212b8da92b83af328de5eef4e211da02097
   ```

3. **Check if historical event is processed**:
   - Backend should scan historical `PositionUpdate` events
   - Should find the 2000 ticket purchase
   - Should create InfoFi market in database

4. **Verify market creation**:
   ```bash
   curl http://localhost:3000/api/infofi/markets?seasonId=1
   ```
   Should return at least one market for player `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`

5. **Test real-time event capture**:
   - Buy more tickets (crossing another threshold if needed)
   - Verify market is created immediately
   - Check backend logs for `[bondingCurveListener] 🎯 Threshold crossed`

## Related Files

- `backend/src/services/seasonListener.js` - Fixed file
- `backend/src/services/bondingCurveListener.js` - Event listener implementation
- `contracts/src/lib/RaffleTypes.sol` - Struct definition
- `contracts/src/core/Raffle.sol` - Season storage

## Prevention

To prevent similar issues in the future:

1. **Use named destructuring** instead of array indices when possible
2. **Add TypeScript types** for contract return values
3. **Add integration tests** that verify correct contract addresses are being monitored
4. **Document struct layouts** in backend code when accessing tuple indices

## Status

✅ **FIXED** - Ready for testing
⏳ **PENDING** - Backend restart and validation required
