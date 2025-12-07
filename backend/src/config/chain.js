// backend/src/config/chain.js
// Env-driven chain configuration for backend services (read-only onchain)

/**
 * Load env with sane defaults. Validates based on DEFAULT_NETWORK.
 */
export function loadChainEnv() {
  const env = {
    LOCAL: {
      id: Number(process.env.LOCAL_CHAIN_ID || 31337),
      name: process.env.LOCAL_CHAIN_NAME || "Local Anvil",
      rpcUrl: process.env.RPC_URL_LOCAL || "http://127.0.0.1:8545",
      raffle: process.env.RAFFLE_ADDRESS_LOCAL || "",
      sof: process.env.SOF_ADDRESS_LOCAL || "",
      curve: process.env.CURVE_ADDRESS_LOCAL || "",
      infofiFactory: process.env.INFOFI_FACTORY_ADDRESS_LOCAL || "",
      // InfoFi on-chain hybrid price oracle (required for SSE transport)
      infofiOracle: process.env.INFOFI_ORACLE_ADDRESS_LOCAL || "",
      // Network-specific configuration
      avgBlockTime: 1, // Anvil produces blocks instantly
      lookbackBlocks: 10000n, // Smaller lookback for local testing
    },
    TESTNET: {
      id: Number(process.env.TESTNET_CHAIN_ID || 84532),
      name: process.env.TESTNET_NAME || "Base Sepolia",
      rpcUrl: process.env.RPC_URL_TESTNET || "",
      raffle: process.env.RAFFLE_ADDRESS_TESTNET || "",
      sof: process.env.SOF_ADDRESS_TESTNET || "",
      curve: process.env.CURVE_ADDRESS_TESTNET || "",
      infofiFactory: process.env.INFOFI_FACTORY_ADDRESS_TESTNET || "",
      // InfoFi on-chain hybrid price oracle (required for SSE transport)
      infofiOracle: process.env.INFOFI_ORACLE_ADDRESS_TESTNET || "",
      // Network-specific configuration
      avgBlockTime: 2, // Base has ~2 second block time
      lookbackBlocks: 50000n, // Safe lookback under RPC limit (Base Sepolia limit is 100k)
    },
    MAINNET: {
      id: Number(process.env.MAINNET_CHAIN_ID || 8453),
      name: process.env.MAINNET_NAME || "Base",
      rpcUrl: process.env.RPC_URL_MAINNET || "",
      raffle: process.env.RAFFLE_ADDRESS_MAINNET || "",
      sof: process.env.SOF_ADDRESS_MAINNET || "",
      curve: process.env.CURVE_ADDRESS_MAINNET || "",
      infofiFactory: process.env.INFOFI_FACTORY_ADDRESS_MAINNET || "",
      // InfoFi on-chain hybrid price oracle (required for SSE transport)
      infofiOracle: process.env.INFOFI_ORACLE_ADDRESS_MAINNET || "",
      // Network-specific configuration
      avgBlockTime: 2, // Base has ~2 second block time
      lookbackBlocks: 50000n, // Safe lookback under RPC limit (Base mainnet limit is 100k)
    },
  };

  // Validate only the network we're actually using
  const defaultNet = (
    process.env.DEFAULT_NETWORK ||
    process.env.VITE_DEFAULT_NETWORK ||
    "LOCAL"
  ).toUpperCase();

  // Define required env vars per network
  const REQUIRED_BY_NETWORK = {
    LOCAL: ["RPC_URL_LOCAL"],
    TESTNET: ["RPC_URL_TESTNET"],
    MAINNET: ["RPC_URL_MAINNET"],
  };

  const required = REQUIRED_BY_NETWORK[defaultNet] || [];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length) {
    // Log warning rather than crash; healthcheck will surface failures
    // eslint-disable-next-line no-console
    console.warn(
      `[chain] Missing required env for ${defaultNet}: ${missing.join(", ")}`
    );
  }

  return env;
}

/**
 * Get a chain config by key (LOCAL/TESTNET), fallback to DEFAULT_NETWORK from .env.
 * @param {string} key
 */
export function getChainByKey(key) {
  const env = loadChainEnv();
  // Respect DEFAULT_NETWORK from .env instead of hardcoding LOCAL
  const defaultNet = (
    process.env.DEFAULT_NETWORK ||
    process.env.VITE_DEFAULT_NETWORK ||
    "LOCAL"
  ).toUpperCase();
  const k = (key || defaultNet).toUpperCase();
  return env[k] || env[defaultNet] || env.LOCAL;
}
