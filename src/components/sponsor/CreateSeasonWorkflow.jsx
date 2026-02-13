// src/components/sponsor/CreateSeasonWorkflow.jsx
// Shared 3-step create-season workflow: Stake → Create → Confirmation
// Used by both desktop /create-season route and mobile Portfolio tab.
import { useState, useEffect, useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { decodeEventLog } from "viem";
import { Crown, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Workflow,
  WorkflowSteps,
  WorkflowStep,
  WorkflowContent,
  useWorkflow,
} from "@/components/ui/workflow";
import { SponsorStakingCard } from "@/components/sponsor/SponsorStakingCard";
import CreateSeasonForm from "@/components/admin/CreateSeasonForm";
import { AdminAuthProvider } from "@/context/AdminAuthContext";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useSponsorStaking } from "@/hooks/useSponsorStaking";
import { useRaffleWrite } from "@/hooks/useRaffleWrite";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getContractAddresses, RAFFLE_ABI } from "@/config/contracts";

/**
 * Inner workflow content — requires AdminAuthProvider above it.
 */
function WorkflowInner() {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const publicClient = usePublicClient();
  const { isAuthenticated, isLoading: isAuthLoading, error: authError, login } = useAdminAuth();
  const { isSponsor, isLoading: isSponsorLoading } = useSponsorStaking();
  const { createSeason } = useRaffleWrite();

  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);

  // Check on-chain canCreateSeason
  const { isLoading: isCanCreateLoading } = useQuery({
    queryKey: ["canCreateSeason", address, contracts.RAFFLE],
    queryFn: async () => {
      if (!publicClient || !contracts.RAFFLE) return false;
      try {
        return await publicClient.readContract({
          address: contracts.RAFFLE,
          abi: [{
            type: "function",
            name: "canCreateSeason",
            inputs: [{ name: "account", type: "address" }],
            outputs: [{ name: "", type: "bool" }],
            stateMutability: "view",
          }],
          functionName: "canCreateSeason",
          args: [address],
        });
      } catch {
        return false;
      }
    },
    enabled: !!address && !!publicClient,
  });

  // Chain time for CreateSeasonForm
  const chainTimeQuery = useQuery({
    queryKey: ["chainTime", netKey],
    queryFn: async () => {
      if (!publicClient) return null;
      const block = await publicClient.getBlock();
      return Number(block.timestamp);
    },
    refetchInterval: 10000,
  });

  // Workflow state
  const initialStep = isSponsor ? "create" : "stake";
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [createdSeasonId, setCreatedSeasonId] = useState(null);

  // If sponsor status loads and they're already a sponsor, jump to create
  useEffect(() => {
    if (!isSponsorLoading && isSponsor && currentStep === "stake") {
      setCurrentStep("create");
    }
  }, [isSponsor, isSponsorLoading, currentStep]);

  // Watch for season creation success
  useEffect(() => {
    if (!createSeason?.isConfirmed || !createSeason?.receipt) return;
    // Parse seasonId from SeasonCreated event
    const seasonLog = createSeason.receipt.logs.find((log) => {
      try {
        const decoded = decodeEventLog({
          abi: RAFFLE_ABI,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === "SeasonCreated";
      } catch {
        return false;
      }
    });
    if (seasonLog) {
      const decoded = decodeEventLog({
        abi: RAFFLE_ABI,
        data: seasonLog.data,
        topics: seasonLog.topics,
      });
      setCreatedSeasonId(Number(decoded.args.seasonId));
      setCurrentStep("confirm");
    }
  }, [createSeason?.isConfirmed, createSeason?.receipt]);

  // Handle step change with completion marking
  const handleStepChange = useCallback((newStep) => {
    setCurrentStep(newStep);
  }, []);

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            Create a Raffle
          </CardTitle>
          <CardDescription>Connect your wallet to create a raffle season.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isSponsorLoading || isCanCreateLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-muted-foreground">Checking permissions...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Workflow value={currentStep} onValueChange={handleStepChange}>
      <WorkflowSteps>
        <WorkflowStep value="stake" label="Become Sponsor" stepNumber={1} />
        <WorkflowStep value="create" label="Configure Season" stepNumber={2} />
        <WorkflowStep value="confirm" label="Done" stepNumber={3} />
      </WorkflowSteps>

      {/* Step 1: Sponsor Staking */}
      <WorkflowContent value="stake">
        <SponsorStakingCard />
        <StakeNav />
      </WorkflowContent>

      {/* Step 2: Create Season Form */}
      <WorkflowContent value="create">
        {!isAuthenticated ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-4">
              <p className="text-muted-foreground text-center">
                Sign a message with your wallet to authenticate for season creation.
              </p>
              <Button onClick={login} disabled={isAuthLoading} size="lg">
                {isAuthLoading ? "Signing..." : "Sign in to create seasons"}
              </Button>
              {authError && (
                <p className="text-sm text-destructive">{authError}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Configure Season</CardTitle>
              <CardDescription>Set up your raffle season parameters.</CardDescription>
            </CardHeader>
            <CardContent>
              <CreateSeasonForm
                createSeason={createSeason}
                chainTimeQuery={chainTimeQuery}
              />
            </CardContent>
          </Card>
        )}
      </WorkflowContent>

      {/* Step 3: Confirmation */}
      <WorkflowContent value="confirm">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <Crown className="h-6 w-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold">Season Created!</h3>
            <p className="text-muted-foreground">
              Your raffle season #{createdSeasonId} has been created successfully.
            </p>
            <Button
              onClick={() => navigate(`/raffles/${createdSeasonId}`)}
              className="mt-2"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Season
            </Button>
          </CardContent>
        </Card>
      </WorkflowContent>
    </Workflow>
  );
}

/**
 * Navigation for the Stake step — uses workflow context.
 */
function StakeNav() {
  const { isSponsor } = useSponsorStaking();
  const { goNext, markCompleted } = useWorkflow();

  const handleNext = useCallback(() => {
    markCompleted("stake");
    goNext();
  }, [markCompleted, goNext]);

  return (
    <div className="flex justify-end mt-4">
      <Button onClick={handleNext} disabled={!isSponsor} type="button">
        {isSponsor ? "Next: Configure Season" : "Complete staking to continue"}
      </Button>
    </div>
  );
}

/**
 * Public component — wraps with AdminAuthProvider.
 */
export function CreateSeasonWorkflow() {
  return (
    <AdminAuthProvider>
      <WorkflowInner />
    </AdminAuthProvider>
  );
}

export default CreateSeasonWorkflow;
