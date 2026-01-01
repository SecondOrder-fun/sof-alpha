// src/components/mobile/SmartTabs.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { Tabs, TabsTrigger } from "@/components/ui/tabs";

/**
 * SmartTabsTrigger - Tab trigger with smart corner rounding
 * Corners are only rounded when not adjacent to the active tab
 */
const SmartTabsTrigger = ({ value, activeTab, position, children }) => {
  const isActive = value === activeTab;
  const activePosition = ["account", "balances", "claims"].indexOf(activeTab);

  // Determine which corners should be rounded
  let roundingClasses = "";

  if (isActive) {
    // Active tab: round all corners
    roundingClasses =
      "!rounded-tl-md !rounded-tr-md !rounded-bl-md !rounded-br-md";
  } else {
    // Inactive tab: check if there's another inactive tab next to it
    const hasInactiveLeft = position > 0 && position - 1 !== activePosition;
    const hasInactiveRight = position < 2 && position + 1 !== activePosition;

    if (hasInactiveLeft && hasInactiveRight) {
      // Middle inactive tab with inactive tabs on both sides
      roundingClasses =
        "!rounded-tl-none !rounded-tr-none !rounded-bl-none !rounded-br-none";
    } else if (hasInactiveLeft) {
      // Has inactive tab to the left, round right corners only
      roundingClasses =
        "!rounded-tl-none !rounded-tr-md !rounded-bl-none !rounded-br-md";
    } else if (hasInactiveRight) {
      // Has inactive tab to the right, round left corners only
      roundingClasses =
        "!rounded-tl-md !rounded-tr-none !rounded-bl-md !rounded-br-none";
    } else {
      // No adjacent inactive tabs: round all corners
      roundingClasses =
        "!rounded-tl-md !rounded-tr-md !rounded-bl-md !rounded-br-md";
    }
  }

  return (
    <TabsTrigger
      value={value}
      className={`${roundingClasses} ${position > 0 ? "-ml-[1px]" : ""}`}
    >
      {children}
    </TabsTrigger>
  );
};

SmartTabsTrigger.propTypes = {
  value: PropTypes.string.isRequired,
  activeTab: PropTypes.string.isRequired,
  position: PropTypes.number.isRequired,
  totalTabs: PropTypes.number.isRequired,
  children: PropTypes.node.isRequired,
};

/**
 * SmartTabs - Tabs component with smart corner rounding
 */
const SmartTabs = ({ defaultValue, children, className }) => {
  const [activeTab, setActiveTab] = useState(defaultValue);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className={className}>
      {typeof children === "function" ? children(activeTab) : children}
    </Tabs>
  );
};

SmartTabs.propTypes = {
  defaultValue: PropTypes.string.isRequired,
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
  className: PropTypes.string,
};

export { SmartTabs, SmartTabsTrigger };
export default SmartTabs;
