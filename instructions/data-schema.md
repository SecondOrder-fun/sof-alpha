# SecondOrder.fun Data Schema

This document defines the data schema and formats for all entities in the SecondOrder.fun platform, including raffles, users, InfoFi markets, and real-time pricing data.

**⚠️ IMPORTANT**: This schema is verified against actual database migrations in `backend/src/db/migrations/`. Always check migration files for the source of truth.

---

## Updated Schema (Last verified: 2025-10-23)

The following models align with the actual database schema from Supabase migrations. All InfoFi-related tables use:

- **snake_case** column names in the database
- **Basis points (bps)** as integers (0-10000) for probabilities and prices
- **NUMERIC(38,18)** for decimal amounts (not DECIMAL(18,6))
- **season_id** (not raffle_id) in infofi_markets table

### Season / Raffle (Onchain-aligned)

```typescript
type Season = {
  seasonId: number;                 // Unique season/raffle ID (uint256 onchain)
  status: number;                   // Enum-like numeric status (e.g., 0=Uninitialized,1=Active,2=Ended)
  raffleContract: string;           // Address of the Raffle contract
  bondingCurveContract: string;     // Address of the curve/ticket token
  startTime: number;                // Unix ms
  endTime: number;                  // Unix ms
  winnerCount: number;              // 1,3,5,10, etc.
  totalTickets: number;             // Current total supply of tickets
  vrfRequestId?: string;            // Optional VRF request identifier
  vrfStatus?: string;               // 'none' | 'requested' | 'fulfilled' | 'failed'
  prizePoolSof?: string;            // Optional SOF totals (string for bigints)
  consolationPoolSof?: string;
  buyFeeBps?: number;               // e.g., 10 = 0.1%
  sellFeeBps?: number;              // e.g., 70 = 0.7%
}
```

### Player Position (Per Season)

```typescript
type PlayerPosition = {
  seasonId: number;
  address: string;                  // EVM address
  ticketCount: number;              // Current tickets
  startRange: number;               // Sliding-window start index for the player
  lastUpdate: number;               // Unix ms
  winProbabilityBps: number;        // (ticketCount / totalTickets) * 10000
}
```

### InfoFi Market (Platform-level)

**IMPORTANT**: Database uses snake_case column names. The actual Supabase table schema from migrations:

- `season_id` (BIGINT NOT NULL) - **NOT raffle_id**
- `player_address` (VARCHAR(42) NOT NULL) - Direct address field
- `player_id` (BIGINT, nullable, references players(id)) - Optional normalized reference
- `market_type` (VARCHAR(50))
- `contract_address` (VARCHAR(42))
- `initial_probability_bps` (INTEGER) - Basis points 0-10000
- `current_probability_bps` (INTEGER) - Basis points 0-10000
- `is_active` (BOOLEAN)
- `is_settled` (BOOLEAN)
- `settlement_time` (TIMESTAMPTZ)
- `winning_outcome` (BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMPTZ)

```typescript
type InfoFiMarket = {
  id: number;                       // BIGSERIAL primary key
  season_id: number;                // NOT raffle_id - references season/raffle
  player_address: string;           // VARCHAR(42) NOT NULL - direct address
  player_id?: number;               // BIGINT nullable - optional normalized reference
  market_type: 'WINNER_PREDICTION' | 'POSITION_SIZE' | 'BEHAVIORAL';
  contract_address?: string;        // VARCHAR(42)
  initial_probability_bps: number;  // INTEGER basis points (0-10000)
  current_probability_bps: number;  // INTEGER basis points (0-10000)
  is_active: boolean;
  is_settled: boolean;
  settlement_time?: string;         // TIMESTAMPTZ
  winning_outcome?: boolean;
  created_at: string;               // TIMESTAMPTZ
  updated_at: string;               // TIMESTAMPTZ
}
```

**Frontend/API Mapping**: When returning to frontend, convert to camelCase:

- `season_id` → `seasonId`
- `player_address` → `playerAddress`
- `initial_probability_bps` → `initialProbabilityBps`
- `current_probability_bps` → `currentProbabilityBps`

### InfoFi Position (User Bet)

**IMPORTANT**: Database uses snake_case column names. The actual Supabase table schema from migrations:

- `market_id` (BIGINT, foreign key to infofi_markets table)
- `user_address` (VARCHAR(42), Ethereum address)
- `outcome` (VARCHAR(10), 'YES' or 'NO')
- `amount` (NUMERIC(38,18), amount bet)
- `price` (NUMERIC(38,18), price at time of bet) - **NOT entry_price**
- `created_at` (TIMESTAMPTZ)

**Note**: No `current_value`, `is_hedge_position`, or `updated_at` fields exist in actual schema.

