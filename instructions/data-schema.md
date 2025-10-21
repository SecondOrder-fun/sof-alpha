# SecondOrder.fun Data Schema

This document defines the data schema and formats for all entities in the SecondOrder.fun platform, including raffles, users, InfoFi markets, and real-time pricing data.

---

## Updated Schema (2025-08-17)

The following models align with the current smart contracts, InfoFi roadmap, and real-time pricing architecture. Values using basis points (bps) are integers from 0–10000.

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

**IMPORTANT**: Database uses snake_case column names. The actual Supabase table schema is:

- `raffle_id` (NOT `season_id` or `seasonId`)
- `player_address` (NOT `playerAddress`)
- `market_type` (NOT `marketType`)
- `initial_probability_bps` (NOT `initialProbabilityBps`)
- `current_probability_bps` (NOT `currentProbabilityBps`)
- `is_active` (NOT `isActive`)
- `is_settled` (NOT `isSettled`)

```typescript
type InfoFiMarket = {
  id: string | number;              // DB identifier (auto-increment)
  raffle_id: number;                // Associated raffle/season (DB column name)
  player_address?: string;          // For player-focused markets (DB column name)
  market_type: 'WINNER_PREDICTION' | 'POSITION_SIZE' | 'BEHAVIORAL';
  contract_address?: string;        // Onchain market address if deployed
  initial_probability_bps: number;  // Snapshot at creation
  current_probability_bps: number;  // Updated via position changes
  is_active: boolean;
  is_settled: boolean;
  settlement_time?: string;         // ISO timestamp
  winning_outcome?: boolean;        // Depends on market type
  created_at: string;               // ISO timestamp
  updated_at: string;               // ISO timestamp
}
```

**Frontend/API Mapping**: When returning to frontend, convert to camelCase:

- `raffle_id` → `raffleId` or `seasonId`
- `player_address` → `playerAddress`
- etc.

### InfoFi Position (User Bet)

```typescript
type InfoFiUserPosition = {
  id: string | number;
  marketId: string | number;
  userAddress: string;              // EVM address
  outcome: 'YES' | 'NO';
  amount: string;                   // Decimal string
  price?: string;                   // Price at entry
  createdAt: string;                // ISO timestamp
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

**IMPORTANT**: Database uses snake_case column names. The actual Supabase table schema is:

- Table name: `market_pricing_cache` (NOT `hybrid_pricing_cache`)
- `market_id` (BIGINT, primary key)
- `raffle_probability` (INTEGER, basis points 0-10000)
- `market_sentiment` (INTEGER, basis points 0-10000)
- `hybrid_price` (NUMERIC, decimal 0-1)
- `raffle_weight` (INTEGER, default 7000)
- `market_weight` (INTEGER, default 3000)
- `last_updated` (TIMESTAMPTZ)

```typescript
type MarketPricingCache = {
  market_id: number;                // Database column name
  raffle_probability: number;       // INTEGER: basis points from onchain positions (0-10000)
  market_sentiment: number;         // INTEGER: basis points from trading activity (0-10000)
  hybrid_price: number;             // NUMERIC: decimal (raffle_weight*raffle + market_weight*sentiment)/10000/10000
  raffle_weight: number;            // INTEGER: default 7000 (70%)
  market_weight: number;            // INTEGER: default 3000 (30%)
  last_updated: string;             // ISO timestamp
}
```

### Arbitrage Opportunity (Analytics)

```typescript
type ArbitrageOpportunity = {
  id: string | number;
  seasonId: number;
  playerAddress: string;
  marketId: string | number;
  rafflePriceBps: number;           // Effective raffle-implied price
  marketPriceBps: number;           // Current hybrid market price
  priceDifferenceBps: number;
  profitabilityPct: number;         // Percentage (e.g., 2.5 means 2.5%)
  estimatedProfit: string;          // Decimal string
  isExecuted: boolean;
  executedAt?: string;              // ISO timestamp
  createdAt: string;                // ISO timestamp
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
