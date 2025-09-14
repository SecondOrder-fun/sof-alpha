#!/bin/bash
set -e

# Define the deployer private key and address
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 1. Start Anvil
echo "Starting fresh Anvil instance..."
pkill -f anvil || true
anvil --gas-limit 30000000 > /tmp/anvil.log 2>&1 &
ANVIL_PID=$!
sleep 3 # Wait for anvil to start

# Cleanup function to kill anvil on exit
trap "kill $ANVIL_PID" EXIT

# 2. Deploy Contracts & Create Season
echo "Cleaning forge cache and deploying contracts..."
cd contracts
forge clean
CREATE_SEASON=true forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key $DEPLOYER_PK --broadcast -vvvv
cd ..

# 3. Setup Environment
echo "Updating environment variables and ABIs..."
node scripts/update-env-addresses.js
node scripts/copy-abis.js

# 4. Get Deployed Contract Addresses
echo "Reading deployed contract addresses from broadcast..."
BROADCAST_FILE=$(find contracts/broadcast/Deploy.s.sol/31337 -name "run-latest.json")

# Extract all necessary contract addresses and export them
export RAFFLE_ADDRESS=$(jq -r '.transactions[] | select(.contractName == "Raffle") | .contractAddress' $BROADCAST_FILE | head -n 1)
export SOF_ADDRESS=$(jq -r '.transactions[] | select(.contractName == "SOFToken") | .contractAddress' $BROADCAST_FILE | head -n 1)
export INFOFI_MARKET_ADDRESS=$(jq -r '.transactions[] | select(.contractName == "InfoFiMarket") | .contractAddress' $BROADCAST_FILE | head -n 1)
export VRF_COORDINATOR_ADDRESS=$(jq -r '.transactions[] | select(.contractName == "VRFCoordinatorV2Mock") | .contractAddress' $BROADCAST_FILE | head -n 1)
export PRIZE_DISTRIBUTOR_ADDRESS=$(jq -r '.transactions[] | select(.contractName == "RafflePrizeDistributor") | .contractAddress' $BROADCAST_FILE | head -n 1)

# Hardcode user account keys for simplicity in the E2E script
export ACCOUNT1_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
export ACCOUNT2_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

# 5. Start Season
echo "Advancing time and starting season..."
curl -X POST --data '{"jsonrpc":"2.0","method":"anvil_mine","params":[1, 86401],"id":1}' -H "Content-Type: application/json" http://127.0.0.1:8545 > /dev/null
cast send $RAFFLE_ADDRESS "startSeason(uint256)" 1 --rpc-url http://127.0.0.1:8545 --private-key $DEPLOYER_PK

# 6. Fund Accounts and Buy Tickets
echo "Funding accounts and purchasing tickets..."
cd contracts
SEASON_ID=1 RAFFLE_ADDRESS=$RAFFLE_ADDRESS SOF_ADDRESS=$SOF_ADDRESS forge script script/BuyTickets.s.sol --rpc-url http://127.0.0.1:8545 --private-key $DEPLOYER_PK --broadcast -vvvv
cd ..

# 7. End Season and Determine Winner
echo "Ending season and resolving winner..."
cd contracts
SEASON_ID=1 PRIVATE_KEY=$DEPLOYER_PK RAFFLE_ADDRESS=$RAFFLE_ADDRESS INFOFI_MARKET_ADDRESS=$INFOFI_MARKET_ADDRESS SOF_ADDRESS=$SOF_ADDRESS VRF_COORDINATOR_ADDRESS=$VRF_COORDINATOR_ADDRESS ACCOUNT1_PRIVATE_KEY=$ACCOUNT1_PRIVATE_KEY ACCOUNT2_PRIVATE_KEY=$ACCOUNT2_PRIVATE_KEY PRIZE_DISTRIBUTOR_ADDRESS=$PRIZE_DISTRIBUTOR_ADDRESS forge script script/EndToEndResolveAndClaim.s.sol --rpc-url http://127.0.0.1:8545 --private-key $DEPLOYER_PK --broadcast -vvvv
cd ..

# 8. Generate Merkle Tree for Consolation Prizes
echo "Generating Merkle tree for consolation prizes..."
node scripts/generate-merkle-consolation.js

# 9. Claim Prizes
echo "Claiming grand and consolation prizes..."
SEASON_ID=1 RPC_URL=http://127.0.0.1:8545 RAFFLE_ADDRESS=$RAFFLE_ADDRESS PRIZE_DISTRIBUTOR_ADDRESS=$PRIZE_DISTRIBUTOR_ADDRESS node scripts/claim-prizes.js

echo "Full season test completed successfully!"
