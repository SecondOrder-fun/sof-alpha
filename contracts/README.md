# SecondOrder.fun Contracts: Local Anvil Deployment & Usage

This guide shows how to:

- Start a local Anvil chain with funded accounts
- Deploy contracts with Foundry scripts
- (Option A) Stand up a Chainlink VRF v2+ mock locally
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
- `VRF_COORDINATOR` – Chainlink VRF v2+ coordinator address (mock for local)
- `VRF_KEY_HASH` – key hash used by the coordinator (mock value OK)
- `VRF_SUBSCRIPTION_ID` – VRF subId (from mock)

You can either:

- Use a VRF v2+ mock (recommended for testing full flow)
- Or deploy Raffle and avoid calling `requestSeasonEnd` until VRF is properly configured

## 3) Deploy VRF v2+ Mock (Recommended)

The repo includes Chainlink deps via `chainlink-brownie-contracts`. You can deploy the VRF v2+ mock using forge. A typical mock contract is `VRFCoordinatorV2_5Mock` or `VRFCoordinatorV2PlusMock` (names differ by package). The tests already use a mock via remappings; below is a general approach:

```bash
# Example using a common mock name (adjust to exact path if needed)
forge create \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  chainlink-brownie-contracts/contracts/src/v0.8/vrf/dev/VRFCoordinatorV2PlusMock.sol:VRFCoordinatorV2PlusMock \
  --constructor-args 0 0
```

Record the deployed mock address as `VRF_COORDINATOR`.

Create a subscription (ABI depends on mock; typical flow):

```bash
# Create sub
cast send $VRF_COORDINATOR "createSubscription()" --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Read subId (many mocks emit event or expose getter; example assuming subId = 1)
export VRF_SUBSCRIPTION_ID=1

# Add consumer later after Raffle is deployed.
```

Pick (or mock) a keyHash:

```bash
# Any 32-byte value works on mock
export VRF_KEY_HASH=0x0000000000000000000000000000000000000000000000000000000000000001
```

## 4) Deploy contracts with Foundry script

The script deploys:

- `SOFToken` (demo local $SOF)
- `Raffle` (constructed with SOF + VRF config)
- `InfoFiMarket` (standalone for now)

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

Set the required env vars for the script:

```bash
export VRF_COORDINATOR=<deployed_mock_address>
export VRF_SUBSCRIPTION_ID=<your_sub_id>
export VRF_KEY_HASH=<your_keyhash>
```

After run, note the console logs with deployed addresses:

- SOF token
- Raffle
- InfoFiMarket

Add the Raffle address as a VRF consumer on the mock (so callbacks work):

```bash
cast send $VRF_COORDINATOR \
  "addConsumer(uint256,address)" $VRF_SUBSCRIPTION_ID <RAFFLE_ADDRESS> \
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

CONFIG=$(cast abi-encode "(string,uint256,uint256,uint32,uint16,uint16,uint16,bool,bool,address,address)" \
  "Season 1" $START $END 10000 3 4000 6000 false false 0x0000000000000000000000000000000000000000 0x0000000000000000000000000000000000000000)

# Bond steps: two steps (first 10k tokens at 10 SOF, next 10k at 11 SOF)
STEP1=$(cast abi-encode "(uint128,uint128)" 10000 10)
STEP2=$(cast abi-encode "(uint128,uint128)" 20000 11)

# Pack as dynamic array of BondStep
STEPS=$(cast abi-encode "(tuple(uint128,uint128)[])" "[$STEP1,$STEP2]")

BUY_FEE=10    # 0.1%
SELL_FEE=70   # 0.7%

# Call createSeason
cast send <RAFFLE_ADDRESS> \
  "createSeason((string,uint256,uint256,uint32,uint16,uint16,uint16,bool,bool,address,address),(uint128,uint128)[],uint16,uint16)" \
  $CONFIG $STEPS $BUY_FEE $SELL_FEE \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

Get the current `seasonId` (the contract increments `currentSeasonId`):

```bash
cast call <RAFFLE_ADDRESS> "currentSeasonId()" --rpc-url $RPC_URL
```

Start the season when `block.timestamp >= startTime`:

```bash
SEASON_ID=<output_of_previous_call>
cast send <RAFFLE_ADDRESS> "startSeason(uint256)" $SEASON_ID --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

Fetch season details:

```bash
cast call <RAFFLE_ADDRESS> "getSeasonDetails(uint256)" $SEASON_ID --rpc-url $RPC_URL
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
cast call <RAFFLE_ADDRESS> "seasons(uint256)" $SEASON_ID --rpc-url $RPC_URL
# ... tuple includes bondingCurve address

export CURVE=<BONDING_CURVE_ADDRESS>
export SOF=<SOF_TOKEN_ADDRESS>
export BUYER_PK=$PRIVATE_KEY    # use a funded account
export BUYER=$(cast wallet address --private-key $BUYER_PK)

# Approve SOF to the curve, then buy 100 tokens with a max spend cap
cast send $SOF "approve(address,uint256)" $CURVE 100000000000000000000000 \
  --rpc-url $RPC_URL --private-key $BUYER_PK

# Optional: quote the cost
cast call $CURVE "calculateBuyPrice(uint256)" 100 --rpc-url $RPC_URL

# Buy
cast send $CURVE "buyTokens(uint256,uint256)" 100 100000000000000000000000 \
  --rpc-url $RPC_URL --private-key $BUYER_PK
```

Selling works similarly (ensure you hold raffle tokens). The curve will callback Raffle to update positions.

## 7) Ending the season (VRF)

When `block.timestamp >= endTime`, end the season and request VRF:

```bash
cast send <RAFFLE_ADDRESS> "requestSeasonEnd(uint256)" $SEASON_ID --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

The contract locks trading on the curve, submits a VRF request with `winnerCount` words, then upon fulfillment selects winners and transitions to distribution.

With a mock coordinator, you may need to manually fulfill the request (mock function name varies). In tests, fulfillment calls the consumer’s `fulfillRandomWords` via the mock. Look up your mock’s function (e.g., `fulfillRandomWords(uint256,address)` or v2+ variant) and call it with the `requestId` and consumer (Raffle address).

You can read the pending `vrfRequestId`:

```bash
cast call <RAFFLE_ADDRESS> "seasonStates(uint256)" $SEASON_ID --rpc-url $RPC_URL
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
