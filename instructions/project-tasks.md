# SecondOrder.fun Project Tasks

## Project Overview

SecondOrder.fun is a full-stack Web3 platform that transforms cryptocurrency speculation into structured, fair finite games through applied game theory enhanced with InfoFi (Information Finance) integration. The platform combines transparent raffle mechanics with sophisticated prediction markets to create a multi-layer system enabling cross-layer strategies, real-time arbitrage opportunities, and information-based value creation.

## Known Issues (2025-08-20)

- [x] Cannot buy tickets in the active raffle (Resolved 2025-08-20; see Latest Progress).

- [ ] Cannot sell tickets to close position in raffle (Reported 2025-08-21)
  - Symptom: Sell flow fails when attempting to close or reduce raffle ticket positions.
  - Scope: Raffle sell path only (InfoFi market buy/sell is separate and in progress).
  - Action: Investigate contract/UI/hook path in `src/hooks/useCurve.js` and `src/routes/RaffleDetails.jsx` after current InfoFi task is complete.

Note: Backend API tests are now green locally (see Latest Progress for details).

## Latest Progress (2025-09-10)

- [x] RaffleDetails: "Your Current Position" live update
  - Implemented immediate on-chain refresh after Buy/Sell using authoritative sources:
    - Prefer `SOFBondingCurve.playerTickets(address)` and `curveConfig.totalSupply`.
    - Fallback to ticket ERC-20 `balanceOf/totalSupply` (auto-detected via `raffleToken/token/ticketToken/tickets/asset`).
  - Added resilient follow-up refreshes to withstand RPC/indexer lag and clear local override when server snapshot returns.

- [x] Buy/Sell widget header and UX refinements
  - Centered, enlarged Buy/Sell tabs as the widget header; larger slippage gear.
  - Labels updated to "Amount to Buy" / "Amount to Sell"; removed Buy MAX.
  - Added transaction toasts (copy hash, explorer link, auto-expire 2 minutes) rendered under the position widget.

- [x] Bonding Curve graph polish
  - Y-axis domain anchored to first/last step prices; increased chart height.
  - Progress bar moved below graph; custom tooltips for step dots with price and step number; flicker fixes.

No changes to open Known Issues at this time.

### InfoFi Trading – Next Tasks (On-chain shift)

- Next Objectives (2025-08-27):
  - [C] RafflePositionTracker Integration (Frontend): implement env + ABI + `useRaffleTracker()` and wire into UI.
  - [B] ArbitrageOpportunityDisplay: build UI leveraging on-chain oracle after [C] completes.

- [x] Replace threshold-sync REST with direct on-chain factory call (permissionless)
  - UI: call `InfoFiMarketFactory.createWinnerPredictionMarket(seasonId, player)` from frontend
  - Subscribe to `MarketCreated` to refresh view (viem WS when available)
  - Keep backend route only as optional passthrough for now, then remove

- [x] Frontend subscribe to `MarketCreated` and `PriceUpdated` (no DB insertion)
  - Use viem `watchContractEvent` when WS provided; fall back to periodic refetch

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

#### Raffle Ticket Bonding Curve UI (GLICO-style) — Plan (2025-09-10)

Applies Mint Club GLICO layout to our raffle ticket token. Ignore Locking, Airdrops, and Child Tokens. Focus on Graph, Buy/Sell, Transactions, and Token Information + Token Holders tab.

- [ ] Page scaffold and routing
  - [ ] Create route `src/routes/Curve.jsx` linked from header nav ("Bonding Curve")
  - [ ] Layout sections: `Graph`, `Buy/Sell`, `Tabs: Transactions | Token Info | Token Holders`
  - [ ] Shared header shows token symbol, network, and season context

- [ ] Bonding Curve Graph
  - [x] Hook to read live curve state (current step, current price, minted supply, max supply)
  - [x] Visualize stepped linear curve progress and price ladder
  - [x] Show current price and step index badges (average price pending)

