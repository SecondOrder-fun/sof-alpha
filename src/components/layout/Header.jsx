// React import not needed with Vite JSX transform
import { Link, NavLink } from "react-router-dom";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTranslation } from "react-i18next";
import LanguageToggle from "@/components/common/LanguageToggle";
import { Globe, Sun, Moon, Monitor } from "lucide-react";
import { useUsername } from "@/hooks/useUsername";
import { useAllowlist } from "@/hooks/useAllowlist";
import { ACCESS_LEVELS } from "@/config/accessLevels";
import { useRouteAccess } from "@/hooks/useRouteAccess";
import { useTheme } from "@/context/ThemeContext";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Header = () => {
  const { t } = useTranslation("navigation");
  const { address } = useAccount();
  const { data: username } = useUsername(address);
  const { accessLevel } = useAllowlist();
  const isAdmin = accessLevel >= ACCESS_LEVELS.ADMIN;
  const { theme, setTheme } = useTheme();

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

  // Shared nav link styling
  const navLinkClass = ({ isActive }) =>
    `transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-primary"}`;

  return (
    <header className="border-b bg-background text-foreground">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <Link to="/" className="flex items-center gap-3 text-2xl font-bold">
            <img
              src="/images/logo.png"
              alt={t("brandName")}
              className="w-10 h-10"
            />
            <span>
              <span className="text-foreground">Second</span>
              <span className="text-primary">Order</span>
              <span className="text-muted-foreground">.fun</span>
            </span>
          </Link>
          <nav className="hidden md:flex space-x-6">
            <NavLink to="/raffles" className={navLinkClass}>
              {t("raffles")}
            </NavLink>
            {showPredictionMarkets ? (
              <NavLink to="/markets" className={navLinkClass}>
                {t("predictionMarkets")}
              </NavLink>
            ) : null}
            <NavLink to="/leaderboard" className={navLinkClass}>
              {t("leaderboard")}
            </NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin" className={navLinkClass}>
                  {t("admin")}
                </NavLink>
                <NavLink to="/admin/localization" className={navLinkClass}>
                  <span className="flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    Localization
                  </span>
                </NavLink>
              </>
            )}
            <NavLink to="/portfolio" className={navLinkClass}>
              {t("portfolio")}
            </NavLink>
            <NavLink to="/faucet" className={navLinkClass}>
              {t("betaFaucets")}
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center gap-2">
            {/* Wallet toolbar lives here (RainbowKit) */}
          </div>
          {/* Theme toggle */}
          <Tabs value={theme} onValueChange={setTheme} className="h-9">
            <TabsList className="h-8 p-0.5">
              <TabsTrigger value="light" className="h-7 px-2 text-xs no-underline">
                <Sun className="h-3.5 w-3.5" />
              </TabsTrigger>
              <TabsTrigger value="dark" className="h-7 px-2 text-xs no-underline">
                <Moon className="h-3.5 w-3.5" />
              </TabsTrigger>
              <TabsTrigger value="system" className="h-7 px-2 text-xs no-underline">
                <Monitor className="h-3.5 w-3.5" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
                          className="px-4 py-2 rounded-md transition-colors bg-primary text-primary-foreground hover:bg-primary/80 active:bg-muted"
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
