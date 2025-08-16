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
- [x] Set up development environments (local)
  - [x] Anvil + Foundry scripts working end-to-end (deploy, create/start season, buy, end via VRF request)
  - [x] Env var docs added in `contracts/README.md`
  - [x] Deploy script updated to premint 10,000,000 SOF to deployer for local testing
- [ ] Set up development environments (testnet)

### Frontend Development Setup

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
  - [ ] Implement Farcaster SignInButton and user profile display
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
- [ ] Create database schema and migrations (markets, positions, winnings, pricing cache)
- [ ] Connect frontend to backend services (query/mutations wired to API)

### Frontend Features

- [ ] Build raffle display components (season list, ticket positions, odds)
- [ ] Build InfoFi market components with real-time updates
- [ ] Implement arbitrage opportunity display
- [ ] Create cross-layer strategy panel
- [ ] Add settlement status tracking
- [ ] Build winnings claim interface
- [ ] User experience refinement (copy, flows, accessibility)

### Frontend Contract Integration (NEXT)

- **Network & Config**
  - [x] Add network toggle UI (Local/Anvil default, Testnet) in a `NetworkToggle` component
  - [x] Provide network config via `src/config/networks.js` (RPC URLs, chain IDs)
  - [x] Provide contract address map via `src/config/contracts.js` (RAFFLE, SOF, BONDING_CURVE per network)
  - [x] Default network to Local/Anvil; persist selection in localStorage
  - [ ] Update Wagmi config to switch chains dynamically based on toggle

- **Wagmi/Viem Hooks**
  - [x] `useRaffleRead()` for `currentSeasonId()`, `getSeasonDetails(seasonId)`
  - [x] `useRaffleAdmin()` for `createSeason()`, `startSeason()`, `requestSeasonEnd()` (role-gated)
  - [x] `useCurve()` for `buyTickets(amount)`, allowance and SOF approvals
  - [x] `useAccessControl()` to check `hasRole` for admin actions
  - [x] React Query integration (queries + mutations + invalidation) for reads/writes

- **Routing & Pages**

  - [x] Add routes for `/raffles`, `/raffles/:id`, `/admin`, and `/account`
  - [x] Implement `RaffleList` page to show active/current season overview
  - [x] Implement `RaffleDetails` page to show season timings, status, odds, buy form
  - [x] Implement `AdminPanel` page to create/start/end season, role status
  - [x] Implement `AccountPage` to show user's tickets, past participation, winnings
  - [ ] Header: `NetworkToggle`, wallet connect, current chain indicator
  - [ ] Widgets: `SeasonTimer`, `OddsBadge`, `TxStatusToast`

- **ENV & Addresses**
  
  - [ ] Add `.env` support for Vite: `VITE_RPC_URL_LOCAL`, `VITE_RPC_URL_TESTNET`
  - [ ] Add `VITE_RAFFLE_ADDRESS_LOCAL`, `VITE_SOF_ADDRESS_LOCAL`, `VITE_CURVE_ADDRESS_LOCAL`
  - [ ] Add testnet equivalents (left empty until deployment)
  - [ ] Update frontend README with network toggle and env examples
  - [x] Add `.env.example` template with all required frontend/backend variables

- **Testing**
  - [ ] Vitest tests for hooks (1 success, 1 edge, 1 failure per hook)
  - [ ] Component tests for `NetworkToggle`, `RaffleList`, `RaffleDetails`
  - [ ] Mock Wagmi viem clients for deterministic unit tests

### Backend API Alignment (Onchain)

- **Standards & Conventions**
  - [ ] Ensure backend follows `instructions/project-structure.md` and `.windsurf/rules/project-framework.md` conventions
  - [ ] Use ES Modules with ES6 imports; prefer TypeScript or JSDoc types
  - [x] Centralize RPC and addresses in `backend/src/config/chain.js` (env-driven)

- **Viem Server Clients**
  - [x] Create `backend/src/lib/viemClient.js` with `createPublicClient(http)` per network
  - [ ] Do NOT hold private keys in backend; no signing server-side
  - [ ] Add helpers to build calldata for admin/user actions (frontend signs)

