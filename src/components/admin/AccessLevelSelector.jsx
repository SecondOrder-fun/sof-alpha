/**
 * Access Level Selector
 * Admin component to configure access requirements
 */

import { useState } from "react";
import PropTypes from "prop-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_DISPLAY_NAMES,
  ACCESS_LEVEL_DESCRIPTIONS,
} from "@/config/accessLevels";

export const AccessLevelSelector = ({
  currentLevel = ACCESS_LEVELS.ADMIN,
  onLevelChange,
  title = "Open App Access Level",
  description = "Configure who can access the application",
}) => {
  const [selectedLevel, setSelectedLevel] = useState(currentLevel.toString());

  const handleChange = (value) => {
    setSelectedLevel(value);
    if (onLevelChange) {
      onLevelChange(parseInt(value));
    }
  };

  return (
    <Card className="bg-[#1a1a1a] border-[#c82a54]/30">
      <CardHeader>
        <CardTitle className="text-white">{title}</CardTitle>
        <CardDescription className="text-[#a89e99]">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Select value={selectedLevel} onValueChange={handleChange}>
            <SelectTrigger className="w-full bg-[#130013] border-[#6b6b6b] text-white">
              <SelectValue placeholder="Select access level" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[#6b6b6b]">
              {Object.entries(ACCESS_LEVELS).map(([key, value]) => (
                <SelectItem
                  key={value}
                  value={value.toString()}
                  className="text-white hover:bg-[#c82a54]/20 focus:bg-[#c82a54]/20"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold">
                      {ACCESS_LEVEL_DISPLAY_NAMES[value]}
                    </span>
                    <span className="text-xs text-[#a89e99]">
                      {ACCESS_LEVEL_DESCRIPTIONS[value]}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="p-3 bg-[#130013] rounded-md border border-[#6b6b6b]/30">
            <p className="text-sm text-[#a89e99]">
              <span className="font-semibold text-white">Current Level: </span>
              {ACCESS_LEVEL_DISPLAY_NAMES[parseInt(selectedLevel)]}
            </p>
            <p className="text-xs text-[#a89e99] mt-1">
              {ACCESS_LEVEL_DESCRIPTIONS[parseInt(selectedLevel)]}
            </p>
          </div>

          <div className="text-xs text-[#a89e99] space-y-1">
            <p>
              <span className="font-semibold text-white">Note:</span> Changes
              take effect immediately.
            </p>
            <p>
              Access is checked against backend API and user&apos;s wallet/FID.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

AccessLevelSelector.propTypes = {
  currentLevel: PropTypes.number,
  onLevelChange: PropTypes.func,
  title: PropTypes.string,
  description: PropTypes.string,
};

export default AccessLevelSelector;