```typescript
type InfoFiUserPosition = {
  id: number;                       // BIGSERIAL primary key
  market_id: number;                // Foreign key to infofi_markets(id)
  user_address: string;             // VARCHAR(42) - EVM address
  outcome: 'YES' | 'NO';            // VARCHAR(10)
  amount: string;                   // NUMERIC(38,18) - Amount bet as decimal string
  price?: string;                   // NUMERIC(38,18) - Price at entry (NOT entry_price)
  created_at: string;               // TIMESTAMPTZ
}
```

### InfoFi Winnings (Claimable)

```typescript
type InfoFiWinnings = {
  id: string | number;
  userAddress: string;
  marketId: string | number;
  amount: string;                   // Decimal string
  isClaimed: boolean;
  claimedAt?: string;               // ISO timestamp
  createdAt: string;                // ISO timestamp
}
```

### Market Pricing Cache (Hybrid Model)

**IMPORTANT**: Database uses snake_case column names. The actual Supabase table schema from migrations:

- Table name: `market_pricing_cache` (NOT hybrid_pricing_cache)
- `market_id` (BIGINT primary key, references infofi_markets)
- `raffle_probability_bps` (INTEGER) - Basis points 0-10000
- `market_sentiment_bps` (INTEGER) - Basis points 0-10000
- `hybrid_price_bps` (INTEGER) - Basis points 0-10000
- `raffle_weight_bps` (INTEGER, default 7000) - 70% weight
- `market_weight_bps` (INTEGER, default 3000) - 30% weight
- `last_updated` (TIMESTAMPTZ)

**Note**: All values are in basis points (integers), NOT decimals. No volume or price_change fields exist.

```typescript
type MarketPricingCache = {
  market_id: number;                // BIGINT primary key
  raffle_probability_bps: number;   // INTEGER basis points (0-10000)
  market_sentiment_bps: number;     // INTEGER basis points (0-10000)
  hybrid_price_bps: number;         // INTEGER basis points (0-10000)
  raffle_weight_bps: number;        // INTEGER default 7000 (70%)
  market_weight_bps: number;        // INTEGER default 3000 (30%)
  last_updated: string;             // TIMESTAMPTZ
}
```

### Arbitrage Opportunity (Analytics)

**IMPORTANT**: Database uses snake_case column names. The actual Supabase table schema from migrations:

