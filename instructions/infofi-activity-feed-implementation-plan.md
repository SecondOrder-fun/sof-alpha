# InfoFi Market Activity Feed Implementation Plan

## Overview

This document outlines the complete implementation plan for indexing and displaying InfoFi market purchase events in a real-time activity feed on the Market Detail Page.

**Status**: Ready for implementation after Market Detail Page core functionality is complete

**Priority**: MEDIUM (enhances UX but not critical for MVP)

---

## Architecture Decision

### Why Dual Storage (Supabase + Redis)?

**Supabase**: Permanent storage, complex queries, pagination, analytics
**Redis Lists**: Ultra-fast reads (<5ms), real-time updates, automatic FIFO

### Data Flow
```
Smart Contract Event → Listener → Supabase + Redis → API → Frontend
```

---

## Smart Contract Events

### Primary Event
```solidity
event BetPlaced(address indexed better, uint256 indexed marketId, bool prediction, uint256 amount);
event PayoutClaimed(address indexed better, uint256 indexed marketId, bool prediction, uint256 amount);
event MarketResolved(uint256 indexed marketId, bool outcome, uint256 totalYesPool, uint256 totalNoPool);
```

---

## Database Schema

### Supabase Table: `infofi_market_activity`

```sql
CREATE TABLE infofi_market_activity (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    log_index INTEGER NOT NULL,
    market_id INTEGER NOT NULL REFERENCES infofi_markets(id),
    season_id INTEGER NOT NULL,
    user_address VARCHAR(42),
    event_data JSONB NOT NULL,
    block_timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_event UNIQUE (transaction_hash, log_index)
);

CREATE INDEX idx_activity_market_time ON infofi_market_activity(market_id, block_timestamp DESC);
```

---

## Redis Structure

**Key**: `activity:market:{seasonId}:{marketId}`
**Type**: List (LPUSH/LRANGE)
**Max Size**: 1000 events
**TTL**: 7 days

---

## Implementation Components

### 1. Activity Listener Service
**File**: `/backend/src/services/activityListener.js`

Listens to BetPlaced, PayoutClaimed, MarketResolved events and stores in Supabase + Redis.

### 2. Activity Cache Service
**File**: `/backend/shared/activityCacheService.js`

Manages Redis lists with FIFO trimming and fast reads.

### 3. API Endpoint
**Endpoint**: `GET /api/infofi/markets/:marketId/activity`

**Query Params**: limit, offset, eventType, userAddress, useCache

### 4. Frontend Integration
**File**: `/src/pages/InfoFiMarketDetail.jsx`

Update Activity tab with real data using React Query infinite scroll.

---

## Rollout Strategy

**Phase 1**: Backend (Week 1) - Listener, cache, database
**Phase 2**: API (Week 1) - Endpoints, tests
**Phase 3**: Frontend (Week 2) - Activity tab, components
**Phase 4**: Real-time (Week 2) - WebSocket updates (optional)
**Phase 5**: Production (Week 3) - Deploy and monitor

---

## Performance

- **Redis**: <5ms latency, ~50MB for 100 markets
- **Database**: <200ms queries with indexes
- **API**: <50ms cached, <200ms database

---

## Integration with Market Detail Page

**Before**: Activity tab shows "Coming soon"
**After**: Real-time feed with infinite scroll, user filtering, transaction links

---

**Document Version**: 1.0
**Last Updated**: 2025-10-18
**Status**: Ready for Implementation
