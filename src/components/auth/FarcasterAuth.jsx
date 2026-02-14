import { useRef, useCallback } from "react";
import { useSignIn } from "@farcaster/auth-kit";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const FarcasterAuth = () => {
  const { t } = useTranslation("auth");
  const {
    isBackendAuthenticated,
    backendUser,
    fetchNonce,
    verifyWithBackend,
    logout,
    isVerifying,
  } = useFarcaster();
  const { toast } = useToast();

  // Store nonce for use in onSuccess
  const nonceRef = useRef(null);

  const handleSuccess = useCallback(
    async (res) => {
      const { message, signature } = res;
      const nonce = nonceRef.current;

      if (!message || !signature || !nonce) {
        toast({
          title: t("siwfError", "Authentication Error"),
          description: "Missing SIWF response data",
          variant: "destructive",
        });
        return;
      }

      try {
        const { user } = await verifyWithBackend({ message, signature, nonce });
        toast({
          title: t("siwfSuccess", "Signed In"),
          description: `${t("welcome", "Welcome")}, ${user.displayName || user.username || `FID ${user.fid}`}!`,
        });
      } catch (err) {
        toast({
          title: t("siwfError", "Authentication Error"),
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [verifyWithBackend, toast, t],
  );

  const handleError = useCallback(
    (error) => {
      toast({
        title: t("siwfError", "Authentication Error"),
        description: error?.message || "Sign in failed",
        variant: "destructive",
      });
    },
    [toast, t],
  );

  const nonceGetter = useCallback(async () => {
    const nonce = await fetchNonce();
    nonceRef.current = nonce;
    return nonce;
  }, [fetchNonce]);

  const {
    signIn,
    signOut,
    isPolling,
    url,
    qrCodeUri,
    isError,
  } = useSignIn({
    nonce: nonceGetter,
    onSuccess: handleSuccess,
    onError: handleError,
    timeout: 300000,
    interval: 1500,
  });

  // Authenticated state — show profile + sign-out
  if (isBackendAuthenticated && backendUser) {
    return (
      <div className="flex items-center gap-3">
        {backendUser.pfpUrl && (
          <img
            src={backendUser.pfpUrl}
            alt={backendUser.displayName || backendUser.username || ""}
            className="w-8 h-8 rounded-full"
          />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            {backendUser.displayName || backendUser.username || `FID ${backendUser.fid}`}
          </span>
          {backendUser.username && (
            <span className="text-xs text-muted-foreground">
              @{backendUser.username}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            signOut();
            logout();
          }}
        >
          {t("farcasterSignOut", "Sign Out")}
        </Button>
      </div>
    );
  }

  // Verifying state
  if (isVerifying) {
    return (
      <Button variant="farcaster" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("siwfVerifying", "Verifying...")}
      </Button>
    );
  }

  // Polling state — QR code shown
  if (isPolling && qrCodeUri) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {t("scanQrCode", "Scan with Warpcast to sign in")}
        </p>
        <div className="rounded-lg overflow-hidden bg-white p-3">
          <QRCodeSVG value={qrCodeUri} size={200} />
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline"
          >
            {t("openInWarpcast", "Open in Warpcast")}
          </a>
        )}
      </div>
    );
  }

  // Default: sign-in button
  return (
    <Button
      variant="farcaster"
      onClick={signIn}
      disabled={isError}
    >
      {t("signInWithFarcaster", "Sign in with Farcaster")}
    </Button>
  );
};

export default FarcasterAuth;
