---
trigger: always_on
---

# SecondOrder.fun Prediction Market Integration: Technical Implementation Part 1

## Overview: Second-Order Betting on Raffle Outcomes

The prediction market layer allows users to bet on raffle outcomes and participant behavior without directly participating in the raffle itself. This creates a **derivative betting layer** where users can speculate on who will win, how many tickets will be sold, and what strategies other players will use.

## Core Data Inputs: Position Tracking System

### Real-Time Position Monitoring

**Data Sources Needed:**

- **Bonding curve contract events** (Buy/Sell transactions)
- **Player position sizes** (Current ticket holdings per address)
- **Sliding window calculations** (Number ranges for each player)
- **Transaction timestamps** (For position entry order tracking)

**Example Data Structure:**

```javascript
{
  "seasonId": "season_001",
  "totalTickets": 50000,
  "totalPlayers": 125,
  "positions": [
    {
      "address": "0xabc...",
      "ticketCount": 5000,
      "numberRange": [1, 5000],
      "entryBlock": 18500000,
      "lastUpdate": 18750000,
      "winProbability": 0.10
    },
    {
      "address": "0xdef...",
      "ticketCount": 2500,
      "numberRange": [5001, 7500],
      "entryBlock": 18600000,
      "lastUpdate": 18600000,
      "winProbability": 0.05
    }
  ],
  "lastUpdate": "2025-07-20T15:30:00Z"
}
```

### Position Update Frequency (Real-Time Approach)

**Event-Driven Updates:**

- **On-chain transaction events** trigger immediate updates (Buy/Sell from bonding curve)
- **WebSocket connections** push updates to all connected clients
- **Smart contract event listeners** monitor raffle contract emissions:
  ```solidity
  event TicketPurchase(address player, uint256 amount, uint256 newTotal);
  event TicketSale(address player, uint256 amount, uint256 newTotal);
  event PositionUpdate(address player, uint256 startRange, uint256 endRange);
  ```
- **Sliding window recalculation** occurs instantly on position changes
- **Batch confirmations** every block (2 seconds on Base) for UI consistency

**Real-Time Architecture:**

```
Blockchain Events → Event Processor → Position Calculator →
WebSocket Broadcast → Live UI Updates → Market Price Adjustments
```

## Win Probability Calculations

### Linear Probability Formula

Since we're using linear probability with sliding windows:

```
Player Win Probability = (Player Ticket Count) / (Total Tickets Issued)

Example:
- Player A: 1,500 tickets out of 50,000 total = 3% win chance
- Player B: 700 tickets out of 50,000 total = 1.4% win chance
- Player C: 300 tickets out of 50,000 total = 0.6% win chance
```

### Dynamic Probability Updates

**As ticket purchases occur:**

1. **New tickets minted** → Total supply increases → All probabilities decrease proportionally
2. **Player increases position** → Their probability increases, others decrease
3. **Player sells tickets** → Their probability decreases, others increase proportionally

**Example Dynamic Change:**

```
Initial State: 40,000 total tickets
- Player A: 4,000 tickets = 10% win chance

Player B buys 10,000 new tickets:
New State: 50,000 total tickets
- Player A: 4,000 tickets = 8% win chance (decreased)
- Player B: 10,000 tickets = 20% win chance (new)
```

## Prediction Market Structure

### Market Types

**Primary Markets:**

1. **Winner Prediction** - "Will Player X win the raffle?"
2. **Position Size Prediction** - "Will Player X hold >5,000 tickets at season end?"
3. **Total Participation** - "Will >100,000 total tickets be sold?"
4. **Price Level Prediction** - "Will ticket price exceed 20 $SOF?"

**Secondary Markets:**

1. **Exit Timing** - "Will Player X exit before season end?"
2. **Whale Behavior** - "Will any player hold >25% of total tickets?"
3. **Late Entry** - "Will >10,000 tickets be sold in final 24 hours?"

