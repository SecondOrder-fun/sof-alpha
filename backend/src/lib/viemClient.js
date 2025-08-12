// backend/src/lib/viemClient.js
// Factory for viem PublicClient per network for read-only calls and logs.

import { createPublicClient, http } from "viem";
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
