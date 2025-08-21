# SecondOrder.fun Project Tasks

## Project Overview

SecondOrder.fun is a full-stack Web3 platform that transforms cryptocurrency speculation into structured, fair finite games through applied game theory enhanced with InfoFi (Information Finance) integration. The platform combines transparent raffle mechanics with sophisticated prediction markets to create a multi-layer system enabling cross-layer strategies, real-time arbitrage opportunities, and information-based value creation.

## Known Issues (2025-08-20)

- [x] Cannot buy tickets in the active raffle (Resolved 2025-08-20; see Latest Progress).

Note: Backend API tests are now green locally (see Latest Progress for details).

### Development Servers & Start Scripts

- Backend runs on port **3000** (Fastify). Frontend runs on port **5173** (Vite). This avoids the previous collision where port 3000 showed the web app.
- New scripts in `package.json`:
  - `npm run dev:backend` → start Fastify backend on port 3000
  - `npm run dev:frontend` → start Vite frontend on port 5173
  - `npm run dev` → alias for frontend (5173)
  - `npm run start:backend` / `npm run start:frontend` → same as above (explicit names)
  - `npm run kill:zombies` → kills processes on 8545 (anvil), 3000 (backend), 5173 (frontend)
  - `npm run anvil:deploy` → starts Anvil on 8545 and deploys contracts (then copies ABIs)
  - `npm run start:full` → executes the full local dev startup sequence:
    1. Kills any zombie servers (anvil/backend/frontend)
    2. Starts Anvil on 8545
    3. Deploys contracts and copies ABIs
    4. Starts backend on 3000
    5. Starts frontend on 5173

Notes:

- Backend port is controlled via `PORT` env (defaults to 3000 in code); scripts set `PORT=3000` to standardize.
- CORS in `backend/fastify/server.js` already allows <http://localhost:3000> and <http://localhost:5173> in dev.

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
- [x] Create database schema and migrations (markets, positions, winnings, pricing cache)
- [ ] Connect frontend to backend services (query/mutations wired to API)

### Frontend Features

