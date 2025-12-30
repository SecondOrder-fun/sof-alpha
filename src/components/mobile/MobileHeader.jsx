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
        {/* Logo + Branding */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#c82a54] flex items-center justify-center">
            <span className="text-white font-bold text-sm">SO</span>
          </div>
          <span className="text-white font-semibold text-sm">
            SecondOrder.fun
          </span>
        </Link>

        {/* User Profile */}
        <Link to="/account">
          <Avatar className="w-8 h-8 border-2 border-[#c82a54]/30">
            {profile.pfpUrl ? (
              <AvatarImage
                src={profile.pfpUrl}
                alt={profile.displayName || "User"}
              />
            ) : null}
            <AvatarFallback className="bg-[#6b6b6b] text-white">
              {profile.displayName ? (
                profile.displayName[0].toUpperCase()
              ) : (
                <User className="w-4 h-4" />
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
