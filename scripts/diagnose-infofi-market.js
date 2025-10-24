#!/usr/bin/env node
/**
 * Diagnose InfoFi Market Issues
 * Checks why markets aren't being created or why buying fails
 */

import { createPublicClient, http, formatUnits, getAddress } from 'viem';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env') });

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const SEASON_ID = process.env.SEASON_ID || '4';
const PLAYER_ADDRESS = process.env.PLAYER_ADDRESS || '0xf39Fd6e51aad88F6F4ce6ab8827279cffFb92266';

// Contract addresses from .env
const INFOFI_FACTORY = process.env.INFOFI_MARKET_FACTORY_ADDRESS;
const INFOFI_FPMM = process.env.INFOFI_FPMM_ADDRESS;
const SOF_ADDRESS = process.env.SOF_ADDRESS;
const RAFFLE_ADDRESS = process.env.RAFFLE_ADDRESS;

const publicClient = createPublicClient({
  transport: http(RPC_URL)
});

// Minimal ABIs
const factoryAbi = [
  {
    "type": "function",
    "name": "marketCreated",
    "inputs": [
      {"name": "seasonId", "type": "uint256"},
      {"name": "player", "type": "address"}
    ],
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "playerMarkets",
    "inputs": [
      {"name": "seasonId", "type": "uint256"},
      {"name": "player", "type": "address"}
    ],
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "THRESHOLD_BPS",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "INITIAL_LIQUIDITY",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view"
  }
];

const fpmmManagerAbi = [
  {
    "type": "function",
    "name": "getMarket",
    "inputs": [
      {"name": "seasonId", "type": "uint256"},
      {"name": "player", "type": "address"}
    ],
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view"
  }
];

const erc20Abi = [
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [{"name": "account", "type": "address"}],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  }
];