### Market Creation Triggers (Automatic + Threshold-Based)

**Automatic Market Creation:**

- **When player position ≥1% of total** tickets → Create winner market for that player
- **When existing player crosses 1% threshold** → Instant market generation
- **When total tickets reach milestones** (25k, 50k, 100k) → Create participation level markets
- **24 hours before season end** → Create exit timing markets for major players
- **When bonding curve price reaches thresholds** → Create price level markets

**Market Creation Logic:**

```javascript
// Monitor position changes in real-time
if (newPosition.percentage >= 1.0 && !marketExists(player)) {
  createWinnerMarket(player, currentOdds);
  broadcastNewMarket(marketId, player);
}

// Check for threshold crossings
if (oldPosition.percentage < 1.0 && newPosition.percentage >= 1.0) {
  createWinnerMarket(player, currentOdds);
}
```

**Future Enhancement: User-Created Markets**

- Phase 2 feature allowing custom market creation
- Duplicate prevention through market hash verification
- Community moderation for non-standard markets

## Prediction Market Pricing Mechanisms

### Option 1: Fixed-Odds Market Maker

**Simple Implementation (Like Onit):**

```
Yes Token Price = Current Win Probability
No Token Price = 1 - Current Win Probability

Example:
Player A has 3% win chance
- "Player A Wins" token = $0.03
- "Player A Loses" token = $0.97
```

**Advantages:**

- Easy to understand and implement
- Real-time price updates based on raffle data
- Low gas costs for price updates

**Disadvantages:**

- No price discovery from betting activity
- Limited liquidity mechanisms

### Option 2: AMM-Based Pricing (Polymarket Style)

**Dynamic Pricing with Liquidity Pools:**

```
Initial Price = Current Win Probability
Market Price = AMM formula considering:
- Betting volume on each side
- Liquidity pool ratios
- Time to raffle resolution
```

**AMM Formula for Binary Markets:**

```
Constant Product: Yes_Tokens × No_Tokens = k
Price Discovery: Price = Yes_Pool / (Yes_Pool + No_Pool)
```

**Example:**

```
Player A Win Market:
- Yes Pool: 1,000 USDC
- No Pool: 9,000 USDC
- Current Price: 1,000 / 10,000 = $0.10 (10% implied probability)
- Raffle Probability: 3% (from ticket holdings)
- Arbitrage Opportunity: Buy "Yes" tokens (underpriced by market)
```

### Hybrid Pricing Model (Selected Approach)

**Combine real-time raffle data with market sentiment:**

```
Market Price = (0.7 × Raffle_Probability) + (0.3 × AMM_Price)

This creates:
- Price anchoring to actual ticket data (70% weight)
- Price discovery from betting sentiment (30% weight)
- Arbitrage opportunities when sentiment diverges from reality
```

**Gamification Through Arbitrage Dynamics:**

- **Information Edge Rewards**: Players with deep raffle knowledge can profit from prediction market mispricing
- **Cross-Market Strategy**: Hold raffle position AND bet against yourself for guaranteed profit scenarios
- **Market Efficiency Incentives**: Arbitrageurs correct pricing, improving market accuracy
- **Layered Complexity**: Multiple ways to play creates different user archetypes and engagement levels

## Technical Implementation Architecture

### Data Flow Pipeline

```
1. Raffle Contract Events
   ↓
2. Position Tracking Service
   ↓
3. Probability Calculator
   ↓
4. Market Price Engine
   ↓
5. Onit SDK Integration
   ↓
6. Frontend Price Display
```

### Smart Contract Integration

**Raffle Contract Interface:**

```solidity
interface IRaffleContract {
    function getTotalTickets() external view returns (uint256);
    function getPlayerPosition(address player) external view returns (uint256);
    function getPlayerList() external view returns (address[]);
    function getNumberRange(address player) external view returns (uint256 start, uint256 end);
}
```

**Prediction Market Contract:**

