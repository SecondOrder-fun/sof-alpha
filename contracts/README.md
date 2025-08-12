# SecondOrder.fun Contracts: Local Anvil Deployment & Usage

This guide shows how to:

- Start a local Anvil chain with funded accounts
- Deploy contracts with Foundry scripts
- (Option A) Stand up a Chainlink VRF v2 mock locally
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

The deployment script `contracts/script/Deploy.s.sol` expects:

- `PRIVATE_KEY` – your anvil deployer key
- `VRF_COORDINATOR` – Chainlink VRF v2 coordinator address (mock for local)
- `VRF_KEY_HASH` – key hash used by the coordinator (mock value OK)
- `VRF_SUBSCRIPTION_ID` – VRF subId (from mock)

You can either:

- Use a VRF v2 mock (recommended for testing full flow)
- Or deploy Raffle and avoid calling `requestSeasonEnd` until VRF is properly configured

## 3) Deploy VRF v2 Mock (Recommended)

The repo includes Chainlink deps via `chainlink-brownie-contracts`. For VRF v2, use `VRFCoordinatorV2Mock`:

```bash
# Deploy VRF v2 mock (baseFee, gasPriceLink)
forge create \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  lib/chainlink-brownie-contracts/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2Mock.sol:VRFCoordinatorV2Mock \
  --constructor-args 100000000000000000 1000000000

export VRF_COORDINATOR=<address_from_output>
```

Create and fund a subscription, then add your consumer (Raffle):

```bash
# Create sub (returns uint64 subId via event)
cast send $VRF_COORDINATOR "createSubscription() returns (uint64)" \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Get subId from receipt events
export VRF_SUBSCRIPTION_ID=<decoded_uint64_sub_id>

# Fund sub (mock treats this as LINK-like units)
cast send $VRF_COORDINATOR "fundSubscription(uint64,uint96)" \
  $VRF_SUBSCRIPTION_ID 100000000000000000000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Pick any 32-byte keyHash for mock usage
export VRF_KEY_HASH=0x0000000000000000000000000000000000000000000000000000000000000001
```

## 4) Deploy contracts with Foundry script

The script deploys:

- `SOFToken` (demo local $SOF)
- `Raffle` (constructed with SOF + VRF config)
- `InfoFiMarket` (standalone for now)

Set the required env vars for the script:

```bash
export VRF_COORDINATOR=<deployed_mock_address>
export VRF_SUBSCRIPTION_ID=<your_sub_id>
export VRF_KEY_HASH=<your_keyhash>
```

**For ANVIL**
Set the following env vars:

```bash
export ETHERSCAN_API_KEY=dummy
```

Run the script:

```bash
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvvv \
  --sender $(cast wallet address --private-key $PRIVATE_KEY) \
  --via-ir
```

After run, note the console logs with deployed addresses:

```bash
export SOF_TOKEN_ADDRESS=<deployed_sof_token_address>
export RAFFLE_ADDRESS=<deployed_raffle_address>
```

Add the Raffle address as a VRF consumer on the mock (so callbacks work):

```bash
cast send $VRF_COORDINATOR \
  "addConsumer(uint64,address)" $VRF_SUBSCRIPTION_ID $RAFFLE_ADDRESS \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

Optionally fund the subscription if the mock requires it (some mocks accept LINK-like tokens or don’t enforce funding).

## 5) Creating a season (Raffle)

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
  uint32 maxParticipants;
  uint16 winnerCount;
  uint16 prizePercentage;       // bps
  uint16 consolationPercentage; // bps
  bool isActive;
  bool isCompleted;
  address raffleToken;  // filled by createSeason
  address bondingCurve; // filled by createSeason
}
```

BondStep layout (pricing steps for the discrete bonding curve):

```solidity
struct BondStep {
  uint128 rangeTo; // cumulative supply bound for the step
  uint128 price;   // SOF per token on this step
}
```

### Example: create a season via `cast`

Pick a start/end time in the future and steps:

```bash
# Example times
START=$(($(date +%s)+60))    # starts in 1 minute
END=$(($(date +%s)+86400))   # ends in 1 day

# Encode SeasonConfig (tuple) for cast; booleans/isActive/isCompleted must be false at creation
# We will pass empty addresses for raffleToken/bondingCurve since contract fills them.

CONFIG_TUPLE="(\"Season 1\",$START,$END,10000,3,4000,6000,false,false,0x0000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000)"


# Bond steps: two steps (first 10k tokens at 10 SOF, next 10k at 11 SOF)
STEPS_ARRAY="[(10000,10),(20000,11)]"

# Set the buy and sell transaction fees
BUY_FEE=10    # 0.1%
SELL_FEE=70   # 0.7%

# Call createSeason
cast send $RAFFLE_ADDRESS \
  'createSeason((string,uint256,uint256,uint32,uint16,uint16,uint16,bool,bool,address,address),(uint128,uint128)[],uint16,uint16)' \
  "$CONFIG_TUPLE" "$STEPS_ARRAY" $BUY_FEE $SELL_FEE \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

Get the current `seasonId` (the contract increments `currentSeasonId`):

```bash
SEASON_ID=$(cast call $RAFFLE_ADDRESS "currentSeasonId()" --rpc-url $RPC_URL)

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

## 6) Buying and selling tickets on the curve

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

## 7) Ending the season (VRF)

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

## 8) Roles & Admin utilities

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

## 9) Quick reference: core function calls

- `Raffle.createSeason(config, steps[], buyFeeBps, sellFeeBps) -> seasonId`
- `Raffle.startSeason(seasonId)`
- `SOFBondingCurve.buyTokens(tokenAmount, maxSofAmount)`
- `SOFBondingCurve.sellTokens(tokenAmount, minSofAmount)`
- `Raffle.requestSeasonEnd(seasonId)`
- Views: `Raffle.getSeasonDetails`, `Raffle.getParticipants`, `Raffle.getParticipantPosition`, `Raffle.getParticipantNumberRange`, `SOFBondingCurve.getSofReserves`

## Notes

- All numbers in steps/prices are raw integer units; adapt to your chosen decimals for SOF (demo token may use 18 decimals).
- Timestamps must be consistent with your local anvil clock (real-time seconds since epoch).
- For structured calls with tuples on `cast`, the provided examples show tuple encodings via `cast abi-encode` and passing them into the function call.
- If you only want to smoke test buy/sell without VRF, avoid `requestSeasonEnd`.
- VRF v2 subscription id is `uint64`. Ensure you export and pass it accordingly.
