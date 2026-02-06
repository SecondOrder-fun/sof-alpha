// src/components/sponsor/SponsorStakingCard.jsx
import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSponsorStaking } from "@/hooks/useSponsorStaking";
import { useSOFBalance } from "@/hooks/useSOFBalance";
import { HATS_CONFIG } from "@/config/hats";
import { CONTRACTS } from "@/config/contracts";
import StakingEligibilityAbi from "@/contracts/abis/StakingEligibility.json";
import { Crown, Loader2, Check, Clock, AlertTriangle, RefreshCw } from "lucide-react";

// ERC20 ABI for approve
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
];

function formatTimeRemaining(seconds) {
  if (seconds <= 0) return "Ready";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function SponsorStakingCard() {
  const { address, isConnected } = useAccount();
  const network = (import.meta.env.VITE_DEFAULT_NETWORK || "TESTNET").toUpperCase();
  const sofAddress = CONTRACTS[network]?.SOF;
  
  const {
    stakeAmount,
    minStake,
    stakeAmountFormatted,
    isSponsor,
    isWearingHat,
    isInGoodStanding,
    isSlashed,
    isUnstaking,
    canCompleteUnstake,
    unstakeTimeRemaining,
    unstakingAmountFormatted,
    isLoading: isStatusLoading,
    refetch,
  } = useSponsorStaking();

  const { balance: sofBalance, isLoading: isBalanceLoading } = useSOFBalance();
  
  const [step, setStep] = useState("idle"); // idle, approving, staking, unstaking, completing
  
  // Contract writes
  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: stake, data: stakeHash, isPending: isStaking } = useWriteContract();
  const { writeContract: beginUnstake, data: unstakeHash, isPending: isBeginningUnstake } = useWriteContract();
  const { writeContract: completeUnstake, data: completeHash, isPending: isCompleting } = useWriteContract();

  // Wait for transactions
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isStakeConfirming, isSuccess: isStakeSuccess } = useWaitForTransactionReceipt({ hash: stakeHash });
  const { isLoading: isUnstakeConfirming, isSuccess: isUnstakeSuccess } = useWaitForTransactionReceipt({ hash: unstakeHash });
  const { isLoading: isCompleteConfirming, isSuccess: isCompleteSuccess } = useWaitForTransactionReceipt({ hash: completeHash });

  // Auto-proceed from approve to stake
  useEffect(() => {
    if (isApproveSuccess && step === "approving") {
      setStep("staking");
      stake({
        address: HATS_CONFIG.STAKING_ELIGIBILITY_ADDRESS,
        abi: StakingEligibilityAbi,
        functionName: "stake",
        args: [minStake],
      });
    }
  }, [isApproveSuccess, step, stake, minStake]);

  // Refetch on success
  useEffect(() => {
    if (isStakeSuccess || isUnstakeSuccess || isCompleteSuccess) {
      setStep("idle");
      refetch();
    }
  }, [isStakeSuccess, isUnstakeSuccess, isCompleteSuccess, refetch]);

  const handleStake = async () => {
    if (!sofAddress) return;
    setStep("approving");
    approve({
      address: sofAddress,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [HATS_CONFIG.STAKING_ELIGIBILITY_ADDRESS, minStake],
    });
  };

  const handleBeginUnstake = async () => {
    setStep("unstaking");
    beginUnstake({
      address: HATS_CONFIG.STAKING_ELIGIBILITY_ADDRESS,
      abi: StakingEligibilityAbi,
      functionName: "beginUnstake",
      args: [stakeAmount],
    });
  };

  const handleCompleteUnstake = async () => {
    setStep("completing");
    completeUnstake({
      address: HATS_CONFIG.STAKING_ELIGIBILITY_ADDRESS,
      abi: StakingEligibilityAbi,
      functionName: "completeUnstake",
      args: [address],
    });
  };

  const isProcessing = isApproving || isApproveConfirming || isStaking || isStakeConfirming || 
                       isBeginningUnstake || isUnstakeConfirming || isCompleting || isCompleteConfirming;

  const hasEnoughSOF = sofBalance >= minStake;

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            Become a Sponsor
          </CardTitle>
          <CardDescription>Connect wallet to stake and create raffles</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            Sponsor Status
          </CardTitle>
          {isSponsor ? (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <Check className="h-3 w-3 mr-1" />
              Active Sponsor
            </Badge>
          ) : isUnstaking ? (
            <Badge variant="outline" className="border-yellow-500/30 text-yellow-400">
              <Clock className="h-3 w-3 mr-1" />
              Unstaking
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground/30">
              Not a Sponsor
            </Badge>
          )}
        </div>
        <CardDescription>
          Stake {HATS_CONFIG.MIN_STAKE_DISPLAY} $SOF to create raffles permissionlessly
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Stake */}
        <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
          <span className="text-sm text-muted-foreground">Your Stake</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">
              {isStatusLoading ? "..." : Number(stakeAmountFormatted).toLocaleString()} $SOF
            </span>
            <button
              onClick={() => refetch()}
              disabled={isStatusLoading}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 ${isStatusLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Unstaking Status */}
        {isUnstaking && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-yellow-400">Unstaking Amount</span>
              <span className="font-mono text-yellow-400">
                {Number(unstakingAmountFormatted).toLocaleString()} $SOF
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-yellow-400">Time Remaining</span>
              <span className="font-mono text-yellow-400">
                {formatTimeRemaining(unstakeTimeRemaining)}
              </span>
            </div>
          </div>
        )}

        {/* Slashing Warning */}
        {isSlashed && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm text-red-400">Account has been slashed — stake forfeited</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {!isSponsor && !isUnstaking && (
            <>
              {!hasEnoughSOF ? (
                <div className="text-sm text-muted-foreground text-center py-2">
                  You need {HATS_CONFIG.MIN_STAKE_DISPLAY} $SOF to become a sponsor.
                  <br />
                  Current balance: {isBalanceLoading ? "..." : Number(sofBalance / BigInt(10**18)).toLocaleString()} $SOF
                </div>
              ) : (
                <Button 
                  onClick={handleStake} 
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {step === "approving" ? "Approving..." : "Staking..."}
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" />
                      Stake {HATS_CONFIG.MIN_STAKE_DISPLAY} $SOF
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          {stakeAmount > 0n && !isUnstaking && (
            <Button 
              variant="outline" 
              onClick={handleBeginUnstake}
              disabled={isProcessing}
              className="w-full"
            >
              {isBeginningUnstake || isUnstakeConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Begin Unstake (7 day cooldown)"
              )}
            </Button>
          )}

          {isUnstaking && canCompleteUnstake && (
            <Button 
              onClick={handleCompleteUnstake}
              disabled={isProcessing}
              className="w-full"
            >
              {isCompleting || isCompleteConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Complete Unstake"
              )}
            </Button>
          )}
        </div>

        {/* Info */}
        <p className="text-xs text-muted-foreground text-center">
          Sponsors can create raffles without admin approval. 
          Stake can be slashed for misconduct.
        </p>
      </CardContent>
    </Card>
  );
}

export default SponsorStakingCard;
