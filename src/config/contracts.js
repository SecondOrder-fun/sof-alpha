// src/config/contracts.js
// Contract addresses per network (frontend)
// Values come from Vite env. Keep testnet empty until deployed.

/**
 * @typedef {Object} ContractAddresses
 * @property {`0x${string}` | string} RAFFLE
 * @property {`0x${string}` | string} SOF
 * @property {`0x${string}` | string} BONDING_CURVE
 */

/** @type {Record<string, ContractAddresses>} */
export const CONTRACTS = {
  LOCAL: {
    RAFFLE: import.meta.env.VITE_RAFFLE_ADDRESS_LOCAL || "",
    SOF: import.meta.env.VITE_SOF_ADDRESS_LOCAL || "",
    BONDING_CURVE: import.meta.env.VITE_CURVE_ADDRESS_LOCAL || "",
  },
  TESTNET: {
    RAFFLE: import.meta.env.VITE_RAFFLE_ADDRESS_TESTNET || "",
    SOF: import.meta.env.VITE_SOF_ADDRESS_TESTNET || "",
    BONDING_CURVE: import.meta.env.VITE_CURVE_ADDRESS_TESTNET || "",
  },
};

/**
 * Returns addresses for selected network key.
 * @param {string} key
 * @returns {ContractAddresses}
 */
export function getContractsByKey(key) {
  const k = (key || "LOCAL").toUpperCase();
  return CONTRACTS[k] || CONTRACTS.LOCAL;
}