const raffleAbi = [
  {
    "type": "function",
    "name": "getParticipantPosition",
    "inputs": [
      {"name": "seasonId", "type": "uint256"},
      {"name": "participant", "type": "address"}
    ],
    "outputs": [{"name": "ticketCount", "type": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSeasonDetails",
    "inputs": [{"name": "seasonId", "type": "uint256"}],
    "outputs": [
      {"name": "totalTickets", "type": "uint256"},
      {"name": "status", "type": "uint8"},
      {"name": "startTime", "type": "uint256"},
      {"name": "endTime", "type": "uint256"}
    ],
    "stateMutability": "view"
  }
];

async function diagnose() {
  console.log('🔍 InfoFi Market Diagnostic Tool\n');
  console.log('Configuration:');
  console.log(`  RPC URL: ${RPC_URL}`);
  console.log(`  Season ID: ${SEASON_ID}`);
  console.log(`  Player: ${PLAYER_ADDRESS}`);
  console.log(`  InfoFi Factory: ${INFOFI_FACTORY}`);
  console.log(`  InfoFi FPMM Manager: ${INFOFI_FPMM}`);
  console.log(`  SOF Token: ${SOF_ADDRESS}`);
  console.log(`  Raffle: ${RAFFLE_ADDRESS}\n`);

  if (!INFOFI_FACTORY || !INFOFI_FPMM || !SOF_ADDRESS || !RAFFLE_ADDRESS) {
    console.error('❌ Missing contract addresses in .env file');
    process.exit(1);
  }

  try {
    // 1. Check if market was created
    console.log('1️⃣  Checking if market exists...');
    const marketCreated = await publicClient.readContract({
      address: INFOFI_FACTORY,
      abi: factoryAbi,
      functionName: 'marketCreated',
      args: [BigInt(SEASON_ID), getAddress(PLAYER_ADDRESS)]
    });
    console.log(`   Market created: ${marketCreated ? '✅ YES' : '❌ NO'}\n`);

    // 2. Get market address from factory
    console.log('2️⃣  Getting market address from factory...');
    const factoryMarketAddress = await publicClient.readContract({
      address: INFOFI_FACTORY,
      abi: factoryAbi,
      functionName: 'playerMarkets',
      args: [BigInt(SEASON_ID), getAddress(PLAYER_ADDRESS)]
    });
    console.log(`   Factory market address: ${factoryMarketAddress}`);
    console.log(`   ${factoryMarketAddress === '0x0000000000000000000000000000000000000000' ? '❌ Zero address' : '✅ Valid address'}\n`);

    // 3. Get market address from FPMM manager
    console.log('3️⃣  Getting market address from FPMM manager...');
    const fpmmMarketAddress = await publicClient.readContract({
      address: INFOFI_FPMM,
      abi: fpmmManagerAbi,
      functionName: 'getMarket',
      args: [BigInt(SEASON_ID), getAddress(PLAYER_ADDRESS)]
    });
    console.log(`   FPMM market address: ${fpmmMarketAddress}`);
    console.log(`   ${fpmmMarketAddress === '0x0000000000000000000000000000000000000000' ? '❌ Zero address' : '✅ Valid address'}\n`);

    // 4. Check player's position
    console.log('4️⃣  Checking player position in raffle...');
    const playerTickets = await publicClient.readContract({
      address: RAFFLE_ADDRESS,
      abi: raffleAbi,
      functionName: 'getParticipantPosition',
      args: [BigInt(SEASON_ID), getAddress(PLAYER_ADDRESS)]
    });
    console.log(`   Player tickets: ${playerTickets.toString()}\n`);

    // 5. Get season details
    console.log('5️⃣  Getting season details...');
    const [totalTickets, status, startTime, endTime] = await publicClient.readContract({
      address: RAFFLE_ADDRESS,
      abi: raffleAbi,
      functionName: 'getSeasonDetails',
      args: [BigInt(SEASON_ID)]
    });
    console.log(`   Total tickets: ${totalTickets.toString()}`);
    console.log(`   Season status: ${status}`);
    
    // Calculate probability
    if (totalTickets > 0n) {
      const probabilityBps = (playerTickets * 10000n) / totalTickets;
      console.log(`   Player probability: ${probabilityBps.toString()} bps (${Number(probabilityBps) / 100}%)`);
      
      // Check threshold
      const threshold = await publicClient.readContract({
        address: INFOFI_FACTORY,
        abi: factoryAbi,
        functionName: 'THRESHOLD_BPS'
      });
      console.log(`   Market creation threshold: ${threshold.toString()} bps (${Number(threshold) / 100}%)`);
      console.log(`   ${probabilityBps >= threshold ? '✅ Above threshold' : '❌ Below threshold'}\n`);
    } else {
      console.log(`   ⚠️  No tickets sold yet\n`);
    }

    // 6. Check treasury balance
    console.log('6️⃣  Checking treasury SOF balance...');
    const treasury = await publicClient.readContract({
      address: INFOFI_FACTORY,
      abi: factoryAbi,
      functionName: 'treasury'
    });
    console.log(`   Treasury address: ${treasury}`);
    
    const treasuryBalance = await publicClient.readContract({
      address: SOF_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [treasury]
    });
    console.log(`   Treasury SOF balance: ${formatUnits(treasuryBalance, 18)} SOF`);
    
    const initialLiquidity = await publicClient.readContract({
      address: INFOFI_FACTORY,
      abi: factoryAbi,
      functionName: 'INITIAL_LIQUIDITY'
    });
    console.log(`   Required initial liquidity: ${formatUnits(initialLiquidity, 18)} SOF`);
    console.log(`   ${treasuryBalance >= initialLiquidity ? '✅ Sufficient balance' : '❌ Insufficient balance'}\n`);

    // Summary
    console.log('📊 Summary:');
    if (!marketCreated) {
      console.log('   ❌ Market has not been created yet');
      if (playerTickets === 0n) {
        console.log('   ℹ️  Reason: Player has no tickets');
      } else if (totalTickets > 0n && (playerTickets * 10000n) / totalTickets < threshold) {
        console.log('   ℹ️  Reason: Player position below 1% threshold');
      } else if (treasuryBalance < initialLiquidity) {
        console.log('   ℹ️  Reason: Treasury has insufficient SOF balance');
      } else {
        console.log('   ⚠️  Reason: Unknown - market should have been created');
      }
    } else {
      console.log('   ✅ Market exists and should be tradeable');
    }

  } catch (error) {
    console.error('❌ Error during diagnosis:', error.message);
    process.exit(1);
  }
}

diagnose();
