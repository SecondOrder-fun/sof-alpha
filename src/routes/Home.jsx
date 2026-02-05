// src/routes/Home.jsx
// Platform-aware Home page:
// - Farcaster/Base App: Landing-style content (COMING SOON, Add App, social links)
// - Web: Welcome blurb with navigation CTAs

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Settings } from "lucide-react";

import MeltyLines from "@/components/backgrounds/MeltyLines";
import { usePlatform } from "@/hooks/usePlatform";
import AddMiniAppButton from "@/components/farcaster/AddMiniAppButton";
import LaunchAppButtons from "@/components/farcaster/LaunchAppButtons";
import StickyFooter from "@/components/layout/StickyFooter";
import AccessLevelSelector from "@/components/admin/AccessLevelSelector";
import { useAllowlist } from "@/hooks/useAllowlist";
import { ACCESS_LEVELS } from "@/config/accessLevels";

// ---------------------------------------------------------------------------
// Farcaster / Base App view
// ---------------------------------------------------------------------------
const FarcasterHome = () => {
  const { isAdmin } = useAllowlist();
  const [showAccessConfig, setShowAccessConfig] = useState(false);

  const [requiredAccessLevel, setRequiredAccessLevel] = useState(() => {
    const stored = localStorage.getItem("openAppAccessLevel");
    return stored ? parseInt(stored) : ACCESS_LEVELS.CONNECTED;
  });

  useEffect(() => {
    if (isAdmin()) {
      localStorage.setItem(
        "openAppAccessLevel",
        requiredAccessLevel.toString(),
      );
    }
  }, [requiredAccessLevel, isAdmin]);

  return (
    <div className="relative min-h-[80vh] bg-[#0d0d0d]">
      <MeltyLines />

      {/* Admin access-level toggle */}
      {isAdmin() && (
        <div className="relative z-10 px-4 pt-4">
          <button
            onClick={() => setShowAccessConfig(!showAccessConfig)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Configure Access Level"
          >
            <Settings className="w-5 h-5 text-[#a89e99] hover:text-white" />
          </button>

          {showAccessConfig && (
            <div className="mt-2 bg-[#1a1a1a] border border-[#c82a54] rounded-lg p-4">
              <h3 className="text-white font-semibold mb-2">
                Admin: Configure Required Access Level
              </h3>
              <p className="text-[#a89e99] text-sm mb-3">
                Set the minimum access level required to enter the app
              </p>
              <AccessLevelSelector
                currentLevel={requiredAccessLevel}
                onLevelChange={setRequiredAccessLevel}
              />
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <main className="relative z-10 flex items-center justify-center px-4 py-12">
        <div
          className="w-full max-w-2xl mx-auto p-8 rounded-lg"
          style={{
            backgroundColor: "rgba(20, 20, 20, 0.9)",
            border: "1px solid #c82a54",
            boxShadow: "0 0 30px rgba(200, 42, 84, 0.2)",
          }}
        >
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <img
              src="/images/logo.png"
              alt="SecondOrder.fun Logo"
              className="w-12 h-12"
            />
            <h1 className="text-2xl font-bold">
              <span className="text-white">Second</span>
              <span className="text-[#c82a54]">Order</span>
              <span className="text-[#a89e99]">.fun</span>
            </h1>
          </div>

          <h2
            className="text-2xl font-bold mb-6 tracking-widest"
            style={{ color: "#c82a54", fontFamily: "monospace" }}
          >
            COMING SOON
          </h2>

          <p
            className="mb-8 leading-relaxed"
            style={{ color: "#a89e99", fontFamily: "monospace" }}
          >
            SecondOrder.fun transforms memecoins from chaotic infinite games
            into structured, fair finite games. Join our community and be the
            first to know when we launch.
          </p>

          <h3
            className="text-lg font-semibold mb-6"
            style={{ color: "#e25167" }}
          >
            Memecoins without the hangover
          </h3>

          {/* Connect Wallet */}
          <div className="mb-6 flex justify-center">
            <ConnectButton />
          </div>

          {/* Add to Farcaster */}
          <div className="mb-6">
            <AddMiniAppButton
              promptText="Add the app for notifications from the Commissariat of Free Play"
              addedText="The Commissariat of Free Play will be issuing marching orders in the coming weeks."
            />
          </div>

          {/* Launch App Buttons */}
          <div className="mb-6">
            <LaunchAppButtons domain="secondorder.fun" />
          </div>

          {/* Social Links */}
          <div className="flex flex-col min-[400px]:flex-row items-center justify-center gap-2 pt-6 border-t border-[#333]">
            <a
              href="https://x.com/SecondOrderfun"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-md transition-all hover:bg-[#c82a54]/20"
              style={{ color: "#a89e99" }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="text-sm font-medium">@SecondOrderfun</span>
            </a>

            <a
              href="https://farcaster.xyz/secondorderfun"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-md transition-all hover:bg-[#c82a54]/20"
              style={{ color: "#a89e99" }}
            >
              <svg
                viewBox="0 0 1000 1000"
                className="w-5 h-5"
                fill="currentColor"
              >
                <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
                <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
                <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
              </svg>
              <span className="text-sm font-medium">@SecondOrderfun</span>
            </a>
          </div>
        </div>
      </main>

      <StickyFooter />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Web view
// ---------------------------------------------------------------------------
const WebHome = () => {
  const { t } = useTranslation("common");

  return (
    <div className="relative">
      <MeltyLines />

      <div className="relative z-10 flex items-center justify-center min-h-[45vh]">
        <div
          className="w-full max-w-4xl mx-auto px-8 py-12 rounded-lg text-center"
          style={{ backgroundColor: "rgba(128, 128, 128, 0.1)" }}
        >
          <h1 className="text-2xl font-semibold mb-4">{t("home.welcome")}</h1>
          <p className="text-muted-foreground leading-relaxed mb-8">
            {t("home.blurb")}
          </p>

          {/* Navigation CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/raffles"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-[#c82a54] text-white font-semibold hover:bg-[#a82248] transition-colors"
            >
              View Raffles
            </Link>
            <Link
              to="/markets"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-[#c82a54] text-[#c82a54] font-semibold hover:bg-[#c82a54]/10 transition-colors"
            >
              Explore Markets
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Home component – delegates to platform-specific view
// ---------------------------------------------------------------------------
const Home = () => {
  const { isFarcaster, isBaseApp } = usePlatform();

  if (isFarcaster || isBaseApp) {
    return <FarcasterHome />;
  }

  return <WebHome />;
};

export default Home;
