# SecondOrder.fun

A full-stack Web3 platform that combines raffles with prediction markets (InfoFi) to create structured, fair finite games that convert crypto speculation into quantifiable value.

## Project Overview

SecondOrder.fun is a decentralized platform that:

- Hosts raffles where players can win prizes
- Creates associated prediction markets (InfoFi) for each raffle
- Uses hybrid pricing mechanisms combining raffle positions with market sentiment
- Detects and exploits arbitrage opportunities between raffle prices and market predictions
- Provides real-time updates via Server-Sent Events (SSE)

## Technology Stack

### Frontend

- React 18
- Vite 6
- TypeScript/JavaScript
- Tailwind CSS
- shadcn/ui component library
- Wagmi for Ethereum interactions
- Viem for Ethereum utilities
- RainbowKit for wallet connections

### Backend

- Fastify for REST API
- Hono for edge functions and SSE
- Supabase for database
- WebSocket for real-time communication

### Smart Contract

- Solidity
- Foundry development framework
- OpenZeppelin for secure contract patterns
- Chainlink VRF for random number generation

### Testing

- Vitest for frontend testing
- Foundry for smart contract testing

## Project Structure

```bash
sof-alpha/
├── backend/
│   ├── fastify/
│   │   ├── routes/
│   │   └── server.js
│   ├── hono/
│   └── shared/
├── contracts/
│   ├── src/
│   │   ├── core/
│   │   └── infofi/
│   ├── test/
│   ├── script/
│   └── lib/
├── documentation/
├── instructions/
├── public/
├── src/
│   ├── components/
│   ├── contexts/
│   ├── hooks/
│   ├── lib/
│   ├── styles/
│   └── views/
├── tests/
└── documentation/
```

## Setup Instructions

### Prerequisites

- Node.js >= 18
- Foundry (for smart contract development)
- Git

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/secondorder-fun.git
   cd secondorder-fun
   ```

2. Install frontend dependencies:

   ```bash
   npm install
   ```

3. Install backend dependencies:

   ```bash
   npm install fastify @fastify/cors @fastify/helmet @fastify/rate-limit ws
   npm install hono
   npm install @supabase/supabase-js
   npm install jsonwebtoken
   ```

4. Set up smart contract dependencies:

   ```bash
   cd contracts
   forge install openzeppelin/openzeppelin-contracts
   forge install smartcontractkit/chainlink
   cd ..
   ```

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Wallet Connect
VITE_WALLET_CONNECT_PROJECT_ID=your_wallet_connect_project_id

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h

# Chainlink VRF (for smart contracts)
VRF_COORDINATOR=your_vrf_coordinator_address
VRF_KEY_HASH=your_vrf_key_hash
VRF_SUBSCRIPTION_ID=your_vrf_subscription_id

# Deployment
PRIVATE_KEY=your_private_key_for_deployment
```

### Running the Application

#### Frontend Development

```bash
npm run dev
```

This will start the Vite development server on `http://localhost:5173`.

#### Backend Server

```bash
node backend/fastify/server.js
```

This will start the Fastify server on `http://localhost:3001`.

#### Smart Contract Development

Compile contracts:

```bash
cd contracts
forge build
```

Run tests:

```bash
forge test
```

Deploy contracts (to local network):

```bash
forge script script/Deploy.s.sol:DeployScript --rpc-url http://localhost:8545 --private-key $PRIVATE_KEY --broadcast
```

### Running Tests

#### Frontend Tests

```bash
npm run test
```

#### Smart Contract Tests

```bash
cd contracts
forge test
```

## Smart Contracts

### Raffle.sol

The core raffle contract that handles:

- Creating and managing raffles
- Selling tickets
- Selecting winners using Chainlink VRF
- Distributing prizes

### InfoFiMarket.sol

The prediction market contract that handles:

- Creating prediction markets for raffle outcomes
- Accepting bets on yes/no questions
- Resolving markets with outcomes
- Distributing payouts to winners

## API Endpoints

### Raffle API (Fastify)

- `GET /api/raffles` - Get all active raffles
- `GET /api/raffles/:id` - Get a specific raffle
- `POST /api/raffles` - Create a new raffle
- `POST /api/raffles/:id/join` - Join a raffle
- `GET /api/raffles/:id/participants` - Get raffle participants

### InfoFi API (Fastify)

- `GET /api/infofi/markets` - Get all active InfoFi markets
- `GET /api/infofi/markets/:id` - Get a specific InfoFi market
- `POST /api/infofi/markets` - Create a new InfoFi market
- `POST /api/infofi/markets/:id/bet` - Place a bet on an InfoFi market
- `GET /api/infofi/markets/:id/odds` - Get market odds

### User API (Fastify)

- `GET /api/users/profile/:id` - Get user profile
- `GET /api/users/:id/raffles` - Get user's raffle participation
- `GET /api/users/:id/infofi-positions` - Get user's InfoFi market positions
- `GET /api/users/:id/portfolio` - Get user's portfolio
- `PUT /api/users/profile/:id` - Update user profile

### Real-time Updates (Hono SSE)

- `GET /sse/raffles` - SSE endpoint for real-time raffle updates
- `GET /sse/infofi-markets` - SSE endpoint for real-time InfoFi market updates
- `GET /sse/arbitrage` - SSE endpoint for arbitrage opportunities

## Development Phases

1. **Foundation** (Week 1-2)

   - Project setup and structure
   - Basic frontend components
   - Backend API endpoints
   - Smart contract development

2. **Core Features** (Week 3-4)

   - Raffle creation and participation
   - InfoFi market creation and betting
   - Wallet integration
   - Basic UI/UX

3. **Advanced Features** (Week 5-6)

   - Hybrid pricing mechanisms
   - Arbitrage detection
   - Real-time updates
   - Advanced UI components

4. **Testing & Refinement** (Week 7-8)
   - Comprehensive testing
   - Bug fixes and optimizations
   - Documentation
   - Deployment preparation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a pull request

## License

MIT

## Contact

For questions or support, please open an issue on GitHub.
