// React import not needed with Vite JSX transform
import { Link, NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTranslation } from "react-i18next";
import LanguageToggle from "@/components/common/LanguageToggle";
import { useAccessControl } from "@/hooks/useAccessControl";
import { Globe } from "lucide-react";
import { useUsername } from "@/hooks/useUsername";

const Header = () => {
  const { t } = useTranslation("navigation");
  const { address, isConnected } = useAccount();
  const { data: username } = useUsername(address);
  const { hasRole } = useAccessControl();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      // DEFAULT_ADMIN_ROLE in OZ is 0x00...00
      const DEFAULT_ADMIN_ROLE =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      if (!isConnected || !address) {
        setIsAdmin(false);
        return;
      }
      try {
        const ok = await hasRole(DEFAULT_ADMIN_ROLE, address);
        if (!cancelled) setIsAdmin(Boolean(ok));
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, hasRole]);

  return (
    <header className="border-b bg-background text-foreground">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <Link to="/" className="text-2xl font-bold">
            <span className="text-white">Second</span>
            <span className="text-[#c82a54]">Order</span>
            <span className="text-[#a89e99]">.fun</span>
          </Link>
          <nav className="hidden md:flex space-x-6">
            <NavLink
              to="/raffles"
              className={({ isActive }) =>
                `transition-colors ${
                  isActive
                    ? "text-[#c82a54]"
                    : "text-[#a89e99] hover:text-[#e25167]"
                }`
              }
            >
              {t("raffles")}
            </NavLink>
            <NavLink
              to="/markets"
              className={({ isActive }) =>
                `transition-colors ${
                  isActive
                    ? "text-[#c82a54]"
                    : "text-[#a89e99] hover:text-[#e25167]"
                }`
              }
            >
              {t("predictionMarkets")}
            </NavLink>
            <NavLink
              to="/leaderboard"
              className={({ isActive }) =>
                `transition-colors ${
                  isActive
                    ? "text-[#c82a54]"
                    : "text-[#a89e99] hover:text-[#e25167]"
                }`
              }
            >
              {t("leaderboard")}
            </NavLink>
            {isAdmin && (
              <>
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `transition-colors ${
                      isActive
                        ? "text-[#c82a54]"
                        : "text-[#a89e99] hover:text-[#e25167]"
                    }`
                  }
                >
                  {t("admin")}
                </NavLink>
                <NavLink
                  to="/admin/localization"
                  className={({ isActive }) =>
                    `transition-colors ${
                      isActive
                        ? "text-[#c82a54]"
                        : "text-[#a89e99] hover:text-[#e25167]"
                    }`
                  }
                >
                  <span className="flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    Localization
                  </span>
                </NavLink>
              </>
            )}
            <NavLink
              to="/portfolio"
              className={({ isActive }) =>
                `transition-colors ${
                  isActive
                    ? "text-[#c82a54]"
                    : "text-[#a89e99] hover:text-[#e25167]"
                }`
              }
            >
              {t("portfolio")}
            </NavLink>
            <NavLink
              to="/faucet"
              className={({ isActive }) =>
                `transition-colors ${
                  isActive
                    ? "text-[#c82a54]"
                    : "text-[#a89e99] hover:text-[#e25167]"
                }`
              }
            >
              {t("betaFaucets")}
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center gap-2">
            {/* Wallet toolbar lives here (RainbowKit) */}
          </div>
          <LanguageToggle />
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openAccountModal,
              openConnectModal,
              mounted,
            }) => {
              const ready = mounted;
              const connected = ready && account && chain;

              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: {
                      opacity: 0,
                      pointerEvents: "none",
                      userSelect: "none",
                    },
                  })}
                >
                  {(() => {
                    if (!connected) {
                      return (
                        <button
                          onClick={openConnectModal}
                          type="button"
                          className="px-4 py-2 rounded-md transition-colors bg-[#c82a54] text-white hover:bg-[#e25167] active:bg-[#f9d6de]"
                        >
                          {t("connectWallet")}
                        </button>
                      );
                    }

                    return (
                      <button
                        onClick={openAccountModal}
                        type="button"
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors font-medium"
                      >
                        {username || account.displayName}
                      </button>
                    );
                  })()}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  );
};

export default Header;
