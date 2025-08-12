// src/config/networks.js
// Centralized chain configuration for frontend (Wagmi/Viem)
// Uses env-driven RPC URLs; defaults tuned for Local/Anvil

/**
 * @typedef {Object} ChainConfig
 * @property {number} id - EVM chain id
 * @property {string} name - Human-readable name
 * @property {string} rpcUrl - HTTPS RPC endpoint
 * @property {string} explorer - Block explorer base URL
 */

/** @type {Record<string, ChainConfig>} */
export const NETWORKS = {
  LOCAL: {
    id: 31337,
    name: "Local Anvil",
    rpcUrl: import.meta.env.VITE_RPC_URL_LOCAL || "http://127.0.0.1:8545",
    explorer: "",
  },
  TESTNET: {
    // Adjust to your target testnet (e.g., Base Sepolia 84532, Ethereum Sepolia 11155111)
    id: Number(import.meta.env.VITE_TESTNET_CHAIN_ID || 84532),
    name: import.meta.env.VITE_TESTNET_NAME || "Base Sepolia",
    rpcUrl: import.meta.env.VITE_RPC_URL_TESTNET || "",
    explorer: import.meta.env.VITE_TESTNET_EXPLORER || "https://sepolia.basescan.org",
  },
};

/**
 * Returns the initial/default network key.
 * Default to LOCAL per project rules; can be overridden via env.
 */
export function getDefaultNetworkKey() {
  return (import.meta.env.VITE_DEFAULT_NETWORK || "LOCAL").toUpperCase();
}

/**
 * Safe getter for a chain by key, falling back to LOCAL.
 * @param {string} key
 * @returns {ChainConfig}
 */
export function getNetworkByKey(key) {
  const k = (key || "LOCAL").toUpperCase();
  return NETWORKS[k] || NETWORKS.LOCAL;
}
