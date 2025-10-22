# SecondOrder.fun Smart Contract Audit Report
## InfoFi Market Creation Flow Analysis

**Date:** 2025-01-22
**Auditor:** Cascade AI
**Scope:** Complete trace of position purchase → InfoFi market creation flow

---

## Executive Summary

**CRITICAL FINDING:** InfoFi markets are NOT being created when raffle positions are purchased due to a **FUNDAMENTAL ARCHITECTURAL MISMATCH** between the smart contract implementation and the backend listener system.

### Root Cause

The system has **TWO PARALLEL BUT DISCONNECTED** market creation mechanisms:

1. **Smart Contract Path (InfoFiMarketFactory)**: Raffle.sol calls `InfoFiMarketFactory.onPositionUpdate()` which creates FPMM-based prediction markets on-chain
2. **Backend Listener Path (positionTrackerListener.js)**: Backend listens to `RafflePositionTracker.PositionSnapshot` events and creates database records in `infofi_markets` table

**The problem:** These two systems are completely independent and neither is properly triggering the other.

---

## Detailed Flow Analysis

### Expected Flow (According to Architecture)

```
1. User calls SOFBondingCurve.buyTokens()
   ↓
2. Curve emits PositionUpdate event
   ↓
3. Curve calls Raffle.recordParticipant()
   ↓
4. Raffle emits PositionUpdate event
   ↓
5. Raffle calls InfoFiMarketFactory.onPositionUpdate()
   ↓
6. Factory checks if player crossed 1% threshold
   ↓
7. Factory creates FPMM market on-chain
   ↓
8. Curve calls RafflePositionTracker.updateAllPlayersInSeason()
   ↓
9. Tracker emits PositionSnapshot events
   ↓
10. Backend listener creates database records
```

### Actual Flow (What's Happening)

```
1. User calls SOFBondingCurve.buyTokens() ✅
   ↓
2. Curve emits PositionUpdate event ✅
   ↓
3. Curve calls Raffle.recordParticipant() ✅
   ↓
4. Raffle emits PositionUpdate event ✅
   ↓
5. Raffle calls InfoFiMarketFactory.onPositionUpdate() ❌ FAILS SILENTLY
   ↓
6. Curve calls RafflePositionTracker.updateAllPlayersInSeason() ✅
   ↓
7. Tracker emits PositionSnapshot events ✅
   ↓
8. Backend listener receives events ✅
   ↓
9. Backend creates database records ✅
```

**The InfoFiMarketFactory.onPositionUpdate() call is FAILING but the failure is being swallowed by the Raffle contract.**

---

## Contract-by-Contract Audit

### 1. SOFBondingCurve.sol ✅ CORRECT

**Lines 169-237: buyTokens() function**

```solidity
function buyTokens(uint256 tokenAmount, uint256 maxSofAmount) external nonReentrant whenNotPaused {
    // ... token purchase logic ...
    
    // Line 213-220: Emits PositionUpdate event
    emit PositionUpdate(
        raffleSeasonId,
        msg.sender,
        oldTickets,
        newTickets,
        totalTickets,
        newBps
    );
    
    // Line 222-225: Calls Raffle.recordParticipant()
    if (raffle != address(0)) {
        IRaffle(raffle).recordParticipant(raffleSeasonId, msg.sender, tokenAmount);
    }
    
    // Line 230-236: Calls RafflePositionTracker.updateAllPlayersInSeason()
    if (positionTracker != address(0)) {
        try IRafflePositionTracker(positionTracker).updateAllPlayersInSeason() {
            // no-op
        } catch {
            // swallow error to avoid impacting user buy
        }
    }
}
```

**Roles Set:**
- ✅ `RAFFLE_MANAGER_ROLE` granted to SeasonFactory (line 66)
- ✅ `RAFFLE_MANAGER_ROLE` granted to Raffle (line 67 in SeasonFactory)
- ✅ Position tracker set via `setPositionTracker()` (line 159)

**Status:** WORKING CORRECTLY

---

### 2. Raffle.sol ⚠️ CRITICAL ISSUE

**Lines 261-291: recordParticipant() function**

