import { useRef, useCallback, useState, useEffect } from "react";
import { useSignIn } from "@farcaster/auth-kit";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

/**
 * Extracted SIWF (Sign In With Farcaster) state machine.
 *
 * Manages: nonce fetching, channel creation, QR polling, success/error
 * callbacks, and backend verification.
 *
 * Used by both LoginModal (inline QR view) and FarcasterAuth (standalone Dialog).
 *
 * @param {object} [opts]
 * @param {() => void} [opts.onSuccess] - called after successful backend verification
 * @param {() => void} [opts.onError]   - called on sign-in error
 */
export const useFarcasterSignIn = ({ onSuccess, onError } = {}) => {
  const { t } = useTranslation("auth");
  const { fetchNonce, verifyWithBackend, isVerifying } = useFarcaster();
  const { toast } = useToast();

  const [wantsToSignIn, setWantsToSignIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showQrView, setShowQrView] = useState(false);

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
        setShowQrView(false);
        return;
      }

      try {
        const { user } = await verifyWithBackend({ message, signature, nonce });
        toast({
          title: t("siwfSuccess", "Signed In"),
          description: `${t("welcome", "Welcome")}, ${user.displayName || user.username || `FID ${user.fid}`}!`,
        });
        onSuccess?.();
      } catch (err) {
        toast({
          title: t("siwfError", "Authentication Error"),
          description: err.message,
          variant: "destructive",
        });
      }
      setWantsToSignIn(false);
      setShowQrView(false);
    },
    [verifyWithBackend, toast, t, onSuccess],
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
      setShowQrView(false);
      onError?.();
    },
    [toast, t, onError],
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

  // Once the channel is created, start polling and show QR
  useEffect(() => {
    if (wantsToSignIn && channelToken && !isPolling) {
      signIn();
      setIsConnecting(false);
      setShowQrView(true);
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

  const handleCancel = useCallback(() => {
    setShowQrView(false);
    setWantsToSignIn(false);
  }, []);

  const isLoading = isVerifying || (isConnecting && !isPolling);

  return {
    handleSignInClick,
    handleCancel,
    signOut,
    isConnecting,
    isPolling,
    showQrView,
    url,
    isLoading,
  };
};
