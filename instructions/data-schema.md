# SecondOrder.fun Data Schema

This document defines the database schema for all Supabase tables in the SecondOrder.fun platform.

**Last verified**: 2026-02-08 (against `sof-backend/shared/` service files, `sof-backend/migrations/`, and live Supabase)

## Conventions

- **snake_case** column names in the database
- **Basis points (bps)** as integers (0-10000) for probabilities and prices
- **NUMERIC(38,18)** for token/currency amounts
- **TIMESTAMPTZ** for all timestamps
- **VARCHAR(42)** for Ethereum addresses
- All addresses stored **lowercase**

## Migration Files

Migrations live in `sof-backend/migrations/`. Core tables (marked "no migration") were created manually via Supabase SQL Editor and should be backfilled with migration files.

---

## 1. User & Access Control

### `players`

**No migration file.** Stores player wallet addresses. Referenced as FK by multiple tables.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `address` | VARCHAR(42) | UNIQUE, NOT NULL | Ethereum address (lowercase) |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

**Used by**: `supabaseClient.js` (getOrCreatePlayerId, getPlayerByAddress, createPlayer)

---

### `allowlist_entries`

**Migration**: `004_allowlist_entries.sql`, `006_granular_access.sql`, `007_allowlist_wallet_only.sql`, `009_lockdown_admin_allowlist.sql`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `fid` | BIGINT | nullable, unique when not null | Farcaster ID |
| `wallet_address` | VARCHAR(42) | unique (lowercase) when not null | Ethereum address |
| `username` | TEXT | | Farcaster username |
| `display_name` | TEXT | | |
| `source` | TEXT | NOT NULL, DEFAULT 'webhook' | 'webhook', 'manual', 'import' |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `access_level` | INTEGER | DEFAULT 2 | 0=public, 1=connected, 2=allowlist, 3=beta, 4=admin |
| `added_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `wallet_resolved_at` | TIMESTAMPTZ | | |
| `metadata` | JSONB | DEFAULT '{}' | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Used by**: `allowlistService.js`, `accessService.js`

---

### `allowlist_config`

**Migration**: `004_allowlist_entries.sql`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `name` | TEXT | NOT NULL, DEFAULT 'default' | |
| `window_start` | TIMESTAMPTZ | NOT NULL | |
| `window_end` | TIMESTAMPTZ | nullable | NULL = open indefinitely |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `max_entries` | INTEGER | | Optional cap |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Used by**: `allowlistService.js`

---

### `access_groups`

**Migration**: `006_granular_access.sql`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `slug` | TEXT | NOT NULL, UNIQUE | e.g. 'season-5-vip' |
| `name` | TEXT | NOT NULL | |
| `description` | TEXT | | |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Used by**: `accessService.js`, `groupService.js`

---

### `user_access_groups`

**Migration**: `006_granular_access.sql`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `fid` | BIGINT | NOT NULL | References allowlist_entries.fid |
| `group_id` | INTEGER | NOT NULL, FK `access_groups(id)` ON DELETE CASCADE | |
| `granted_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `granted_by` | TEXT | | Admin FID or 'system' |
| `expires_at` | TIMESTAMPTZ | | Optional expiration |
| `is_active` | BOOLEAN | DEFAULT TRUE | |

**Unique**: `(fid, group_id)`

**Used by**: `accessService.js`, `groupService.js`

---

### `route_access_config`

**Migration**: `006_granular_access.sql`, `008_seed_prediction_markets_feature_toggle.sql`, `010_make_raffles_portfolio_public.sql`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `route_pattern` | TEXT | NOT NULL, UNIQUE | e.g. '/raffles', '/raffles/:id' |
| `resource_type` | TEXT | | 'page', 'raffle', 'market', 'feature' |
| `resource_id` | TEXT | | e.g. '5' for specific raffle |
| `required_level` | INTEGER | DEFAULT 2 | Minimum access level (0-4) |
| `required_groups` | TEXT[] | | Array of group slugs |
| `require_all_groups` | BOOLEAN | DEFAULT FALSE | |
| `is_public` | BOOLEAN | DEFAULT FALSE | |
| `is_disabled` | BOOLEAN | DEFAULT FALSE | |
| `name` | TEXT | | |
| `description` | TEXT | | |
| `priority` | INTEGER | DEFAULT 0 | Higher = checked first |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Used by**: `accessService.js`, `routeConfigService.js`

