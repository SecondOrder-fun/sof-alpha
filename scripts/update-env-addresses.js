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
const BROADCAST_DIR = path.join(ROOT, "contracts", "broadcast", "Deploy.s.sol");

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

/**
 * Find the latest broadcast JSON for a given chain id.
 */
function findLatestBroadcast(chainId = "31337") {
  const chainDir = path.join(BROADCAST_DIR, String(chainId));
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
    if (candidates[0]?.p) return candidates[0].p;
  }

  // Next, pick the newest top-level run-<timestamp>.json
  if (fs.existsSync(chainDir)) {
    const runFiles = fs
      .readdirSync(chainDir)
      .filter((f) => /^run-\d+\.json$/.test(f))
      .map((f) => path.join(chainDir, f))
      .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (runFiles[0]?.p) return runFiles[0].p;
  }

  // Fallback to run-latest.json
  const latestPath = path.join(chainDir, "run-latest.json");
  if (fs.existsSync(latestPath)) return latestPath;
  return null;
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
function parseDeployAddresses(broadcastDir) {
  const broadcastPath = findLatestBroadcast();
  if (!broadcastPath) {
    console.error(
      "Could not find broadcast output. Looked under:",
      broadcastDir
    );
    process.exit(1);
  }

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
 * Update an .env-like file with provided key/value pairs.
 * - Preserves existing comments and unrelated lines
 * - Updates existing keys or appends missing ones at the end
 */
function updateEnvFile(
  filePath,
  updates,
  { prefix = "", suffix = "_LOCAL", sanitizer } = {}
) {
  let content = "";
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf8");
  } else {
    console.warn(`Env file not found, creating: ${filePath}`);
  }

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
  const network = process.env.NETWORK || process.env.DEFAULT_NETWORK || "LOCAL";
  const chainId =
    process.env.CHAIN_ID ||
    (network === "LOCAL" ? "31337" : process.env.TESTNET_CHAIN_ID || "");

  if (!chainId) {
    console.error(
      "Could not determine chainId. Set CHAIN_ID or TESTNET_CHAIN_ID."
    );
    process.exit(1);
  }

  const addrMap = parseDeployAddresses(BROADCAST_DIR);
  if (!Object.keys(addrMap).length) {
    console.error("No known contract addresses found in broadcast file.");
    process.exit(1);
  }

  // Prepare updates for backend and frontend
  const backendUpdates = {};
  const frontendUpdates = {};
  for (const [base, address] of Object.entries(addrMap)) {
    // Normalize to EIP-55 checksum casing for clarity in logs and UIs
    let checksummed = address;
    try {
      checksummed = toChecksumAddress(address);
    } catch (_) {
      // If normalization fails, keep original (may be CREATE2 or non-standard), still valid on-chain
    }
    backendUpdates[base] = checksummed; // e.g., RAFFLE_ADDRESS_LOCAL
    frontendUpdates[base] = checksummed; // e.g., VITE_RAFFLE_ADDRESS_LOCAL
  }

  const envPath = path.join(ROOT, ".env");
  const envLocalPath = path.join(ROOT, ".env.local");
  const contractsEnvLocalPath = path.join(ROOT, "contracts", ".env.local");

  // Determine suffix based on target network
  const envSuffix =
    (network || "").toUpperCase() === "TESTNET" ? "_TESTNET" : "_LOCAL";

  // Update .env in-place (backend keys with suffix)
  updateEnvFile(envPath, backendUpdates, {
    prefix: "",
    suffix: envSuffix,
    sanitizer: (text) => text,
  });

  // Also write VITE_ keys with suffix into .env for frontend
  updateEnvFile(envPath, backendUpdates, {
    prefix: "VITE_",
    suffix: envSuffix,
    sanitizer: (text) => text,
  });

  // If .env.local exists, mirror only VITE_ keys there (optional convenience)
  if (fs.existsSync(envLocalPath)) {
    updateEnvFile(envLocalPath, backendUpdates, {
      prefix: "VITE_",
      suffix: envSuffix,
      sanitizer: (text) => text,
    });
  }

  // Update contracts/.env.local with plain keys (no suffix, no prefix)
  // This is used by deployment scripts and tests
  if (fs.existsSync(contractsEnvLocalPath)) {
    updateEnvFile(contractsEnvLocalPath, backendUpdates, {
      prefix: "",
      suffix: "",
      sanitizer: (text) => text,
    });
  }

  // Console summary
  console.log(
    "Updated environment with deployed addresses (network=%s, chainId=%s):",
    network,
    chainId
  );
  for (const [k, v] of Object.entries(addrMap)) {
    console.log(`  ${k}: ${v}`);
  }
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
