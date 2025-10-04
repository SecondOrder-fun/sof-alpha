# 🔧 Quick Fix: MetaMask Circuit Breaker Error

## ⚡ The Problem

You see this error when trying to create a raffle or make transactions:

```
Execution prevented because the circuit breaker is open
```

## ✅ Quick Fix (30 seconds)

1. **Open MetaMask** (click the fox icon)
2. **Click the network dropdown** (top left, shows "Localhost 8545")
3. **Switch to "Ethereum Mainnet"** (or any other network)
4. **Wait 2-3 seconds** ⏱️
5. **Switch back to "Localhost 8545"**
6. **Try your transaction again** ✨

## 🔍 Why This Happens

MetaMask's circuit breaker trips when:
- Anvil is not running
- Too many failed connection attempts
- Page was reloaded during a transaction

## 🛠️ If Quick Fix Doesn't Work

### Check Anvil is Running

```bash
# In a terminal, run:
curl http://127.0.0.1:8545 -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

**Expected response:** `{"jsonrpc":"2.0","id":1,"result":"0x..."}`

**If it fails:** Start Anvil:
```bash
anvil -p 8545 --chain-id 31337
```

### Still Not Working?

1. **Restart MetaMask:**
   - Disable the extension in Chrome
   - Re-enable it
   - Reload the page

2. **Check the browser console** for other errors

3. **See full documentation:** `/docs/03-development/metamask-circuit-breaker-fix.md`

## 📝 Prevention

- ✅ Always start Anvil before opening the dApp
- ✅ Use `npm run dev:stack` to start everything together
- ✅ Don't reload the page during transactions
- ✅ Check MetaMask is on "Localhost 8545" network

---

**Need more help?** Check the full documentation in `/docs/03-development/metamask-circuit-breaker-fix.md`
