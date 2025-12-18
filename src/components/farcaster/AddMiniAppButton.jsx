/**
 * Farcaster Add Mini App Button
 * Only renders when running inside a Farcaster client (Warpcast, etc.)
 * Uses the Farcaster Frame SDK to prompt users to add the app
 */

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";

const AddMiniAppButton = ({
  className = "",
  onAdded,
  onError,
  showNotificationStatus = true,
}) => {
  const [sdk, setSdk] = useState(null);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [isInFarcasterClient, setIsInFarcasterClient] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load SDK and check if we're in a Farcaster client
  useEffect(() => {
    const loadSDK = async () => {
      try {
        // Dynamically import the SDK (correct package: @farcaster/miniapp-sdk)
        const miniappSdk = await import("@farcaster/miniapp-sdk");
        const sdkInstance = miniappSdk.sdk;
        setSdk(sdkInstance);

        // Check if we're in a Farcaster client by checking for context
        const context = await sdkInstance.context;

        if (context) {
          setIsInFarcasterClient(true);
          // Signal that the app is ready
          sdkInstance.actions.ready();
        }

        setIsSDKLoaded(true);
      } catch (err) {
        // SDK not available or not in Farcaster client
        setIsSDKLoaded(true);
        setIsInFarcasterClient(false);
      }
    };

    loadSDK();
  }, []);

  const handleAddApp = useCallback(async () => {
    if (!sdk || !isInFarcasterClient || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await sdk.actions.addMiniApp();

      if (result.added) {
        setIsAdded(true);

        if (result.notificationDetails) {
          setHasNotifications(true);
        }

        onAdded?.(result);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to add app";
      setError(errorMessage);
      onError?.(err);
    } finally {
      setIsLoading(false);
    }
  }, [sdk, isInFarcasterClient, isLoading, onAdded, onError]);

  // Don't render if not in Farcaster client or SDK not loaded
  if (!isSDKLoaded || !isInFarcasterClient) {
    return null;
  }

  // Already added
  if (isAdded) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-green-500">✓</span>
        <span className="text-sm" style={{ color: "#a89e99" }}>
          App Added
          {showNotificationStatus && hasNotifications && " • Notifications On"}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleAddApp}
      disabled={isLoading}
      className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${className}`}
      style={{
        backgroundColor: isLoading ? "#666" : "#c82a54",
        color: "#ffffff",
        cursor: isLoading ? "wait" : "pointer",
      }}
      onMouseOver={(e) =>
        !isLoading && (e.currentTarget.style.backgroundColor = "#e25167")
      }
      onMouseOut={(e) =>
        !isLoading && (e.currentTarget.style.backgroundColor = "#c82a54")
      }
    >
      {/* Farcaster icon */}
      <svg viewBox="0 0 1000 1000" className="w-5 h-5" fill="currentColor">
        <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
        <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
        <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
      </svg>
      <span>{isLoading ? "Adding..." : "Add to Farcaster"}</span>
      {error && <span className="text-red-400 text-xs ml-2">{error}</span>}
    </button>
  );
};

AddMiniAppButton.propTypes = {
  className: PropTypes.string,
  onAdded: PropTypes.func,
  onError: PropTypes.func,
  showNotificationStatus: PropTypes.bool,
};

export default AddMiniAppButton;
