// src/components/airdrop/AirdropBanner.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { useAccount } from "wagmi";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAirdrop } from "@/hooks/useAirdrop";
import { useAppIdentity } from "@/hooks/useAppIdentity";

/**
 * AirdropBanner
 *
 * Shown to connected users who have not yet claimed their initial $SOF.
 * Fetches an EIP-712 attestation from the backend, then submits claimInitial().
 *
 * Hidden once dismissed (session-scoped) or after a successful claim.
 */
const AirdropBanner = () => {
  const { t } = useTranslation("airdrop");
  const { isConnected } = useAccount();
  const { fid } = useAppIdentity();

  const {
    hasClaimed,
    initialAmount,
    claimInitial,
    claimInitialState,
    resetInitialState,
  } = useAirdrop();

  const [dismissed, setDismissed] = useState(false);

  // Only render if wallet connected and user has not yet claimed
  if (!isConnected || hasClaimed || dismissed) return null;

  const { isPending, isSuccess, isError, error } = claimInitialState;

  const handleClaim = () => {
    claimInitial(fid ?? 0);
  };

  const handleDismiss = () => {
    resetInitialState();
    setDismissed(true);
  };

  const formattedAmount = initialAmount.toLocaleString();

  return (
    <Card className="border-primary bg-card mb-6">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-base mb-1">
              {t("welcomeTitle")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("welcomeMessage")}
            </p>

            {isSuccess ? (
              <p className="text-sm font-medium text-primary">
                {t("claimed")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleClaim}
                  disabled={isPending || isSuccess}
                  className="w-full sm:w-auto"
                >
                  {isPending
                    ? t("claiming")
                    : t("claimInitial", { amount: formattedAmount })}
                </Button>

                {isError && error && (
                  <p className="text-sm text-destructive">{t("claimError")}</p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t("dismiss")}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

AirdropBanner.propTypes = {};

export default AirdropBanner;
