// src/components/mobile/MobileClaimsTab.jsx
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

/**
 * MobileClaimsTab - Placeholder for future claims functionality
 */
const MobileClaimsTab = () => {
  const { t } = useTranslation(["account", "common"]);

  return (
    <div className="p-4 text-center">
      <div className="text-muted-foreground py-12">
        <p className="mb-2 text-lg">{t("common:comingSoon")}</p>
        <p className="text-sm">{t("account:claimsComingSoon")}</p>
      </div>
    </div>
  );
};

MobileClaimsTab.propTypes = {
  address: PropTypes.string,
};

export default MobileClaimsTab;
