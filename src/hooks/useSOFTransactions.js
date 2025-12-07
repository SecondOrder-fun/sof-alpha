// src/hooks/useSOFTransactions.js
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { getContractAddresses } from "@/config/contracts";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { queryLogsInChunks } from "@/utils/blockRangeQuery";

/**
 * Hook to fetch all $SOF transaction history for an address
 * Includes: transfers, bonding curve buys/sells, prize claims, fees collected
 * Uses chunked queries to handle RPC block range limits
 */
export function useSOFTransactions(address, options = {}) {
  const publicClient = usePublicClient();
  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);
  const chain = getNetworkByKey(netKey);

  const {
    lookbackBlocks = chain.lookbackBlocks, // Use network-specific default
    enabled = true,
  } = options;

  return useQuery({
    queryKey: [
      "sofTransactions",
      address,
      contracts.SOF,
      lookbackBlocks.toString(),
      netKey,
    ],
    queryFn: async () => {
      if (!address || !contracts.SOF || !publicClient) {
        return [];
      }

      // Get current block and calculate fromBlock
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock =
        currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;
      const toBlock = currentBlock;

      const transactions = [];

      // 1. Fetch all Transfer events (incoming and outgoing) using chunked queries
      const [transfersIn, transfersOut] = await Promise.all([
        queryLogsInChunks(publicClient, {
          address: contracts.SOF,
          event: {
            type: "event",
            name: "Transfer",
            inputs: [
              { indexed: true, name: "from", type: "address" },
              { indexed: true, name: "to", type: "address" },
              { indexed: false, name: "value", type: "uint256" },
            ],
          },
          args: { to: address },
          fromBlock,
          toBlock,
        }),
        queryLogsInChunks(publicClient, {
          address: contracts.SOF,
          event: {
            type: "event",
            name: "Transfer",
            inputs: [
              { indexed: true, name: "from", type: "address" },
              { indexed: true, name: "to", type: "address" },
              { indexed: false, name: "value", type: "uint256" },
            ],
          },
          args: { from: address },
          fromBlock,
          toBlock,
        }),
      ]);

      // Process incoming transfers
      for (const log of transfersIn) {
        const block = await publicClient.getBlock({
          blockNumber: log.blockNumber,
        });
        transactions.push({
          type: "TRANSFER_IN",
          hash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp: Number(block.timestamp),
          from: log.args.from,
          to: log.args.to,
          amount: formatUnits(log.args.value, 18),
          amountRaw: log.args.value,
          direction: "IN",
          description: "Received SOF",
        });
      }

      // Store outgoing transfers for later categorization
      const outgoingTransfers = [];
      for (const log of transfersOut) {
        const block = await publicClient.getBlock({
          blockNumber: log.blockNumber,
        });
        outgoingTransfers.push({
          type: "TRANSFER_OUT",
          hash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp: Number(block.timestamp),
          from: log.args.from,
          to: log.args.to,
          amount: formatUnits(log.args.value, 18),
          amountRaw: log.args.value,
          direction: "OUT",
          description: "Sent SOF",
        });
      }

      // 2. Fetch bonding curve buy events (TokensPurchased)
      if (contracts.SOFBondingCurve) {
        try {
          const buyEvents = await queryLogsInChunks(publicClient, {
            address: contracts.SOFBondingCurve,
            event: {
              type: "event",
              name: "TokensPurchased",
              inputs: [
                { indexed: true, name: "buyer", type: "address" },
                { indexed: false, name: "sofSpent", type: "uint256" },
                { indexed: false, name: "tokensReceived", type: "uint256" },
                { indexed: false, name: "newPrice", type: "uint256" },
              ],
            },
            args: { buyer: address },
            fromBlock,
            toBlock,
          });

          for (const log of buyEvents) {
            const block = await publicClient.getBlock({
              blockNumber: log.blockNumber,
            });
            transactions.push({
              type: "BONDING_CURVE_BUY",
              hash: log.transactionHash,
              blockNumber: log.blockNumber,
              timestamp: Number(block.timestamp),
              amount: formatUnits(log.args.sofSpent, 18),
              amountRaw: log.args.sofSpent,
              tokensReceived: formatUnits(log.args.tokensReceived, 18),
              direction: "OUT",
              description: "Bought raffle tickets",
            });
          }
        } catch (err) {
          // Silently fail if bonding curve buy events cannot be fetched
        }
      }

      // 3. Fetch bonding curve sell events (TokensSold)
      if (contracts.SOFBondingCurve) {
        try {
          const sellEvents = await queryLogsInChunks(publicClient, {
            address: contracts.SOFBondingCurve,
            event: {
              type: "event",
              name: "TokensSold",
              inputs: [
                { indexed: true, name: "seller", type: "address" },
                { indexed: false, name: "tokensSold", type: "uint256" },
                { indexed: false, name: "sofReceived", type: "uint256" },
                { indexed: false, name: "newPrice", type: "uint256" },
              ],
            },
            args: { seller: address },
            fromBlock,
            toBlock,
          });

          for (const log of sellEvents) {
            const block = await publicClient.getBlock({
              blockNumber: log.blockNumber,
            });
            transactions.push({
              type: "BONDING_CURVE_SELL",
              hash: log.transactionHash,
              blockNumber: log.blockNumber,
              timestamp: Number(block.timestamp),
              amount: formatUnits(log.args.sofReceived, 18),
              amountRaw: log.args.sofReceived,
              tokensSold: formatUnits(log.args.tokensSold, 18),
              direction: "IN",
              description: "Sold raffle tickets",
            });
          }
        } catch (err) {
          // Silently fail if bonding curve sell events cannot be fetched
        }
      }

      // 4. Fetch prize claim events (GrandPrizeClaimed, ConsolationClaimed)
      if (contracts.RafflePrizeDistributor) {
        try {
          const [grandPrizeClaims, consolationClaims] = await Promise.all([
            queryLogsInChunks(publicClient, {
              address: contracts.RafflePrizeDistributor,
              event: {
                type: "event",
                name: "GrandPrizeClaimed",
                inputs: [
                  { indexed: true, name: "seasonId", type: "uint256" },
                  { indexed: true, name: "winner", type: "address" },
                  { indexed: false, name: "amount", type: "uint256" },
                ],
              },
              args: { winner: address },
              fromBlock,
              toBlock,
            }),
            queryLogsInChunks(publicClient, {
              address: contracts.RafflePrizeDistributor,
              event: {
                type: "event",
                name: "ConsolationClaimed",
                inputs: [
                  { indexed: true, name: "seasonId", type: "uint256" },
                  { indexed: true, name: "participant", type: "address" },
                  { indexed: false, name: "amount", type: "uint256" },
                ],
              },
              args: { participant: address },
              fromBlock,
              toBlock,
            }),
          ]);

          for (const log of grandPrizeClaims) {
            const block = await publicClient.getBlock({
              blockNumber: log.blockNumber,
            });
            transactions.push({
              type: "PRIZE_CLAIM_GRAND",
              hash: log.transactionHash,
              blockNumber: log.blockNumber,
              timestamp: Number(block.timestamp),
              seasonId: Number(log.args.seasonId),
              amount: formatUnits(log.args.amount, 18),
              amountRaw: log.args.amount,
              direction: "IN",
              description: `Won Grand Prize (Season #${log.args.seasonId})`,
            });
          }

          for (const log of consolationClaims) {
            const block = await publicClient.getBlock({
              blockNumber: log.blockNumber,
            });
            transactions.push({
              type: "PRIZE_CLAIM_CONSOLATION",
              hash: log.transactionHash,
              blockNumber: log.blockNumber,
              timestamp: Number(block.timestamp),
              seasonId: Number(log.args.seasonId),
              amount: formatUnits(log.args.amount, 18),
              amountRaw: log.args.amount,
              direction: "IN",
              description: `Claimed Consolation Prize (Season #${log.args.seasonId})`,
            });
          }
        } catch (err) {
          // Silently fail if prize claim events cannot be fetched
        }
      }

      // 5. Fetch fee collection events from bonding curve (if user is admin/treasury)
      if (contracts.SOFBondingCurve) {
        try {
          const feeEvents = await queryLogsInChunks(publicClient, {
            address: contracts.SOFBondingCurve,
            event: {
              type: "event",
              name: "FeesCollected",
              inputs: [
                { indexed: true, name: "collector", type: "address" },
                { indexed: false, name: "amount", type: "uint256" },
              ],
            },
            args: { collector: address },
            fromBlock,
            toBlock,
          });

          for (const log of feeEvents) {
            const block = await publicClient.getBlock({
              blockNumber: log.blockNumber,
            });
            transactions.push({
              type: "FEE_COLLECTED",
              hash: log.transactionHash,
              blockNumber: log.blockNumber,
              timestamp: Number(block.timestamp),
              amount: formatUnits(log.args.amount, 18),
              amountRaw: log.args.amount,
              direction: "IN",
              description: "Collected platform fees",
            });
          }
        } catch (err) {
          // Silently fail if fee collection events cannot be fetched
        }
      }

      // Categorize outgoing transfers based on recipient
      const bondingCurveAddresses = [
        contracts.SOFBondingCurve?.toLowerCase(),
      ].filter(Boolean);

      for (const transfer of outgoingTransfers) {
        const recipientLower = transfer.to?.toLowerCase();

        // Check if this transfer was to a bonding curve (purchase)
        if (bondingCurveAddresses.includes(recipientLower)) {
          transactions.push({
            ...transfer,
            type: "BONDING_CURVE_PURCHASE",
            description: "Purchased raffle tickets",
          });
        } else {
          // Regular transfer to another address
          transactions.push(transfer);
        }
      }

      // Sort by block number (most recent first)
      transactions.sort(
        (a, b) => Number(b.blockNumber) - Number(a.blockNumber)
      );

      return transactions;
    },
    enabled: Boolean(address && contracts.SOF && publicClient && enabled),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });
}
