/**
 * Export initial chain for RainbowKit configuration.
 */
import { getChainConfig } from "@/lib/wagmi";

const testnetChainConfig = getChainConfig("TESTNET");

export const getInitialChain = () => testnetChainConfig.chain;
