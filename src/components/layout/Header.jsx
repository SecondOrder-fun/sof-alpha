// React import not needed with Vite JSX transform
import { Link, NavLink } from "react-router-dom";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTranslation } from "react-i18next";
import LanguageToggle from "@/components/common/LanguageToggle";
import { Globe } from "lucide-react";
import { useUsername } from "@/hooks/useUsername";
import { useAllowlist } from "@/hooks/useAllowlist";
import { ACCESS_LEVELS } from "@/config/accessLevels";
import { useRouteAccess } from "@/hooks/useRouteAccess";

const Header = () => {
  const { t } = useTranslation("navigation");
  const { address } = useAccount();
  const { data: username } = useUsername(address);
  const { accessLevel } = useAllowlist();
  const isAdmin = accessLevel >= ACCESS_LEVELS.ADMIN;

  const predictionMarketsToggle = useRouteAccess(
    "__feature__/prediction_markets",
    {
      enabled: !!address,
      resourceType: "feature",
      resourceId: "prediction_markets",
    },
  );

  const showPredictionMarkets =
    !predictionMarketsToggle.isDisabled && predictionMarketsToggle.hasAccess;

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
            {showPredictionMarkets ? (
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
            ) : null}
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

              const handleOpenConnect = () => {
                try {
                  if (typeof openConnectModal !== "function") {
                    // eslint-disable-next-line no-console
                    console.error(
                      "RainbowKit openConnectModal is not a function",
                    );
                    return;
                  }
                  openConnectModal();
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error("Failed to open connect modal", e);
                }
              };

              const handleOpenAccount = () => {
                try {
                  if (typeof openAccountModal !== "function") {
                    // eslint-disable-next-line no-console
                    console.error(
                      "RainbowKit openAccountModal is not a function",
                    );
                    return;
                  }
                  openAccountModal();
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error("Failed to open account modal", e);
                }
              };

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
                          onClick={handleOpenConnect}
                          type="button"
                          className="px-4 py-2 rounded-md transition-colors bg-[#c82a54] text-white hover:bg-[#e25167] active:bg-[#f9d6de]"
                        >
                          {t("connectWallet")}
                        </button>
                      );
                    }

                    return (
                      <button
                        onClick={handleOpenAccount}
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
