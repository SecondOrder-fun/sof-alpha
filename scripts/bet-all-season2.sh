#!/bin/bash
# bet-all-season2.sh — Place test bets on all Season 2 InfoFi markets
# Usage: ./scripts/bet-all-season2.sh
#
# Markets (Season 2, Raffle 2):
#   Market 30: player 0x1ed4 (our wallet), FPMM 0x1fc0, prob ~89.7%
#   Market 31: player 0x2146, FPMM 0xd4bf, prob ~50%
#   Market 33: player 0xC46b, FPMM 0x96cC, prob ~33.3%
#   Market 34: player 0x7931, FPMM 0x4504, prob ~25%

set -euo pipefail

# Config
RPC_URL="https://sepolia.base.org"
PRIVATE_KEY="${SOF_DEV_WALLET_PRIVATE_KEY:-0x99593f2b6808e237a23806fc06f8ad5f76987b01d69e31425a13afcefbfaa826}"
SOF_TOKEN="0x5146Dd2a3Af7Bd4D247e34A3F7322daDF7ee5B0c"
BET_AMOUNT="10000000000000000000"  # 10 SOF

# Markets: FPMM_ADDRESS BUY_YES(true/false) MARKET_ID PLAYER_SHORT
MARKETS=(
  "0x1fc0879c2edd4b8401615a15c280896a5199a037:true:30:0x1ed4"
  "0xd4bf98b14698bae2b356261d6f74d28168722d6d:false:31:0x2146"
  "0x96ccc4b1324b12bfd7f05160fce38344c2595e17:true:33:0xC46b"
  "0x45040def20c42b05c9d4f73780a77b525373f255:false:34:0x7931"
)

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Season 2 — Batch Bet Script (10 SOF each)         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Get wallet address
WALLET=$(cast wallet address --private-key $PRIVATE_KEY)
echo "🔑 Wallet: $WALLET"

# Helper: strip cast annotation (e.g. "12345 [1.2e4]" → "12345")
strip() { echo "$1" | awk '{print $1}'; }

# Check SOF balance
BALANCE_RAW=$(cast call $SOF_TOKEN "balanceOf(address)(uint256)" $WALLET --rpc-url $RPC_URL)
echo "💰 SOF Balance: $(cast from-wei $(strip "$BALANCE_RAW")) SOF"
echo ""

TOTAL_BET=0

for entry in "${MARKETS[@]}"; do
  IFS=':' read -r FPMM BUY_YES MARKET_ID PLAYER <<< "$entry"
  SIDE=$([ "$BUY_YES" = "true" ] && echo "YES" || echo "NO")

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Market $MARKET_ID (player $PLAYER) — Buying $SIDE"
  echo "   FPMM: $FPMM"

  # Calculate expected output
  EXPECTED_RAW=$(cast call $FPMM "calcBuyAmount(bool,uint256)(uint256)" $BUY_YES $BET_AMOUNT --rpc-url $RPC_URL)
  EXPECTED=$(strip "$EXPECTED_RAW")
  echo "   Expected output: $(cast from-wei $EXPECTED) outcome tokens"

  # Min output = 80% of expected (generous slippage for testnet)
  MIN_OUT=$(echo "$EXPECTED * 80 / 100" | bc)
  echo "   Min output (80%): $(cast from-wei $MIN_OUT)"

  # Step 1: Approve SOF to FPMM
  echo "   ⏳ Approving SOF..."
  NONCE=$(cast nonce $WALLET --rpc-url $RPC_URL)
  cast send $SOF_TOKEN "approve(address,uint256)" $FPMM $BET_AMOUNT \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL --nonce $NONCE --quiet 2>&1 | tail -1
  echo "   ✅ Approved"

  # Step 2: Buy (wait for nonce to advance)
  echo "   ⏳ Placing bet..."
  NONCE=$((NONCE + 1))
  TX=$(cast send $FPMM "buy(bool,uint256,uint256)" $BUY_YES $BET_AMOUNT $MIN_OUT \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL --nonce $NONCE --json)
  sleep 2  # Let nonce propagate

  TX_HASH=$(echo $TX | jq -r '.transactionHash')
  STATUS=$(echo $TX | jq -r '.status')

  if [ "$STATUS" = "0x1" ]; then
    echo "   ✅ Bet placed! TX: $TX_HASH"
    TOTAL_BET=$((TOTAL_BET + 10))
  else
    echo "   ❌ FAILED! TX: $TX_HASH"
    echo "   Status: $STATUS"
  fi

  # Check new reserves
  YES_R=$(strip "$(cast call $FPMM 'yesReserve()(uint256)' --rpc-url $RPC_URL)")
  NO_R=$(strip "$(cast call $FPMM 'noReserve()(uint256)' --rpc-url $RPC_URL)")
  echo "   📈 New reserves: YES=$(cast from-wei $YES_R), NO=$(cast from-wei $NO_R)"
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏁 Done! Total bet: ${TOTAL_BET} SOF across ${#MARKETS[@]} markets"

# Final balance
BALANCE_AFTER=$(strip "$(cast call $SOF_TOKEN 'balanceOf(address)(uint256)' $WALLET --rpc-url $RPC_URL)")
echo "💰 SOF Balance after: $(cast from-wei $BALANCE_AFTER) SOF"
