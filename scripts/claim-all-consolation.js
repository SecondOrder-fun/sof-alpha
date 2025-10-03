#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-undef */
/*
  scripts/claim-all-consolation.js
  Usage (env inline recommended):
  RPC_URL=... PRIZE_DISTRIBUTOR_ADDRESS=0x... SEASON_ID=1 PRIVATE_KEY=0x... node scripts/claim-all-consolation.js

  This script claims ALL consolation prizes for a user's tickets in a season.
  It reads the Merkle tree from public/merkle/season-<id>.json and submits
  all claims for the user's address in a batch.
*/

import fs from 'fs';
import path from 'path';
import { createWalletClient, createPublicClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

const DistributorAbi = [
  { 
    type: 'function', 
    name: 'claimConsolation', 
    stateMutability: 'nonpayable', 
    inputs: [
      { name: 'seasonId', type: 'uint256' },
      { name: 'index', type: 'uint256' },
      { name: 'account', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'merkleProof', type: 'bytes32[]' }
    ], 
    outputs: [] 
  },
  { 
    type: 'function', 
    name: 'isClaimed', 
    stateMutability: 'view', 
    inputs: [
      { name: 'seasonId', type: 'uint256' },
      { name: 'index', type: 'uint256' }
    ], 
    outputs: [{ name: '', type: 'bool' }] 
  },
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
  const PRIZE_DISTRIBUTOR_ADDRESS = getAddress(requireEnv('PRIZE_DISTRIBUTOR_ADDRESS'));
  const SEASON_ID = BigInt(requireEnv('SEASON_ID'));
  const PRIVATE_KEY = requireEnv('PRIVATE_KEY');

  const account = privateKeyToAccount(PRIVATE_KEY);
  const userAddress = account.address;

  console.log(`Claiming consolation prizes for ${userAddress} in season ${SEASON_ID}...`);

  // Read Merkle tree
  const merkleFile = path.join(process.cwd(), 'public', 'merkle', `season-${SEASON_ID}.json`);
  if (!fs.existsSync(merkleFile)) {
    console.error(`Merkle file not found: ${merkleFile}`);
    console.error('Run generate-merkle-consolation.js first');
    process.exit(1);
  }

  const merkleData = JSON.parse(fs.readFileSync(merkleFile, 'utf-8'));
  const { leaves } = merkleData;

  // Filter leaves for this user
  const userLeaves = leaves.filter(l => l.account.toLowerCase() === userAddress.toLowerCase());

  if (userLeaves.length === 0) {
    console.log(`No consolation prizes found for ${userAddress} in season ${SEASON_ID}`);
    return;
  }

  console.log(`Found ${userLeaves.length} consolation prizes to claim`);

  // Create clients
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(RPC_URL)
  });

  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport: http(RPC_URL)
  });

  // Check which are already claimed
  const unclaimedLeaves = [];
  for (const leaf of userLeaves) {
    const isClaimed = await publicClient.readContract({
      address: PRIZE_DISTRIBUTOR_ADDRESS,
      abi: DistributorAbi,
      functionName: 'isClaimed',
      args: [SEASON_ID, BigInt(leaf.index)]
    });

    if (!isClaimed) {
      unclaimedLeaves.push(leaf);
    }
  }

  if (unclaimedLeaves.length === 0) {
    console.log('All prizes already claimed!');
    return;
  }

  console.log(`${unclaimedLeaves.length} prizes unclaimed, claiming now...`);

  // Claim each prize
  let totalClaimed = 0n;
  for (const leaf of unclaimedLeaves) {
    try {
      const hash = await walletClient.writeContract({
        address: PRIZE_DISTRIBUTOR_ADDRESS,
        abi: DistributorAbi,
        functionName: 'claimConsolation',
        args: [
          SEASON_ID,
          BigInt(leaf.index),
          leaf.account,
          BigInt(leaf.amount),
          leaf.proof
        ]
      });

      console.log(`Claimed ticket #${leaf.ticketNumber}: ${leaf.amount} wei (tx: ${hash})`);
      totalClaimed += BigInt(leaf.amount);
    } catch (error) {
      console.error(`Failed to claim ticket #${leaf.ticketNumber}:`, error.message);
    }
  }

  console.log(`\nTotal claimed: ${totalClaimed} wei`);
  console.log(`Successfully claimed ${unclaimedLeaves.length} prizes!`);
}

main().catch((err) => { 
  console.error(err); 
  process.exit(1); 
});
