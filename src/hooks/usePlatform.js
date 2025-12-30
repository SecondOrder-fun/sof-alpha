/**
 * Platform Detection Hook
 * Detects whether the app is running in:
 * - Web (desktop/mobile browser)
 * - Farcaster Mini App
 * - Base App (dApp browser)
 */

import { useState, useEffect } from "react";
import { useFarcasterSDK } from "./useFarcasterSDK";
import { useSupportsBaseApp } from "./useIsMobile";

export const PLATFORMS = {
  WEB: "web",
  FARCASTER: "farcaster",
  BASE_APP: "base_app",
};

export const usePlatform = () => {
  const { isInFarcasterClient, isSDKLoaded } = useFarcasterSDK();
  const supportsBaseApp = useSupportsBaseApp();
  const [platform, setPlatform] = useState(PLATFORMS.WEB);

  useEffect(() => {
    if (!isSDKLoaded) return;

    // Priority: Farcaster > Base App > Web
    if (isInFarcasterClient) {
      setPlatform(PLATFORMS.FARCASTER);
    } else if (supportsBaseApp) {
      // Check if we're in a dApp browser
      const isInDappBrowser =
        typeof window !== "undefined" &&
        (window.ethereum !== undefined || window.coinbaseWallet !== undefined);

      if (isInDappBrowser) {
        setPlatform(PLATFORMS.BASE_APP);
      } else {
        setPlatform(PLATFORMS.WEB);
      }
    } else {
      setPlatform(PLATFORMS.WEB);
    }
  }, [isInFarcasterClient, isSDKLoaded, supportsBaseApp]);

  return {
    platform,
    isWeb: platform === PLATFORMS.WEB,
    isFarcaster: platform === PLATFORMS.FARCASTER,
    isBaseApp: platform === PLATFORMS.BASE_APP,
    isMobile:
      platform === PLATFORMS.FARCASTER || platform === PLATFORMS.BASE_APP,
  };
};

export default usePlatform;
