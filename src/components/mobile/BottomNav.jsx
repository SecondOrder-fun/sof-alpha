/* global __APP_VERSION__, __GIT_HASH__ */
/**
 * Bottom Navigation
 * Fixed 4-tab navigation footer for mobile interfaces
 */

import PropTypes from "prop-types";
import { useNavigate, useLocation } from "react-router-dom";
import { Ticket, TrendingUp, Wallet, Trophy } from "lucide-react";
import { useSafeArea } from "@/hooks/useSafeArea";

const tabs = [
  { id: "raffles", label: "Raffles", icon: Ticket, path: "/raffles" },
  { id: "infofi", label: "InfoFi", icon: TrendingUp, path: "/markets" },
  { id: "portfolio", label: "Portfolio", icon: Wallet, path: "/account" },
  { id: "ranking", label: "Ranking", icon: Trophy, path: "/users" },
];

export const BottomNav = ({ className = "" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const safeArea = useSafeArea();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.startsWith("/raffles") || path.startsWith("/raffle/"))
      return "raffles";
    if (path.startsWith("/markets") || path.startsWith("/market/"))
      return "infofi";
    if (path.startsWith("/account")) return "portfolio";
    if (path.startsWith("/users")) return "ranking";
    return "raffles";
  };

  const activeTab = getActiveTab();

  const version =
    typeof __APP_VERSION__ !== "undefined" &&
    typeof __GIT_HASH__ !== "undefined"
      ? `v${__APP_VERSION__}-${__GIT_HASH__}`
      : "dev";

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-[#130013] border-t border-[#6b6b6b]/20 ${className}`}
      style={{
        paddingBottom: `max(${safeArea.bottom}px, 8px)`,
      }}
    >
      <div className="max-w-screen-sm mx-auto">
        {/* Navigation Buttons */}
        <div className="grid grid-cols-4 gap-1.5 px-1.5 pt-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all ${
                  isActive
                    ? "bg-[#c82a54] text-white shadow-lg shadow-[#c82a54]/30 border border-white"
                    : "text-white hover:bg-white/10"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-tight">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Copyright and Version */}
        <div className="flex items-center justify-center gap-2 pt-2 pb-1">
          <p className="text-[9px] text-muted-foreground/70">
            &copy; {new Date().getFullYear()} SecondOrder.fun
          </p>
          <span className="text-[8px] text-muted-foreground/50">{version}</span>
        </div>
      </div>
    </nav>
  );
};

BottomNav.propTypes = {
  className: PropTypes.string,
};

export default BottomNav;
