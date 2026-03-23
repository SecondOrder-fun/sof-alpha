# Dual Paymaster Routing: Coinbase CDP + Pimlico

## Goal

Add gas sponsorship for MetaMask Smart Wallet users via Pimlico, alongside existing Coinbase CDP sponsorship. Route paymaster requests based on wallet type. Gate Pimlico sponsorship behind authenticated sessions.

## Background

SecondOrder.fun uses ERC-5792 batched transactions (`wallet_sendCalls`) with ERC-7677 paymaster sponsorship. Currently only Coinbase Smart Wallets get gas sponsored via Coinbase CDP. MetaMask Smart Wallets (EIP-7702) support the same ERC-5792/7677 flow but need Pimlico as the paymaster backend.

Coinbase CDP only sponsors Coinbase Smart Wallet transactions (built-in protection). Pimlico sponsors any valid userOperation, so we need auth gating to prevent abuse.

## Architecture

### Request Flow

```
User clicks "Buy Tickets" (or any on-chain action)
  │
  ├─ Coinbase Smart Wallet (connector.id === 'coinbaseWalletSDK')
  │   └─ sendCalls({ capabilities: { paymasterService: { url: "/api/paymaster/coinbase" }}})
  │       └─ Wallet calls proxy → proxy forwards to Coinbase CDP → sponsored
  │
  └─ Any other wallet (MetaMask, WalletConnect, etc.)
      ├─ Frontend: POST /api/paymaster/session (JWT auth) → { sessionToken }
      └─ sendCalls({ capabilities: { paymasterService: { url: "/api/paymaster/pimlico?session=<token>" }}})
          └─ Wallet calls proxy → proxy validates session (Redis) → forwards to Pimlico → sponsored
```

### Backend Routes (sof-backend)

All routes are registered in `paymasterProxyRoutes.js` under the existing `/api/paymaster` prefix. The file currently exports a single function that registers `POST /` — after this change it registers three sub-routes: `/session`, `/coinbase`, `/pimlico`, plus a backward-compat `POST /` that proxies to `/coinbase`.

Use `import { redisClient } from '../../shared/redisClient.js'` and call `redisClient.getClient()` for Redis access (same pattern as `authRoutes.js`).

#### `POST /api/paymaster/session`

- **Auth:** Explicitly call `AuthService.authenticateRequest(request)` and catch errors (return 401). Do NOT rely on the global `authenticateFastify` preHandler — it is permissive by design and does not reject unauthenticated requests.
- **Action:** Generate random UUID via `crypto.randomUUID()`, store in Redis: `SET paymaster:session:<uuid> 1 EX 300` (5-minute TTL)
- **Response:** `{ sessionToken: "<uuid>" }`
- **Rate limit:** 10 per minute per IP (Fastify per-route `config.rateLimit`)
- **Timeout:** 5s max for Redis write; return 503 on failure

#### `POST /api/paymaster/coinbase`

- **Auth:** None (Coinbase CDP self-protects by only sponsoring Coinbase Smart Wallet txs)
- **Action:** Forward JSON-RPC body to Coinbase CDP URL. URL selection: `isTestnet ? process.env.PAYMASTER_RPC_URL_TESTNET : process.env.PAYMASTER_RPC_URL`
- **Response:** Upstream response passthrough
- **Rate limit:** 30 per minute per IP
- **Missing env var:** Return `503 { error: "Coinbase paymaster not configured" }` if URL is falsy (existing pattern)

#### `POST /api/paymaster/pimlico`

- **Auth:** Read `session` from `request.query.session`. Check `GET paymaster:session:<session>` in Redis. If missing/expired, return `401 { error: "Invalid or expired session" }`. Do NOT delete on use (wallet makes 2 ERC-7677 calls per batch: `pm_getPaymasterStubData` then `pm_getPaymasterData`). TTL handles expiry.
- **Action:** Forward JSON-RPC body to Pimlico URL (see below for URL construction)
- **Response:** Upstream response passthrough
- **Rate limit:** 30 per minute per IP
- **Missing env var:** Return `503 { error: "Pimlico paymaster not configured" }` if API key is falsy
- **Logging:** Redact the `session` query param from Fastify access logs (do not log full URL at INFO level)