- [ ] Buy/Sell Widget
  - [x] Extend `useCurve()` to support quotes via `calculateBuyPrice(uint256)` and `calculateSellPrice(uint256)`
  - [x] SOF allowance flow: detect + prompt `approve(spender, amount)` before buy/sell
  - [x] Execute `buyTokens(amount, maxCost)` and `sellTokens(amount, minProceeds)` with tx status toasts (added copy + explorer link)
  - [ ] Basic validation (positive amounts, sufficient SOF/ticket balance)

- [ ] Transactions Tab
  - [ ] Read recent on-chain events (buys/sells) via viem `getLogs` for the curve
  - [ ] Paginate and show: time, wallet (shortened), side (Buy/Sell), amount, price paid/received
  - [ ] Empty and loading states; auto-refresh on interval

- [ ] Token Information Tab
  - [ ] Fields: Contract Address, Current / Max Supply, Total Value Locked in $SOF, Bonding Curve Progress
  - [ ] Derive TVL from curve reserves; compute progress = currentSupply / maxSupply
  - [ ] Copy-to-clipboard for addresses

- [ ] Token Holders Tab
  - [ ] MVP: top holders and holder count via on-chain reads (iterate holders from events; cache in memory)
  - [ ] Placeholder message if indexer not ready; link to future indexer task

- [ ] Hooks & Wiring
  - [ ] `useCurveRead()` (prices, supply, tvl) and `useCurveWrite()` (approve, buy, sell)
  - [ ] Reuse network + contracts from `src/config/networks.js` and `src/config/contracts.js`
  - [ ] SSE/WebSocket not required for v1; periodic polling is acceptable

- [ ] Tests (Vitest)
  - [x] Buy/Sell widget: success UI path (labels/header) — baseline
  - [ ] Buy/Sell widget: edge (insufficient allowance), failure (revert)
  - [x] Graph domain: Y-axis first/last step prices
  - [ ] Graph data hook: edge (zero supply), failure (RPC error)

- [ ] Documentation
  - [ ] Update `instructions/frontend-guidelines.md` with page structure and hooks
  - [ ] Update `README.md` with how to use Buy/Sell locally (Anvil runbook)

### Testing Utilities (NEW)

- [ ] $SOF Test Faucet — Anvil/Sepolia Only (Pending Plan Approval 2025-09-04)
  - Scope: Provide a small amount of $SOF to a wallet for local Anvil and Sepolia testnet only, strictly one claim per address, with rate limiting and per-claim cap.
  - Decision Needed: Choose between on-chain faucet contract vs. backend-signer faucet vs. frontend-only (requires mint role). Default recommendation: on-chain faucet contract funded during deploy, with chainId gating (31337, 11155111) and one-claim-per-address.
  - Subtasks:
    - [ ] Finalize design choice and parameters (claim amount, cooldown, caps)
    - [ ] Contracts (if chosen): implement `SOFFaucet.sol` with `claim()` once-per-address mapping, `require(chainid in {31337, 11155111})`, pausable, owner-configurable per-claim amount and cooldown; fund faucet from deploy script
    - [ ] Frontend: add `SofFaucet` component gated by network (Anvil/Sepolia), display remaining claims, and call `claim()`; add basic abuse copy and UX
    - [ ] Backend (optional): add rate-limit middleware for any supporting endpoints; no server-side signing of transactions
    - [ ] Env/Docs: add faucet address per network to `.env.example`, update `contracts.js` and README/runbook
    - [ ] Tests: Foundry unit tests (success, cooldown/duplicate claim, wrong chain); Vitest UI tests (success, wrong-network, already-claimed)
  - Acceptance Criteria:
    - Works only on chainId 31337 (Anvil) and 11155111 (Sepolia)
    - One successful claim per wallet address; subsequent attempts revert or are disabled in UI
    - Per-claim amount and optional cooldown are configurable by owner
    - No backend private key custody; no mainnet exposure
    - Documented runbook and addresses; included in dev startup flow as needed

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
  - [x] Header: add "Prediction Markets" nav entry linking to markets index (`/markets`)
  - [ ] Widgets: `SeasonTimer`, `OddsBadge`, `TxStatusToast`

