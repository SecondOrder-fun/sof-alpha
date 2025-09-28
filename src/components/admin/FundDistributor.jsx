// src/components/admin/FundDistributor.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { usePublicClient } from "wagmi";
import { getContractAddresses } from "@/config/contracts";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { createWalletClient, custom, formatEther, parseEther } from "viem";
import { buildFriendlyContractError } from "@/lib/contractErrors";

const FundDistributor = ({ 
  seasonId, 
  setEndingE2EId, 
  setEndStatus, 
  setVerify, 
  allSeasonsQuery,
  RaffleMiniAbi
}) => {
  const publicClient = usePublicClient();
  const netKey = getStoredNetworkKey();
  const netCfg = getNetworkByKey(netKey);

  // Check if the contract is in the correct state for funding
  async function checkContractState(raffleAddr, seasonId) {
    try {
      // Check if the season exists and has a winner
      const seasonDetails = await publicClient.readContract({
        address: raffleAddr,
        abi: [
          {
            type: "function",
            name: "getSeasonDetails",
            stateMutability: "view",
            inputs: [{ name: "seasonId", type: "uint256" }],
            outputs: [
              {
                name: "config",
                type: "tuple",
                components: [
                  { name: "name", type: "string" },
                  { name: "startTime", type: "uint256" },
                  { name: "endTime", type: "uint256" },
                  { name: "winnerCount", type: "uint8" },
                  { name: "prizePercentage", type: "uint8" },
                  { name: "consolationPercentage", type: "uint8" },
                  { name: "grandPrizeBps", type: "uint16" },
                  { name: "raffleToken", type: "address" },
                  { name: "bondingCurve", type: "address" },
                  { name: "isActive", type: "bool" },
                  { name: "isCompleted", type: "bool" },
                ],
              },
              { name: "status", type: "uint8" },
              { name: "totalTickets", type: "uint256" },
              { name: "winner", type: "address" },
              { name: "merkleRoot", type: "bytes32" },
            ],
          },
        ],
        functionName: "getSeasonDetails",
        args: [BigInt(seasonId)],
      });

      const [config, status, totalTickets, winner] = seasonDetails;

      // Check if the season is in a state that can be funded
      if (winner === "0x0000000000000000000000000000000000000000") {
        throw new Error("No winner has been selected for this season yet");
      }

      if (status !== 3) {
        // Assuming 3 is the status for completed with winner
        throw new Error(
          `Season is not in a state that can be funded (status: ${status})`
        );
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to check contract state: ${error.message}`);
    }
  }

  // Manually fund distributor after VRF completion (Phase 3)
  async function fundDistributorManual() {
    setEndingE2EId(seasonId);
    setEndStatus("Initializing...");
    
    try {
      // Get network configuration
      const contractAddresses = getContractAddresses(netKey);

      if (!contractAddresses || !contractAddresses.RAFFLE) {
        const errorMsg = "Could not find RAFFLE contract address for network";
        setEndStatus(`${errorMsg} ${netKey}`);
        return;
      }

      const raffleAddr = contractAddresses.RAFFLE;

      // Check contract state before proceeding
      try {
        setEndStatus("Checking contract state...");
        await checkContractState(raffleAddr, seasonId);
      } catch (error) {
        setEndStatus(`Error: ${error.message}`);
        return;
      }

      // Check if window.ethereum is available
      if (!window.ethereum) {
        const errorMsg =
          "Ethereum provider not found. Please install MetaMask or another Web3 provider.";
        setEndStatus(errorMsg);
        return;
      }

      // Create wallet client with the target network's chain ID
      const wallet = createWalletClient({
        chain: {
          id: netCfg.id, // Use the target network's ID, not the current chainId
          name: netCfg.name,
          network: netCfg.name.toLowerCase().replace(/\s+/g, "-"),
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: {
            default: {
              http: [netCfg.rpcUrl],
            },
            public: {
              http: [netCfg.rpcUrl],
            },
          },
          testnet: netCfg.id !== 1, // Assuming 1 is mainnet
        },
        transport: custom(window.ethereum),
      });

      // Get the current chain ID and account
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];

      if (!address) {
        const errorMsg = "No connected account found";
        setEndStatus(errorMsg);
        return;
      }

      // Ensure we're on the correct network
      const currentChainId = parseInt(chainId, 16);
      if (currentChainId !== netCfg.id) {
        try {
          const switchChainId = `0x${netCfg.id.toString(16)}`;
          setEndStatus(`Switching network to ${netCfg.name}...`);

          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: switchChainId }],
            });
            // Add a small delay to ensure the wallet has updated its state
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: switchChainId,
                    chainName: netCfg.name,
                    nativeCurrency: {
                      name: "Ether",
                      symbol: "ETH",
                      decimals: 18,
                    },
                    rpcUrls: [netCfg.rpcUrl],
                    blockExplorerUrls: netCfg.explorer ? [netCfg.explorer] : [],
                  },
                ],
              });
              // Wait for network to be added and switched
              await new Promise((resolve) => setTimeout(resolve, 2000));
            } else {
              throw switchError;
            }
          }
        } catch (err) {
          setEndStatus(`Failed to switch network: ${err.message}`);
          return;
        }
      }

      // Resolve distributor (best-effort; some builds may not expose this view)
      let distributor = undefined;
      try {
        distributor = await publicClient.readContract({
          address: raffleAddr,
          abi: [
            {
              type: "function",
              name: "prizeDistributor",
              stateMutability: "view",
              inputs: [],
              outputs: [{ type: "address" }],
            },
          ],
          functionName: "prizeDistributor",
        });
      } catch (error) {
        // proceed; post-verification may be skipped if distributor unknown
      }
      const DistAbi = [
        {
          type: "function",
          name: "getSeason",
          stateMutability: "view",
          inputs: [{ name: "seasonId", type: "uint256" }],
          outputs: [
            {
              name: "",
              type: "tuple",
              components: [
                { name: "token", type: "address" },
                { name: "grandWinner", type: "address" },
                { name: "grandAmount", type: "uint256" },
                { name: "consolationAmount", type: "uint256" },
                { name: "totalTicketsSnapshot", type: "uint256" },
                { name: "grandWinnerTickets", type: "uint256" },
                { name: "merkleRoot", type: "bytes32" },
                { name: "funded", type: "bool" },
                { name: "grandClaimed", type: "bool" },
              ],
            },
          ],
        },
      ];

      // Pre state
      let distSeason = null;
      if (
        distributor &&
        distributor !== "0x0000000000000000000000000000000000000000"
      ) {
        try {
          distSeason = await publicClient.readContract({
            address: distributor,
            abi: DistAbi,
            functionName: "getSeason",
            args: [BigInt(seasonId)],
          });
        } catch (_) {
          // ignore pre-read errors
        }
      }
      const preWinner =
        distSeason?.grandWinner ??
        distSeason?.[1] ??
        "0x0000000000000000000000000000000000000000";
      const preFunded = Boolean(distSeason?.funded ?? distSeason?.[7] ?? false);
      setVerify((prev) => ({
        ...prev,
        [seasonId]: {
          ...(prev[seasonId] || {}),
          distGrandWinner: preWinner,
          distFunded: preFunded,
        },
      }));

      // Guard rails: must have a nonzero winner and not already funded
      if (preWinner === "0x0000000000000000000000000000000000000000") {
        setEndStatus(
          "Cannot fund: winner not set yet. Ensure VRF has completed and winners selected."
        );
        return;
      }
      if (preFunded) {
        setEndStatus("Already funded. No action needed.");
        return;
      }

      try {
        setEndStatus("Starting transaction...");

        // Check if wallet is properly connected and has an account
        if (!address) {
          const errorMsg = "No connected account found";
          setEndStatus(`Error: ${errorMsg}`);
          return;
        }

        // Check if RaffleMiniAbi has the required function
        const hasFunction = RaffleMiniAbi.some((item) => {
          const matches =
            item.type === "function" && item.name === "fundPrizeDistributor";
          return matches;
        });

        if (!hasFunction) {
          const errorMsg = "fundPrizeDistributor function not found in ABI";
          setEndStatus(`Error: ${errorMsg}`);
          const availableFunctions = RaffleMiniAbi.filter(
            (item) => item.type === "function"
          ).map((item) => item.name);
          return;
        }

        setEndStatus("Validating contract and balance...");

        // Check if contract address is valid
        const isValidAddress =
          raffleAddr && /^0x[a-fA-F0-9]{40}$/.test(raffleAddr);

        if (!isValidAddress) {
          throw new Error(`Invalid contract address: ${raffleAddr}`);
        }

        // Check account balance (optional but recommended)
        try {
          const balance = await publicClient.getBalance({
            address: address,
          });
          const balanceEth = formatEther(balance);

          if (balance < parseEther("0.001")) {
            const warning = `Low balance: ${balanceEth} ETH - transaction may fail`;
            setEndStatus(`Warning: ${warning}`);
          }
        } catch (balanceError) {
          // Continue execution even if balance check fails
        }

        setEndStatus('Preparing transaction simulation...');

        // Prepare the transaction
        let request;
        try {
          // Log the full function signature we're looking for
          const fundFunction = RaffleMiniAbi.find(
            (x) => x.type === 'function' && x.name === 'fundPrizeDistributor'
          );
          
          if (!fundFunction) {
            const errorMsg = 'fundPrizeDistributor function not found in ABI';
            throw new Error(errorMsg);
          }
          
          // Add a timeout for the simulation
          const simulationPromise = (async () => {
            const simResult = await publicClient.simulateContract({
              account: address,
              address: raffleAddr,
              abi: RaffleMiniAbi,
              functionName: "fundPrizeDistributor",
              args: [BigInt(seasonId)],
              chain: { id: chainId },
            });

            return simResult;
          })();

          // Add a 30 second timeout for the simulation
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Simulation timed out after 30 seconds")),
              30000
            )
          );

          // Race the simulation against the timeout
          const simResult = await Promise.race([
            simulationPromise,
            timeoutPromise,
          ]);

          request = simResult.request;
        } catch (simError) {
          // Try to extract a more specific error message
          let errorMessage = "Transaction simulation failed";
          if (simError.message.includes("insufficient funds")) {
            errorMessage = "Insufficient funds for transaction";
          } else if (simError.message.includes("user rejected")) {
            errorMessage = "User rejected the transaction";
          } else if (simError.message.includes("execution reverted")) {
            errorMessage = "Transaction would revert";
          } else if (simError.message) {
            errorMessage = simError.message;
          }
          throw new Error(errorMessage);
        }

        setEndStatus('Sending transaction...');

        // Send the transaction
        try {
          // Add a timeout for the transaction
          const transactionPromise = wallet.writeContract({
            ...request,
            gas: 1000000, // Explicit gas limit
            gasPrice: 1000000000n, // 1 Gwei
          });
          
          // Add a 60 second timeout for the transaction
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction submission timed out after 60 seconds')), 60000)
          );
          
          try {
            // Race the transaction against the timeout
            const txHash = await Promise.race([transactionPromise, timeoutPromise]);
            
            setEndStatus(`Transaction sent: ${txHash.slice(0, 10)}...`);
            
            setEndStatus("Waiting for transaction confirmation...");

            try {
              const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash,
                confirmations: 1,
                timeout: 60000, // 60 seconds timeout
              });

              if (receipt.status === "success") {
                setEndStatus("Transaction successful!");
                return; // Exit the function on success
              } else {
                throw new Error("Transaction failed");
              }
            } catch (receiptError) {
              throw new Error(
                `Failed to get transaction receipt: ${receiptError.message}`
              );
            }
          } catch (txError) {
            // Extract more detailed error message
            let errorMessage = "Transaction failed";
            if (txError.message) {
              if (txError.message.includes("insufficient funds")) {
                errorMessage = "Insufficient funds for transaction";
              } else if (txError.message.includes("user rejected")) {
                errorMessage = "Transaction was rejected by user";
              } else if (txError.message.includes("execution reverted")) {
                const revertMatch = txError.message.match(/reason: (.*?),/);
                errorMessage =
                  revertMatch && revertMatch[1]
                    ? `Transaction reverted: ${revertMatch[1]}`
                    : "Transaction reverted";
              } else {
                errorMessage = txError.message;
              }
            }

            throw new Error(errorMessage);
          }
        } catch (err) {
          const msg = buildFriendlyContractError(
            RaffleMiniAbi,
            err,
            "Failed to fund distributor"
          );
          setEndStatus(`Error: ${msg}`);
          throw err;
        }
      } catch (error) {
        // Add the missing catch block to handle any errors from the outer try block
        setEndStatus(`Error: ${error?.message || "Unknown error occurred"}`);
      }

      // After successful funding, fetch updated season data
      setEndStatus("Fetching updated season data...");
      try {
        // First try to get the distributor address if not already known
        if (
          !distributor ||
          distributor === "0x0000000000000000000000000000000000000000"
        ) {
          distributor = await publicClient.readContract({
            address: raffleAddr,
            abi: [
              {
                type: "function",
                name: "prizeDistributor",
                stateMutability: "view",
                inputs: [],
                outputs: [{ type: "address" }],
              },
            ],
            functionName: "prizeDistributor",
          });
        }

        // If we have a valid distributor, fetch the updated season data
        if (
          distributor &&
          distributor !== "0x0000000000000000000000000000000000000000"
        ) {
          const after = await publicClient.readContract({
            address: distributor,
            abi: DistAbi,
            functionName: "getSeason",
            args: [BigInt(seasonId)],
          });

          const afterWinner =
            after?.grandWinner ??
            after?.[1] ??
            "0x0000000000000000000000000000000000000000";
          const afterFunded = Boolean(after?.funded ?? after?.[7] ?? false);
          const grandAmount = after?.grandAmount ?? after?.[2] ?? 0n;
          const consolationAmount =
            after?.consolationAmount ?? after?.[3] ?? 0n;

          setVerify((prev) => ({
            ...prev,
            [seasonId]: {
              ...(prev[seasonId] || {}),
              distGrandWinnerAfter: afterWinner,
              distFundedAfter: afterFunded,
              grandAmount: grandAmount,
              consolationAmount: consolationAmount,
              grandWinner:
                afterWinner !== "0x0000000000000000000000000000000000000000"
                  ? afterWinner
                  : prev[seasonId]?.grandWinner || "",
              funded: afterFunded,
            },
          }));
        } else {
          // If no distributor, try to get winner info directly from the raffle contract
          try {
            const winner = await publicClient.readContract({
              address: raffleAddr,
              abi: [
                {
                  type: "function",
                  name: "getGrandWinner",
                  stateMutability: "view",
                  inputs: [{ name: "seasonId", type: "uint256" }],
                  outputs: [{ type: "address" }],
                },
              ],
              functionName: "getGrandWinner",
              args: [BigInt(seasonId)],
            });

            if (
              winner &&
              winner !== "0x0000000000000000000000000000000000000000"
            ) {
              setVerify((prev) => ({
                ...prev,
                [seasonId]: {
                  ...(prev[seasonId] || {}),
                  grandWinner: winner,
                  funded: true,
                },
              }));
            }
          } catch (_) {
            // Ignore if we can't get the winner info
          }
        }
      } catch (err) {
        // Continue even if we can't update the verification data
      }
      
      setEndStatus("Done");
      allSeasonsQuery.refetch();
    } finally {
      setEndingE2EId(null);
    }
  }

  return { fundDistributorManual };
};

FundDistributor.propTypes = {
  seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  setEndingE2EId: PropTypes.func.isRequired,
  setEndStatus: PropTypes.func.isRequired,
  setVerify: PropTypes.func.isRequired,
  allSeasonsQuery: PropTypes.object.isRequired,
  RaffleMiniAbi: PropTypes.array.isRequired
};

export default FundDistributor;
