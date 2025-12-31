/**
 * Mobile Header
 * Simplified header with branding and user profile for mobile interfaces
 */

import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { User } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const MobileHeader = ({ className = "" }) => {
  const profile = useUserProfile();

  return (
    <header
      className={`sticky top-0 z-50 bg-[#130013] border-b border-[#6b6b6b]/20 ${className}`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        {/* Logo + Branding - matching landing page */}
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/images/logo.png"
            alt="SecondOrder.fun Logo"
            className="w-10 h-10"
          />
          <h1 className="text-lg font-bold">
            <span className="text-white">Second</span>
            <span className="text-[#c82a54]">Order</span>
            <span className="text-[#a89e99]">.fun</span>
          </h1>
        </Link>

        {/* User Profile */}
        <Link to="/account">
          <Avatar className="w-10 h-10 border-2 border-[#c82a54]">
            {profile.pfpUrl ? (
              <AvatarImage
                src={profile.pfpUrl}
                alt={profile.displayName || "User"}
              />
            ) : null}
            <AvatarFallback className="bg-[#1a1a1a] text-[#a89e99]">
              {profile.displayName ? (
                profile.displayName[0].toUpperCase()
              ) : (
                <User className="w-5 h-5" />
              )}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
};

MobileHeader.propTypes = {
  className: PropTypes.string,
};

export default MobileHeader;