---

### `access_settings`

**Migration**: `006_granular_access.sql`

Key-value store for global access control settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | e.g. 'default_access_level', 'global_public_override' |
| `value` | JSONB | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_by` | TEXT | | |

**Used by**: `accessService.js`, `routeConfigService.js`

---

### `farcaster_notification_tokens`

**Migration**: `002_farcaster_notification_tokens.sql`, `003_add_app_key_to_notification_tokens.sql`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `fid` | BIGINT | NOT NULL | Farcaster ID |
| `app_key` | TEXT | NOT NULL | Client's app key |
| `notification_url` | TEXT | NOT NULL | URL to POST notifications to |
| `notification_token` | TEXT | NOT NULL, UNIQUE | |
| `notifications_enabled` | BOOLEAN | DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Unique**: `(fid, app_key)`

**Used by**: `farcasterNotificationService.js`, `allowlistRoutes.js`, `farcasterWebhookRoutes.js`, `adminRoutes.js`

---

## 2. InfoFi (Prediction Markets)

### `infofi_markets`

**No migration file.** Core InfoFi prediction market records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `season_id` | BIGINT | NOT NULL | Season identifier |
| `player_address` | VARCHAR(42) | NOT NULL | Player's wallet address (lowercase) |
| `player_id` | BIGINT | nullable, FK `players(id)` | Optional normalized reference |
| `market_type` | VARCHAR(50) | | e.g. 'WINNER_PREDICTION' |
| `contract_address` | VARCHAR(42) | | FPMM contract address |
| `initial_probability_bps` | INTEGER | | Snapshot at creation (0-10000) |
| `current_probability_bps` | INTEGER | | Updated via position changes (0-10000) |
| `is_active` | BOOLEAN | | |
| `is_settled` | BOOLEAN | | |
| `settlement_time` | TIMESTAMPTZ | | |
| `winning_outcome` | BOOLEAN | | |
| `last_synced_block` | BIGINT | | Last block synced for trade events |
| `last_synced_at` | TIMESTAMPTZ | | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

**Used by**: `supabaseClient.js`, `infoFiRoutes.js`, `adminRoutes.js`, `infoFiPositionService.js`, `seasonCompletedListener.js`, `server.js`, `userRoutes.js`

---

### `infofi_positions`

**No migration file.** User bets/positions in InfoFi markets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `market_id` | BIGINT | FK `infofi_markets(id)` | |
| `user_address` | VARCHAR(42) | NOT NULL | Ethereum address (lowercase) |
| `outcome` | VARCHAR(10) | | 'YES' or 'NO' |
| `amount` | NUMERIC(38,18) | | Amount bet |
| `price` | NUMERIC(38,18) | | Price at time of bet |
| `tx_hash` | VARCHAR(66) | | Transaction hash (dedupe key) |
| `created_at` | TIMESTAMPTZ | | |

**Used by**: `infoFiPositionService.js`, `infoFiRoutes.js`, `userRoutes.js`

**View**: `user_market_positions` — aggregates positions by user + market + outcome

---

### `infofi_winnings`

**No migration file.** Claimable winnings from settled markets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `user_address` | VARCHAR(42) | NOT NULL | |
| `market_id` | BIGINT | FK `infofi_markets(id)` | |
| `amount` | NUMERIC(38,18) | | Payout amount |
| `is_claimed` | BOOLEAN | DEFAULT FALSE | |
| `claimed_at` | TIMESTAMPTZ | | |
| `created_at` | TIMESTAMPTZ | | |

**Used by**: `infoFiRoutes.js` (settlement + claim endpoints)

---

### `infofi_odds_history`

**Migration**: `011_infofi_odds_history.sql`

Historical odds snapshots for prediction markets (replaces previous Redis sorted-set storage).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `market_id` | BIGINT | NOT NULL, FK `infofi_markets(id)` ON DELETE CASCADE | |
| `season_id` | BIGINT | NOT NULL | |
| `recorded_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `yes_bps` | INTEGER | NOT NULL | YES odds (0-10000) |
| `no_bps` | INTEGER | NOT NULL | NO odds (0-10000) |
| `hybrid_bps` | INTEGER | NOT NULL, DEFAULT 0 | |
| `raffle_bps` | INTEGER | NOT NULL, DEFAULT 0 | |
| `sentiment_bps` | INTEGER | NOT NULL, DEFAULT 0 | |

