/**
 * Bottom Navigation
 * Fixed 4-tab navigation footer for mobile interfaces
 */

import PropTypes from "prop-types";
import { useNavigate, useLocation } from "react-router-dom";
import { Ticket, TrendingUp, Wallet, Trophy } from "lucide-react";
import { useSafeArea } from "../../hooks/useSafeArea";

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

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-[#130013] border-t border-[#6b6b6b]/20 ${className}`}
      style={{
        paddingBottom: `max(${safeArea.bottom}px, 8px)`,
      }}
    >
      <div className="flex items-center justify-around px-2 pt-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-1 px-3 py-2 min-w-[60px] transition-colors ${
                isActive ? "text-[#c82a54]" : "text-[#a89e99]"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

BottomNav.propTypes = {
  className: PropTypes.string,
};

export default BottomNav;