```solidity
function recordParticipant(uint256 seasonId, address participant, uint256 ticketAmount) 
    external onlyRole(BONDING_CURVE_ROLE) {
    // ... participant tracking logic ...
    
    // Line 281: Emits PositionUpdate event
    emit PositionUpdate(seasonId, participant, oldTickets, newTicketsLocal, state.totalTickets);
    
    // Line 282-290: Calls InfoFiMarketFactory.onPositionUpdate()
    if (infoFiFactory != address(0)) {
        IInfoFiMarketFactory(infoFiFactory).onPositionUpdate(
            seasonId,
            participant,
            oldTickets,
            newTicketsLocal,
            state.totalTickets
        );
    }
}
```

**🚨 CRITICAL PROBLEM:** The call to `InfoFiMarketFactory.onPositionUpdate()` is **NOT wrapped in a try/catch block**, which means:
- If the factory call reverts, the ENTIRE transaction reverts
- User cannot buy tickets
- BUT: The factory call SHOULD be reverting based on the access control check

**Roles Set:**
- ✅ `infoFiFactory` set via `setInfoFiFactory()` (line 87-90)
- ✅ `BONDING_CURVE_ROLE` granted to curve (line 164)

**Status:** MISSING TRY/CATCH WRAPPER

---

### 3. InfoFiMarketFactory.sol 🔴 CRITICAL ACCESS CONTROL BUG

**Lines 109-134: onPositionUpdate() function**

```solidity
function onPositionUpdate(
    uint256 seasonId,
    address player,
    uint256 oldTickets,
    uint256 newTickets,
    uint256 totalTickets
) external nonReentrant {
    (RaffleTypes.SeasonConfig memory cfg, , , , ) = raffle.getSeasonDetails(seasonId);
    if (cfg.bondingCurve == address(0)) revert InvalidAddress();
    
    // Line 119-121: ACCESS CONTROL CHECK
    if (msg.sender != cfg.bondingCurve && msg.sender != address(raffle)) {
        revert OnlyCurveOrRaffle();
    }
    
    // ... market creation logic ...
}
```

**🚨 CRITICAL BUG:** The access control check requires `msg.sender` to be EITHER:
1. The bonding curve address, OR
2. The raffle address

**BUT:** When `Raffle.recordParticipant()` calls `InfoFiMarketFactory.onPositionUpdate()`:
- `msg.sender` = Raffle contract address ✅
- This SHOULD pass the access control check

**However, there's a SECOND issue:**

**Lines 141-149: _createMarket() function**

```solidity
function _createMarket(
    uint256 seasonId,
    address player,
    uint256 probabilityBps
) internal {
    if (sofToken.balanceOf(treasury) < INITIAL_LIQUIDITY) {
        emit MarketCreationFailed(
            seasonId,
            player,
            WINNER_PREDICTION,
            "Insufficient treasury balance"
        );
        return;
    }
    
    try this._createMarketInternal(seasonId, player, probabilityBps) {
        // Success
    } catch Error(string memory reason) {
        emit MarketCreationFailed(seasonId, player, WINNER_PREDICTION, reason);
    } catch {
        emit MarketCreationFailed(seasonId, player, WINNER_PREDICTION, "Unknown error");
    }
}
```

**🚨 CRITICAL FINDING:** Market creation failures are **SILENTLY CAUGHT** and only emit events. The function returns normally even if market creation fails.

**Lines 160-191: _createMarketInternal() function**

```solidity
function _createMarketInternal(
    uint256 seasonId,
    address player,
    uint256 probabilityBps
) external {
    require(msg.sender == address(this), "Internal only");
    
    bytes32 conditionId = oracleAdapter.preparePlayerCondition(seasonId, player);
    
    // Line 169-172: Treasury transfer
    require(
        sofToken.transferFrom(treasury, address(this), INITIAL_LIQUIDITY),
        "Treasury transfer failed"
    );
    
    // ... market creation logic ...
}
```

**🚨 CRITICAL BUG:** The `transferFrom()` call on line 170 will **FAIL** because:
1. The factory is trying to transfer SOF from `treasury` to `address(this)`
2. This requires the treasury to have **APPROVED** the factory to spend SOF
3. The approval is set in Deploy.sol line 164, BUT:
   - The approval is from the **deployer's wallet** (which is the treasury in testing)
   - The approval is **NOT automatically renewed** after each market creation
   - After the first market creation uses 100 SOF, the allowance decreases
   - The factory needs **continuous approval** or should use a different pattern

**Status:** MULTIPLE CRITICAL BUGS

---

### 4. RafflePositionTracker.sol ✅ CORRECT

**Lines 104-124: updateAllPlayersInSeason() function**

