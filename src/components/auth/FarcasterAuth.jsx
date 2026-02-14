import { useRef, useCallback, useState, useEffect } from "react";
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

  // Track whether user has initiated sign-in (to auto-poll once channel is ready)
  const [wantsToSignIn, setWantsToSignIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [debugError, setDebugError] = useState(null);

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
        setWantsToSignIn(false);
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
    },
    [verifyWithBackend, toast, t],
  );

  const handleError = useCallback(
    (error) => {
      const info = {
        type: typeof error,
        message: error?.message,
        str: String(error),
        keys: error && typeof error === "object" ? Object.keys(error) : [],
        json: (() => { try { return JSON.stringify(error); } catch { return "unstringifiable"; } })(),
      };
      setDebugError(info);
      toast({
        title: t("siwfError", "Authentication Error"),
        description: error?.message || error?.toString?.() || "Sign in failed",
        variant: "destructive",
      });
      setWantsToSignIn(false);
      setIsConnecting(false);
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
    qrCodeUri,
    isError,
    error: signInError,
    data: signInData,
    validSignature,
  } = useSignIn({
    nonce: nonceGetter,
    onSuccess: handleSuccess,
    onError: handleError,
    timeout: 300000,
    interval: 1500,
  });

  // Debug: capture state changes
  useEffect(() => {
    if (isError || signInData) {
      setDebugError((prev) => ({
        ...prev,
        isError,
        signInError: String(signInError),
        signInDataState: signInData?.state,
        signInDataFid: signInData?.fid,
        signInDataHasMsg: !!signInData?.message,
        signInDataHasSig: !!signInData?.signature,
        validSignature,
      }));
    }
  }, [isError, signInError, signInData, validSignature]);

  // Once the channel is created, start polling automatically
  useEffect(() => {
    if (wantsToSignIn && channelToken && !isPolling) {
      signIn();
      setIsConnecting(false);
    }
  }, [wantsToSignIn, channelToken, isPolling, signIn]);

  // Button click: create channel first, then polling starts via effect
  const handleSignInClick = useCallback(() => {
    setWantsToSignIn(true);
    setIsConnecting(true);
    if (isError) {
      reconnect();
    } else {
      connect();
    }
  }, [connect, reconnect, isError]);

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

  // Connecting state (creating channel)
  if (isConnecting && !isPolling) {
    return (
      <Button variant="farcaster" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("signInWithFarcaster", "Sign in with Farcaster")}
      </Button>
    );
  }

  // Polling state — QR code shown
  // Use url (shorter Warpcast deep link) instead of qrCodeUri to avoid
  // "Data too long" errors — Farcaster's qrCodeUri can exceed QR capacity.
  const qrValue = url || qrCodeUri;
  if (isPolling && qrValue) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {t("scanQrCode", "Scan with Warpcast to sign in")}
        </p>
        <div className="rounded-lg overflow-hidden bg-white p-3">
          <QRCodeSVG value={qrValue} size={200} level="L" />
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
    <div className="flex flex-col items-center gap-2">
      {debugError && (
        <pre className="text-xs text-destructive bg-muted p-2 rounded max-w-sm overflow-auto whitespace-pre-wrap">
          {JSON.stringify(debugError, null, 2)}
        </pre>
      )}
      <Button
        variant="farcaster"
        onClick={handleSignInClick}
      >
        {t("signInWithFarcaster", "Sign in with Farcaster")}
      </Button>
    </div>
  );
};

export default FarcasterAuth;
