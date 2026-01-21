// src/config/contracts.js
// Contract addresses per network (frontend)
// Values come from Vite env. Keep testnet empty until deployed.

/**
 * @typedef {Object} ContractAddresses
 * @property {`0x${string}` | string} RAFFLE
 * @property {`0x${string}` | string} SOF
 * @property {`0x${string}` | string} SEASON_FACTORY
 * @property {`0x${string}` | string} INFOFI_FACTORY
 * @property {`0x${string}` | string} INFOFI_ORACLE
 * @property {`0x${string}` | string} INFOFI_SETTLEMENT
 * @property {`0x${string}` | string} INFOFI_FPMM // FPMM manager contract
 * @property {`0x${string}` | string} CONDITIONAL_TOKENS // Gnosis Conditional Tokens
 * @property {`0x${string}` | string} VRF_COORDINATOR
 * @property {`0x${string}` | string} PRIZE_DISTRIBUTOR
 * @property {`0x${string}` | string} SOF_FAUCET
 */

import RAFFLE_ABI_JSON from "../contracts/abis/Raffle.json";

export const RAFFLE_ABI = RAFFLE_ABI_JSON;

/** @type {Record<string, ContractAddresses>} */
export const CONTRACTS = {
  LOCAL: {
    RAFFLE: import.meta.env.VITE_RAFFLE_ADDRESS_LOCAL || "",
    SOF: import.meta.env.VITE_SOF_ADDRESS_LOCAL || "",
    SEASON_FACTORY: import.meta.env.VITE_SEASON_FACTORY_ADDRESS_LOCAL || "",
    INFOFI_FACTORY: import.meta.env.VITE_INFOFI_FACTORY_ADDRESS_LOCAL || "",
    INFOFI_ORACLE: import.meta.env.VITE_INFOFI_ORACLE_ADDRESS_LOCAL || "",
    INFOFI_SETTLEMENT:
      import.meta.env.VITE_INFOFI_SETTLEMENT_ADDRESS_LOCAL || "",
    INFOFI_MARKET: import.meta.env.VITE_INFOFI_MARKET_ADDRESS_LOCAL || "", // legacy
    INFOFI_FPMM: import.meta.env.VITE_INFOFI_FPMM_ADDRESS_LOCAL || "",
    CONDITIONAL_TOKENS:
      import.meta.env.VITE_CONDITIONAL_TOKENS_ADDRESS_LOCAL || "",
    VRF_COORDINATOR: import.meta.env.VITE_VRF_COORDINATOR_ADDRESS_LOCAL || "",
    PRIZE_DISTRIBUTOR:
      import.meta.env.VITE_PRIZE_DISTRIBUTOR_ADDRESS_LOCAL || "",
    SOF_FAUCET: import.meta.env.VITE_SOF_FAUCET_ADDRESS_LOCAL || "",
  },
  TESTNET: {
    RAFFLE: import.meta.env.VITE_RAFFLE_ADDRESS_TESTNET || "",
    SOF: import.meta.env.VITE_SOF_ADDRESS_TESTNET || "",
    SEASON_FACTORY: import.meta.env.VITE_SEASON_FACTORY_ADDRESS_TESTNET || "",
    INFOFI_FACTORY: import.meta.env.VITE_INFOFI_FACTORY_ADDRESS_TESTNET || "",
    INFOFI_ORACLE: import.meta.env.VITE_INFOFI_ORACLE_ADDRESS_TESTNET || "",
    INFOFI_SETTLEMENT:
      import.meta.env.VITE_INFOFI_SETTLEMENT_ADDRESS_TESTNET || "",
    INFOFI_MARKET: import.meta.env.VITE_INFOFI_MARKET_ADDRESS_TESTNET || "", // legacy
    INFOFI_FPMM: import.meta.env.VITE_INFOFI_FPMM_ADDRESS_TESTNET || "",
    CONDITIONAL_TOKENS:
      import.meta.env.VITE_CONDITIONAL_TOKENS_ADDRESS_TESTNET || "",
    VRF_COORDINATOR: import.meta.env.VITE_VRF_COORDINATOR_ADDRESS_TESTNET || "",
    PRIZE_DISTRIBUTOR:
      import.meta.env.VITE_PRIZE_DISTRIBUTOR_ADDRESS_TESTNET || "",
    SOF_FAUCET: import.meta.env.VITE_SOF_FAUCET_ADDRESS_TESTNET || "",
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
