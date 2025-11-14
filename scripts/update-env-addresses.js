#!/usr/bin/env node
/* eslint-env node */
/* eslint no-console: 0 */
/*
  update-env-addresses.js
  - Parses Foundry broadcast output and updates .env and .env.local with deployed contract addresses
  - Supports LOCAL (default) network; extensible for TESTNET if needed
*/

import fs from "fs";
import path from "path";
import process from "node:process";
import { fileURLToPath } from "url";
import { getAddress as toChecksumAddress } from "viem";

// Resolve repo root relative to this script location so it works from any CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const BROADCAST_BASE = path.join(ROOT, "contracts", "broadcast");

// Base directory for Foundry broadcast artifacts
const BROADCAST_DIR = BROADCAST_BASE;

// Map contract names in broadcast to env keys
const NAME_TO_ENV = {
  // Core
  SOFToken: "SOF",
  Raffle: "RAFFLE",
  SeasonFactory: "SEASON_FACTORY",
  // InfoFi
  InfoFiMarketFactory: "INFOFI_FACTORY",
  InfoFiPriceOracle: "INFOFI_ORACLE",
  InfoFiSettlement: "INFOFI_SETTLEMENT",
  InfoFiFPMMV2: "INFOFI_FPMM",
  ConditionalTokenSOF: "CONDITIONAL_TOKENS",
  RafflePrizeDistributor: "PRIZE_DISTRIBUTOR",
  // Faucet
  SOFFaucet: "SOF_FAUCET",
  // VRF mock (needed for local resolve flows)
  VRFCoordinatorV2Mock: "VRF_COORDINATOR",
};

// VRF configuration keys that should be preserved/updated
const VRF_CONFIG_KEYS = [
  "VRF_COORDINATOR_ADDRESS",
  "VRF_KEY_HASH",
  "VRF_SUBSCRIPTION_ID",
];

/**
 * Find the latest broadcast JSON for a given chain id.
 * Searches across all deployment scripts and returns the most recent broadcast.
 */
function findLatestBroadcast(chainId) {
  if (!chainId) return null;
  const deploymentScripts = [
    "00_DeployToSepolia.s.sol", // Testnet (Base Sepolia)
    "Deploy.s.sol",              // Local/Anvil
  ];

  let mostRecentPath = null;
  let mostRecentTime = 0;

  for (const script of deploymentScripts) {
    const scriptDir = path.join(BROADCAST_BASE, script);
    if (!fs.existsSync(scriptDir)) continue;

    // First, try run-latest.json (most reliable)
    const latestPath = path.join(scriptDir, String(chainId), "run-latest.json");
    if (fs.existsSync(latestPath)) {
      const stat = fs.statSync(latestPath);
      if (stat.mtimeMs > mostRecentTime) {
        mostRecentTime = stat.mtimeMs;
        mostRecentPath = latestPath;
        console.log("Found run-latest.json at:", latestPath);
      }
    }

    const chainDir = path.join(scriptDir, String(chainId));
    const runsDir = path.join(chainDir, "runs");

    // Prefer the most recent run.json under runs/*
    if (fs.existsSync(runsDir)) {
      const candidates = [];
      for (const entry of fs.readdirSync(runsDir)) {
        const p = path.join(runsDir, entry, "run.json");
        if (fs.existsSync(p)) {
          const stat = fs.statSync(p);
          candidates.push({ p, mtime: stat.mtimeMs });
        }
      }
      candidates.sort((a, b) => b.mtime - a.mtime);
      if (candidates[0]?.p && candidates[0].mtime > mostRecentTime) {
        mostRecentTime = candidates[0].mtime;
        mostRecentPath = candidates[0].p;
      }
    }

    // Next, pick the newest top-level run-<timestamp>.json
    if (fs.existsSync(chainDir)) {
      const runFiles = fs
        .readdirSync(chainDir)
        .filter((f) => /^run-\d+\.json$/.test(f))
        .map((f) => path.join(chainDir, f))
        .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (runFiles[0]?.p && runFiles[0].mtime > mostRecentTime) {
        mostRecentTime = runFiles[0].mtime;
        mostRecentPath = runFiles[0].p;
      }
    }
  }

  if (mostRecentPath) {
    console.log("Using most recent broadcast:", mostRecentPath);
  }
  return mostRecentPath;
}

/**
 * Parse simple KEY=VALUE env files into a map. Ignores comments and blank lines.
 * Note: This function is kept for future use but currently not used directly.
 * @param {string} filePath - Path to the env file
 * @returns {Map<string, string>} Map of key-value pairs
 */
// eslint-disable-next-line no-unused-vars
function readEnvToMap(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) {
      map.set(m[1], m[2]);
    }
  }
  return map;
}

/**
 * Build target env content from .env.example, filtering to allowed keys and
 * filling values using (1) updates override, (2) existing file values, (3) example defaults.
 * Note: This function is kept for future use but currently not used directly.
 * @param {string} exampleText - Content of the example env file
 * @param {Object} options - Options for building the env file
 * @param {Function} options.allowPredicate - Function to determine if a key should be included
 * @param {Object} options.updates - Key-value pairs to override existing values
 * @param {Map<string, string>} options.existing - Map of existing key-value pairs
 * @returns {string} The built env file content
 */
