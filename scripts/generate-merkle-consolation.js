#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-undef */
/*
  scripts/generate-merkle-consolation.js
  Usage (env inline recommended):
  RPC_URL=... RAFFLE_ADDRESS=0x... SEASON_ID=1 node scripts/generate-merkle-consolation.js

  This script builds a Merkle tree for consolation payouts using:
  - Participants from Raffle.getParticipants(seasonId)
  - Ticket counts from Raffle.getParticipantPosition(seasonId, addr)
  - Grand winner and amounts from Distributor.getSeason(seasonId)

  Output: public/merkle/season-<id>.json with fields { merkleRoot, leaves: [{ index, account, amount }], seasonId }
*/

import fs from 'fs';
import path from 'path';
import { createPublicClient, http, keccak256, encodePacked, toBytes } from 'viem';

// Minimal ABIs
const RaffleAbi = [
  { type: 'function', name: 'getParticipants', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'getParticipantPosition', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }, { name: 'participant', type: 'address' }], outputs: [{ name: 'position', type: 'tuple', components: [
    { name: 'ticketCount', type: 'uint256' },
    { name: 'entryBlock', type: 'uint256' },
    { name: 'lastUpdateBlock', type: 'uint256' },
    { name: 'isActive', type: 'bool' }
  ]}] },
  { type: 'function', name: 'getSeasonDetails', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [
    { name: 'config', type: 'tuple', components: [
      { name: 'name', type: 'string' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'winnerCount', type: 'uint16' },
      { name: 'prizePercentage', type: 'uint16' },
      { name: 'consolationPercentage', type: 'uint16' },
      { name: 'grandPrizeBps', type: 'uint16' },
      { name: 'raffleToken', type: 'address' },
      { name: 'bondingCurve', type: 'address' },
      { name: 'isActive', type: 'bool' },
      { name: 'isCompleted', type: 'bool' }
    ]},
    { name: 'status', type: 'uint8' },
    { name: 'totalParticipants', type: 'uint256' },
    { name: 'totalTickets', type: 'uint256' },
    { name: 'totalPrizePool', type: 'uint256' }
  ] },
];

const DistributorAbi = [
  { type: 'function', name: 'getSeason', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [
    { name: 'token', type: 'address' },
    { name: 'grandWinner', type: 'address' },
    { name: 'grandAmount', type: 'uint256' },
    { name: 'consolationAmount', type: 'uint256' },
    { name: 'totalTicketsSnapshot', type: 'uint256' },
    { name: 'grandWinnerTickets', type: 'uint256' },
    { name: 'merkleRoot', type: 'bytes32' },
    { name: 'funded', type: 'bool' },
    { name: 'grandClaimed', type: 'bool' },
  ]}] },
  { type: 'function', name: 'prizeDistributor', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

function buildClient(rpcUrl) {
  return createPublicClient({ chain: { id: 31337 }, transport: http(rpcUrl) });
}

function buildMerkle(leaves) {
  const leafHashes = leaves.map((l) => keccak256(encodePacked(['uint256','address','uint256'], [BigInt(l.index), l.account, BigInt(l.amount)])));
  if (leafHashes.length === 0) return { root: '0x'.padEnd(66,'0'), layers: [leafHashes] };
  let layers = [leafHashes];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i=0; i<prev.length; i+=2) {
      const left = prev[i];
      const right = i+1 < prev.length ? prev[i+1] : prev[i];
      const packed = left.toLowerCase() < right.toLowerCase() ? `${left}${right.slice(2)}` : `${right}${left.slice(2)}`;
      next.push(keccak256(toBytes(packed)));
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], layers };
}

// Build a Merkle proof for a given index using layers from buildMerkle
function buildProof(layers, index) {
  const proof = [];
  let idx = index;
  for (let layer = 0; layer < layers.length - 1; layer++) {
    const layerNodes = layers[layer];
    const pairIndex = idx ^ 1; // sibling
    const sibling = layerNodes[Math.min(pairIndex, layerNodes.length - 1)];
    // Push sibling (even if it's the same when odd count, matches the up-layer duplication)
    proof.push(sibling);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

async function main() {
  const RPC_URL = requireEnv('RPC_URL');
  const RAFFLE_ADDRESS = requireEnv('RAFFLE_ADDRESS');
  const PRIZE_DISTRIBUTOR_ADDRESS = requireEnv('PRIZE_DISTRIBUTOR_ADDRESS');
  const SEASON_ID = BigInt(requireEnv('SEASON_ID'));

  const client = buildClient(RPC_URL);

  // Read distributor season snapshot
  const dist = await client.readContract({ address: PRIZE_DISTRIBUTOR_ADDRESS, abi: DistributorAbi, functionName: 'getSeason', args: [SEASON_ID] });
  const { grandWinner, consolationAmount, totalTicketsSnapshot, grandWinnerTickets } = dist;

  // Get participants
  const participants = await client.readContract({ address: RAFFLE_ADDRESS, abi: RaffleAbi, functionName: 'getParticipants', args: [SEASON_ID] });

  // Build amounts excluding grand winner
  const denom = BigInt(totalTicketsSnapshot) - BigInt(grandWinnerTickets);
  if (denom <= 0n) {
    // No losers (either no participants or all tickets held by grand winner).
    // Write an empty manifest with zero root so the UI can proceed gracefully.
    const outDir = path.join(process.cwd(), 'public', 'merkle');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `season-${SEASON_ID}.json`);
    const zeroRoot = '0x'.padEnd(66, '0');
    fs.writeFileSync(outPath, JSON.stringify({ seasonId: `${SEASON_ID}`, merkleRoot: zeroRoot, leaves: [] }, null, 2));
    console.log(`No consolation recipients for season ${SEASON_ID}. Wrote empty manifest at ${outPath}`);
    console.log(`Root: ${zeroRoot}`);
    return;
  }

  const leaves = [];
  let runningSum = 0n;
  let index = 0;
  for (const addr of participants) {
    if (addr.toLowerCase() === grandWinner.toLowerCase()) continue;
    const pos = await client.readContract({ address: RAFFLE_ADDRESS, abi: RaffleAbi, functionName: 'getParticipantPosition', args: [SEASON_ID, addr] });
    const tickets = BigInt(pos.ticketCount ?? (Array.isArray(pos) ? pos[0] : 0));
    if (tickets === 0n) continue;
    const raw = (BigInt(consolationAmount) * tickets) / denom;
    if (raw > 0n) {
      leaves.push({ index, account: addr, amount: raw.toString() });
      runningSum += raw;
      index += 1;
    }
  }

  // Adjust last leaf to avoid dust (ensure sum <= consolation)
  const consolation = BigInt(consolationAmount);
  if (leaves.length > 0 && runningSum > consolation) {
    const diff = runningSum - consolation;
    const last = leaves[leaves.length - 1];
    const adj = BigInt(last.amount) - diff;
    leaves[leaves.length - 1] = { ...last, amount: (adj > 0n ? adj : 0n).toString() };
  }

  const { root, layers } = buildMerkle(leaves);

  // Attach proofs per leaf
  const leavesWithProofs = leaves.map((l, i) => ({ ...l, proof: buildProof(layers, i) }));

  const outDir = path.join(process.cwd(), 'public', 'merkle');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `season-${SEASON_ID}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ seasonId: `${SEASON_ID}`, merkleRoot: root, leaves: leavesWithProofs }, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Root: ${root}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