- **Replace Mocked Endpoints with Onchain Reads**
  - [ ] GET `/api/raffles` → read current/active seasons from Raffle contract
  - [ ] GET `/api/raffles/:id` → `getSeasonDetails`, state, VRF status
  - [ ] GET `/api/raffles/:id/positions` → aggregate from contract events/state
  - [ ] GET `/api/prices/:marketId` → from `market_pricing_cache` with fallback to onchain oracle if present

- **Transaction Builder Endpoints (No Server Signing)**

  - [ ] POST `/api/tx/curve/buy` → returns { to, data, value } for `buyTickets(amount)`
  - [ ] POST `/api/tx/sof/approve` → returns calldata for `approve(spender, amount)`
  - [ ] POST `/api/tx/raffle/admin` → returns calldata for `create/start/requestSeasonEnd` (role-gated in UI)

- **Real-Time & Events**

  - [ ] SSE `/stream/raffles/:id/events` → stream contract events (purchases, season changes)
  - [ ] Backfill from logs via viem `getLogs` on connect; then `watchContractEvent`
  - [ ] Wire arbitrage detection to live updates (consumes SSE internally)

- **Security & Ops**

  - [ ] Rate limit public endpoints; cache hot reads (e.g., season details)
  - [ ] Env validation for RPC URLs and addresses; fail fast with helpful errors
  - [ ] Add healthcheck that verifies RPC connectivity per network

- **Tests**
  - [ ] Unit tests for viem read helpers (success/edge/failure)
  - [ ] API tests for each endpoint (mock RPC)
  - [ ] SSE integration test (connect, receive initial snapshot + updates)

### Smart Contracts Development

- [x] Create contracts directory structure
- [x] Set up Foundry development environment
- [x] Implement core raffle contracts
- [x] Develop InfoFi market contracts
- [x] Integrate Chainlink VRF for provably fair resolution
- [x] Implement OpenZeppelin AccessControl for permissions
- [x] Add minimal Foundry tests for season-based Raffle + BondingCurve integration
- [ ] Security audits of smart contracts
- [x] Update `Deploy.s.sol` to premint 10,000,000 SOF to deployer (local runs)
- [ ] Deploy InfoFiMarketFactory.sol with AccessControl (testnet)
- [ ] Integrate VRF callbacks with InfoFiSettlement.sol (testnet validation)
- [ ] Enhance RaffleBondingCurve.sol with InfoFi event emission (verified on testnet)

### Documentation and Testing

- [x] Create basic README.md with setup instructions
- [x] Set up Vitest for frontend testing
- [x] Configure testing framework for backend services
- [x] Set up Foundry for smart contract testing
- [x] Document initial API endpoints
- [x] Create comprehensive API documentation for all endpoints
- [x] Document smart contract deployment for Anvil, testnet, and mainnet
- [ ] Comprehensive testing of all components (frontend, backend, contracts)
- [ ] Security testing of arbitrage execution paths
- [ ] User acceptance testing (UAT)

#### Smart Contract Testing Roadmap (Discovered During Work)

- [x] Minimal integration tests for season creation, curve buy/sell, participant tracking
- [x] VRF winner selection flow with mock coordinator (request -> fulfill -> Completed status)
- [x] Edge cases: zero participants, duplicate winners handling
- [x] Trading lock enforcement after `requestSeasonEnd()`
- [x] Prize pool accounting from curve reserves at end-of-season
- [x] Access control checks for season lifecycle and emergency paths
- [ ] End-to-end testing of VRF → InfoFi settlement flow

Note: Trading lock was validated at the curve level via `lockTrading()`; add a follow-up test to exercise `Raffle.requestSeasonEnd()` path and broader role-gated lifecycle actions.

### Optimization & QA

- [ ] Performance optimization for real-time pricing and SSE
- [ ] General performance optimization (frontend/backend)

### Release & Deployment

- [ ] Production deployment preparation (envs, build, CI/CD)

## Latest Progress (2025-08-13)

- **Local VRF v2 flow validated**: Created season, started, advanced chain time, called `requestSeasonEnd()`; SeasonEndRequested emitted and VRF request created.
- **Premint added**: `contracts/script/Deploy.s.sol` now mints 10,000,000 SOF to deployer to simplify local testing/funding.
- **Docs improved**: `contracts/README.md` updated with buyer funding, env vars, VRF v2 mock fulfillment, and zsh-safe commands.
- **Tests**: Trading lock enforcement, access control checks, prize pool accounting, zero participants, and duplicate winners handling covered; tests passing locally.

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