// eslint-disable-next-line no-unused-vars
function buildFromExample(
  exampleText,
  {
    allowPredicate, // (key) => boolean
    updates = {},
    existing = new Map(),
  }
) {
  const out = [];
  const lines = exampleText.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) {
      // comment/blank, keep to preserve readability
      out.push(line);
      continue;
    }
    const key = m[1];
    if (!allowPredicate(key)) {
      // drop keys not allowed in this target file
      continue;
    }
    const override = Object.prototype.hasOwnProperty.call(updates, key)
      ? updates[key]
      : undefined;
    const current = existing.get(key);
    const exampleVal = m[2] ?? "";
    const value = override ?? current ?? exampleVal;
    out.push(`${key}=${value}`);
  }
  // Ensure trailing newline
  if (out.length === 0 || out[out.length - 1] !== "") out.push("");
  return out.join("\n");
}

/**
 * Parse addresses from broadcast file.
 */
function parseDeployAddresses(broadcastDir, chainId) {
  const broadcastPath = findLatestBroadcast(chainId);
  if (!broadcastPath) {
    console.error(
      "Could not find broadcast output for chainId:",
      chainId,
      "Looked under:",
      broadcastDir
    );
    process.exit(1);
  }

  // High-signal log: exactly which broadcast file is being used
  console.log("\n=== Using Foundry broadcast ===");
  console.log("  Chain ID:      ", chainId);
  console.log("  Broadcast dir: ", broadcastDir);
  console.log("  Broadcast file:", broadcastPath);
  console.log("=== ======================= ===\n");

  const raw = fs.readFileSync(broadcastPath, "utf8");
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse broadcast JSON:", broadcastPath);
    throw e;
  }

  console.log("Using broadcast file:", broadcastPath);
  const out = {};
  const txs = Array.isArray(json?.transactions) ? json.transactions : [];
  const unmatched = [];
  for (const tx of txs) {
    const name = tx.contractName;
    const address =
      tx.contractAddress || tx.contractAddressDeployed || tx.address;
    if (!name || !address) continue;
    const envKeyBase = NAME_TO_ENV[name];
    if (envKeyBase) {
      out[envKeyBase] = address;
    } else {
      unmatched.push({ name, address });
    }
  }

  if (unmatched.length) {
    console.log(
      "Unmatched contracts in broadcast (ignored):",
      unmatched.map((u) => u.name).join(", ")
    );
  }

  return out;
}

/**
 * Extract VRF configuration from existing env file.
 * Returns a map of VRF config keys with their current values.
 */
function extractVrfConfig(filePath, suffix = "_LOCAL") {
  const vrfConfig = {};
  if (!fs.existsSync(filePath)) return vrfConfig;

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, value] = match;

    // Check if this is a VRF config key with the target suffix
    for (const vrfKey of VRF_CONFIG_KEYS) {
      if (key === `${vrfKey}${suffix}`) {
        vrfConfig[key] = value;
      }
    }
  }

  return vrfConfig;
}

/**
 * Update an .env-like file with provided key/value pairs.
 * - Preserves existing comments and unrelated lines
 * - Updates existing keys or appends missing ones at the end
 * - Preserves VRF configuration keys
 */
function updateEnvFile(
  filePath,
  updates,
  { prefix = "", suffix = "_LOCAL", sanitizer, preserveVrfConfig = true } = {}
) {
  let content = "";
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf8");
  } else {
    console.warn(`Env file not found, creating: ${filePath}`);
  }

  // Extract VRF config before sanitizing
  const vrfConfig = preserveVrfConfig ? extractVrfConfig(filePath, suffix) : {};

  // Optionally sanitize existing content (e.g., remove misplaced keys)
  if (typeof sanitizer === "function") {
    content = sanitizer(content || "");
  }

  const lines = content ? content.split(/\r?\n/) : [];
  const keyLineIndex = new Map();

  // Build index of existing keys
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (match) keyLineIndex.set(match[1], i);
  }

  const appliedKeys = [];

  for (const [baseKey, address] of Object.entries(updates)) {
    const fullKey = `${prefix}${baseKey}_ADDRESS${suffix}`;
    const newLine = `${fullKey}=${address}`;
    if (keyLineIndex.has(fullKey)) {
      const idx = keyLineIndex.get(fullKey);
      lines[idx] = newLine;
    } else {
      appliedKeys.push(newLine);
    }
  }

  // Preserve VRF config keys
  for (const [vrfKey, vrfValue] of Object.entries(vrfConfig)) {
    if (!keyLineIndex.has(vrfKey)) {
      appliedKeys.push(`${vrfKey}=${vrfValue}`);
    }
  }

  let updatedContent = lines.join("\n");
  if (appliedKeys.length) {
    const header = `\n# --- Auto-updated by scripts/update-env-addresses.js (${new Date().toISOString()}) ---`;
    updatedContent =
      (updatedContent ? updatedContent + "\n" : "") +
      header +
      "\n" +
      appliedKeys.join("\n") +
      "\n";
  }

  fs.writeFileSync(filePath, updatedContent, "utf8");
}

