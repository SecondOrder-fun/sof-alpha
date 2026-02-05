// src/components/mobile/MobileAccountTab.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiCopy } from "react-icons/fi";
import { Card, CardContent } from "@/components/ui/card";
import UsernameEditor from "@/components/account/UsernameEditor";
import FaucetWidget from "@/components/faucet/FaucetWidget";

/**
 * MobileAccountTab - Mobile-optimized account information display
 */
const MobileAccountTab = ({ address, username }) => {
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation(["account", "common"]);

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
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-2">
            {t("account:username")}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base text-white">
              {username || t("account:notSet")}
            </span>
            <button
              type="button"
              onClick={() => setIsEditingUsername(!isEditingUsername)}
              className="p-0 text-primary hover:text-primary/80 active:text-primary/60 bg-transparent hover:bg-transparent active:bg-transparent border-none outline-none flex items-center justify-center"
              aria-label={
                isEditingUsername
                  ? t("account:cancelUsernameEdit")
                  : t("account:editUsername")
              }
              title={
                isEditingUsername
                  ? t("account:cancelUsernameEdit")
                  : t("account:editUsername")
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
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground">
              {t("account:address")}
            </div>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="p-1 text-primary hover:text-primary/80 active:text-primary/60 bg-transparent hover:bg-transparent active:bg-transparent border-none outline-none flex items-center justify-center"
              aria-label={t("common:copyToClipboard")}
              title={copied ? t("common:copied") : t("common:copyToClipboard")}
            >
              <FiCopy />
            </button>
          </div>
          <p className="font-mono text-xs break-all text-white">{address}</p>
          {copied && (
            <p className="text-xs text-green-600 mt-1">{t("common:copied")}</p>
          )}
        </CardContent>
      </Card>

      {/* SOF Faucet Widget - Temporary */}
      <FaucetWidget />

      {/* NFTs Section - Placeholder */}
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-2">NFTs</div>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-black/20">
            <p className="text-sm text-muted-foreground">NFT Gallery</p>
            <p className="text-xs text-muted-foreground mt-2">
              {t("account:nftGalleryComingSoon")}
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
