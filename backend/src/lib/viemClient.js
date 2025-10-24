// backend/src/lib/viemClient.js
// Factory for viem PublicClient and WalletClient per network

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainByKey } from "../config/chain.js";

/**
 * Build a viem PublicClient for a given network key (LOCAL/TESTNET).
 * @param {string} [key]
 */
export function getPublicClient(key) {
  const chain = getChainByKey(key);
  return createPublicClient({
    chain: {
      id: chain.id,
      name: chain.name,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [chain.rpcUrl] } },
    },
    transport: http(chain.rpcUrl),
  });
}

/**
 * Build a viem WalletClient for backend wallet operations
 * @param {string} [key] - Network key (LOCAL/TESTNET)
 * @returns {import('viem').WalletClient}
 */
export function getWalletClient(key) {
  const chain = getChainByKey(key);
  const privateKey = process.env.BACKEND_WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('Backend wallet private key not configured. Set BACKEND_WALLET_PRIVATE_KEY or PRIVATE_KEY in .env');
  }
  
  const account = privateKeyToAccount(privateKey);
  
  return createWalletClient({
    account,
    chain: {
      id: chain.id,
      name: chain.name,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [chain.rpcUrl] } },
    },
    transport: http(chain.rpcUrl),
  });
}
