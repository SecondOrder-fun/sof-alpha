// src/components/sponsor/CreateSeasonWorkflow.jsx
// Shared 3-step create-season workflow: Stake → Create → Confirmation
// Used by both desktop /create-season route and mobile Portfolio tab.
import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useChainTime } from "@/hooks/useChainTime";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { decodeEventLog } from "viem";
import { ChevronLeft, ChevronRight, Crown, ExternalLink, Loader2 } from "lucide-react";
import PropTypes from "prop-types";
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
  const { t } = useTranslation("raffle");
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

  // Shared chain time hook (React Query cache keyed by netKey)
  const chainNow = useChainTime({ refetchInterval: 10_000 });
  const chainTimeQuery = { data: chainNow };

  // Workflow state
  const initialStep = isSponsor ? "details" : "stake";
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [createdSeasonId, setCreatedSeasonId] = useState(null);
  const hasAutoAdvanced = useRef(false);

  // If sponsor status loads and they're already a sponsor, jump to details (once)
  useEffect(() => {
    if (!isSponsorLoading && isSponsor && currentStep === "stake" && !hasAutoAdvanced.current) {
      hasAutoAdvanced.current = true;
      setCurrentStep("details");
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
            {t("createRaffleTitle")}
          </CardTitle>
          <CardDescription>{t("connectToCreate")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isSponsorLoading || isCanCreateLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-muted-foreground">{t("checkingPermissions")}</span>
        </CardContent>
      </Card>
    );
  }

  // Dynamic Step 1 label: "Manage Stake" if already a sponsor, else "Become Sponsor"
  const step1Label = isSponsor ? t("manageStake") : t("stepBecomeSponsor");

  // Map workflow step to form section
  const formSection = { details: "details", prizes: "prizes", curve: "curve" }[currentStep] || null;
  const isFormStep = !!formSection;

  return (
    <Workflow value={currentStep} onValueChange={handleStepChange}>
      <WorkflowSteps className="max-w-sm mx-auto">
        <WorkflowStep value="stake" label={step1Label} stepNumber={1} />
        <WorkflowStep value="details" label={t("sectionMainDetails")} stepNumber={2} />
        <WorkflowStep value="prizes" label={t("sectionPrizeSettings")} stepNumber={3} />
        <WorkflowStep value="curve" label={t("sectionBondingCurve")} stepNumber={4} />
        <WorkflowStep value="confirm" label={t("stepDone")} stepNumber={5} />
      </WorkflowSteps>

      {/* Step 1: Sponsor Staking */}
      <WorkflowContent value="stake">
        <SponsorStakingCard />
        <StakeNav />
      </WorkflowContent>

      {/* Steps 2-4: Form sections — auth gate or section content */}
      {["details", "prizes", "curve"].map((step) => (
        <WorkflowContent key={step} value={step}>
          {!isAuthenticated ? (
            <Card>
              <CardContent className="pt-6 flex flex-col items-center gap-4">
                <p className="text-muted-foreground text-center">
                  {t("signToCreate")}
                </p>
                <Button onClick={login} disabled={isAuthLoading} size="lg">
                  {isAuthLoading ? t("signing") : t("signInToCreate")}
                </Button>
                {authError && (
                  <p className="text-sm text-destructive">{authError}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </WorkflowContent>
      ))}

      {/* Persistent form — rendered once, always mounted while on a form step.
          activeSection controls which fields are visible. */}
      {isFormStep && isAuthenticated && (
        <Card>
          <CardContent className="pt-6">
            <CreateSeasonForm
              createSeason={createSeason}
              chainTimeQuery={chainTimeQuery}
              activeSection={formSection}
            />
          </CardContent>
        </Card>
      )}

      {/* Back / Next nav for form steps (details, prizes only — curve has submit) */}
      {isFormStep && (
        <FormStepNav step={currentStep} isAuthenticated={isAuthenticated} showNext={currentStep !== "curve"} />
      )}

      {/* Step 5: Confirmation */}
      <WorkflowContent value="confirm">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <Crown className="h-6 w-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold">{t("seasonCreated")}</h3>
            <p className="text-muted-foreground">
              {t("seasonCreatedMessage", { seasonId: createdSeasonId })}
            </p>
            <Button
              onClick={() => navigate(`/raffles/${createdSeasonId}`)}
              className="mt-2"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("viewSeason")}
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
  const { t } = useTranslation("raffle");
  const { isSponsor } = useSponsorStaking();
  const { goNext, markCompleted } = useWorkflow();

  // Mark stake as completed when user is already a sponsor
  useEffect(() => {
    if (isSponsor) markCompleted("stake");
  }, [isSponsor, markCompleted]);

  const handleNext = useCallback(() => {
    markCompleted("stake");
    goNext();
  }, [markCompleted, goNext]);

  return (
    <div className="flex justify-end mt-4">
      <Button onClick={handleNext} disabled={!isSponsor} type="button">
        {isSponsor ? t("nextConfigureSeason") : t("completeStakingToContinue")}
      </Button>
    </div>
  );
}

/**
 * Navigation for form steps — Back / Next buttons.
 * Uses workflow context to mark step completed and advance.
 */
function FormStepNav({ step, isAuthenticated, showNext = true }) {
  const { goBack, goNext, markCompleted } = useWorkflow();

  const handleNext = useCallback(() => {
    markCompleted(step);
    goNext();
  }, [markCompleted, goNext, step]);

  return (
    <div className="flex justify-between mt-4">
      <Button variant="outline" onClick={goBack} type="button">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {showNext && (
        <Button onClick={handleNext} disabled={!isAuthenticated} type="button">
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

FormStepNav.propTypes = {
  step: PropTypes.string.isRequired,
  isAuthenticated: PropTypes.bool,
  showNext: PropTypes.bool,
};

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
