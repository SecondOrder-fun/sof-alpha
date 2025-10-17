import { createPublicClient, createWalletClient, http, custom } from 'viem';
import { getNetworkByKey } from '@/config/networks';
import { getContractAddresses } from '@/config/contracts';
import SeasonCSMMAbi from '@/contracts/abis/SeasonCSMM.json';
import InfoFiMarketFactoryAbi from '@/contracts/abis/InfoFiMarketFactory.json';

/**
 * Get all claimable CSMM payouts for a user across all seasons
 * @param {string} address - User address
 * @param {string} networkKey - Network key
 * @returns {Promise<Array>} Array of claimable payouts
 */
export async function getClaimableCSMMPayouts({ address, networkKey }) {
  const network = getNetworkByKey(networkKey);
  const contracts = getContractAddresses(networkKey);
  
  const publicClient = createPublicClient({
    chain: {
      id: network.id,
      name: network.name,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [network.rpcUrl] } },
    },
    transport: http(network.rpcUrl),
  });

  const claimables = [];

  try {
    // Get all season players from factory
    const factory = contracts.InfoFiMarketFactory;
    if (!factory) return claimables;

    // Get current season to determine how many seasons to check
    const currentSeason = await publicClient.readContract({
      address: contracts.Raffle,
      abi: [{ name: 'getCurrentSeason', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'getCurrentSeason',
    });

    // Check last 10 seasons (or current season, whichever is less)
    const seasonsToCheck = Math.min(Number(currentSeason), 10);
    
    for (let seasonId = 1; seasonId <= seasonsToCheck; seasonId++) {
      try {
        // Get CSMM address for this season
        const csmmAddress = await publicClient.readContract({
          address: factory,
          abi: InfoFiMarketFactoryAbi,
          functionName: 'getSeasonCSMM',
          args: [BigInt(seasonId)],
        });

        // Skip if no CSMM for this season
        if (!csmmAddress || csmmAddress === '0x0000000000000000000000000000000000000000') {
          continue;
        }

        // Get all players for this season
        const players = await publicClient.readContract({
          address: factory,
          abi: InfoFiMarketFactoryAbi,
          functionName: 'getSeasonPlayers',
          args: [BigInt(seasonId)],
        });

        // Check each player market for user's position
        for (const playerAddress of players) {
          const playerId = BigInt(playerAddress);
          
          // Get market state
          const [, , , isResolved, outcome] = await publicClient.readContract({
            address: csmmAddress,
            abi: SeasonCSMMAbi,
            functionName: 'getMarketState',
            args: [playerId],
          });

          // Skip if not resolved
          if (!isResolved) continue;

          // Get user's position
          const [userYesShares, userNoShares] = await publicClient.readContract({
            address: csmmAddress,
            abi: SeasonCSMMAbi,
            functionName: 'getUserPosition',
            args: [address, playerId],
          });

          // Check if user has winning shares
          const hasWinningShares = outcome ? userYesShares > 0n : userNoShares > 0n;
          
          if (hasWinningShares) {
            const winningShares = outcome ? userYesShares : userNoShares;
            
            // Calculate payout (shares - 2% fee)
            const grossPayout = winningShares;
            const fee = (grossPayout * 200n) / 10000n; // 2% fee
            const netPayout = grossPayout - fee;
            
            claimables.push({
              seasonId,
              playerAddress,
              playerId: playerId.toString(),
              csmmAddress,
              outcome: outcome ? 'YES' : 'NO',
              shares: winningShares,
              grossPayout,
              fee,
              netPayout,
              type: 'csmm'
            });
          }
        }
      } catch (error) {
        // Continue with next season silently
        // Error logged for debugging: `Error checking season ${seasonId}`
      }
    }
  } catch (error) {
    // Error logged for debugging: 'Error getting claimable CSMM payouts'
  }

  return claimables;
}

/**
 * Claim payout from a CSMM market
 * @param {string} csmmAddress - SeasonCSMM contract address
 * @param {string} playerId - Player ID (as string)
 * @param {string} networkKey - Network key
 * @returns {Promise<string>} Transaction hash
 */
export async function claimCSMMPayout({ csmmAddress, playerId, networkKey }) {
  const network = getNetworkByKey(networkKey);
  
  if (!window.ethereum) {
    throw new Error('No wallet detected');
  }

  const walletClient = createWalletClient({
    chain: {
      id: network.id,
      name: network.name,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [network.rpcUrl] } },
    },
    transport: custom(window.ethereum),
  });

  const [account] = await walletClient.getAddresses();

  const hash = await walletClient.writeContract({
    address: csmmAddress,
    abi: SeasonCSMMAbi,
    functionName: 'claimPayout',
    args: [BigInt(playerId)],
    account,
  });

  return hash;
}

/**
 * Get user's position in a specific CSMM market
 * @param {string} csmmAddress - SeasonCSMM contract address
 * @param {string} playerAddress - Player address
 * @param {string} userAddress - User address
 * @param {string} networkKey - Network key
 * @returns {Promise<object>} Position data
 */
export async function getCSMMPosition({ csmmAddress, playerAddress, userAddress, networkKey }) {
  const network = getNetworkByKey(networkKey);
  
  const publicClient = createPublicClient({
    chain: {
      id: network.id,
      name: network.name,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [network.rpcUrl] } },
    },
    transport: http(network.rpcUrl),
  });

  const playerId = BigInt(playerAddress);

  const [marketState, userPosition, yesPrice, noPrice] = await Promise.all([
    publicClient.readContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'getMarketState',
      args: [playerId],
    }),
    publicClient.readContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'getUserPosition',
      args: [userAddress, playerId],
    }),
    publicClient.readContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'getPrice',
      args: [playerId, true],
    }),
    publicClient.readContract({
      address: csmmAddress,
      abi: SeasonCSMMAbi,
      functionName: 'getPrice',
      args: [playerId, false],
    }),
  ]);

  const [yesReserve, noReserve, isActive, isResolved, outcome] = marketState;
  const [userYesShares, userNoShares] = userPosition;

  return {
    yesReserve,
    noReserve,
    isActive,
    isResolved,
    outcome,
    userYesShares,
    userNoShares,
    yesPrice,
    noPrice,
  };
}
