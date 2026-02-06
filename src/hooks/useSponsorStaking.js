// src/hooks/useSponsorStaking.js
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { HATS_CONFIG } from "@/config/hats";
import StakingEligibilityAbi from "@/contracts/abis/StakingEligibility.json";
import HatsAbi from "@/contracts/abis/Hats.json";

/**
 * Hook for reading sponsor staking status
 * @returns {Object} Staking status and hat ownership info
 */
export function useSponsorStaking() {
  const { address, isConnected } = useAccount();

  // Read multiple values in one call
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      // Current stake amount
      {
        address: HATS_CONFIG.STAKING_ELIGIBILITY_ADDRESS,
        abi: StakingEligibilityAbi,
        functionName: "stakes",
        args: [address],
      },
      // Min stake required
      {
        address: HATS_CONFIG.STAKING_ELIGIBILITY_ADDRESS,
        abi: StakingEligibilityAbi,
        functionName: "minStake",
      },
      // Unstaking amount (if any)
      {
        address: HATS_CONFIG.STAKING_ELIGIBILITY_ADDRESS,
        abi: StakingEligibilityAbi,
        functionName: "unstakingAmounts",
        args: [address],
      },
      // Unstake deadline (if any)
      {
        address: HATS_CONFIG.STAKING_ELIGIBILITY_ADDRESS,
        abi: StakingEligibilityAbi,
        functionName: "unstakeDeadlines",
        args: [address],
      },
      // Is wearer of Sponsor hat
      {
        address: HATS_CONFIG.HATS_ADDRESS,
        abi: HatsAbi,
        functionName: "isWearerOfHat",
        args: [address, HATS_CONFIG.SPONSOR_HAT_ID],
      },
      // Is in good standing
      {
        address: HATS_CONFIG.HATS_ADDRESS,
        abi: HatsAbi,
        functionName: "isInGoodStanding",
        args: [address, HATS_CONFIG.SPONSOR_HAT_ID],
      },
    ],
    query: {
      enabled: isConnected && !!address,
    },
  });

  // Parse results
  const stakeAmount = data?.[0]?.result ?? BigInt(0);
  const minStake = data?.[1]?.result ?? HATS_CONFIG.MIN_STAKE;
  const unstakingAmount = data?.[2]?.result ?? BigInt(0);
  const unstakeDeadline = data?.[3]?.result ?? BigInt(0);
  const isWearingHat = data?.[4]?.result ?? false;
  const isInGoodStanding = data?.[5]?.result ?? false;

  // Derived state
  const hasMinStake = stakeAmount >= minStake;
  const isSponsor = isWearingHat && isInGoodStanding;
  const isUnstaking = unstakingAmount > BigInt(0);
  const canCompleteUnstake = isUnstaking && BigInt(Math.floor(Date.now() / 1000)) >= unstakeDeadline;
  
  // Format for display
  const stakeAmountFormatted = formatUnits(stakeAmount, 18);
  const minStakeFormatted = formatUnits(minStake, 18);
  const unstakingAmountFormatted = formatUnits(unstakingAmount, 18);
  
  // Time until unstake completes
  const unstakeTimeRemaining = unstakeDeadline > BigInt(0) 
    ? Number(unstakeDeadline) - Math.floor(Date.now() / 1000)
    : 0;

  return {
    // Raw values
    stakeAmount,
    minStake,
    unstakingAmount,
    unstakeDeadline,
    
    // Formatted values
    stakeAmountFormatted,
    minStakeFormatted,
    unstakingAmountFormatted,
    
    // Status flags
    isConnected,
    isLoading,
    hasMinStake,
    isSponsor,
    isWearingHat,
    isInGoodStanding,
    isUnstaking,
    canCompleteUnstake,
    unstakeTimeRemaining,
    
    // Actions
    refetch,
  };
}

export default useSponsorStaking;