#### RafflePositionTracker Integration (Frontend)

- [ ] Add tracker env keys to `.env.example` and `.env`
  - Frontend: `VITE_RAFFLE_TRACKER_ADDRESS_LOCAL`, `VITE_RAFFLE_TRACKER_ADDRESS_TESTNET`
  - Backend (optional reads): `RAFFLE_TRACKER_ADDRESS_LOCAL`, `RAFFLE_TRACKER_ADDRESS_TESTNET`
- [ ] Copy Tracker ABI to frontend: `src/contracts/abis/RafflePositionTracker.json` (extend `scripts/copy-abis.js` if needed)
- [ ] Extend `src/config/contracts.js` to expose `RAFFLE_TRACKER` per network
- [ ] Create `useRaffleTracker()` hook for reading player positions and ranges
- [ ] Wire tracker reads into `RaffleDetails` (positions/odds display) and `AccountPage`
- [ ] Vitest: 1 success, 1 edge, 1 failure test for `useRaffleTracker`

> Next Objective: Complete this Tracker integration [C], then implement ArbitrageOpportunityDisplay [B].

- **ENV & Addresses**

  - [x] Add `.env` support for Vite: `VITE_RPC_URL_LOCAL`, `VITE_RPC_URL_TESTNET`
  - [x] Add `VITE_RAFFLE_ADDRESS_LOCAL`, `VITE_SOF_ADDRESS_LOCAL`, `VITE_SEASON_FACTORY_ADDRESS_LOCAL`, `VITE_INFOFI_MARKET_ADDRESS_LOCAL`
  - [ ] Add testnet equivalents (left empty until deployment)
  - [ ] Update frontend README with network toggle and env examples
  - [x] Add `.env.example` template with all required frontend/backend variables
  - [ ] Add tracker addresses: `VITE_RAFFLE_TRACKER_ADDRESS_LOCAL/TESTNET` and backend `RAFFLE_TRACKER_ADDRESS_LOCAL/TESTNET`
  - [ ] Update `scripts/update-env-addresses.js` to map `RafflePositionTracker -> RAFFLE_TRACKER`

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
  - [x] End-to-end testing of VRF → InfoFi settlement flow (via `contracts/script/EndToEndResolveAndClaim.s.sol`)

Note: Trading lock was validated at the curve level via `lockTrading()`; add a follow-up test to exercise `Raffle.requestSeasonEnd()` path and broader role-gated lifecycle actions.

### Optimization & QA

- [ ] Performance optimization for real-time pricing and SSE
- [ ] General performance optimization (frontend/backend)

### Release & Deployment

- [ ] Production deployment preparation (envs, build, CI/CD)

- [ ] Refactor contract files to move library-like contracts into `contracts/src/lib`

## InfoFi Integration Roadmap (NEXT)

This roadmap consolidates the InfoFi specs into executable tasks across contracts, backend, frontend, and testing. These will be the next priorities after stabilizing tests and the ticket purchase bug.

### Current Local Status (2025-08-21)

- [x] Local deploys (Anvil): `InfoFiMarketFactory`, `InfoFiPriceOracle`, `InfoFiSettlement` deployed via `Deploy.s.sol`.
- [x] Oracle admin/updater: `InfoFiPriceOracle` constructed with `address(infoFiFactory)` as admin; factory holds `DEFAULT_ADMIN_ROLE` and `PRICE_UPDATER_ROLE`.
- [x] Raffle wired as VRF consumer (local mock) and season factory connected.
- [x] ENV/addresses synced to frontend/backend via scripts.
- [x] Frontend: added on-chain service `src/services/onchainInfoFi.js` and UI in `src/routes/MarketsIndex.jsx` to list season players and call `createWinnerPredictionMarket` permissionlessly.
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

#### Automatic On-Chain Prediction Market Plan (Now — 2025-08-21)

— Execute these in order to enable automatic market creation on threshold without manual backfills.