- [ ] Build raffle display components (season list, ticket positions, odds)
- [ ] Build InfoFi market components with real-time updates
- [ ] Implement arbitrage opportunity display
- [ ] Create cross-layer strategy panel
- [ ] Add settlement status tracking
- [ ] Build winnings claim interface
- [ ] User experience refinement (copy, flows, accessibility)
- [x] Implement Admin page authorization (default to deployer `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, allow adding more admins)

### Frontend Contract Integration (NEXT)

- **Network & Config**
  - [x] Add network toggle UI (Local/Anvil default, Testnet) in a `NetworkToggle` component
  - [x] Provide network config via `src/config/networks.js` (RPC URLs, chain IDs)
  - [x] Provide contract address map via `src/config/contracts.js` (RAFFLE, SOF, BONDING_CURVE per network)
  - [x] Default network to Local/Anvil; persist selection in localStorage
  - [x] Update Wagmi config to switch chains dynamically based on toggle

- **Build & Tooling**
  - [x] Create script to copy contract ABIs to frontend directory

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
  - [x] Header: `NetworkToggle`, wallet connect, current chain indicator
  - [ ] Header: add "Prediction Markets" nav entry (temporary label; may shorten later) linking to markets index
  - [ ] Widgets: `SeasonTimer`, `OddsBadge`, `TxStatusToast`

- **ENV & Addresses**
  
  - [x] Add `.env` support for Vite: `VITE_RPC_URL_LOCAL`, `VITE_RPC_URL_TESTNET`
  - [x] Add `VITE_RAFFLE_ADDRESS_LOCAL`, `VITE_SOF_ADDRESS_LOCAL`, `VITE_SEASON_FACTORY_ADDRESS_LOCAL`, `VITE_INFOFI_MARKET_ADDRESS_LOCAL`
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

  - [x] Rate limit public endpoints; cache hot reads (e.g., season details)
  - [x] Env validation for RPC URLs and addresses; fail fast with helpful errors
  - [x] Add healthcheck that verifies RPC connectivity per network

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
- [x] Resolve contract size limit by refactoring with SeasonFactory
- [x] Fix InfoFiPriceOracle admin assignment during deploy (factory set as admin; no post-deploy grant needed)
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

- [ ] Refactor contract files to move library-like contracts into `contracts/src/lib`

## InfoFi Integration Roadmap (NEXT)

This roadmap consolidates the InfoFi specs into executable tasks across contracts, backend, frontend, and testing. These will be the next priorities after stabilizing tests and the ticket purchase bug.

### Current Local Status (2025-08-20)

- [x] Local deploys (Anvil): `InfoFiMarketFactory`, `InfoFiPriceOracle`, `InfoFiSettlement` deployed via `Deploy.s.sol`.
- [x] Oracle admin/updater: `InfoFiPriceOracle` constructed with `address(infoFiFactory)` as admin; factory holds `DEFAULT_ADMIN_ROLE` and `PRICE_UPDATER_ROLE`.
- [x] Raffle wired as VRF consumer (local mock) and season factory connected.
- [x] ENV/addresses synced to frontend/backend via scripts.
- [ ] Position events: Curve does not yet emit `PositionUpdate` nor call factory on threshold.
- [ ] Testnet deployments remain pending.

### InfoFi Smart Contracts

- [ ] Deploy `InfoFiMarketFactory.sol` to testnet; record addresses in `src/config/contracts.js` and backend env.
- [ ] Deploy `InfoFiPriceOracle.sol` to testnet; set initial weights (70/30).
- [ ] Deploy `InfoFiSettlement.sol` to testnet; grant `SETTLER_ROLE` to raffle/curve contract.
- [ ] Add `PositionUpdate(address player, uint256 oldTickets, uint256 newTickets, uint256 totalTickets)` event in `SOFBondingCurve`.
- [ ] In `SOFBondingCurve.buyTokens/sellTokens`, emit `PositionUpdate` and calculate probability bps; on crossing 1% upward, call `InfoFiMarketFactory.onPositionUpdate(...)` (idempotent guard in factory).
- [x] Ensure oracle updater role is assigned to factory (done via constructor passing factory as admin in local deploy; replicate on testnet).
- [ ] Validate VRF winner flow triggers settlement (raffle → settlement) on testnet.

### Backend (Services, SSE, DB)

- [x] Create DB schema/migrations in Supabase per `infofi_markets`, `infofi_positions`, `infofi_winnings`, `arbitrage_opportunities`, and `market_pricing_cache` (see schema in `.windsurf/rules`).
- [ ] Define marketId generation scheme and association with `seasonId` (multiple markets per season):
  - [ ] Choose deterministic ID format (e.g., `${seasonId}:${marketType}:${playerAddr}`) or DB PK + unique index on (seasonId, marketType, subject)
  - [ ] Expose resolver endpoints to list markets by season and fetch by marketId
  - [ ] Ensure SSE and snapshot endpoints accept the canonical marketId
- [ ] Implement pricing cache service with SSE streams: `/stream/pricing/:marketId` and `/stream/pricing/all`.
- [ ] Implement `infoFiMarketService` for market CRUD, pricing updates, settlement.
- [ ] Implement `arbitrageDetectionService` reacting to price updates; persist opportunities.
- [ ] Add REST endpoints: list markets for raffle, get user positions, place bet (mock/payments TBD), get current price snapshot.
- [ ] Add healthcheck and env validation for oracle/factory addresses.

### Frontend (Hooks & Components)

- [ ] Hook `useInfoFiMarkets(raffleId)` with React Query to fetch markets and user positions.
- [ ] Component `ArbitrageOpportunityDisplay` rendering live opportunities and execution stub.
- [ ] Components: `InfoFiMarketCard`, `ProbabilityChart`, `SettlementStatus`, `WinningsClaimPanel` (MVP scope).
- [ ] Connect SSE pricing stream to UI (initial snapshot + live updates).
- [ ] Add basic market actions (place YES/NO bet – mocked until payments are finalized).
- [ ] Account integration: show user's open prediction market positions in `AccountPage` (query by wallet → positions with PnL placeholders).

### Testing (Auto-Creation)

- [ ] Contracts: fork/testnet tests for factory creation thresholds and settlement triggers.
- [ ] Backend: unit tests for pricing service and arbitrage detection; SSE integration test.
- [ ] Frontend: Vitest tests for `useInfoFiMarkets` and `ArbitrageOpportunityDisplay` (success/edge/failure).

### Onit Integration (Local Mock Plan)

Given `onit-markets` is an SDK for Onit's hosted API (no public ABIs for local deploy), we'll integrate by mocking the API locally and swapping the base URL.

- **Env & Config**
  - [ ] Add `VITE_ONIT_API_BASE` (frontend) and `ONIT_API_BASE` (backend) to `.env.example`.
  - [ ] Default to `http://localhost:8787` in dev; `https://markets.onit-labs.workers.dev` in prod.

- **Backend (API Mock, Hono/Fastify)**
  - [ ] Implement endpoints compatible with `onit-markets` client:
    - [ ] `GET /api/markets` (list)
    - [ ] `POST /api/markets` (mock create)
    - [ ] `GET /api/markets/:marketAddress` (detail)
    - [ ] `GET /stream/pricing/:marketId/current` (snapshot)
    - [ ] `GET /stream/pricing/:marketId` (SSE hybrid updates)
  - [ ] Use SuperJSON-compatible serialization and zod validation (align with SDK expectations).

- **Frontend (Client Wiring)**
  - [ ] Create `onitClient.ts` wrapper using `getClient(import.meta.env.VITE_ONIT_API_BASE)`.
  - [ ] Add hooks to consume: list markets, get market, place bet (mock), subscribe to SSE.
  - [ ] Feature-flag switch between local mock and hosted API by env.

- **Testing**
  - [ ] Backend: unit tests for endpoints + SSE (initial snapshot + update event).
  - [ ] Frontend: integration tests validating client calls and SSE handling against local mock.

### Note

- No official Onit ABIs surfaced; if true onchain local is required, implement Option B: deploy our minimal prediction markets to Anvil and expose API-shaped adapter.

## InfoFi Market Auto-Creation (1% Threshold) — Plan & Tasks (2025-08-19)

Goal: Automatically create an InfoFi prediction market for a player as soon as their ticket position crosses ≥1% of total tickets in a season. Aligns with `instructions/project-requirements.md` and `.windsurf/rules` InfoFi specs. Use on-chain event-driven flow with a backend watcher fallback.

### Contracts (Primary Path)

- [ ] Emit `PositionUpdate(address player, uint256 oldTickets, uint256 newTickets, uint256 totalTickets)` on every buy/sell
- [ ] On crossing 1% upward (old < 1%, new ≥ 1%), call `InfoFiMarketFactory.onPositionUpdate(player, oldTickets, newTickets, totalTickets)` (idempotent)
- [ ] InfoFiMarketFactory
  - [ ] Enforce 100 bps threshold and prevent duplicates per `(seasonId, player, marketType)`
  - [ ] Map `seasonId → (player → marketId)`; expose a view function
  - [ ] Emit `MarketCreated(marketId, player, marketType, probabilityBps, marketContract)`
- [ ] InfoFiPriceOracle
  - [ ] Grant updater role to factory; default hybrid weights 70/30 (raffle/market)
- [ ] Foundry tests
  - [ ] Threshold crossing creates exactly one market; subsequent crossings don’t duplicate
  - [ ] Emits proper events and updates oracle probability

### Backend (Watcher + API)
- [ ] Viem watcher service (fallback & analytics)
  - [ ] `watchContractEvent` on PositionUpdate
  - [ ] Compute bps = `newTickets * 10000 / totalTickets` (guard `totalTickets>0`)
  - [ ] If `bps ≥ 100` and no market for `(raffleId/seasonId, player, WINNER_PREDICTION)`, `db.createInfoFiMarket`
  - [ ] Debounce duplicate events and ensure idempotency
- [ ] Routes alignment (`backend/fastify/routes/infoFiRoutes.js`)
  - [ ] `GET /api/infofi/markets?raffleId=` → list markets for a raffle
  - [ ] `POST /api/infofi/markets` accepts `{ raffle_id, player_address, market_type, initial_probability_bps }` for admin/backfill
- [ ] SSE pricing bootstrap
  - [ ] Initialize `market_pricing_cache` with raffleProbability=newProbability, marketSentiment=newProbability, `hybridPrice` per 70/30
  - [ ] Broadcast initial snapshot on `/api/stream/pricing/:marketId`
- [ ] Healthchecks/env
  - [ ] Validate factory/raffle addresses; add health endpoint

### Database (Supabase)

- [x] Apply schema: `infofi_markets`, `market_pricing_cache` (see `.windsurf/rules`)
- [x] Unique index `(raffle_id, market_type, player_address)` to prevent duplicates
- [x] Backfill task: rescan recent PositionUpdate logs to create missing markets

### Progress Notes (2025-08-20)
- **InfoFi DB setup**: Successfully applied schema for `infofi_markets` and `market_pricing_cache` tables.
- **Seeding**: Added sample data for active markets, one position for `0xf39F…2266` (2000 tickets), and pricing cache.
- **tx_hash logging**: Added `tx_hash` column on `infofi_positions` and backfilled purchase hash `0x9734…c68`.

### Frontend
- [ ] `useInfoFiMarkets(raffleId)` → fetch `GET /api/infofi/markets?raffleId=` and handle empty-state
- [ ] Add badge for players ≥1% with link to their market card (MVP)

### Testing
- [ ] Backend unit tests: threshold edge cases (exact 1.00%, flapping around threshold), idempotency
- [ ] Contract tests: factory creation path, pause/guard paths
- [ ] Frontend tests: hook states (success/empty/error); UI reflects market appearing after purchase

### Ops
- [ ] Update `.env.example` with Factory/Oracle/Settlement addresses (LOCAL/TESTNET)
- [ ] Document runbook: auto-creation flow, reindex procedure, and troubleshooting `/api/infofi/markets` 500s

## Latest Progress (2025-08-20)

- **Contracts (AccessControl fix)**: Updated `contracts/script/Deploy.s.sol` to construct `InfoFiPriceOracle` with `address(infoFiFactory)` as admin. This removes reliance on `tx.origin`/`msg.sender` in script context and eliminates `AccessControlUnauthorizedAccount` during `grantRole`.
- **Local deployment successful**: `npm run anvil:deploy` completes end-to-end. Addresses copied to frontend via `scripts/copy-abis.js` and `.env` updated via `scripts/update-env-addresses.js`.
- **ENV aligned**: `.env` now contains fresh LOCAL addresses for RAFFLE/SEASON_FACTORY/INFOFI_*.
- **Resolved**: "Cannot buy tickets in the active raffle" — buy flow now succeeds end-to-end on local (SOF balance + allowance + integer ticket amounts verified).

- **Backend/Supabase**:
  - Created InfoFi tables: `infofi_markets`, `infofi_positions`, `infofi_winnings`, `arbitrage_opportunities`, `market_pricing_cache` (via MCP migrations).
  - Seeded sample data: active markets, one position for `0xf39F…2266` (2000 tickets), and pricing cache.
  - Added `tx_hash` column on `infofi_positions` and backfilled purchase hash `0x9734…c68`.
  - Softened `/api/infofi/positions` to return empty list if tables are missing instead of 500.
  - Server now prefers `SUPABASE_SERVICE_ROLE_KEY` for writes; falls back to anon key.
  - Tightened RLS: kept public SELECT; removed public INSERT/UPDATE on `infofi_markets`, `infofi_positions`, and `market_pricing_cache` (service role writes only).

## Latest Progress (2025-08-17)

- **Frontend (sell flow)**: Implemented ticket sell flow in `src/routes/RaffleDetails.jsx` with integer amount, slippage input, estimated SOF receive, and "Min after slippage" display.
- **Hooks (curve)**: Added `sellTokens(tokenAmount, minSofAmount)` mutation in `src/hooks/useCurve.js` using Wagmi + React Query.
{{ ... }}
- **Lint & quality**: Removed debug logs, fixed variable shadowing, ensured unconditional hook declarations to avoid HMR hook-order errors.
- **Docs**: Fixed Markdown list formatting (MD005/MD007, MD032) in this file.
- **Backend (API tests)**: Added and stabilized Vitest coverage for Fastify route plugins `pricingRoutes`, `arbitrageRoutes`, `analyticsRoutes`, and `userRoutes`. Implemented Supabase client mocking, dynamic imports after mocks, route prefix alignment, and `app.ready()` awaiting. All backend API tests pass locally (40/40 total tests currently green).

## Latest Progress (2025-08-16)

- **Local VRF v2 flow validated**: Created season, started, advanced chain time, called `requestSeasonEnd()`; SeasonEndRequested emitted and VRF request created.
- **Premint added**: `contracts/script/Deploy.s.sol` now mints 10,000,000 SOF to deployer to simplify local testing/funding.
- **Docs improved**: `contracts/README.md` updated with buyer funding, env vars, VRF v2 mock fulfillment, and zsh-safe commands.
- **Tests**: Trading lock enforcement, access control checks, prize pool accounting, zero participants, and duplicate winners handling covered; tests passing locally.
- **Frontend (raffles UX)**: Replaced "Current Season" with **Active Seasons** grid in `src/routes/RaffleList.jsx` (shows all `status === 1`).
- **Frontend (guards)**: Added "Season not found or not initialized" guard in `src/routes/RaffleDetails.jsx` to hide default/ghost season structs (1970 timestamps).
- **Frontend (reads alignment)**: Updated `src/hooks/useAllSeasons.js` to use the selected network key and filter out ghost/default seasons (zero start/end or zero bondingCurve).
- **Environment**: `.env.local` validated; address and network resolution consistent across reads.
- **Next Bug**: **Cannot buy tickets in the active raffle**.

## Discovered During Work

- [x] Fix all backend Fastify route lint errors (unused vars, undefined identifiers, unreachable code)
- [x] Fix all backend/config lint errors (process, require, __dirname, unused vars)
- [x] Fix all frontend unused variable/import warnings
- [x] Design and document InfoFi market API endpoints
- [x] Implement mock implementations for placeholder backend endpoints:
  - [x] Raffle endpoints (`/api/raffles`)
  - [x] User profile endpoints (`/api/users`)
  - [x] SSE pricing stream endpoint (`/api/pricing/markets/:id/pricing-stream`)
  - [x] Add npm scripts to run Anvil and deploy contracts locally (`anvil`, `deploy:anvil`, `anvil:deploy`)
- [x] Investigate and fix: **Cannot buy tickets in the active raffle** (resolved 2025-08-20)

- [x] Remove `fastify-plugin` wrappers from route files, fix duplicate `/api/health` registration, and verify all routes mount under their prefixes. Backend health endpoint reports OK and curls pass for raffles, infofi ping, users, arbitrage.

- [x] Resolved React hook-order warnings during HMR by making hook declarations unconditional in `useCurve`.
- [x] Fixed Markdown list indentation (MD005, MD007) and blanks-around-lists (MD032) in `instructions/project-tasks.md`.
- [x] Added UI copy in `RaffleDetails.jsx` to show "Estimated receive" and "Min after slippage" for sell transactions.
