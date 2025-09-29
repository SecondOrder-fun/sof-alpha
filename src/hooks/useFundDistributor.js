// src/hooks/useFundDistributor.js
import { useAccount, usePublicClient } from 'wagmi';
import { createWalletClient, custom } from 'viem';
import { getContractAddresses } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook for managing the raffle distribution process
 */
const useFundDistributor = ({
  seasonId,
  setEndingE2EId,
  setEndStatus,
  setVerify,
  allSeasonsQuery,
  RaffleMiniAbi
}) => {
  const netKey = getStoredNetworkKey();
  const publicClient = usePublicClient();
  const { chain, address } = useAccount();
  const netCfg = chain;
  const queryClient = useQueryClient();
  const contractAddresses = getContractAddresses(netKey);

  // Check contract state before proceeding
  async function checkContractState(raffleAddr, seasonId) {
    try {
      console.log('checkContractState called with:', { raffleAddr, seasonId });
      console.log('Using RaffleMiniAbi:', RaffleMiniAbi);
      console.log('Looking for getSeasonDetails function in ABI');
      const getSeasonDetailsAbi = RaffleMiniAbi.find(item => item.name === 'getSeasonDetails');
      console.log('Found getSeasonDetails in ABI:', !!getSeasonDetailsAbi);
      
      // Get season details
      const seasonDetails = await publicClient.readContract({
        address: raffleAddr,
        abi: RaffleMiniAbi,
        functionName: "getSeasonDetails",
        args: [BigInt(seasonId)],
      });
      
      console.log('Season details returned:', seasonDetails);

      // Extract season details for processing
      const [, status, totalParticipants, totalTickets, totalPrizePool] = seasonDetails;
      
      // Status codes from RaffleStorage.sol:
      // enum SeasonStatus { NotStarted, Active, EndRequested, VRFPending, Distributing, Completed }
      // 0: NotStarted, 1: Active, 2: EndRequested, 3: VRFPending, 4: Distributing, 5: Completed
      
      return {
        status,
        totalParticipants,
        totalTickets,
        totalPrizePool
      };
    } catch (error) {
      throw new Error(`Failed to check contract state: ${error.message}`);
    }
  }

  // Complete end-to-end flow for raffle resolution
  async function fundDistributorManual(targetSeasonId) {
    const idToUse = targetSeasonId || seasonId;
    console.log('fundDistributorManual called with seasonId:', idToUse);
    console.log('RaffleMiniAbi available:', !!RaffleMiniAbi);
    if (RaffleMiniAbi) {
      console.log('RaffleMiniAbi functions:', RaffleMiniAbi.map(item => item.name).join(', '));
    }
    setEndingE2EId(idToUse);
    setEndStatus("Initializing end-to-end process for season " + idToUse);
    
    // Will store the account to use for transactions
    let account;
    
    try {
      // Check if contract addresses are available
      if (!contractAddresses || !contractAddresses.RAFFLE) {
        setEndStatus(`Could not find RAFFLE contract address for network ${netKey}`);
        return;
      }
      
      // Define status labels for readable status messages
      const statusLabels = ['NotStarted', 'Active', 'EndRequested', 'VRFPending', 'Distributing', 'Completed'];

      const raffleAddr = contractAddresses.RAFFLE;
      const vrfCoordinatorAddr = contractAddresses.VRF_COORDINATOR;
      
      // Step 1: Check initial season state
      setEndStatus("Checking season state...");
      console.log('Checking contract state for raffle address:', raffleAddr, 'and season ID:', idToUse);
      let seasonState;
      try {
        seasonState = await checkContractState(raffleAddr, idToUse);
        console.log('Season state retrieved:', seasonState);
        setEndStatus(`Season status: ${statusLabels[seasonState.status]}`);
        
        // Add season details to verification data for admin UI
        setVerify(prev => ({
          ...prev,
          [idToUse]: {
            ...(prev[idToUse] || {}),
            status: seasonState.status,
            statusLabel: statusLabels[seasonState.status] || `Unknown (${seasonState.status})`,
            totalParticipants: seasonState.totalParticipants,
            totalTickets: seasonState.totalTickets,
            totalPrizePool: seasonState.totalPrizePool?.toString() || '0',
          }
        }));
      } catch (error) {
        setEndStatus(`Error checking season state: ${error.message}`);
        return;
      }
      
      // Check if window.ethereum is available
      if (!window.ethereum) {
        setEndStatus("Error: MetaMask or compatible wallet not found");
        console.log('Error: window.ethereum not available');
        return;
      }
      
      // Create wallet client for transactions
      setEndStatus("Creating wallet client...");
      console.log('Creating wallet client with netCfg:', netCfg);
      let walletClient;
      
      try {
        const chainConfig = {
          id: netCfg.id,
          name: netCfg.name,
          network: netCfg.name.toLowerCase(),
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18
          },
          rpcUrls: {
            default: {
              http: [netCfg.rpcUrls.default.http[0]],
            },
            public: {
              http: [netCfg.rpcUrls.public.http[0]],
            },
          },
        };
        
        console.log('Chain config for wallet client:', chainConfig);
        
        walletClient = createWalletClient({
          chain: chainConfig,
          transport: custom(window.ethereum),
        });
        
        console.log('Wallet client created successfully');
      } catch (error) {
        setEndStatus(`Error creating wallet client: ${error.message}`);
        return;
      }
      
      // Get the current chain ID and account
      try {
        console.log('Getting chain ID from wallet client');
        const chainId = await walletClient.getChainId();
        console.log('Chain ID from wallet:', chainId, 'Expected:', netCfg.id);
        
        if (chainId !== netCfg.id) {
          setEndStatus(`Error: Connected to wrong chain. Expected ${netCfg.id}, got ${chainId}`);
          console.log(`Error: Connected to wrong chain. Expected ${netCfg.id}, got ${chainId}`);
          return;
        }
        
        console.log('Getting wallet addresses');
        const accounts = await walletClient.getAddresses();
        console.log('Wallet addresses:', accounts);
        
        if (!accounts || accounts.length === 0) {
          setEndStatus("Error: No accounts found. Please connect your wallet.");
          console.log('Error: No accounts found');
          return;
        }
        
        account = accounts[0];
        console.log('Using account:', account);
      } catch (error) {
        setEndStatus(`Error getting account: ${error.message}`);
        return;
      }
      
      // Step 2: Request season end if needed
      if (seasonState.status === 0 || seasonState.status === 1) { // NotStarted or Active
        setEndStatus("Requesting season end...");
        
        try {
          const hash = await walletClient.writeContract({
            address: raffleAddr,
            abi: RaffleMiniAbi,
            functionName: "requestSeasonEndEarly",
            args: [BigInt(idToUse)],
            account
          });
          
          setEndStatus("Season end requested. Waiting for transaction confirmation...");
          
          // Wait for transaction to be mined
          await publicClient.waitForTransactionReceipt({ hash });
          
          // Refresh season state
          seasonState = await checkContractState(raffleAddr, idToUse);
          setEndStatus(`Season status updated: ${statusLabels[seasonState.status]}`);
        } catch (error) {
          setEndStatus(`Error requesting season end: ${error.message}`);
          return;
        }
      }
      
      // Step 3: Get VRF request ID
      setEndStatus("Getting VRF request ID...");
      let requestId;
      
      try {
        requestId = await publicClient.readContract({
          address: raffleAddr,
          abi: RaffleMiniAbi,
          functionName: "getVrfRequestForSeason",
          args: [BigInt(idToUse)],
        });
        
        setEndStatus(`VRF request ID: ${requestId}`);
      } catch (error) {
        setEndStatus(`Error getting VRF request ID: ${error.message}`);
        return;
      }
      
      // Step 4: Fulfill VRF request
      if (requestId && (seasonState.status === 2 || seasonState.status === 3)) { // EndRequested or VRFPending
        setEndStatus(`Fulfilling VRF request ${requestId}...`);
        console.log('Attempting to fulfill VRF request:', requestId);
        console.log('VRF Coordinator address:', vrfCoordinatorAddr);
        console.log('Raffle address (consumer):', raffleAddr);
        
        try {
          const vrfAbi = [
            {
              type: "function",
              name: "fulfillRandomWords",
              stateMutability: "nonpayable",
              inputs: [
                { name: "requestId", type: "uint256" },
                { name: "consumer", type: "address" },
              ],
              outputs: [],
            },
          ];
          
          console.log('Using VRF ABI:', vrfAbi);
          console.log('VRF function args:', [requestId, raffleAddr]);
          
          const hash = await walletClient.writeContract({
            address: vrfCoordinatorAddr,
            abi: vrfAbi,
            functionName: "fulfillRandomWords",
            args: [requestId, raffleAddr],
            account
          });
          
          console.log('VRF fulfillment transaction hash:', hash);
          
          setEndStatus("VRF fulfillment requested. Waiting for transaction confirmation...");
          
          // Wait for transaction to be mined
          await publicClient.waitForTransactionReceipt({ hash });
          
          // Refresh season state
          seasonState = await checkContractState(raffleAddr, idToUse);
          setEndStatus(`Season status after VRF: ${statusLabels[seasonState.status]}`);
        } catch (error) {
          console.error('Error fulfilling VRF:', error);
          console.log('Error details:', {
            message: error.message,
            code: error.code,
            data: error.data,
            stack: error.stack
          });
          setEndStatus(`Error fulfilling VRF: ${error.message}`);
          return;
        }
      }
      
      // Step 5: Get winners
      setEndStatus("Getting winners...");
      let winner;
      
      try {
        const winners = await publicClient.readContract({
          address: raffleAddr,
          abi: RaffleMiniAbi,
          functionName: "getWinners",
          args: [BigInt(idToUse)],
        });
        
        if (!winners || winners.length === 0) {
          setEndStatus("No winners found. VRF may not have completed yet.");
          return;
        }
        
        winner = winners[0];
        setEndStatus(`Winner found: ${winner}`);
        
        if (!winner || winner === '0x0000000000000000000000000000000000000000') {
          setEndStatus("Invalid winner address. VRF may not have completed correctly.");
          return;
        }
      } catch (error) {
        // If getWinners fails, the season may not be completed yet
        setEndStatus(`Could not get winners: ${error.message}`);
        return;
      }
      
      // Step 6: Check if distributor is already configured
      setEndStatus("Checking distributor configuration...");
      const distributorAddr = contractAddresses.PRIZE_DISTRIBUTOR;
      
      if (!distributorAddr) {
        setEndStatus("Error: Prize distributor address not found");
        return;
      }
      
      let distSeason;
      try {
        distSeason = await publicClient.readContract({
          address: distributorAddr,
          abi: [
            {
              type: "function",
              name: "seasons",
              stateMutability: "view",
              inputs: [{ name: "seasonId", type: "uint256" }],
              outputs: [
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
          functionName: "seasons",
          args: [BigInt(idToUse)],
        });
        
        const preFunded = Boolean(distSeason[7]);
        
        if (preFunded) {
          setEndStatus("Distributor already funded. No action needed.");
          return;
        }
      } catch (error) {
        setEndStatus(`Error checking distributor: ${error.message}`);
        // Continue anyway, as the distributor might not be configured yet
      }
      
      // Step 7: Configure distributor if needed
      if (seasonState.status === 5) { // Completed
        setEndStatus("Configuring distributor...");
        
        try {
          // Get the bonding curve address from season details
          const seasonDetails = await publicClient.readContract({
            address: raffleAddr,
            abi: RaffleMiniAbi,
            functionName: "getSeasonDetails",
            args: [BigInt(idToUse)],
          });
          
          const bondingCurveAddr = seasonDetails[0][8];
          
          // Extract SOF from bonding curve
          setEndStatus("Extracting SOF from bonding curve...");
          
          const extractHash = await walletClient.writeContract({
            address: bondingCurveAddr,
            abi: [
              {
                type: "function",
                name: "extractSof",
                stateMutability: "nonpayable",
                inputs: [
                  { name: "to", type: "address" },
                  { name: "amount", type: "uint256" },
                ],
                outputs: [],
              },
            ],
            functionName: "extractSof",
            args: [distributorAddr, seasonState.totalPrizePool],
            account
          });
          
          await publicClient.waitForTransactionReceipt({ hash: extractHash });
          setEndStatus("SOF extracted to distributor");
          
          // Fund the season
          setEndStatus("Funding season in distributor...");
          
          const fundHash = await walletClient.writeContract({
            address: distributorAddr,
            abi: [
              {
                type: "function",
                name: "fundSeason",
                stateMutability: "nonpayable",
                inputs: [
                  { name: "seasonId", type: "uint256" },
                  { name: "amount", type: "uint256" },
                ],
                outputs: [],
              },
            ],
            functionName: "fundSeason",
            args: [BigInt(idToUse), seasonState.totalPrizePool],
            account
          });
          
          await publicClient.waitForTransactionReceipt({ hash: fundHash });
          setEndStatus("Season funded successfully!");
          
          // Invalidate SOF balance query to refresh the user's balance
          if (address) {
            console.log('Invalidating SOF balance query for address:', address);
            queryClient.invalidateQueries({ queryKey: ['sofBalance', netKey, contractAddresses.SOF, address] });
            
            // Also invalidate raffle token balances query
            queryClient.invalidateQueries({ queryKey: ['raffleTokenBalances', netKey, address] });
          }
        } catch (error) {
          setEndStatus(`Error funding distributor: ${error.message}`);
          return;
        }
      } else {
        setEndStatus(`Cannot fund: Season not completed yet. Current status: ${statusLabels[seasonState.status]}`);
        return;
      }
      
      // Refresh data
      setEndStatus("Done! Season fully resolved and funded.");
      allSeasonsQuery.refetch();
      
      // Invalidate SOF balance query to refresh the user's balance
      if (address) {
        console.log('Invalidating SOF balance query for address:', address);
        queryClient.invalidateQueries({ queryKey: ['sofBalance', netKey, contractAddresses.SOF, address] });
        
        // Also invalidate raffle token balances query
        queryClient.invalidateQueries({ queryKey: ['raffleTokenBalances', netKey, address] });
      }
    } catch (error) {
      setEndStatus(`Unexpected error: ${error.message}`);
    } finally {
      // Always reset the ending ID
      setEndingE2EId(null);
    }
  }

  return { fundDistributorManual };
};

export default useFundDistributor;