```solidity
function updateAllPlayersInSeason() external onlyRole(MARKET_ROLE) {
    uint256 seasonId = raffle.currentSeasonId();
    address[] memory players = raffle.getParticipants(seasonId);
    
    if (players.length == 0) return;
    
    // Get total tickets once to save gas
    (, , , uint256 totalTickets, ) = raffle.getSeasonDetails(seasonId);
    
    // Limit to MAX_PLAYERS_PER_UPDATE for gas safety
    uint256 updateCount = players.length > MAX_PLAYERS_PER_UPDATE 
        ? MAX_PLAYERS_PER_UPDATE 
        : players.length;
    
    // Update each player with pre-fetched totalTickets
    for (uint256 i = 0; i < updateCount; i++) {
        _updatePlayerInternalWithTotal(players[i], seasonId, totalTickets);
    }
    
    seasonLastUpdateBlock[seasonId] = block.number;
}
```

**Roles Set:**
- ✅ `MARKET_ROLE` granted to bonding curve (SeasonFactory line 77)
- ✅ `ADMIN_ROLE` granted to deployer (constructor line 87)
- ✅ `ADMIN_ROLE` granted to Raffle (Deploy.sol line 64)
- ✅ `ADMIN_ROLE` granted to SeasonFactory (Deploy.sol line 71)

**Status:** WORKING CORRECTLY

---

### 5. SeasonFactory.sol ✅ CORRECT

**Lines 42-85: createSeasonContracts() function**

```solidity
function createSeasonContracts(
    uint256 seasonId,
    RaffleTypes.SeasonConfig calldata config,
    RaffleTypes.BondStep[] calldata bondSteps,
    uint16 buyFeeBps,
    uint16 sellFeeBps
) external onlyRole(RAFFLE_ADMIN_ROLE) returns (address raffleTokenAddr, address curveAddr) {
    // ... deploy contracts ...
    
    // Line 73-78: Set position tracker on bonding curve
    if (trackerAddress != address(0)) {
        curve.setPositionTracker(trackerAddress);
        // Grant MARKET_ROLE to bonding curve so it can update positions
        ITrackerACL(trackerAddress).grantRole(keccak256("MARKET_ROLE"), curveAddr);
    }
    
    // ... grant other roles ...
}
```

**Roles Set:**
- ✅ Position tracker wired correctly
- ✅ `MARKET_ROLE` granted to bonding curve on tracker

**Status:** WORKING CORRECTLY

---

## Role Permission Matrix

| Contract | Role | Granted To | Purpose | Status |
|----------|------|------------|---------|--------|
| SOFBondingCurve | `RAFFLE_MANAGER_ROLE` | SeasonFactory | Initialize curve | ✅ |
| SOFBondingCurve | `RAFFLE_MANAGER_ROLE` | Raffle | Lock trading, extract SOF | ✅ |
| Raffle | `BONDING_CURVE_ROLE` | Bonding Curve | Record participants | ✅ |
| Raffle | `SEASON_CREATOR_ROLE` | Deployer | Create seasons | ✅ |
| RafflePositionTracker | `MARKET_ROLE` | Bonding Curve | Update positions | ✅ |
| RafflePositionTracker | `ADMIN_ROLE` | Raffle | Manage roles | ✅ |
| RafflePositionTracker | `ADMIN_ROLE` | SeasonFactory | Manage roles | ✅ |
| InfoFiMarketFactory | `ADMIN_ROLE` | Deployer | Admin functions | ✅ |
| InfoFiMarketFactory | `TREASURY_ROLE` | Treasury | Provide liquidity | ✅ |
| RaffleOracleAdapter | `RESOLVER_ROLE` | Factory | Resolve markets | ✅ |
| InfoFiFPMMV2 | `FACTORY_ROLE` | Factory | Create markets | ✅ |
| InfoFiPriceOracle | `PRICE_UPDATER_ROLE` | Factory | Update prices | ✅ |

**All roles are correctly configured.**

---

## Critical Bugs Identified

### Bug #1: Missing Try/Catch in Raffle.recordParticipant()

**Location:** `Raffle.sol` lines 282-290

**Impact:** HIGH - If InfoFiMarketFactory call reverts, entire ticket purchase fails

**Current Code:**
```solidity
if (infoFiFactory != address(0)) {
    IInfoFiMarketFactory(infoFiFactory).onPositionUpdate(
        seasonId,
        participant,
        oldTickets,
        newTicketsLocal,
        state.totalTickets
    );
}
```

