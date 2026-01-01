// src/components/mobile/MobileClaimsTab.jsx
import PropTypes from "prop-types";

/**
 * MobileClaimsTab - Placeholder for future claims functionality
 */
const MobileClaimsTab = () => {
  return (
    <div className="p-4 text-center">
      <div className="text-muted-foreground py-12">
        <p className="mb-2 text-lg">Claims functionality coming soon</p>
        <p className="text-sm">
          Check back later to claim your prizes and rewards
        </p>
      </div>
    </div>
  );
};

MobileClaimsTab.propTypes = {
  address: PropTypes.string,
};

export default MobileClaimsTab;
