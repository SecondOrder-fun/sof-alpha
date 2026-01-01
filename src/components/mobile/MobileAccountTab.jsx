// src/components/mobile/MobileAccountTab.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { FiEdit2, FiCopy } from "react-icons/fi";
import { Card, CardContent } from "@/components/ui/card";
import UsernameEditor from "@/components/account/UsernameEditor";

/**
 * MobileAccountTab - Mobile-optimized account information display
 */
const MobileAccountTab = ({ address, username }) => {
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3 mt-3">
      {/* Username Section */}
      <Card className="border-[#353e34] bg-[#130013]">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-2">Username</div>
          <div className="flex items-center gap-2">
            <span className="text-base text-white">
              {username || "Not set"}
            </span>
            <button
              type="button"
              onClick={() => setIsEditingUsername(!isEditingUsername)}
              className="p-0 text-[#c82a54] hover:text-[#e25167] active:text-[#f9d6de] bg-transparent hover:bg-transparent active:bg-transparent border-none outline-none flex items-center justify-center"
              aria-label={
                isEditingUsername ? "Cancel username edit" : "Edit username"
              }
              title={
                isEditingUsername ? "Cancel username edit" : "Edit username"
              }
            >
              <FiEdit2 />
            </button>
          </div>
          {isEditingUsername && (
            <div className="mt-3">
              <UsernameEditor
                address={address}
                currentUsername={username}
                onSuccess={() => setIsEditingUsername(false)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Address Section */}
      <Card className="border-[#353e34] bg-[#130013]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground">Address</div>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="p-1 text-[#c82a54] hover:text-[#e25167] active:text-[#f9d6de] bg-transparent hover:bg-transparent active:bg-transparent border-none outline-none flex items-center justify-center"
              aria-label="Copy address"
              title={copied ? "Copied!" : "Copy address"}
            >
              <FiCopy />
            </button>
          </div>
          <p className="font-mono text-xs break-all text-white">{address}</p>
          {copied && (
            <p className="text-xs text-green-600 mt-1">Address copied!</p>
          )}
        </CardContent>
      </Card>

      {/* NFTs Section - Placeholder */}
      <Card className="border-[#353e34] bg-[#130013]">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-2">NFTs</div>
          <div className="border-2 border-dashed border-[#353e34] rounded-lg p-6 text-center bg-black/20">
            <p className="text-sm text-muted-foreground">NFT Gallery</p>
            <p className="text-xs text-muted-foreground mt-2">
              Coming soon: View your SecondOrder.fun NFTs here
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

MobileAccountTab.propTypes = {
  address: PropTypes.string,
  username: PropTypes.string,
};

export default MobileAccountTab;
