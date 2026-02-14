import { useRef, useCallback, useState, useEffect } from "react";
import { useSignIn } from "@farcaster/auth-kit";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, X } from "lucide-react";

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

  const [wantsToSignIn, setWantsToSignIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);

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
        setWantsToSignIn(false);
        setShowQrDialog(false);
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
      setWantsToSignIn(false);
      setShowQrDialog(false);
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
      setWantsToSignIn(false);
      setIsConnecting(false);
      setShowQrDialog(false);
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
    connect,
    reconnect,
    isPolling,
    channelToken,
    url,
    isError,
  } = useSignIn({
    nonce: nonceGetter,
    onSuccess: handleSuccess,
    onError: handleError,
    timeout: 300000,
    interval: 1500,
  });

  // Once the channel is created, start polling and show dialog
  useEffect(() => {
    if (wantsToSignIn && channelToken && !isPolling) {
      signIn();
      setIsConnecting(false);
      setShowQrDialog(true);
    }
  }, [wantsToSignIn, channelToken, isPolling, signIn]);

  const handleSignInClick = useCallback(() => {
    setWantsToSignIn(true);
    setIsConnecting(true);
    if (isError) {
      reconnect();
    } else {
      connect();
    }
  }, [connect, reconnect, isError]);

  const handleDialogClose = useCallback(() => {
    setShowQrDialog(false);
    setWantsToSignIn(false);
  }, []);

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

  // Button label depends on state
  const isLoading = isVerifying || (isConnecting && !isPolling);
  const buttonLabel = isVerifying
    ? t("siwfVerifying", "Verifying...")
    : t("signInWithFarcaster", "Sign in with Farcaster");

  return (
    <>
      <Button
        variant="farcaster"
        onClick={handleSignInClick}
        disabled={isLoading}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {buttonLabel}
      </Button>

      <Dialog open={showQrDialog} onOpenChange={handleDialogClose}>
        <DialogContent className="bg-background border border-primary max-w-sm">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {t("signInWithFarcaster", "Log in with Farcaster")}
              </DialogTitle>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={handleDialogClose}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            {url ? (
              <>
                <div className="rounded-lg overflow-hidden bg-white p-3">
                  <QRCodeSVG value={url} size={220} level="L" />
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline"
                >
                  {t("openInFarcaster", "Open in Farcaster")}
                </a>
              </>
            ) : (
              <div className="flex items-center justify-center h-[220px] w-[220px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <DialogDescription className="text-center">
            {t(
              "scanQrCodeDescription",
              "Scan this QR code with the camera on a smartphone that has Farcaster installed and logged in with the account you want to use.",
            )}
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FarcasterAuth;