- **Contracts**
  - [ ] Implement `PositionUpdate` event in `contracts/src/curve/SOFBondingCurve.sol`.
  - [ ] Emit `PositionUpdate` in `buyTokens` and `sellTokens` with `{ player, oldTickets, newTickets, totalTickets }`.
  - [ ] On upward cross to ≥1% (old < 100 bps, new ≥ 100 bps), call `InfoFiMarketFactory.onPositionUpdate(player, oldTickets, newTickets, totalTickets)`.
  - [ ] Add factory view: `getMarketFor(address player, uint256 seasonId, bytes32 marketType)` to prevent duplicates and allow discovery.
  - [ ] Confirm `InfoFiPriceOracle` grants updater role to factory in `contracts/script/Deploy.s.sol` (already done locally) and mirror on testnet.

- **Backend**
  - [ ] Add viem watcher: `watchContractEvent(PositionUpdate)` with debounce and idempotency checks; backfill with `getLogs` on boot.
  - [ ] Endpoint: `POST /api/infofi/markets/sync-threshold` for manual reconciliation by `{ seasonId, playerAddress }`.
  - [ ] SSE pricing stream live at `/stream/pricing/:marketId` using `market_pricing_cache` with initial snapshot + heartbeats.

- **Frontend**
  - [ ] Add header nav item “Prediction Markets” linking to markets index.
  - [x] Add minimal on-chain UI in `MarketsIndex.jsx` to list season players and create markets via factory (permissionless call).
  - [ ] Implement `useInfoFiMarkets(raffleId)` to list markets and positions from chain (no DB); handle empty/error states.
  - [ ] Wire Oracle reads/subscriptions: `InfoFiPriceOracle.getMarketPrice(marketId)` and `PriceUpdated` event.

- **ENV & Addresses**
  - [ ] Add `VITE_INFOFI_FACTORY_ADDRESS`, `VITE_INFOFI_ORACLE_ADDRESS`, `VITE_INFOFI_SETTLEMENT_ADDRESS` to `.env.example` and `.env`.
  - [ ] Ensure `scripts/update-env-addresses.js` writes the above keys alongside RAFFLE/SEASON/ SOF.

- **Testing**
  - [ ] Foundry: threshold crossing creates exactly one market and updates oracle; duplicates prevented.
  - [ ] Backend: unit tests for watcher debounce/idempotency and SSE initial+update events.
  - [ ] Frontend: Vitest for `useInfoFiMarkets` and nav visibility; render with empty/success/error.

#### Plan Update (2025-08-23) — Align with `instructions/sof-prediction-market-dev-plan.md`

Derived from the new prediction market development ruleset. These items complement existing tasks.

- **Smart Contracts**
  - [ ] Ensure raffle exposes or adapt to `IRaffleContract` interface: `getCurrentSeason()`, `isSeasonActive()`, `getTotalTickets()`, `getPlayerPosition()`, `getPlayerList()`, `getNumberRange()`, `getSeasonWinner()`, `getFinalPlayerPosition()`.
  - [ ] Implement `RafflePositionTracker` with snapshots and `MARKET_ROLE`; push updates to markets on position changes.
  - [ ] Implement market contracts (MVP per ruleset):
    - [ ] `RaffleBinaryMarket` (YES/NO) with 70/30 hybrid pricing and USDC collateral; 2% winnings fee; `resolveMarket` role-gated.
    - [ ] `RaffleScalarMarket` (above/below threshold) with live position updates; resolve at season end.
    - [ ] `RaffleCategoricalMarket` (2–6 outcomes) with AMM share re-pricing.
  - [ ] Add `FeeManager` (2% platform fee on winnings) and fee collector wiring.
  - [ ] Add MEV protections: per-block action guard and commit–reveal for large trades (>$1k USDC).
  - [ ] Base chain optimizations: packed storage structs; batch update/resolve.