**Indexes**: `(market_id, recorded_at)`, `(season_id)`
**RLS**: Read-only for all, writes via service role.

**Used by**: `historicalOddsService.js`, `adminRoutes.js` (backfill endpoint)

---

### `infofi_failed_markets`

**No migration file.** Logs failed market creation attempts for debugging.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `season_id` | BIGINT | | |
| `player_address` | VARCHAR(42) | | |
| `source` | VARCHAR | | 'LISTENER', 'ADMIN', 'UNKNOWN' |
| `error_message` | TEXT | | |
| `attempts` | INTEGER | | |
| `last_attempt_at` | TIMESTAMPTZ | | |
| `created_at` | TIMESTAMPTZ | | |

**Used by**: `supabaseClient.js` (logFailedMarketAttempt, getFailedMarketAttempts), `adminRoutes.js`

---

## 3. Raffle (Seasons & Tickets)

### `season_contracts`

**No migration file.** Stores contract addresses discovered via `SeasonStarted` events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| `season_id` | BIGINT | NOT NULL, UNIQUE | Season ID from event |
| `bonding_curve_address` | VARCHAR(42) | NOT NULL | BondingCurve contract address |
| `raffle_token_address` | VARCHAR(42) | NOT NULL | RaffleToken contract address |
| `raffle_address` | VARCHAR(42) | NOT NULL | Raffle contract address |
| `is_active` | BOOLEAN | DEFAULT TRUE | Whether season is active |
| `created_block` | BIGINT | | Block number when season was created |
| `last_tx_sync_block` | BIGINT | DEFAULT 0 | Last block synced for raffle transactions |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

**Indexes**: `season_id`, `is_active`, `bonding_curve_address`, `raffle_token_address`

**Used by**: `supabaseClient.js`, `healthRoutes.js`, `raffleTransactionService.js`, `adminRoutes.js`

---

### `raffle_transactions`

**Migration**: `001_raffle_transactions.sql`

Partitioned by `season_id`. Auto-creates partitions via `create_raffle_tx_partition()` RPC.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PK (composite with season_id) | |
| `season_id` | BIGINT | NOT NULL | Partition key |
| `user_address` | VARCHAR(42) | NOT NULL | |
| `player_id` | BIGINT | FK `players(id)` | Auto-populated by trigger |
| `transaction_type` | VARCHAR(20) | NOT NULL | 'BUY', 'SELL', 'CLAIM', 'TRANSFER' |
| `ticket_amount` | NUMERIC | NOT NULL | |
| `sof_amount` | NUMERIC | NOT NULL | |
| `price_per_ticket` | NUMERIC | | |
| `tx_hash` | VARCHAR(66) | NOT NULL | |
| `block_number` | BIGINT | NOT NULL | |
| `block_timestamp` | TIMESTAMPTZ | NOT NULL | |
| `tickets_before` | NUMERIC | NOT NULL, DEFAULT 0 | |
| `tickets_after` | NUMERIC | NOT NULL | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Unique**: `(tx_hash, season_id)`
**Indexes**: `(user_address, season_id, block_timestamp DESC)`, `(tx_hash)`, `(block_number)`, `(player_id, season_id)`