```solidity
interface IPredictionMarket {
    function updatePlayerOdds(address player, uint256 probability) external;
    function createMarket(address player, uint256 initialOdds) external;
    function resolveMarket(address winner) external;
}
```

### API Endpoints (Following Onit Pattern)

```typescript
// Get current odds for all players
GET /api/seasons/{seasonId}/odds

// Get specific player's win probability
GET /api/seasons/{seasonId}/players/{address}/odds

// Get prediction markets for season
GET /api/seasons/{seasonId}/markets

// Place bet on outcome
POST /api/markets/{marketId}/bet
{
  "outcome": "yes",
  "amount": 100,
  "wallet": "0x..."
}
```

## Integration with Primary Order Mechanics

### Alignment with SecondOrder.fun Framework

**Building on the established raffle tokenomics** from our bonding curve analysis:

- **Fixed $SOF supply** (100M tokens) provides base layer stability
- **2-week season structure** creates rapid prediction market cycles
- **Graduated liquidity phases** for raffle participants parallel prediction market settlement
- **Platform fee capture** (0.1% buy, 0.7% sell) funds prediction market liquidity bootstrapping

### Connection to Winner Selection System

**From our sliding window analysis:**

- **Linear probability calculation** provides transparent, verifiable odds for prediction markets
- **Real-time position tracking** enables instant market price updates
- **Sliding window numbering** creates unique, trackable positions for betting
- **Winner selection transparency** ensures prediction market resolution accuracy

### Cross-Market Arbitrage Opportunities

**Leveraging the bonding curve dynamics:**

- **Early raffle participants** see immediate arbitrage if prediction markets misprice their positions
- **Late entry psychology** can be predicted and monetized through behavioral betting markets
- **Exit timing strategies** become tradeable instruments through prediction markets
- **Prize pool growth** creates expanding arbitrage opportunities as stakes increase

## Market Resolution & Settlement (Rapid Resolution)

### Immediate Resolution Timeline

**Aligned with primary raffle resolution:**

1. **Raffle ends** → Winner determined via sliding window random selection
2. **Within 5 minutes**: All winner prediction markets auto-resolve via smart contract
3. **Within 15 minutes**: Secondary markets (position sizes, participation) resolve using final data
4. **Within 30 minutes**: Behavioral markets (exit timing, whale activity) complete settlement
5. **Phase 1 completion** (Day 1-7): All prediction market payouts distributed alongside raffle prize distribution

**Resolution Process Integration:**

```
Raffle Contract Resolution:
- Random number generation
- Sliding window winner mapping
- Prize distribution initiation

Parallel Prediction Market Resolution:
- Winner markets → Immediate settlement
- Position markets → Final snapshot verification
- Behavioral markets → Historical data analysis
- Cross-market settlements → Automatic execution
```

### Synchronization with Graduated Liquidity System

**Following our established phases:**

- **Phase 1 (Days 1-7)**: Prediction markets resolve immediately, winners get instant payouts
- **Phase 2 (Days 8-30)**: Prediction market winnings can be rolled into next season with 10% bonus
- **Phase 3 (Day 31+)**: Unclaimed prediction market winnings join treasury for platform development

**This maintains consistency** between primary raffle mechanics and secondary prediction markets, ensuring users understand unified timeframes across all platform features.

## Revenue Model Integration

### Fee Structure

**Market Creation Fees:**

- **Automatic markets**: No fee (platform-generated)
- **Custom markets**: 0.1% of initial liquidity

**Trading Fees:**

- **2% on net winnings** (following Polymarket model)
- **0.1% on trade volume** (following Onit simplicity)

**Settlement Fees:**

- **1% of total market volume** (distributed to $SOF holders)

### Cross-Platform Arbitrage Revenue

**Platform benefits from arbitrage opportunities:**

- **Users spot pricing inefficiencies** between raffle odds and market prices
- **Increased trading volume** from arbitrage activity
- **Market efficiency improvement** through price correction
- **Fee generation** from arbitrage trading