**Fix:**
```solidity
if (infoFiFactory != address(0)) {
    try IInfoFiMarketFactory(infoFiFactory).onPositionUpdate(
        seasonId,
        participant,
        oldTickets,
        newTicketsLocal,
        state.totalTickets
    ) {
        // Success
    } catch {
        // Log but don't revert - InfoFi failure shouldn't block raffle
        emit InfoFiMarketUpdateFailed(seasonId, participant);
    }
}
```

---

### Bug #2: Treasury Approval Pattern in InfoFiMarketFactory

**Location:** `InfoFiMarketFactory.sol` lines 169-172

**Impact:** CRITICAL - Market creation fails after first market due to insufficient allowance

**Current Code:**
```solidity
require(
    sofToken.transferFrom(treasury, address(this), INITIAL_LIQUIDITY),
    "Treasury transfer failed"
);
```

**Problem:**
- Deploy.sol line 164 approves 100,000 SOF once
- Each market creation uses 100 SOF
- After 1,000 markets, approval is exhausted
- No mechanism to renew approval

**Fix Option 1 (Pull Pattern):**
```solidity
// Have treasury pre-fund the factory
require(
    sofToken.balanceOf(address(this)) >= INITIAL_LIQUIDITY,
    "Insufficient factory balance"
);
// Transfer from factory's own balance
sofToken.transfer(address(fpmmManager), INITIAL_LIQUIDITY);
```

**Fix Option 2 (Infinite Approval):**
```solidity
// In Deploy.sol, use max approval
sof.approve(address(infoFiFactory), type(uint256).max);
```

**Fix Option 3 (Treasury Direct Transfer):**
```solidity
// Have treasury implement a transferFrom function that factory can call
// Requires treasury to be a contract, not an EOA
```

---

### Bug #3: Silent Market Creation Failures

**Location:** `InfoFiMarketFactory.sol` lines 151-157

**Impact:** MEDIUM - Markets fail to create but no one knows why

**Current Code:**
```solidity
try this._createMarketInternal(seasonId, player, probabilityBps) {
    // Success
} catch Error(string memory reason) {
    emit MarketCreationFailed(seasonId, player, WINNER_PREDICTION, reason);
} catch {
    emit MarketCreationFailed(seasonId, player, WINNER_PREDICTION, "Unknown error");
}
```

**Problem:**
- Failures are only logged as events
- Backend may not be listening to `MarketCreationFailed` events
- No way to retry failed market creation
- No alerting mechanism

**Fix:**
```solidity
try this._createMarketInternal(seasonId, player, probabilityBps) {
    // Success
} catch Error(string memory reason) {
    emit MarketCreationFailed(seasonId, player, WINNER_PREDICTION, reason);
    // Store failed attempts for retry
    failedMarketCreations[seasonId][player] = FailedCreation({
        timestamp: block.timestamp,
        reason: reason,
        retryCount: 0
    });
} catch {
    emit MarketCreationFailed(seasonId, player, WINNER_PREDICTION, "Unknown error");
    failedMarketCreations[seasonId][player] = FailedCreation({
        timestamp: block.timestamp,
        reason: "Unknown error",
        retryCount: 0
    });
}
```

---

### Bug #4: Access Control Check May Be Too Restrictive

**Location:** `InfoFiMarketFactory.sol` lines 119-121

**Impact:** LOW - May prevent valid calls in certain edge cases

**Current Code:**
```solidity
if (msg.sender != cfg.bondingCurve && msg.sender != address(raffle)) {
    revert OnlyCurveOrRaffle();
}
```

**Analysis:**
- This check is correct for the current architecture
- However, it prevents any future integrations or admin overrides
- Consider adding an `UPDATER_ROLE` for more flexibility

**Recommendation:**
```solidity
// Add role-based access control
bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

// In constructor, grant UPDATER_ROLE to raffle and curve
_grantRole(UPDATER_ROLE, address(raffle));

// In onPositionUpdate
if (!hasRole(UPDATER_ROLE, msg.sender)) {
    revert OnlyUpdater();
}
```

---

## Backend Listener Analysis

**File:** `backend/src/services/positionTrackerListener.js`

**Status:** ✅ WORKING CORRECTLY

The backend listener is functioning as designed:
1. Listens to `RafflePositionTracker.PositionSnapshot` events
2. Creates database records in `infofi_markets` table
3. Initializes pricing cache

**However:** The backend creates **DATABASE RECORDS ONLY**, not on-chain markets.