**Partition tables**: `raffle_transactions_season_1` through `_season_7`, `_season_17`, `_season_18`

**Used by**: `raffleTransactionService.js`

---

## 4. Infrastructure

### `listener_block_cursors`

**Migration**: `011_fix_service_role_permissions.sql`

Persistent block tracking per event listener for crash recovery. Used exclusively by Supabase (Redis block cursors were removed).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `listener_key` | TEXT | PRIMARY KEY | e.g. "0xABC123:SeasonStarted" |
| `last_block` | BIGINT | NOT NULL | Last fully processed block |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Used by**: `blockCursor.js` (all 5 event listeners)

---

## Views

### `user_raffle_positions` (Materialized View)

Aggregates `raffle_transactions` per user per season. Refreshed via `refresh_user_positions()` RPC.

**Used by**: `raffleTransactionService.js` (getUserPosition, getAllUserPositions)

### `user_market_positions` (View)

Aggregates `infofi_positions` by user + market + outcome for net position calculations.

**Used by**: `infoFiPositionService.js` (getAggregatedPosition)

---

## Undeployed Features

### `nft_drops`

**Table does not exist yet.** Routes are registered in `server.js` but the table has not been created.

**Route file**: `nftDropRoutes.js` (complete CRUD implementation, awaiting table creation)

---

## Onchain-Only Types (Not Database Tables)

These types represent onchain data read from smart contracts. They are **not** stored in Supabase.

### Season (Onchain)

```typescript
type Season = {
  seasonId: number;           // uint256 onchain
  status: number;             // 0=Uninitialized, 1=Active, 2=Ended
  raffleContract: string;
  bondingCurveContract: string;
  startTime: number;          // Unix ms
  endTime: number;            // Unix ms
  winnerCount: number;
  totalTickets: number;
  vrfRequestId?: string;
  vrfStatus?: string;         // 'none' | 'requested' | 'fulfilled' | 'failed'
  prizePoolSof?: string;
  consolationPoolSof?: string;
  buyFeeBps?: number;
  sellFeeBps?: number;
}
```

### Player Position (Onchain)

```typescript
type PlayerPosition = {
  seasonId: number;
  address: string;
  ticketCount: number;
  startRange: number;
  lastUpdate: number;         // Unix ms
  winProbabilityBps: number;  // (ticketCount / totalTickets) * 10000
}
```

---

## SSE Event Types

These are event payloads sent over Server-Sent Events, not database tables.

```typescript
type SSEPricingUpdate = {
  type: 'initial_price' | 'raffle_probability_update' | 'market_sentiment_update' | 'heartbeat';
  marketId: string | number;
  raffleProbabilityBps?: number;
  marketSentimentBps?: number;
  hybridPriceBps?: number;
  timestamp: string;          // ISO timestamp
}
```

---

## Known Issues

1. **Duplicate migration numbering**: Two files share prefix `011` (`011_fix_service_role_permissions.sql` and `011_infofi_odds_history.sql`). One should be renumbered.
2. **Missing migration files**: Core tables have no migration (see "No migration file" notes above).
3. **`reset-season-one.js`**: Uses `.eq('raffle_id', seasonId)` on `infofi_markets` — should be `season_id`. This delete silently fails.

---

## Tables Removed (2026-02-08)

The following tables/code were removed during cleanup:

| Table | Reason |
|-------|--------|
| `arbitrage_opportunities` | Empty, no code references |
| `farcaster_casts` | Empty, no code references |
| `oracle_call_history` | Empty, no code references |
| `market_pricing_cache` | Empty, never written to, all methods uncalled |
| `raffles` | Never existed on Supabase, dead code removed |
| `hybrid_pricing_cache` | Never existed on Supabase, dead code removed |
| `users` | Never existed on Supabase, dead code removed |
| `event_processing_state` | Superseded by `listener_block_cursors`, dead code removed |
