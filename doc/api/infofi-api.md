# InfoFi Market API Documentation

## Overview

The InfoFi Market API provides endpoints for managing prediction markets, real-time pricing, arbitrage opportunities, and cross-layer coordination with raffle systems.

## Base URL

```text
/api/infofi
```

## InfoFi Markets

### Get All Active InfoFi Markets

Retrieve all currently active prediction markets.

```http
GET /markets
```

**Response:**

```json
{
  "markets": [
    {
      "id": 1,
      "raffle_id": 1,
      "question": "Will Bitcoin reach $100,000 by end of season?",
      "yes_price": 0.65,
      "no_price": 0.35,
      "volume": 12500,
      "created_at": "2023-01-01T00:00:00Z",
      "expires_at": "2023-01-15T00:00:00Z",
      "status": "active"
    }
  ]
}
```

### Get InfoFi Market by ID

Retrieve a specific prediction market by ID.

```http
GET /markets/:id
```

**Response:**

```json
{
  "id": 1,
  "raffle_id": 1,
  "question": "Will Bitcoin reach $100,000 by end of season?",
  "yes_price": 0.65,
  "no_price": 0.35,
  "volume": 12500,
  "created_at": "2023-01-01T00:00:00Z",
  "expires_at": "2023-01-15T00:00:00Z",
  "status": "active",
  "description": "Prediction market for Bitcoin price at end of raffle season"
}
```

### Create InfoFi Market

Create a new prediction market.

```http
POST /markets
```

**Request Body:**

```json
{
  "raffle_id": 1,
  "question": "Will Bitcoin reach $100,000 by end of season?",
  "description": "Prediction market for Bitcoin price at end of raffle season",
  "expires_at": "2023-01-15T00:00:00Z"
}
```

**Response:**

```json
{
  "id": 1,
  "raffle_id": 1,
  "question": "Will Bitcoin reach $100,000 by end of season?",
  "yes_price": 0.5,
  "no_price": 0.5,
  "volume": 0,
  "created_at": "2023-01-01T00:00:00Z",
  "expires_at": "2023-01-15T00:00:00Z",
  "status": "active",
  "description": "Prediction market for Bitcoin price at end of raffle season"
}
```

### Update InfoFi Market

Update an existing prediction market.

```http
PUT /markets/:id
```

**Request Body:**

```json
{
  "question": "Updated question",
  "description": "Updated description"
}
```

**Response:**

```json
{
  "id": 1,
  "raffle_id": 1,
  "question": "Updated question",
  "yes_price": 0.65,
  "no_price": 0.35,
  "volume": 12500,
  "created_at": "2023-01-01T00:00:00Z",
  "expires_at": "2023-01-15T00:00:00Z",
  "status": "active",
  "description": "Updated description"
}
```

### Delete InfoFi Market

Delete a prediction market.

```http
DELETE /markets/:id
```

**Response:**

```json
{
  "success": true
}
```

## Real-Time Pricing

### SSE Stream for Market Prices

Server-Sent Events endpoint for real-time market price updates.

```http
GET /markets/:id/pricing-stream
```

**Response (SSE):**

```json
data: {"type": "price_update", "market_id": 1, "yes_price": 0.67, "no_price": 0.33, "timestamp": "2023-01-01T00:00:00Z"}

```

## Arbitrage Opportunities

### Get Arbitrage Opportunities

Retrieve current arbitrage opportunities between raffle positions and InfoFi markets.

```http
GET /arbitrage/opportunities
```

**Response:**

```json
{
  "opportunities": [
    {
      "id": 1,
      "raffle_id": 1,
      "market_id": 1,
      "player_address": "0x123...",
      "raffle_price": 0.75,
      "infofi_price": 0.65,
      "price_difference": 0.1,
      "profitability": 15.38,
      "estimated_profit": 153.85,
      "strategy_description": "Hedge raffle position by selling equivalent InfoFi position"
    }
  ]
}
```

### Execute Arbitrage Strategy

Execute an arbitrage strategy.

```http
POST /arbitrage/execute
```

**Request Body:**

```json
{
  "opportunity_id": 1,
  "player_address": "0x123..."
}
```

**Response:**

```json
{
  "success": true,
  "transaction_hash": "0xabc...",
  "estimated_profit_realized": 153.85
}
```

## Cross-Layer Coordination

### Get Settlement Status

Retrieve the settlement status for a raffle and its associated InfoFi markets.

```http
GET /settlement/status/:raffle_id
```

**Response:**

```json
{
  "raffle_id": 1,
  "raffle_status": "resolved",
  "infofi_markets": [
    {
      "market_id": 1,
      "status": "settled",
      "winning_outcome": "YES",
      "settled_at": "2023-01-15T00:00:00Z"
    }
  ],
  "vrf_request_id": "0xdef...",
  "completed_at": "2023-01-15T00:00:00Z"
}
```