#### Pimlico URL Construction

```js
const CHAIN_IDS = { TESTNET: 84532, MAINNET: 8453 };
const networkKey = process.env.DEFAULT_NETWORK || "TESTNET";
const chainId = CHAIN_IDS[networkKey] || CHAIN_IDS.TESTNET;
const apiKey = networkKey === "TESTNET"
  ? process.env.PIMLICO_API_KEY_TESTNET
  : process.env.PIMLICO_API_KEY;
const pimlicoUrl = `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`;
```

#### Backward Compatibility

Register `POST /` (the old endpoint) as a pass-through to the Coinbase handler. This ensures any cached `VITE_PAYMASTER_PROXY_URL` values still work during rollout. Can be removed after one release cycle.

### Frontend Changes (sof-alpha)

#### `useSmartTransactions.js`

**Connector detection:** Add `connector` to the `useAccount()` destructure:
```js
const { address, connector } = useAccount();
```

**Paymaster URL construction in `executeBatch`:** Replace the current `if (paymasterUrl)` block with wallet-aware routing. The key change: do NOT use `hasPaymaster` from `wallet_getCapabilities` to gate Pimlico — MetaMask Smart Wallets may not report `paymasterService.supported = true` before upgrade. Instead, always attempt the paymaster for non-Coinbase wallets when the user is authenticated:

```js
const isCoinbaseWallet = connector?.id === 'coinbaseWalletSDK';
const apiBase = import.meta.env.VITE_API_BASE_URL;

if (isCoinbaseWallet && apiBase) {
  // Coinbase: use CDP endpoint directly (no session needed)
  batchCapabilities.paymasterService = {
    url: `${apiBase}/paymaster/coinbase`,
    optional: true,
  };
} else if (!isCoinbaseWallet && apiBase && backendJwt) {
  // Non-Coinbase wallet: use Pimlico with session token
  const sessionToken = await fetchPaymasterSession(apiBase, backendJwt);
  if (sessionToken) {
    batchCapabilities.paymasterService = {
      url: `${apiBase}/paymaster/pimlico?session=${sessionToken}`,
      optional: true,
    };
  }
}
```

**`fetchPaymasterSession` utility:** Define as a module-level async function (not a hook) in `useSmartTransactions.js`:

```js
async function fetchPaymasterSession(apiBase, jwt) {
  try {
    const res = await fetch(`${apiBase}/paymaster/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
    });
    if (!res.ok) return null;
    const { sessionToken } = await res.json();
    return sessionToken;
  } catch {
    return null; // fail silently — wallet falls back to user-paid gas
  }
}
```

Returns `null` on any failure — the `optional: true` flag ensures graceful degradation.

**Getting the JWT:** `executeBatch` needs access to `backendJwt` from FarcasterProvider. Add to the hook:
```js
const farcasterAuth = useContext(FarcasterContext);
const backendJwt = farcasterAuth?.backendJwt ?? null;
```

Import `useContext` and `FarcasterContext` at the top of the file.

**Session caching:** Cache the session token in a ref with its expiry time to avoid redundant fetches on rapid `executeBatch` calls:
```js
const sessionCacheRef = useRef({ token: null, expiresAt: 0 });