- **Backend (Realtime + Pricing)**
  - [ ] Implement Hybrid Pricing Engine (mirror on-chain formula) persisting to `market_pricing_cache`.
  - [ ] WebSocket gateway emitting: `MARKET_UPDATE`, `RAFFLE_UPDATE`, `MARKET_RESOLVED`, `NEW_MARKET_CREATED` (keep SSE fallback). Types per ruleset.
  - [ ] Event bridge to consume raffle `PositionUpdate`/market events → update pricing cache + broadcast.

- **Frontend**
  - [ ] WS client with reconnection/heartbeat; fallback to SSE.
  - [ ] Types/hooks for `MarketUpdate` and `RaffleUpdate`.
  - [ ] Build/complete: `InfoFiMarketCard`, `ProbabilityChart`, `ArbitrageOpportunityDisplay`, `SettlementStatus`, `WinningsClaimPanel` wired to live pricing.

- **Testing**
  - [ ] Foundry invariants: shares ≈ liquidity; categorical sum = 100%; hybrid pricing deviation bounds.
  - [ ] Integration: full season E2E — season start → threshold auto-create → trades → season end → resolve → claim.
  - [ ] Backend WS/SSE tests: snapshot + updates + resolution.
  - [ ] Frontend Vitest: hooks/components success/edge/failure.

- **Deployment & Ops**
  - [ ] Pre-deploy: interfaces satisfied; roles configured; emergency pause tested; fee collector set; WS operational.
  - [ ] Post-deploy: alerts for position tracking; monitor hybrid pricing accuracy, gas usage, MEV attempts, and auto-creation health.

### Backend (Services, SSE, DB)

- [x] Create DB schema/migrations in Supabase per `infofi_markets`, `infofi_positions`, `infofi_winnings`, `arbitrage_opportunities`, and `market_pricing_cache` (see schema in `.windsurf/rules`)
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

- [x] Hook `useOnchainInfoFiMarkets(seasonId, networkKey)` to enumerate markets directly from chain and subscribe to `MarketCreated`.
- [x] Hook `useOraclePriceLive(marketId)` to read and subscribe to `InfoFiPriceOracle.PriceUpdated` (viem WS; no backend SSE).
- [x] Components updated: `InfoFiMarketCard` consumes on-chain market objects; `ProbabilityChart` and `InfoFiPricingTicker` use oracle hook for live values.
- [ ] Component `ArbitrageOpportunityDisplay` rendering live opportunities and execution stub.
- [ ] Components: `SettlementStatus`, `WinningsClaimPanel` (MVP scope).
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

## InfoFi Trading (Onit-style) — Buy/Sell Plan (2025-08-21)

Enable opening/closing positions per InfoFi market using a house market‑maker (fixed‑odds, Onit‑style), with hybrid price anchoring (70% raffle / 30% sentiment). Ensure My Account shows only InfoFi positions (not raffle).

### Phase 0 — Correct My Account Source

- [ ] Update My Account panel to read from `infofi_positions`/`infofi_trades` only, not raffle tickets.
- [ ] Backend route to list user InfoFi positions: `GET /api/infofi/positions?address=0x...`.
- [ ] Tests: verify positions reflect InfoFi trades only.

### Phase 1 — Trading Model & Endpoints

- [ ] Implement `marketMakerService`:
  - Quote: `quote(marketId, side, amount)` → `{ priceBps, feeBps, totalCost, slippage }`.
  - Execute buy/sell: updates `infofi_trades`, aggregates `infofi_positions`, updates maker inventory.
  - Use hybrid price from `pricingService` as anchor; apply spread and inventory skew.
- [ ] API (Fastify):
  - `GET /api/infofi/markets/:id/quote?side=yes|no&amount=...`
  - `POST /api/infofi/markets/:id/buy` { side, amount }
  - `POST /api/infofi/markets/:id/sell` { side, amount }
  - `GET /api/infofi/positions?address=0x...`
- [ ] DB additions:
  - `infofi_trades` (market_id, user_address, side, amount, price_bps, fee_bps, created_at)
  - `market_maker_inventory` (market_id, side, net_inventory, exposure_limit, last_updated)
- [ ] SSE: include indicative quotes alongside pricing where useful.

