# Standard Local Anvil E2E Runbook for SecondOrder.fun Contracts (v2)

**Objective**: Execute a full raffle lifecycle on a fresh local Anvil instance, from deployment to prize claim, while tracking token balances.

## 1. Start Anvil

```bash
anvil --gas-limit 30000000
```

## 2. Deploy & Setup Contracts

This command deploys all contracts and then runs scripts to update the `.env` file and copy ABIs to the frontend.

```bash
# From the `contracts` directory
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key <YOUR_PRIVATE_KEY> --broadcast

# From the root project directory
node scripts/update-env-addresses.js
node scripts/copy-abis.js
```

## 3. Create and Start a New Season

Load all required environment variables from your updated `.env` file before running.

```bash
# From the `contracts` directory
export $(cat ../.env | xargs) && \
forge script script/CreateSeason.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast

# Wait for startTime to pass, then start the season
echo "Waiting 61 seconds for season to be startable..." && sleep 61 && \
cast send $RAFFLE_ADDRESS "startSeason(uint256)" 1 --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

## 4. Check Initial Balance

```bash
cast call $SOF_ADDRESS "balanceOf(address)" $ACCOUNT0_ADDRESS --rpc-url $RPC_URL
```

## 5. Buy Tickets

Note: The CURVE address is logged during the `CreateSeason` script execution.

```bash
export CURVE_ADDRESS=<bonding_curve_address_from_logs>

# Approve and buy tokens
cast send $SOF_ADDRESS "approve(address,uint256)" $CURVE_ADDRESS 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff --rpc-url $RPC_URL --private-key $PRIVATE_KEY

cast send $CURVE_ADDRESS "buyTokens(uint256,uint256)" 2000 3500000000000000000000 --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

## 6. Place Bets (from two accounts)

```bash
# Account 0 places a 'YES' bet
cast send $INFOFI_MARKET_ADDRESS "placeBet(uint256,bool,uint256)" 0 true 1000000000000000000 --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Transfer SOF to Account 1 and have it place a 'NO' bet
cast send $SOF_ADDRESS "transfer(address,uint256)" $ACCOUNT1_ADDRESS 1000000000000000000000 --rpc-url $RPC_URL --private-key $PRIVATE_KEY

cast send $SOF_ADDRESS "approve(address,uint256)" $INFOFI_MARKET_ADDRESS 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff --rpc-url $RPC_URL --private-key $ACCOUNT1_PRIVATE_KEY

cast send $INFOFI_MARKET_ADDRESS "placeBet(uint256,bool,uint256)" 0 false 1000000000000000000 --rpc-url $RPC_URL --private-key $ACCOUNT1_PRIVATE_KEY
```

## 7. Resolve Raffle and Claim Prizes

This script now handles VRF fulfillment, market resolution, InfoFi payout claims, and the grand prize claim.

```bash
# From the `contracts` directory
forge script script/EndToEndResolveAndClaim.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast -vvvv
```

## 8. Check Final Balance

```bash
cast call $SOF_ADDRESS "balanceOf(address)" $ACCOUNT0_ADDRESS --rpc-url $RPC_URL
```
