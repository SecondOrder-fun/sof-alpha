---
name: deploy-sepolia
description: Deploy a Foundry contract to Base Sepolia and update env vars on Vercel + Railway
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
---

# /deploy-sepolia — Deploy to Base Sepolia & Update Platform Env Vars

Deploy a Foundry script to Base Sepolia using the backend wallet, then update the relevant env vars on Vercel (frontend) and Railway (backend).

## Usage

```
/deploy-sepolia <script-path> [ENV_VAR_MAPPINGS...]
```

**Examples:**
```
/deploy-sepolia script/deploy/07_RedeployAirdrop.s.sol SOF_AIRDROP_ADDRESS_TESTNET
/deploy-sepolia script/deploy/05_RedeployAllSepolia.s.sol RAFFLE_ADDRESS_TESTNET SOF_ADDRESS_TESTNET
```

If no env var mappings are given, parse them from the deploy script's `console2.log` output.

## Pre-flight Checks

1. **Foundry installed**: Run `forge --version`. If missing, STOP.
2. **Backend .env exists**: Check that `/Users/psd/Documents/PROJECTS/SOf/sof-backend/.env` exists and contains `BACKEND_WALLET_PRIVATE_KEY`. This is the deployer key.
3. **CLIs available**: Run `vercel --version` and `railway --version`. If either is missing, WARN but continue (skip that platform's updates).
4. **Network confirmation**: Print the RPC URL (redacted) and wallet address, then ASK the user to confirm before broadcasting.

## Step 1: Deploy

Run the Foundry deploy script from the `contracts/` directory:

```bash
cd contracts && forge script <script-path> \
  --rpc-url "$RPC_URL_TESTNET" \
  --private-key "$BACKEND_WALLET_PRIVATE_KEY" \
  --broadcast \
  --verify \
  -vvvv
```

**Environment sourcing:** Read `BACKEND_WALLET_PRIVATE_KEY`, `BACKEND_WALLET_ADDRESS`, `RPC_URL_TESTNET`, and `SOF_TOKEN_ADDRESS` (if needed) from `/Users/psd/Documents/PROJECTS/SOf/sof-backend/.env`. Pass them via env vars to the forge command — NEVER echo private keys.

**IMPORTANT:** The deploy script may reference env vars like `PRIVATE_KEY`, `SOF_TOKEN_ADDRESS`, `BACKEND_WALLET_ADDRESS`. Read the script first to determine which env vars it needs, then source them from the backend `.env` file. Map backend env var names to what the script expects:
- `BACKEND_WALLET_PRIVATE_KEY` → `PRIVATE_KEY` (if script uses `vm.envUint("PRIVATE_KEY")`)
- Other vars: pass through as-is

If the deploy fails, show the error output and STOP. Do not proceed to env var updates.

## Step 2: Extract Deployed Addresses

Parse the forge script output for deployed contract addresses. Look for patterns like:
- `SOF_AIRDROP_ADDRESS= 0x...`
- `deployed: 0x...`
- `console2.log` output with addresses

Present the extracted addresses to the user for confirmation.

## Step 3: Update Local .env Files

Update the relevant env vars in:
- `/Users/psd/Documents/PROJECTS/SOf/sof-alpha/.env` (frontend, `VITE_` prefixed)
- `/Users/psd/Documents/PROJECTS/SOf/sof-backend/.env` (backend, no prefix)

For each contract address env var:
- Frontend uses: `VITE_<VAR_NAME>=<address>`
- Backend uses: `<VAR_NAME>=<address>`

Show the changes and ASK the user to confirm before writing.

## Step 4: Update Vercel Env Vars (Frontend)

For each env var that has a `VITE_` frontend equivalent:

```bash
# Remove old value first (both production and preview)
vercel env rm VITE_<VAR_NAME> production -y 2>/dev/null
vercel env rm VITE_<VAR_NAME> preview -y 2>/dev/null

# Add new value
echo "<address>" | vercel env add VITE_<VAR_NAME> production
echo "<address>" | vercel env add VITE_<VAR_NAME> preview
```

Vercel project is already linked in sof-alpha (`.vercel/project.json`). Run commands from the sof-alpha directory.

Also update any non-VITE vars that exist on Vercel (like `SOF_AIRDROP_ADDRESS_TESTNET` — check `vercel env ls` output).

## Step 5: Update Railway Env Vars (Backend)

For each env var:

```bash
railway variables set <VAR_NAME>=<address>
```

Railway is linked to the `sof-backend` project. Run commands from within the sof-backend directory or use `--service sof-backend` flag.

**Note:** Railway's `variables set` updates the current environment (production). If the var doesn't exist yet, it creates it.

## Step 6: Summary

Print a table showing:

| Env Var | New Value | Local (.env) | Vercel | Railway |
|---------|-----------|--------------|--------|---------|
| VAR_NAME | 0x... | UPDATED | UPDATED | UPDATED |

And remind the user:
- Vercel will auto-redeploy on next push (or run `vercel --prod` to force)
- Railway will auto-redeploy on next push to the linked branch
- Run `/deploy-check` to verify everything still builds

## Safety Rules

- **NEVER echo or log private keys.** Always pass via environment variables.
- **ALWAYS ask for user confirmation** before broadcasting transactions and before writing env vars.
- **NEVER deploy to mainnet.** This skill is Sepolia-only. If the script name contains "mainnet" or the RPC URL doesn't contain "sepolia", STOP.
- If `--verify` fails but deploy succeeds, WARN but continue with env var updates. Verification can be retried later.
- Keep a record: after successful deploy, print the etherscan URL for the deployed contract(s).