### Phase 2 — Settlement

- [ ] On market resolution (from `InfoFiMarket.sol` or admin in local), compute PnL and write claimables into `infofi_winnings`.
- [ ] Optionally integrate with `InfoFiSettlement.sol` for on‑chain signals.

### Phase 3 — Frontend UX

- [ ] Market trade panel: YES/NO toggle, amount input, live quote (price/fee/slippage), confirm.
- [ ] Positions table: avg price, size, realized/unrealized PnL, Close button.
- [ ] My Account shows InfoFi positions/trades only.

#### NEW (2025-09-04): Enable users to sell raffle tokens back into the bonding curve

- [ ] Frontend: Extend `useCurve()` and `RaffleDetails` to support `sellTickets(amount, minSofAmount)` with quote via `calculateSellPrice(amount)`; add allowance/balance checks and a confirmation modal.
- [ ] Docs: Update `contracts/README.md` and frontend README with a sell runbook (approve → quote → sell) and examples using `cast`.
- [ ] Tests: Vitest hook tests (success/edge/failure) for sell path; E2E script addition to sell after buy; Foundry test verifying curve callbacks update positions and fees.

### Anvil / Mocks

- [ ] Deploy OpenZeppelin `ERC20Mock` as betting currency; faucet to dev wallet in `Deploy.s.sol`.
- [ ] Wire token address into frontend/backend env (`contracts.js`, server config).

### Tests

- [ ] API tests for quote/buy/sell (+ edge cases: invalid market, paused, insufficient position).
- [ ] Settlement tests: after resolve, winners/losers amounts in `infofi_winnings`.
- [ ] Frontend hooks: quote/trade/positions with success/edge/failure.

### Notes

- Start with house maker (fixed‑odds). AMM can be added later without breaking API.
- Hybrid price from `market_pricing_cache` remains the canonical anchor; quotes adjust with spread and inventory.

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

## Latest Progress (2025-08-27)

- **Frontend (pure on-chain InfoFi)**: Completed migration away from DB-backed markets/pricing.
  - Implemented `src/hooks/useOnchainInfoFiMarkets.js` to enumerate markets via factory views/events.
  - Implemented `src/hooks/useOraclePriceLive.js` to read/subscribe to `InfoFiPriceOracle` on-chain.
  - Refactored `src/routes/MarketsIndex.jsx` to use on-chain hooks; removed backend sync/activity UI.
  - Documented canonical marketId derivation in `instructions/frontend-guidelines.md`.

## Latest Progress (2025-08-21)

- **Frontend (on-chain registry UI)**: Added `src/services/onchainInfoFi.js` with viem helpers and updated `src/routes/MarketsIndex.jsx` to:
  - Load on-chain season players via `InfoFiMarketFactory.getSeasonPlayers(seasonId)`
  - Submit permissionless tx `createWinnerPredictionMarket(seasonId, player)`
  - Prepare for event subscriptions (MarketCreated)

- **ABIs**: Ran `scripts/copy-abis.js` to sync `InfoFiMarketFactory.json` and `InfoFiPriceOracle.json` into `src/contracts/abis/`.

- **Next**: Add Oracle read/subscription helpers and replace the threshold sync REST path with direct factory tx from the UI.

- **Contracts (AccessControl fix)**: Updated `contracts/script/Deploy.s.sol` to construct `InfoFiPriceOracle` with `address(infoFiFactory)` as admin. This removes reliance on `tx.origin`/`msg.sender` in script context and eliminates `AccessControlUnauthorizedAccount` during `grantRole`.
- **Local deployment successful**: `npm run anvil:deploy` completes end-to-end. Addresses copied to frontend via `scripts/copy-abis.js` and `.env` updated via `scripts/update-env-addresses.js`.
- **ENV aligned**: `.env` now contains fresh LOCAL addresses for RAFFLE/SEASON*FACTORY/INFOFI*\*.
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
- [x] Fix all backend/config lint errors (process, require, \_\_dirname, unused vars)
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
