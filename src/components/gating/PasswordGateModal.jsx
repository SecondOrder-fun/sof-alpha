/**
 * PasswordGateModal
 * Prompts users to enter a password before participating in a gated raffle season.
 * Renders as a bottom Sheet on mobile/Farcaster, centered Dialog on desktop.
 */

import PropTypes from "prop-types";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, CheckCircle, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEASON_GATING_ABI } from "@/config/contracts";
import { buildFriendlyContractError } from "@/lib/contractErrors";
import { usePlatform } from "@/hooks/usePlatform";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (v: boolean) => void,
 *   seasonName: string,
 *   onVerify: (password: string) => Promise<string>,
 *   onVerified: () => void,
 * }} props
 */
export const PasswordGateModal = ({
  open,
  onOpenChange,
  seasonName,
  onVerify,
  onVerified,
}) => {
  const { t } = useTranslation(["common", "raffle"]);
  const { isMobile } = usePlatform();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!password.trim()) return;

      setStatus("loading");
      setErrorMsg("");

      try {
        await onVerify(password.trim());
        setStatus("success");

        // Auto-close after delay so user sees the success state
        setTimeout(() => {
          onOpenChange(false);
          setStatus("idle");
          setPassword("");
          onVerified?.();
        }, 2000);
      } catch (err) {
        setStatus("error");

        // Check for InvalidPassword custom error
        const msg = err?.message || "";
        if (msg.includes("InvalidPassword") || msg.includes("invalid password")) {
          setErrorMsg(
            t("raffle:incorrectPassword", {
              defaultValue: "Incorrect password. Please try again.",
            }),
          );
        } else if (msg.includes("AlreadyVerified")) {
          // Edge case: user is already verified
          setStatus("success");
          setTimeout(() => {
            onOpenChange(false);
            setStatus("idle");
            setPassword("");
            onVerified?.();
          }, 600);
          return;
        } else if (msg.includes("User rejected") || msg.includes("User denied")) {
          setErrorMsg(
            t("common:txRejected", {
              defaultValue: "Transaction was rejected.",
            }),
          );
        } else {
          setErrorMsg(
            buildFriendlyContractError(
              SEASON_GATING_ABI,
              err,
              t("common:txFailed", { defaultValue: "Transaction failed. Please try again." }),
            ),
          );
        }
      }
    },
    [password, onVerify, onOpenChange, onVerified, t],
  );

  const handleOpenChange = useCallback(
    (v) => {
      if (!v) {
        // Reset state on close
        setStatus("idle");
        setPassword("");
        setErrorMsg("");
      }
      onOpenChange(v);
    },
    [onOpenChange],
  );

  // Shared header content
  const headerContent = (
    <>
      <div className="flex items-center gap-2">
        <Lock className="w-5 h-5 text-primary" />
        {isMobile ? (
          <SheetTitle className="text-xl font-bold">
            {t("raffle:gatedSeason", { defaultValue: "Gated Season" })}
          </SheetTitle>
        ) : (
          <DialogTitle className="text-xl font-bold">
            {t("raffle:gatedSeason", { defaultValue: "Gated Season" })}
          </DialogTitle>
        )}
      </div>
      {isMobile ? (
        <SheetDescription className="text-sm text-muted-foreground mt-1">
          {seasonName
            ? t("raffle:gatedSeasonDescNamed", {
                defaultValue:
                  '"{{name}}" requires a password to participate.',
                name: seasonName,
              })
            : t("raffle:gatedSeasonDesc", {
                defaultValue:
                  "This season requires a password to participate.",
              })}
        </SheetDescription>
      ) : (
        <DialogDescription className="text-sm text-muted-foreground mt-1">
          {seasonName
            ? t("raffle:gatedSeasonDescNamed", {
                defaultValue:
                  '"{{name}}" requires a password to participate.',
                name: seasonName,
              })
            : t("raffle:gatedSeasonDesc", {
                defaultValue:
                  "This season requires a password to participate.",
              })}
        </DialogDescription>
      )}
    </>
  );

  // Shared body content
  const bodyContent = status === "success" ? (
    <div className="flex flex-col items-center gap-3 py-8">
      <CheckCircle className="w-12 h-12 text-green-500" />
      <p className="text-lg font-semibold">
        {t("raffle:verified", { defaultValue: "Verified!" })}
      </p>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="gate-password"
          className="text-sm font-medium mb-2 block text-muted-foreground"
        >
          {t("common:password", { defaultValue: "Password" })}
        </label>
        <Input
          id="gate-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("raffle:enterPassword", {
            defaultValue: "Enter the season password",
          })}
          disabled={status === "loading"}
          autoFocus
          className="bg-black/40 border-border"
        />
      </div>

      {status === "error" && errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!password.trim() || status === "loading"}
      >
        {status === "loading" ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("common:verifying", { defaultValue: "Verifying..." })}
          </span>
        ) : (
          t("common:submit", { defaultValue: "Submit" })
        )}
      </Button>
    </form>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="bg-background border-t-2 border-primary rounded-t-2xl !px-4 pb-8 w-full max-w-full overflow-x-hidden box-border"
        >
          <SheetHeader className="mb-6 min-w-0">
            {headerContent}
          </SheetHeader>
          <div className="min-w-0 overflow-hidden">
            {bodyContent}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-background border border-primary">
        <DialogHeader className="mb-6">
          {headerContent}
        </DialogHeader>
        {bodyContent}
      </DialogContent>
    </Dialog>
  );
};

PasswordGateModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
  seasonName: PropTypes.string,
  onVerify: PropTypes.func.isRequired,
  onVerified: PropTypes.func,
};

export default PasswordGateModal;