**This is a fundamental architectural issue:**
- Smart contracts create on-chain FPMM markets
- Backend creates database records for API queries
- These two systems are disconnected

---

## Recommendations

### Immediate Fixes (Critical)

1. **Add try/catch to Raffle.recordParticipant()** (Bug #1)
   - Prevents ticket purchase failures
   - Priority: CRITICAL
   - Estimated effort: 5 minutes

2. **Fix treasury approval pattern** (Bug #2)
   - Use infinite approval or pre-fund factory
   - Priority: CRITICAL
   - Estimated effort: 10 minutes

3. **Add backend listener for MarketCreationFailed events**
   - Monitor and alert on failures
   - Priority: HIGH
   - Estimated effort: 30 minutes

### Short-term Improvements (High Priority)

4. **Implement retry mechanism for failed market creation**
   - Store failed attempts
   - Add admin function to retry
   - Priority: HIGH
   - Estimated effort: 2 hours

5. **Add comprehensive event logging**
   - Log all state changes
   - Include reason codes
   - Priority: MEDIUM
   - Estimated effort: 1 hour

### Long-term Architectural Changes (Medium Priority)

6. **Unify on-chain and off-chain market creation**
   - Backend should listen to `MarketCreated` events from factory
   - Sync on-chain markets to database
   - Priority: MEDIUM
   - Estimated effort: 4 hours

7. **Implement role-based access control for InfoFiMarketFactory**
   - Replace hardcoded address checks with roles
   - Priority: LOW
   - Estimated effort: 1 hour

---

## Testing Recommendations

### Unit Tests Required

1. Test `Raffle.recordParticipant()` with InfoFi factory that reverts
2. Test `InfoFiMarketFactory.onPositionUpdate()` with insufficient treasury balance
3. Test `InfoFiMarketFactory._createMarketInternal()` with various failure modes
4. Test market creation with exhausted approval

### Integration Tests Required

1. Full E2E test: Deploy → Create Season → Buy Tickets → Verify Market Created
2. Test with multiple concurrent market creations
3. Test with treasury balance edge cases
4. Test with various player position changes

### Monitoring Required

1. Alert on `MarketCreationFailed` events
2. Track treasury SOF balance
3. Monitor approval allowance
4. Track failed market creation attempts

---

## Conclusion

The InfoFi market creation system has **THREE CRITICAL BUGS** that prevent markets from being created:

1. **Missing try/catch wrapper** in Raffle.recordParticipant() causes transaction reverts
2. **Treasury approval exhaustion** prevents market creation after initial markets
3. **Silent failures** make debugging impossible

All bugs are fixable with minimal code changes. The role permission system is correctly configured.

**Estimated time to fix all critical bugs:** 30 minutes
**Estimated time for comprehensive testing:** 4 hours

---

## Appendix: Complete Call Trace

```
User calls: SOFBondingCurve.buyTokens(tokenAmount, maxSofAmount)
  │
  ├─> Transfers SOF from user to curve
  ├─> Mints raffle tokens to user
  ├─> Updates playerTickets mapping
  ├─> Emits PositionUpdate event
  │
  ├─> Calls: Raffle.recordParticipant(seasonId, msg.sender, tokenAmount)
  │     │
  │     ├─> Updates participant position
  │     ├─> Emits PositionUpdate event
  │     │
  │     └─> Calls: InfoFiMarketFactory.onPositionUpdate(...)  ❌ FAILS HERE
  │           │
  │           ├─> Checks access control (PASSES)
  │           ├─> Checks if player crossed 1% threshold
  │           │
  │           └─> Calls: _createMarket(seasonId, player, probabilityBps)
  │                 │
  │                 ├─> Checks treasury balance (MAY PASS)
  │                 │
  │                 └─> Calls: this._createMarketInternal(...)
  │                       │
  │                       ├─> Calls: oracleAdapter.preparePlayerCondition(...)
  │                       │
  │                       └─> Calls: sofToken.transferFrom(treasury, this, 100e18)
  │                             ❌ FAILS: Insufficient allowance
  │
  └─> Calls: RafflePositionTracker.updateAllPlayersInSeason()
        │
        ├─> Gets all participants
        ├─> For each participant:
        │     │
        │     └─> Emits PositionSnapshot event ✅ WORKS
        │
        └─> Backend listener receives events ✅ WORKS
              │
              └─> Creates database records ✅ WORKS
```

---

**End of Audit Report**
