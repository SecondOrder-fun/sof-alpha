#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-undef */
/*
  scripts/set-merkle-root.js
  Usage (inline envs recommended):
  RPC_URL=... PRIVATE_KEY=0x... PRIZE_DISTRIBUTOR_ADDRESS=0x... SEASON_ID=1 ROOT=0x... node scripts/set-merkle-root.js
*/

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PrizeDistributorAbi = [
  { type: 'function', name: 'setMerkleRoot', stateMutability: 'nonpayable', inputs: [
    { name: 'seasonId', type: 'uint256' }, { name: 'merkleRoot', type: 'bytes32' }
  ], outputs: [] },
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const RPC_URL = requireEnv('RPC_URL');
  const PRIVATE_KEY = requireEnv('PRIVATE_KEY');
  const PRIZE_DISTRIBUTOR_ADDRESS = requireEnv('PRIZE_DISTRIBUTOR_ADDRESS');
  const SEASON_ID = BigInt(requireEnv('SEASON_ID'));
  const ROOT = /** @type {`0x${string}` } */ (requireEnv('ROOT'));

  const chain = { id: 31337 }; // local default; adjust if needed
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
  const account = privateKeyToAccount(PRIVATE_KEY);
  const wallet = createWalletClient({ chain, transport: http(RPC_URL), account });

  console.log(`Setting merkle root for season ${SEASON_ID} on ${PRIZE_DISTRIBUTOR_ADDRESS} ...`);
  const hash = await wallet.writeContract({ address: PRIZE_DISTRIBUTOR_ADDRESS, abi: PrizeDistributorAbi, functionName: 'setMerkleRoot', args: [SEASON_ID, ROOT] });
  console.log('Tx hash:', hash);

  // Optional wait via public client
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Status:', receipt.status);
}

main().catch((err) => { console.error(err); process.exit(1); });
