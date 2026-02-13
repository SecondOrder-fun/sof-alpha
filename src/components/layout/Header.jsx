// React import not needed with Vite JSX transform
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTranslation } from "react-i18next";
import { ChevronDown, Ticket, User, Crown } from "lucide-react";
import LanguageToggle from "@/components/common/LanguageToggle";
import SettingsMenu from "@/components/common/SettingsMenu";
import { useUsername } from "@/hooks/useUsername";
import { useAllowlist } from "@/hooks/useAllowlist";
import { ACCESS_LEVELS } from "@/config/accessLevels";
import { useRouteAccess } from "@/hooks/useRouteAccess";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const { t } = useTranslation("navigation");
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: username } = useUsername(address);
  const { accessLevel } = useAllowlist();
  const isAdmin = accessLevel >= ACCESS_LEVELS.ADMIN;
  const navigate = useNavigate();
  const location = useLocation();
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

  // Raffles dropdown active state
  const isRafflesActive =
    location.pathname.startsWith("/raffles") ||
    location.pathname.startsWith("/create-season");

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
          <nav className="hidden md:flex space-x-6 items-center">
            {/* Raffles Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span
                  role="button"
                  tabIndex={0}
                  className={`transition-colors inline-flex items-center gap-1 cursor-pointer outline-none ${
                    isRafflesActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {t("raffles")}
                  <ChevronDown className="h-3 w-3" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => navigate("/raffles")}
                  className="cursor-pointer"
                >
                  <Ticket className="mr-2 h-4 w-4" />
                  {t("browseRaffles")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => navigate("/raffles?filter=mine")}
                  className="cursor-pointer"
                >
                  <User className="mr-2 h-4 w-4" />
                  {t("myRaffles")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => navigate("/create-season")}
                  className="cursor-pointer"
                >
                  <Crown className="mr-2 h-4 w-4" />
                  {t("createRaffle")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {showPredictionMarkets ? (
              <NavLink to="/markets" className={navLinkClass}>
                {t("predictionMarkets")}
              </NavLink>
            ) : null}
            <NavLink to="/leaderboard" className={navLinkClass}>
              {t("leaderboard")}
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                {t("admin")}
              </NavLink>
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
          <ConnectButton.Custom>
            {({
              account,
              chain,
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

              return (
                <div
                  className="flex items-center space-x-4"
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
                        <>
                          <LanguageToggle />
                          <button
                            onClick={handleOpenConnect}
                            type="button"
                            className="px-4 py-2 rounded-md transition-colors bg-primary text-primary-foreground hover:bg-primary/80 active:bg-muted"
                          >
                            {t("connectWallet")}
                          </button>
                        </>
                      );
                    }

                    return (
                      <SettingsMenu
                        address={address}
                        username={username}
                        onDisconnect={disconnect}
                      />
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