- `raffle_id` (BIGINT NOT NULL)
- `player_address` (VARCHAR(42) NOT NULL)
- `market_id` (BIGINT, nullable, references infofi_markets)
- `raffle_price_bps` (INTEGER NOT NULL) - Basis points
- `market_price_bps` (INTEGER NOT NULL) - Basis points
- `price_difference_bps` (INTEGER NOT NULL) - Basis points
- `profitability_pct` (NUMERIC(10,4) NOT NULL) - Percentage as decimal
- `estimated_profit` (NUMERIC(38,18) NOT NULL)
- `is_executed` (BOOLEAN, default false)
- `executed_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

```typescript
type ArbitrageOpportunity = {
  id: number;                       // BIGSERIAL primary key
  raffle_id: number;                // BIGINT NOT NULL
  player_address: string;           // VARCHAR(42) NOT NULL
  market_id?: number;               // BIGINT nullable
  raffle_price_bps: number;         // INTEGER basis points
  market_price_bps: number;         // INTEGER basis points
  price_difference_bps: number;     // INTEGER basis points
  profitability_pct: string;        // NUMERIC(10,4) as decimal string
  estimated_profit: string;         // NUMERIC(38,18) as decimal string
  is_executed: boolean;
  executed_at?: string;             // TIMESTAMPTZ
  created_at: string;               // TIMESTAMPTZ
}
```

### SSE Pricing Update (Hybrid)

```typescript
type SSEPricingUpdate = {
  type: 'initial_price' | 'raffle_probability_update' | 'market_sentiment_update' | 'heartbeat';
  marketId: string | number;
  raffleProbabilityBps?: number;
  marketSentimentBps?: number;
  hybridPriceBps?: number;
  timestamp: string;                // ISO timestamp
}
```

### REST Snapshot (Pricing)

```typescript
// GET /stream/pricing/:marketId/current
type PricingSnapshot = MarketPricingCache;
```

---

## Raffle Schema

### Raffle Object

```javascript
{
  "id": 1,                    // Integer - Unique identifier for the raffle
  "name": "Ethereum Merge Prediction",  // String - Name of the raffle
  "description": "Predict the exact timestamp of the Ethereum Merge event",  // String - Description of the raffle
  "startTime": 1686000000000,  // Integer (Unix timestamp) - Start time of the raffle
  "endTime": 1686259200000,    // Integer (Unix timestamp) - End time of the raffle
  "ticketPrice": "0.1",       // String - Price per ticket
  "ticketPriceToken": "ETH",  // String - Token used for ticket purchase
  "totalPrize": "10.5",       // String - Total prize pool
  "totalPrizeToken": "ETH",   // String - Token of the prize pool
  "totalTickets": 105,         // Integer - Total number of tickets sold
  "winnerCount": 3,            // Integer - Number of winners
  "status": "active",         // String - Status of the raffle (active, completed, cancelled)
  "participants": 87           // Integer - Number of participants
}
```

### Participant Object

```javascript
{
  "address": "0x1234567890123456789012345678901234567890",  // String - Ethereum address of participant
  "tickets": 5,              // Integer - Number of tickets purchased
  "joinTime": 1686000000000  // Integer (Unix timestamp) - When the participant joined
}
```

## User Schema

### User Profile Object

```javascript
{
  "id": "0x1234567890123456789012345678901234567890",  // String - Ethereum address of the user
  "username": "crypto_player_1",                     // String - Username
  "displayName": "Crypto Player One",               // String - Display name
  "bio": "Enthusiastic participant in DeFi and prediction markets",  // String - User biography
  "avatar": "https://example.com/avatar1.png",      // String - URL to avatar image
  "joinDate": "2023-01-15",                          // String (ISO date) - User join date
  "totalWinnings": "2.5",                            // String - Total winnings
  "totalWinningsToken": "ETH",                       // String - Token of winnings
  "totalParticipations": 15,                          // Integer - Total raffles participated in
  "winRate": "0.27"                                  // String - Win rate as decimal
}
```

### User Raffle Participation Object

```javascript
{
  "raffleId": 1,              // Integer - ID of the raffle
  "raffleName": "Ethereum Merge Prediction",  // String - Name of the raffle
  "ticketsPurchased": 5,      // Integer - Number of tickets purchased
  "joinDate": "2023-06-01",   // String (ISO date) - When user joined the raffle
  "status": "active",         // String - Status of participation (active, completed)
  "won": true,                // Boolean - Whether user won (only for completed raffles)
  "prize": "1.25",            // String - Prize amount won (only for completed raffles)
  "prizeToken": "ETH"         // String - Token of prize (only for completed raffles)
}
```

### User Portfolio Object

```javascript
{
  "totalValue": "25.75",        // String - Total portfolio value
  "totalValueToken": "ETH",     // String - Token of total value
  "assets": [                   // Array - List of assets
    {
      "token": "ETH",           // String - Token symbol
      "balance": "12.5",        // String - Token balance
      "value": "12.5",          // String - Value in ETH
      "valueToken": "ETH"       // String - Token of value
    },
    {
      "token": "USDC",          // String - Token symbol
      "balance": "15000",       // String - Token balance
      "value": "13.25",         // String - Value in ETH
      "valueToken": "ETH"       // String - Token of value
    }
  ],
  "performance": {              // Object - Performance metrics
    "dailyChange": "2.5",       // String - Daily change percentage
    "weeklyChange": "5.7",      // String - Weekly change percentage
    "monthlyChange": "12.3"     // String - Monthly change percentage
  }
}
```

## InfoFi Market Schema

### InfoFi Position Object

```javascript
{
  "marketId": 1,                           // Integer - ID of the InfoFi market
  "marketQuestion": "Will ETH reach $3000 by June 2023?",  // String - Market question
  "prediction": true,                      // Boolean - User's prediction (true/false)
  "amount": "0.5",                        // String - Amount bet
  "token": "ETH",                         // String - Token used for bet
  "entryPrice": "0.65",                   // String - Price at time of entry
  "currentPrice": "0.72",                 // String - Current price
  "potentialPayout": "0.55",              // String - Potential payout
  "status": "active"                      // String - Status of position (active, settled)
}
```

## Real-Time Pricing Schema

### SSE Pricing Update Object

```javascript
{
  "type": "priceUpdate",        // String - Type of update (priceUpdate, connected, heartbeat)
  "market_id": 1,                // Integer - ID of the market
  "yes_price": 0.72,             // Number - Probability of 'yes' outcome (0-1)
  "no_price": 0.28,              // Number - Probability of 'no' outcome (0-1)
  "timestamp": "2023-06-01T12:00:00.000Z"  // String (ISO timestamp) - Update timestamp
}
```

### SSE Connection Object

```javascript
{
  "type": "connected",           // String - Type of update
  "timestamp": 1686000000000     // Integer (Unix timestamp) - Connection timestamp
}
```

### SSE Heartbeat Object

```javascript
{
  "type": "heartbeat",           // String - Type of update
  "timestamp": 1686000000000     // Integer (Unix timestamp) - Heartbeat timestamp
}
```