// Inside executeBatch, before fetchPaymasterSession:
const now = Date.now();
let sessionToken;
if (sessionCacheRef.current.token && sessionCacheRef.current.expiresAt > now) {
  sessionToken = sessionCacheRef.current.token;
} else {
  sessionToken = await fetchPaymasterSession(apiBase, backendJwt);
  if (sessionToken) {
    sessionCacheRef.current = { token: sessionToken, expiresAt: now + 4 * 60 * 1000 }; // 4 min (buffer before 5 min TTL)
  }
}
```

**`VITE_PAYMASTER_PROXY_URL` deprecation:** This env var is no longer used. The frontend constructs paymaster URLs from `VITE_API_BASE_URL` + `/paymaster/coinbase` or `/paymaster/pimlico`. Remove the `paymasterUrl` line that reads this var.

### Environment Variables

#### Backend (Railway)

| Variable | Value | Environment |
|----------|-------|-------------|
| `PIMLICO_API_KEY_TESTNET` | From Pimlico dashboard (free tier) | All |
| `PIMLICO_API_KEY` | From Pimlico dashboard (pay-as-you-go) | Production |
| `PAYMASTER_RPC_URL_TESTNET` | Existing Coinbase CDP URL (unchanged) | All |
| `PAYMASTER_RPC_URL` | Existing Coinbase CDP URL (unchanged) | Production |

#### Frontend (Vercel)

- Remove `VITE_PAYMASTER_PROXY_URL` (no longer needed)
- `VITE_API_BASE_URL` already exists and is used for paymaster URL construction

### Manual Setup Steps

1. Create Pimlico account at [dashboard.pimlico.io](https://dashboard.pimlico.io)
2. Create API key for testnet (free tier, no card needed)
3. Create API key for mainnet (pay-as-you-go, card required) — deferred until mainnet launch
4. Set sponsorship policy in Pimlico dashboard: no contract allowlist (authenticated session gating handles abuse prevention)
5. Add `PIMLICO_API_KEY_TESTNET` to Railway env vars
6. Add `PIMLICO_API_KEY` to Railway env vars when ready for mainnet

### Error Handling

| Scenario | Behavior |
|----------|----------|
| User not authenticated | `fetchPaymasterSession` returns null. No paymaster capability added. Wallet sends without sponsorship. |
| Session token missing/invalid | Pimlico proxy returns 401. `optional: true` means wallet falls back to user-paid gas. |
| Session token expired (>5 min) | Same as invalid — 401, falls back. |
| Session expires between ERC-7677 calls | Second `pm_getPaymasterData` call gets 401. Wallet behavior is undefined but `optional: true` should cause graceful fallback. **Known limitation** — document but accept. |
| Pimlico API down | Proxy returns 502. Wallet falls back. |
| Coinbase CDP down | Proxy returns 502. Wallet falls back. |
| `PIMLICO_API_KEY_TESTNET` missing | Proxy returns 503. Wallet falls back. |
| `fetchPaymasterSession` timeout/error | Returns null silently. No sponsorship attempted. |

The `optional: true` flag in all `paymasterService` capabilities ensures graceful degradation for all failure modes.

### Security Notes

- Session tokens are opaque UUIDs — no user data exposed in URL
- 5-minute TTL limits replay window
- Session tokens are NOT deleted on use (wallet makes 2 calls per batch). TTL is the sole expiry mechanism.
- Pimlico proxy route should redact `session` query param from access logs
- `PIMLICO_API_KEY` is never exposed to the frontend — only the backend proxy uses it

### Testing

- **Unit:** Session token generation, Redis store/validate, chain ID mapping
- **Integration:** Proxy routing to correct upstream for each wallet type
- **E2E (testnet):** Connect Coinbase wallet → verify CDP sponsorship still works. Connect MetaMask → verify Pimlico sponsorship works.
- **Auth gating:** Unauthenticated `POST /api/paymaster/session` → 401. Missing session param on `/api/paymaster/pimlico` → 401.
- **Fallback:** Verify `optional: true` gracefully falls back when paymaster fails
- **Backward compat:** Old `POST /api/paymaster` still works (proxies to Coinbase)

### Cost

Pimlico pay-as-you-go: ~10% surcharge on gas cost. Base L2 gas is ~$0.001-0.01 per tx, so sponsorship cost is ~$0.0001-0.001 per tx. Negligible at current scale.

### Future Considerations

- **Contract allowlist policy:** Once a registry contract for bonding curve instances exists, add Pimlico dashboard policy to restrict sponsorship to known contracts (reduces abuse surface, can remove session gating).
- **Unified paymaster:** If Pimlico proves reliable, consider using it for all wallets (replacing Coinbase CDP) to simplify to one paymaster backend.
- **Session token → signed cookie:** If URL query param proves problematic, switch to a signed HTTP-only cookie that the browser sends automatically.
- **Redis key documentation:** Add `paymaster:session:<uuid>` to the Redis key pattern documentation alongside `auth:nonce:<address>` and `auth:farcaster_nonce:<nonce>`.