function main() {
  // Detect network from environment or command line
  let network = process.env.NETWORK || process.env.DEFAULT_NETWORK;
  let chainId = process.env.CHAIN_ID;

  // If not explicitly set, try to detect from broadcast directory
  if (!network || !chainId) {
    console.log("Detecting network from broadcast directory...");
    
    // Check which deployment script has the most recent broadcast
    const sepoliaDir = path.join(BROADCAST_BASE, "00_DeployToSepolia.s.sol");
    const localDir = path.join(BROADCAST_BASE, "Deploy.s.sol");
    
    let sepoliaTime = 0;
    let localTime = 0;
    
    // Check Sepolia (84532 = Base Sepolia)
    const sepoliaLatest = path.join(sepoliaDir, "84532", "run-latest.json");
    if (fs.existsSync(sepoliaLatest)) {
      sepoliaTime = fs.statSync(sepoliaLatest).mtimeMs;
    }
    
    // Check Local (31337 = Anvil)
    const localLatest = path.join(localDir, "31337", "run-latest.json");
    if (fs.existsSync(localLatest)) {
      localTime = fs.statSync(localLatest).mtimeMs;
    }
    
    if (sepoliaTime > localTime && sepoliaTime > 0) {
      network = "TESTNET";
      chainId = "84532";
      console.log("✓ Detected TESTNET deployment (Base Sepolia, chainId: 84532)");
    } else if (localTime > 0) {
      network = "LOCAL";
      chainId = "31337";
      console.log("✓ Detected LOCAL deployment (Anvil, chainId: 31337)");
    } else {
      console.error("Could not detect network from broadcast files.");
      console.error("Looked in:", sepoliaDir, "and", localDir);
      process.exit(1);
    }
  }

  // Validate chainId
  if (!chainId) {
    console.error(
      "Could not determine chainId. Set CHAIN_ID or ensure broadcast files exist."
    );
    process.exit(1);
  }

  console.log(`\n📦 Updating environment for ${network} (chainId: ${chainId})`);

  const addrMap = parseDeployAddresses(BROADCAST_DIR, chainId);
  if (!Object.keys(addrMap).length) {
    console.error("No known contract addresses found in broadcast file.");
    process.exit(1);
  }

  // Prepare updates for backend and frontend
  const backendUpdates = {};
  for (const [base, address] of Object.entries(addrMap)) {
    // Normalize to EIP-55 checksum casing for clarity in logs and UIs
    let checksummed = address;
    try {
      checksummed = toChecksumAddress(address);
    } catch (_) {
      // If normalization fails, keep original (may be CREATE2 or non-standard), still valid on-chain
    }
    backendUpdates[base] = checksummed;
  }

  const envPath = path.join(ROOT, ".env");
  const envLocalPath = path.join(ROOT, ".env.local");
  const contractsEnvLocalPath = path.join(ROOT, "contracts", ".env.local");

  // Determine suffix based on detected network
  const envSuffix = network.toUpperCase() === "TESTNET" ? "_TESTNET" : "_LOCAL";
  console.log(`Using suffix: ${envSuffix}`);

  // Update .env in-place (backend keys with suffix)
  console.log(`\n📝 Updating ${envPath} with backend addresses...`);
  updateEnvFile(envPath, backendUpdates, {
    prefix: "",
    suffix: envSuffix,
    sanitizer: (text) => text,
  });

  // Also write VITE_ keys with suffix into .env for frontend
  console.log(`📝 Updating ${envPath} with frontend addresses (VITE_ prefix)...`);
  updateEnvFile(envPath, backendUpdates, {
    prefix: "VITE_",
    suffix: envSuffix,
    sanitizer: (text) => text,
  });

  // If .env.local exists, mirror only VITE_ keys there (optional convenience)
  if (fs.existsSync(envLocalPath)) {
    console.log(`📝 Updating ${envLocalPath} with frontend addresses...`);
    updateEnvFile(envLocalPath, backendUpdates, {
      prefix: "VITE_",
      suffix: envSuffix,
      sanitizer: (text) => text,
    });
  }

  // Update contracts/.env.local with plain keys (no suffix, no prefix)
  // This is used by deployment scripts and tests
  if (fs.existsSync(contractsEnvLocalPath)) {
    console.log(`📝 Updating ${contractsEnvLocalPath} with contract addresses...`);
    updateEnvFile(contractsEnvLocalPath, backendUpdates, {
      prefix: "",
      suffix: "",
      sanitizer: (text) => text,
    });
  }

  // Console summary
  console.log(`\n✅ Successfully updated environment with deployed addresses:`);
  console.log(`   Network: ${network}`);
  console.log(`   Chain ID: ${chainId}`);
  console.log(`   Suffix: ${envSuffix}`);
  console.log(`\n📋 Deployed Contracts:`);
  for (const [k, v] of Object.entries(addrMap)) {
    console.log(`   ${k}: ${v}`);
  }
  console.log("");
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
