// src/config/contracts.js
// Contract addresses per network (frontend)
// Values come from Vite env. Keep testnet empty until deployed.

/**
 * @typedef {Object} ContractAddresses
 * @property {`0x${string}` | string} RAFFLE
 * @property {`0x${string}` | string} SOF
 * @property {`0x${string}` | string} SEASON_FACTORY
 * @property {`0x${string}` | string} RAFFLE_TRACKER
 * @property {`0x${string}` | string} INFOFI_FACTORY
 * @property {`0x${string}` | string} INFOFI_ORACLE
 * @property {`0x${string}` | string} INFOFI_SETTLEMENT
 * @property {`0x${string}` | string} INFOFI_MARKET // legacy placeholder
 */

import RAFFLE_ABI_JSON from '../contracts/abis/Raffle.json';
export const RAFFLE_ABI = RAFFLE_ABI_JSON;
import RAFFLE_TRACKER_ABI_JSON from '../contracts/abis/RafflePositionTracker.json';
export const RAFFLE_TRACKER_ABI = RAFFLE_TRACKER_ABI_JSON;

/** @type {Record<string, ContractAddresses>} */
export const CONTRACTS = {
  LOCAL: {
    RAFFLE: import.meta.env.VITE_RAFFLE_ADDRESS_LOCAL || "",
    SOF: import.meta.env.VITE_SOF_ADDRESS_LOCAL || "",
    SEASON_FACTORY: import.meta.env.VITE_SEASON_FACTORY_ADDRESS_LOCAL || "",
    RAFFLE_TRACKER: import.meta.env.VITE_RAFFLE_TRACKER_ADDRESS_LOCAL || "",
    INFOFI_FACTORY: import.meta.env.VITE_INFOFI_FACTORY_ADDRESS_LOCAL || "",
    INFOFI_ORACLE: import.meta.env.VITE_INFOFI_ORACLE_ADDRESS_LOCAL || "",
    INFOFI_SETTLEMENT: import.meta.env.VITE_INFOFI_SETTLEMENT_ADDRESS_LOCAL || "",
    INFOFI_MARKET: import.meta.env.VITE_INFOFI_MARKET_ADDRESS_LOCAL || "", // legacy
  },
  TESTNET: {
    RAFFLE: import.meta.env.VITE_RAFFLE_ADDRESS_TESTNET || "",
    SOF: import.meta.env.VITE_SOF_ADDRESS_TESTNET || "",
    SEASON_FACTORY: import.meta.env.VITE_SEASON_FACTORY_ADDRESS_TESTNET || "",
    RAFFLE_TRACKER: import.meta.env.VITE_RAFFLE_TRACKER_ADDRESS_TESTNET || "",
    INFOFI_FACTORY: import.meta.env.VITE_INFOFI_FACTORY_ADDRESS_TESTNET || "",
    INFOFI_ORACLE: import.meta.env.VITE_INFOFI_ORACLE_ADDRESS_TESTNET || "",
    INFOFI_SETTLEMENT: import.meta.env.VITE_INFOFI_SETTLEMENT_ADDRESS_TESTNET || "",
    INFOFI_MARKET: import.meta.env.VITE_INFOFI_MARKET_ADDRESS_TESTNET || "", // legacy
  },
};

/**
 * Returns addresses for selected network key.
 * @param {string} key
 * @returns {ContractAddresses}
 */
export function getContractAddresses(key) {
  const k = (key || "LOCAL").toUpperCase();
  return CONTRACTS[k] || CONTRACTS.LOCAL;
}
