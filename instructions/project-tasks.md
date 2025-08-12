# SecondOrder.fun Project Tasks

## Project Overview

SecondOrder.fun is a full-stack Web3 platform that transforms cryptocurrency speculation into structured, fair finite games through applied game theory enhanced with InfoFi (Information Finance) integration. The platform combines transparent raffle mechanics with sophisticated prediction markets to create a multi-layer system enabling cross-layer strategies, real-time arbitrage opportunities, and information-based value creation.

## Initial Setup Tasks

### Project Structure Initialization

- [x] Create root directory structure per project-structure.md
- [x] Set up package.json with frontend dependencies
- [x] Configure Vite build system
- [x] Set up Tailwind CSS and shadcn/ui
- [x] Initialize Git repository with proper .gitignore

### Frontend Development Setup (COMPLETED)

All frontend development setup tasks have been completed:

- [x] Create src directory structure
- [x] Set up React 18 with Vite
- [x] Configure routing with React Router DOM v7
- [x] Implement basic Web3 integration with Wagmi + Viem
  - [x] Create WalletContext (src/context/WalletContext.jsx)
  - [x] Add WalletProvider to main.jsx
  - [x] Create WalletConnection component (src/components/wallet/WalletConnection.jsx)
  - [x] Create useRaffleContract hook (src/hooks/useRaffleContract.js)
  - [x] Create test page to verify Web3 and Farcaster integration (src/app/test/page.jsx)
- [x] Set up Farcaster Auth Kit + RainbowKit
  - [x] Install @farcaster/auth-kit and viem
  - [x] Add AuthKitProvider to app root
  - [x] Implement Farcaster SignInButton and user profile display
- [x] Configure React Query for state management
- [x] Implement Server-Sent Events (SSE) for real-time updates
  - [x] Create custom useSSE hook (src/hooks/useSSE.js)
  - [x] Create SSEContext for managing connections (src/context/SSEContext.jsx)
  - [x] Add SSEProvider to main.jsx
  - [x] Create SSE test component (src/components/common/SSETest.jsx)
  
### Routing Scaffolding (COMPLETED)

- [x] Scaffold React Router structure under `src/routes/`
  - [x] Create `Home.jsx`, `Test.jsx`, and `NotFound.jsx`
  - [x] Update router to lazy-load routes with `React.lazy` and `Suspense` in `src/main.jsx`
  - [x] Add index route (`/` → `Home`) and catch-all 404 route (`*` → `NotFound`)
  - [x] Replace prior test page reference from `src/app/test/page.jsx` to `src/routes/Test.jsx`

### Backend Services Setup

- [x] Create backend directory structure
- [x] Set up Fastify server
- [x] Configure Hono edge functions
- [x] Initialize Supabase integration
- [x] Set up JWT + Farcaster authentication
- [x] Implement SSE endpoints for real-time data
- [x] Implement InfoFi market API endpoints (CRUD, pricing, streaming)
- [x] Implement arbitrage detection engine
- [x] Implement cross-layer settlement coordination
- [x] Implement advanced analytics endpoints
- [x] Create comprehensive API documentation

### Smart Contracts Development

- [x] Create contracts directory structure
- [x] Set up Foundry development environment
- [x] Implement core raffle contracts
- [x] Develop InfoFi market contracts
- [x] Integrate Chainlink VRF for provably fair resolution
- [x] Implement OpenZeppelin AccessControl for permissions
- [x] Add minimal Foundry tests for season-based Raffle + BondingCurve integration

### Documentation and Testing

- [x] Create basic README.md with setup instructions
- [x] Set up Vitest for frontend testing
- [x] Configure testing framework for backend services
- [x] Set up Foundry for smart contract testing
- [x] Document initial API endpoints
- [x] Create comprehensive API documentation for all endpoints
- [x] Document smart contract deployment for Anvil, testnet, and mainnet

#### Smart Contract Testing Roadmap (Discovered During Work)

- [x] Minimal integration tests for season creation, curve buy/sell, participant tracking
- [x] VRF winner selection flow with mock coordinator (request -> fulfill -> Completed status)
- [x] Edge cases: zero participants, duplicate winners handling
- [ ] Trading lock enforcement after `requestSeasonEnd()`
- [x] Prize pool accounting from curve reserves at end-of-season
- [ ] Access control checks for season lifecycle and emergency paths

Note: Trading lock was validated at the curve level via `lockTrading()`; add a follow-up test to exercise `Raffle.requestSeasonEnd()` path and broader role-gated lifecycle actions.

## Development Phases

### Phase 1: Foundation

- Complete project structure initialization
- Set up development environments
- Implement basic frontend layout
- Create initial smart contract framework

### Phase 2: Core Functionality

- Implement raffle mechanics
- Develop InfoFi market contracts
- Build frontend components for raffle display
- Create backend services for data management

### Phase 3: Integration

- Connect frontend to backend services
- Integrate Web3 functionality
- Implement real-time SSE updates
- Develop cross-layer strategy components

### Phase 4: Testing and Refinement

- Comprehensive testing of all components
- Security audits of smart contracts
- Performance optimization
- User experience refinement

### Phase 5: Core InfoFi Smart Contracts

- Deploy InfoFiMarketFactory.sol with OpenZeppelin AccessControl
- Implement InfoFiPriceOracle.sol with hybrid pricing model
- Integrate VRF callbacks with InfoFiSettlement.sol
- Enhance RaffleBondingCurve.sol with InfoFi event emission
- Complete smart contract audit and testing

### Phase 6: Real-Time Data Integration

- Implement RealTimePricingService with SSE streams
- Deploy arbitrage detection system
- Create database schema and migrations
- Build backend services for market management
- Test cross-layer event coordination

### Phase 7: Frontend Integration

- Build InfoFi market components with real-time updates
- Implement arbitrage opportunity display
- Create cross-layer strategy panel
- Add settlement status tracking
- Build winnings claim interface

### Phase 8: Testing & Optimization

- End-to-end testing of VRF → InfoFi settlement flow
- Performance optimization for real-time pricing
- Security testing of arbitrage execution
- User acceptance testing
- Production deployment preparation

## Discovered During Work

- [x] Fix all backend Fastify route lint errors (unused vars, undefined identifiers, unreachable code)
- [x] Fix all backend/config lint errors (process, require, \_\_dirname, unused vars)
- [x] Fix all frontend unused variable/import warnings
- [x] Design and document InfoFi market API endpoints
- [x] Implement mock implementations for placeholder backend endpoints:
  - [x] Raffle endpoints (`/api/raffles`)
  - [x] User profile endpoints (`/api/users`)
  - [x] SSE pricing stream endpoint (`/api/pricing/markets/:id/pricing-stream`)
  - [x] Add npm scripts to run Anvil and deploy contracts locally (`anvil`, `deploy:anvil`, `anvil:deploy`)
