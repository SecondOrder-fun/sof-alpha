# SecondOrder.fun Contracts: Local Anvil Deployment & Usage

This guide shows how to:

- Start a local Anvil chain with funded accounts
- Deploy contracts with Foundry scripts
- Stand up a Chainlink VRF v2 mock automatically for local development
- Create and run a raffle season (buy/sell tickets) on the bonding curve
- Call relevant contract functions end-to-end

> Prerequisites: Foundry (forge/cast/anvil) installed.

## 1) Start Anvil and get funded wallets

```bash
anvil --chain-id 31337
```

Anvil prints 10 funded accounts. Copy one private key (Account #0) for deployment; it has 10,000 ETH.

In a new terminal, export it:

```bash
export PRIVATE_KEY=0x<anvil_account0_private_key>
export RPC_URL=http://127.0.0.1:8545
```

## 2) Environment variables for deployment

The deployment script `contracts/script/Deploy.s.sol` only expects `PRIVATE_KEY` for local Anvil deployment. The VRF mock and its configuration are now handled automatically by the script.

### Inline environment variables (required for local E2E runs)

When running Foundry scripts and `cast` commands against local Anvil, set all required environment variables inline on the same command invocation. Do not rely on prior shell exports. This prevents subtle issues when terminals are restarted or `.env` files are out of date.

Examples:

```bash
# Deploy (inline vars)
RPC_URL=http://127.0.0.1:8545 \
PRIVATE_KEY=0x<anvil_account0_private_key> \
forge script script/Deploy.s.sol:DeployScript --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast -vvvv

# Start season (inline vars)
RPC_URL=http://127.0.0.1:8545 \
PRIVATE_KEY=0x<anvil_account0_private_key> \
RAFFLE_ADDRESS=0x<from_deploy_logs> \
cast send $RAFFLE_ADDRESS "startSeason(uint256)" 1 --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Run E2E resolve script (inline vars)
RPC_URL=http://127.0.0.1:8545 \
PRIVATE_KEY=0x<anvil_account0_private_key> \
RAFFLE_ADDRESS=0x<from_deploy_logs> \
SOF_ADDRESS=0x<from_deploy_logs> \
INFOFI_MARKET_ADDRESS=0x<from_deploy_logs> \
VRF_COORDINATOR_ADDRESS=0x<from_deploy_logs> \
forge script script/EndToEndResolveAndClaim.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast -vvvv
```

## 3) Deploy contracts with Foundry script

The script now automatically handles VRF mock deployment. By default, it does NOT create a season on deploy.

It deploys:

- `VRFCoordinatorV2Mock` (for local testing)
- `SOFToken` (demo local $SOF)
- `Raffle` (constructed with SOF + VRF mock config)
- `SeasonFactory`
- `InfoFiMarket` (standalone for now)

It also performs the following setup:

- Creates and funds a VRF subscription.
- Adds the `Raffle` contract as a VRF consumer.
- (Optional) Creates a default season when explicitly enabled (see examples below).

**For ANVIL**
Set the following env var if you plan to verify on a testnet (it can be a dummy value for local deployment):

```bash
export ETHERSCAN_API_KEY=dummy
```

Run the script from the `contracts` directory:

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --via-ir
```

After the run, note the console logs with deployed addresses. You will need to copy these into your frontend and backend `.env` files.

### Enable season creation during deploy (optional)

Season creation is disabled by default. To create a default season during deployment, set the `CREATE_SEASON=true` flag. You can also control whether it starts immediately by setting `FAST_START=true|false` (defaults to `true` when `CREATE_SEASON` is enabled).

Examples:

```bash
# Using package script from project root
CREATE_SEASON=true FAST_START=true npm run anvil:deploy

# Or with pnpm
CREATE_SEASON=true FAST_START=false pnpm run anvil:deploy

# Or running the forge script directly from contracts/
CREATE_SEASON=true FAST_START=true \
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --via-ir
```

## 4) Interacting with the contracts

Contract: `contracts/src/core/Raffle.sol`

Key functions:

- `createSeason(SeasonConfig config, SOFBondingCurve.BondStep[] bondSteps, uint16 buyFeeBps, uint16 sellFeeBps) returns (uint256 seasonId)`
- `startSeason(uint256 seasonId)`
- `requestSeasonEnd(uint256 seasonId)`
- Views: `getSeasonDetails`, `getParticipants`, `getParticipantPosition`, `getParticipantNumberRange`, `getWinners`

SeasonConfig struct layout (Solidity):

```solidity
struct SeasonConfig {
  string name;
  uint256 startTime;
  uint256 endTime;
  uint16 winnerCount;
  uint16 prizePercentage;       // bps
  uint16 consolationPercentage; // bps
  address raffleToken;  // filled by createSeason
  address bondingCurve; // filled by createSeason
  bool isActive;
  bool isCompleted;
}
```

BondStep layout (pricing steps for the discrete bonding curve):

```solidity
struct BondStep {
  uint128 rangeTo; // cumulative supply bound for the step
  uint128 price;   // SOF per token on this step
}
```

### Example: create a new season (recommended: use the script)

The easiest and least error‑prone way to create a 100k/100‑step season is to use the helper script which builds all steps and sets sensible times:

```bash
RPC_URL=http://127.0.0.1:8545 \
RAFFLE_ADDRESS=0x<raffle_address> \
PRIVATE_KEY=0x<deployer_pk> \
forge script script/CreateSeason.s.sol:CreateSeasonScript \
  --rpc-url $RPC_URL --broadcast -vvvv
```

If you prefer a minimal pure‑cast example for a tiny 2‑step curve, the `SeasonConfig` tuple order must match the struct shown above and you should pass zero addresses for `raffleToken` and `bondingCurve` (the contract fills them):

```bash
RPC_URL=http://127.0.0.1:8545 \
RAFFLE_ADDRESS=0x<raffle_address> \
PRIVATE_KEY=0x<deployer_pk> \
START=$(($(date +%s)+60)) \
END=$(($(date +%s)+3600)) \
CONFIG_TUPLE="(\"Season-cast\",$START,$END,3,5000,4000,0x0000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000,false,false)" \
STEPS_ARRAY="[(1000,1000000000000000000),(2000,1100000000000000000)]" \
BUY_FEE=10 SELL_FEE=70 \
cast send $RAFFLE_ADDRESS \
  'createSeason((string,uint256,uint256,uint16,uint16,uint16,address,address,bool,bool),(uint128,uint128)[],uint16,uint16)' \
  "$CONFIG_TUPLE" "$STEPS_ARRAY" $BUY_FEE $SELL_FEE \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

Get the current `seasonId` (the contract increments `currentSeasonId`):

```bash
# The first manually created season will be ID 2, since Season 1 is created on deploy.
SEASON_ID=2

cast call $RAFFLE_ADDRESS "seasons(uint256)" $SEASON_ID --rpc-url $RPC_URL
```

Start the season when `block.timestamp >= startTime`:

```bash
cast send $RAFFLE_ADDRESS "startSeason(uint256)" $SEASON_ID --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

Fetch season details:

```bash
cast call $RAFFLE_ADDRESS "getSeasonDetails(uint256)" $SEASON_ID --rpc-url $RPC_URL
```

## 5) Buying and selling tickets on the curve

Contract: `contracts/src/curve/SOFBondingCurve.sol`

Key functions:

- `buyTokens(uint256 tokenAmount, uint256 maxSofAmount)` – buys raffle tokens, emits `TokensPurchased`
- `sellTokens(uint256 tokenAmount, uint256 minSofAmount)` – sells raffle tokens, emits `TokensSold`
- `calculateBuyPrice(uint256)` / `calculateSellPrice(uint256)` – view pricing helpers
- `getSofReserves()` – view current $SOF reserves in curve

The curve only accepts $SOF (the demo `SOFToken`) – approve first, then buy:

```bash
# Read bondingCurve address from season config
cast call $RAFFLE_ADDRESS "seasons(uint256)" $SEASON_ID --rpc-url $RPC_URL
# ... tuple includes bondingCurve address

export BONDING_CURVE_ADDRESS=<bondingCurve_address_from_seasons_call>
export BUYER_PK=$PRIVATE_KEY    # use a funded account
export BUYER=$(cast wallet address --private-key $BUYER_PK)

# Approve SOF to the curve, then buy 100 tokens with a max spend cap
cast send $SOF_TOKEN_ADDRESS "approve(address,uint256)" $BONDING_CURVE_ADDRESS 100000000000000000000000 \
  --rpc-url $RPC_URL --private-key $BUYER_PK

# Optional: quote the cost
cast call $BONDING_CURVE_ADDRESS "calculateBuyPrice(uint256)" 100 --rpc-url $RPC_URL

# Buy
cast send $BONDING_CURVE_ADDRESS "buyTokens(uint256,uint256)" 100 100000000000000000000000 \
  --rpc-url $RPC_URL --private-key $BUYER_PK
```

### Fund a buyer with 10,000,000 SOF (local testing)

If `buyTokens` reverts, ensure the buyer wallet holds enough SOF. For local testing, you can fund a buyer with 10,000,000 SOF from the deployer account that holds the initial supply.

```bash
# Set buyer (already set above) or choose another funded account
export BUYER_PK=$PRIVATE_KEY
export BUYER=$(cast wallet address --private-key $BUYER_PK)

# Transfer 10,000,000 SOF (18 decimals) to the buyer
# 10,000,000 * 1e18 = 10000000000000000000000000
cast send $SOF_TOKEN_ADDRESS \
  "transfer(address,uint256)" $BUYER 10000000000000000000000000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Verify
cast call $SOF_TOKEN_ADDRESS "balanceOf(address)" $BUYER --rpc-url $RPC_URL
```

Notes:

- The deployer must hold sufficient SOF to transfer. If your `SOFToken` was deployed with `initialSupply = 0`, either redeploy with a non-zero initial supply for local testing or add a dev-only mint path/script.
- Prices in `BondStep` are raw integers; in production you typically use 18‑decimal prices (e.g., 10 SOF = `10000000000000000000`).

Selling works similarly (ensure you hold raffle tokens). The curve will callback Raffle to update positions.

## 6) Ending the season (VRF)

When `block.timestamp >= endTime`, end the season and request VRF:

```bash
cast send $RAFFLE_ADDRESS "requestSeasonEnd(uint256)" $SEASON_ID --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

The contract locks trading on the curve, submits a VRF request with `winnerCount` words, then upon fulfillment selects winners and transitions to distribution.

With the VRF v2 mock, fulfill the request by calling its `fulfillRandomWords(uint256,address)` with the `requestId` and the Raffle address:

```bash
export REQUEST_ID=<value_from_raffle_state_or_event>
cast send $VRF_COORDINATOR "fulfillRandomWords(uint256,address)" \
  $REQUEST_ID $RAFFLE_ADDRESS \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

You can read the pending `vrfRequestId`:

```bash
cast call $RAFFLE_ADDRESS "seasonStates(uint256)" $SEASON_ID --rpc-url $RPC_URL
# parse struct fields; or add a view if convenient
```

## 7) Roles & Admin utilities

- `Raffle` uses AccessControl:
  - `DEFAULT_ADMIN_ROLE` – full admin
  - `SEASON_CREATOR_ROLE` – can create/start/end seasons
  - `EMERGENCY_ROLE` – can `pauseSeason`
  - `BONDING_CURVE_ROLE` – granted to the per-season curve to call participant hooks
- `SOFBondingCurve` roles:
  - `DEFAULT_ADMIN_ROLE` – admin
  - `RAFFLE_MANAGER_ROLE` – the Raffle contract; can initialize curve, lock trading, extract SOF
  - `EMERGENCY_ROLE` – can `pause()`/`unpause()`
- `RaffleToken` roles:
  - `DEFAULT_ADMIN_ROLE` – token admin
  - `MINTER_ROLE`/`BURNER_ROLE` – granted to the per-season curve

Granting roles example (if needed):

```bash
# Example: grant curve RAFFLE_MANAGER_ROLE on itself is done in Raffle.createSeason.
# To grant a role manually on curve (not usually necessary):
cast send $CURVE "grantRole(bytes32,address)" $(cast keccak "RAFFLE_MANAGER_ROLE") <RAFFLE_ADDRESS> \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

## 8) Quick reference: core function calls

- `Raffle.createSeason(config, steps[], buyFeeBps, sellFeeBps) -> seasonId`
- `Raffle.startSeason(seasonId)`
- `SOFBondingCurve.buyTokens(tokenAmount, maxSofAmount)`
- `SOFBondingCurve.sellTokens(tokenAmount, minSofAmount)`
- `Raffle.requestSeasonEnd(seasonId)`
- Views: `Raffle.getSeasonDetails`, `Raffle.getParticipants`, `Raffle.getParticipantPosition`, `Raffle.getParticipantNumberRange`, `SOFBondingCurve.getSofReserves`

## 9) End-to-End InfoFi Market Buy/Bet Script (Local Anvil)

The helper script `contracts/script/EndToEndBuyBet.s.sol` automates the full local flow:

- Create a season
- Start the season (time-warp locally)
- Fund two user accounts with SOF
- Approve and buy raffle tickets for both users on the bonding curve
- Create an InfoFi market for one player
- Approve SOF and place YES/NO bets from both users

Prerequisites:

- Run the deployment script first and note the deployed addresses (RAFFLE, SOF, INFOFI_MARKET)
- Ensure the deployer holds a large SOF balance (preminted by `Deploy.s.sol`)

Required environment variables (all addresses/PKs are local-only for Anvil):

```bash
export RPC_URL=http://127.0.0.1:8545
export PRIVATE_KEY=0x<deployer_pk>
export RAFFLE_ADDRESS=0x<raffle_address_from_deploy>
export SOF_ADDRESS=0x<sof_token_address_from_deploy>
export INFOFI_MARKET_ADDRESS=0x<infofi_market_address_from_deploy>

# Two additional funded accounts for user flows
export ACCOUNT1_PRIVATE_KEY=0x<anvil_account1_pk>
export ACCOUNT2_PRIVATE_KEY=0x<anvil_account2_pk>
```

Run the script from `contracts/`:

```bash
forge script script/EndToEndBuyBet.s.sol \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvvv
```

The script logs:

- Season creation and start
- Curve and token addresses
- Buy transactions for both users
- Created InfoFi market ID
- Bet submissions and final market pools

Notes:

- The script assumes `Deploy.s.sol` already granted the oracle updater role to the InfoFi market (so `placeBet` can publish sentiment). This is handled by our updated deployment wiring.
- If you see allowance/transfer failures, verify SOF balances and approvals for both the curve and the InfoFi market.
- This script focuses on the buy/bet path. Resolution and payouts are planned as a follow-up script.

## 10) End-to-End Resolution + Payout Claim Script (Local Anvil)

The helper script `contracts/script/EndToEndResolveAndClaim.s.sol` automates the latter half of the lifecycle:

- Warp to season end and call `Raffle.requestSeasonEnd(seasonId)`
- Parse the `SeasonEndRequested` event to get `vrfRequestId`
- Fulfill VRF with the local mock, which selects winners and completes the season
- Resolve the InfoFi market for the tracked player based on winners
- Claim payout for the correct bettor (YES if the player is a winner, otherwise NO)

Prerequisites:

- Run the buy/bet helper first (`EndToEndBuyBet.s.sol`) to create a market and place YES/NO bets
- Make sure you have the same env variables exported

Required environment variables:

```bash
export RPC_URL=http://127.0.0.1:8545
export PRIVATE_KEY=0x<deployer_pk>
export RAFFLE_ADDRESS=0x<raffle_address_from_deploy>
export SOF_ADDRESS=0x<sof_token_address_from_deploy>
export INFOFI_MARKET_ADDRESS=0x<infofi_market_address_from_deploy>
export VRF_COORDINATOR_ADDRESS=0x<vrf_mock_from_deploy>
export ACCOUNT1_PRIVATE_KEY=0x<anvil_account1_pk>
export ACCOUNT2_PRIVATE_KEY=0x<anvil_account2_pk>

# Optional: force a given season id (otherwise the script infers one heuristically)
# export SEASON_ID=1
```

Run the script from `contracts/`:

```bash
forge script script/EndToEndResolveAndClaim.s.sol \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvvv
```

What you should see in the logs:

- Target season id and VRF `requestId`
- "VRF fulfilled" confirmation
- Winners count and the chosen outcome for the tracked player
- Payout claimed by the correct account with the SOF delta

Notes:

- The script assumes the most recent market id (`nextMarketId - 1`) is the one created in the buy/bet script.
- If you used a different flow, pass `SEASON_ID` to make sure the end-of-season warp is correct.

### Market lock and emergency fallback

During resolution, all InfoFi markets for the target season are locked before settlement. The script first attempts `lockMarketsForRaffle(seasonId)`; if that function is unavailable or reverts on the deployed bytecode, it falls back to `emergencyLockAll(seasonId)` which scans and locks any markets for the season. Both calls are wrapped as best‑effort so the script won’t abort if locking isn’t available (you will see console logs indicating which path was taken).

The fallback `emergencyLockAll(uint256 raffleId)` is admin‑only and emits `MarketLocked(marketId)` for each market locked.

### Verify post‑lock bets revert

After the market is locked, any attempt to place a new bet must revert. You can quickly verify this on Anvil by attempting a post‑lock bet (expecting a revert):

```bash
RPC_URL=http://127.0.0.1:8545 \
PRIVATE_KEY=0x<anvil_account0_private_key> \
INFOFI_MARKET_ADDRESS=0x<from_deploy_logs> \
SOF_ADDRESS=0x<from_deploy_logs> \
MID=$(($(cast call $INFOFI_MARKET_ADDRESS "nextMarketId()" --rpc-url $RPC_URL) - 1)) \
cast send $SOF_ADDRESS "approve(address,uint256)" $INFOFI_MARKET_ADDRESS 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff --rpc-url $RPC_URL --private-key $PRIVATE_KEY && \
cast send $INFOFI_MARKET_ADDRESS "placeBet(uint256,bool,uint256)" $MID true 1000000000000000000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

If markets are correctly locked, the final `placeBet` call should revert with the contract’s lock error.

## Notes

- All numbers in steps/prices are raw integer units; adapt to your chosen decimals for SOF (demo token may use 18 decimals).
- Timestamps must be consistent with your local anvil clock (real-time seconds since epoch).
- For structured calls with tuples on `cast`, the provided examples show tuple encodings via `cast abi-encode` and passing them into the function call.
- If you only want to smoke test buy/sell without VRF, avoid `requestSeasonEnd`.
- VRF v2 subscription id is `uint64`. Ensure you export and pass it accordingly.

---

## 11) End-to-End VRF Resolution via cast (no forge scripts)

The following commands run the second half of the lifecycle using only `cast` against a local Anvil with the Chainlink VRF v2 mock.

Prereqs:

- Deployed contracts with known addresses from Deploy.s.sol logs
- Anvil at `http://127.0.0.1:8545`
- Use inline env vars on every command

### 11.1 Update VRF callback gas limit (recommended)

The raffle’s VRF callback performs winner selection and distribution setup. Increase the callback gas limit to prevent out-of-gas failures when the mock calls back.

```bash
RPC_URL=http://127.0.0.1:8545 \
RAFFLE=0x<raffle_address> \
ADMIN_PK=0x<anvil_account0_private_key> \
SUB=$(cast call $RAFFLE "vrfSubscriptionId()(uint64)" --rpc-url $RPC_URL) && \
KEYHASH=$(cast call $RAFFLE "vrfKeyHash()(bytes32)" --rpc-url $RPC_URL) && \
cast send $RAFFLE "updateVRFConfig(uint64,bytes32,uint32)" $SUB $KEYHASH 2000000 \
  --rpc-url $RPC_URL --private-key $ADMIN_PK
```

If needed, fund the mock subscription:

```bash
RPC_URL=http://127.0.0.1:8545 \
VRF=0x<vrf_coordinator_mock_address> \
ADMIN_PK=0x<anvil_account0_private_key> \
cast send $VRF "fundSubscription(uint64,uint96)" 1 100000000000000000000 \
  --rpc-url $RPC_URL --private-key $ADMIN_PK
```

### 11.2 Create a short season via cast

This creates a new season with a near-term start and end, using a tiny 2-step curve. Prices are raw integers for demo purposes.

```bash
RPC_URL=http://127.0.0.1:8545 \
RAFFLE=0x<raffle_address> \
ADMIN_PK=0x<anvil_account0_private_key> \
START=$(($(date +%s)+15)) && \
END=$(($(date +%s)+120)) && \
CONFIG_TUPLE="(\"Season-cast\",$START,$END,3,5000,4000,0x0000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000,false,false)" && \
STEPS_ARRAY="[(1000,1000000000000000000),(2000,1100000000000000000)]" && \
BUY_FEE=10 && SELL_FEE=70 && \
cast send $RAFFLE \
  'createSeason((string,uint256,uint256,uint16,uint16,uint16,address,address,bool,bool),(uint128,uint128)[],uint16,uint16)' \
  "$CONFIG_TUPLE" "$STEPS_ARRAY" $BUY_FEE $SELL_FEE \
  --rpc-url $RPC_URL --private-key $ADMIN_PK
```

Get the new `seasonId` and details:

```bash
RPC_URL=http://127.0.0.1:8545 \
RAFFLE=0x<raffle_address> \
SID=$(cast call $RAFFLE "currentSeasonId()(uint256)" --rpc-url $RPC_URL) && echo "seasonId=$SID" && \
cast call $RAFFLE \
  "getSeasonDetails(uint256)((string,uint256,uint256,uint16,uint16,uint16,address,address,bool,bool),uint8,uint256,uint256,uint256)" \
  $SID --rpc-url $RPC_URL
```

### 11.3 Start the season

```bash
RPC_URL=http://127.0.0.1:8545 \
RAFFLE=0x<raffle_address> \
ADMIN_PK=0x<anvil_account0_private_key> \
SID=<season_id_from_above> \
cast send $RAFFLE "startSeason(uint256)" $SID --rpc-url $RPC_URL --private-key $ADMIN_PK
```

Optional: buy a few tickets on the curve before ending. (Skip for pure state progression; winner list can be empty.)

### 11.4 End season (emergency) and trigger VRF

```bash
RPC_URL=http://127.0.0.1:8545 \
RAFFLE=0x<raffle_address> \
ADMIN_PK=0x<anvil_account0_private_key> \
SID=<season_id_from_above> \
cast send $RAFFLE "requestSeasonEndEarly(uint256)" $SID --rpc-url $RPC_URL --private-key $ADMIN_PK
```

Map the new VRF request id to the season:

```bash
RPC_URL=http://127.0.0.1:8545 \
RAFFLE=0x<raffle_address> \
for i in 1 2 3 4 5 6 7 8 9; do echo -n "$i -> "; cast call $RAFFLE "vrfRequestToSeason(uint256)(uint256)" $i --rpc-url $RPC_URL; done
```

Pick the request id that maps to your `SID`.

### 11.5 Fulfill VRF on the mock and verify completion

```bash
RPC_URL=http://127.0.0.1:8545 \
VRF=0x<vrf_coordinator_mock_address> \
RAFFLE=0x<raffle_address> \
ADMIN_PK=0x<anvil_account0_private_key> \
REQ=<request_id_mapped_to_SID> \
cast send $VRF "fulfillRandomWords(uint256,address)" $REQ $RAFFLE --rpc-url $RPC_URL --private-key $ADMIN_PK

# Verify status and winners
RPC_URL=http://127.0.0.1:8545 \
RAFFLE=0x<raffle_address> \
SID=<season_id_from_above> \
cast call $RAFFLE \
  "getSeasonDetails(uint256)((string,uint256,uint256,uint16,uint16,uint16,address,address,bool,bool),uint8,uint256,uint256,uint256)" \
  $SID --rpc-url $RPC_URL && \
cast call $RAFFLE "getWinners(uint256)(address[])" $SID --rpc-url $RPC_URL
```

If the season is `Completed` (status 5), `getWinners` will return the selected addresses. If no tickets were sold, the winners array will be empty but the season status will still be `Completed`.

## 12) One‑pass command sequence (Local Anvil – latest E2E)

These are the exact patterns we used in the latest local E2E. Replace placeholders as needed. Important: to avoid occasional "ENS resolver buffer overrun" issues on some environments, prefer calling `cast send <RAW_ADDRESS> ...` instead of `cast send $ALIAS ...` where noted.

```bash
# Prereqs
RPC_URL=http://127.0.0.1:8545
VRF_COORDINATOR=0x<vrf_mock>
SOF=0x<sof_token>
RAFFLE=0x<raffle>
INFOFI=0x<infofi_market>

# Keys (Anvil defaults)
PK_DEP=0x<anvil_account0_pk>   # deployer/admin
PK_U1=0x<anvil_account1_pk>    # player 1
PK_U2=0x<anvil_account2_pk>    # player 2
ADDR_U1=$(cast wallet address --private-key $PK_U1)
ADDR_U2=$(cast wallet address --private-key $PK_U2)

# 1) Create 100k/100‑step season via script (sets start ~15s in future, end ~3m after)
RAFFLE_ADDRESS=$RAFFLE \
PRIVATE_KEY=$PK_DEP \
forge script script/CreateSeason.s.sol:CreateSeasonScript \
  --rpc-url $RPC_URL --broadcast -vvvv

# 2) Determine latest seasonId and details (here we expect SID=2 after running the script twice)
SID=$(cast call $RAFFLE "currentSeasonId()(uint256)" --rpc-url $RPC_URL)
cast call $RAFFLE \
  "getSeasonDetails(uint256)((string,uint256,uint256,uint16,uint16,uint16,address,address,bool,bool),uint8,uint256,uint256,uint256)" \
  $SID --rpc-url $RPC_URL

# 3) Start the season (must be >= startTime)
cast send $RAFFLE "startSeason(uint256)" $SID --rpc-url $RPC_URL --private-key $PK_DEP

# 4) Fund both players with SOF (1,000,000 SOF each)
# Use raw token address in cast send to avoid ENS resolver bug
cast send $SOF "transfer(address,uint256)" $ADDR_U1 1000000000000000000000000 --rpc-url $RPC_URL --private-key $PK_DEP
cast send $SOF "transfer(address,uint256)" $ADDR_U2 1000000000000000000000000 --rpc-url $RPC_URL --private-key $PK_DEP

# 5) Read the bonding curve address from season config (position 8 in the tuple)
CFG=$(cast call $RAFFLE \
  "getSeasonDetails(uint256)((string,uint256,uint256,uint16,uint16,uint16,address,address,bool,bool),uint8,uint256,uint256,uint256)" \
  $SID --rpc-url $RPC_URL)
# Example: parse bondingCurve off-chain; here assume you copy the address into CURVE
CURVE=0x<bonding_curve_from_above>

# 6) Approve and buy tickets
# Account 1: approve SOF to curve, then buy 5000 tickets with large max cap
cast send $SOF "approve(address,uint256)" $CURVE 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --rpc-url $RPC_URL --private-key $PK_U1
cast send $CURVE "buyTokens(uint256,uint256)" 5000 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --rpc-url $RPC_URL --private-key $PK_U1

# Account 2: approve SOF to curve, then buy 3000 tickets
cast send $SOF "approve(address,uint256)" $CURVE 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --rpc-url $RPC_URL --private-key $PK_U2
cast send $CURVE "buyTokens(uint256,uint256)" 3000 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --rpc-url $RPC_URL --private-key $PK_U2

# 7) Create an InfoFi market for player 1 (operator is deployer; OPERATOR_ROLE is set in Deploy.s.sol)
cast send $INFOFI "createMarket(uint256,address,string,address)" $SID $ADDR_U1 "Will $ADDR_U1 win this raffle?" $SOF \
  --rpc-url $RPC_URL --private-key $PK_DEP

# 8) Place hedged bets (example: U1 bets NO on self, U2 bets YES on U1). Adjust amounts as desired
MID=$(($(cast call $INFOFI "nextMarketId()(uint256)" --rpc-url $RPC_URL) - 1))
cast send $SOF "approve(address,uint256)" $INFOFI 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --rpc-url $RPC_URL --private-key $PK_U1
cast send $SOF "approve(address,uint256)" $INFOFI 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --rpc-url $RPC_URL --private-key $PK_U2
cast send $INFOFI "placeBet(uint256,bool,uint256)" $MID false 1000000000000000000 --rpc-url $RPC_URL --private-key $PK_U1  # NO 1.0
cast send $INFOFI "placeBet(uint256,bool,uint256)" $MID true  1500000000000000000 --rpc-url $RPC_URL --private-key $PK_U2  # YES 1.5

# 9) End season and settle via helper script (locks markets, triggers VRF, resolves, and claims payout)
RAFFLE_ADDRESS=$RAFFLE \
INFOFI_MARKET_ADDRESS=$INFOFI \
VRF_COORDINATOR_ADDRESS=$VRF_COORDINATOR \
SOF_ADDRESS=$SOF \
PRIVATE_KEY=$PK_DEP \
ACCOUNT1_PRIVATE_KEY=$PK_U1 \
ACCOUNT2_PRIVATE_KEY=$PK_U2 \
SEASON_ID=$SID \
forge script script/EndToEndResolveAndClaim.s.sol \
  --rpc-url $RPC_URL --broadcast -vvvv
```

Notes:

- Use raw addresses in `cast send <RAW_ADDRESS> ...` when you see any ENS resolver errors.
- If the normal `requestSeasonEnd` reverts due to `endTime`, the resolve script falls back to granting `EMERGENCY_ROLE` and calling `requestSeasonEndEarly`.
- The InfoFi market resolution in the script assumes the most recent market (id = `nextMarketId - 1`) tracks user1. Adjust if you created multiple markets.
