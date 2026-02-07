/**
 * SlippageSettings Component
 * Shared slippage tolerance configuration panel
 */

import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const SlippageSettings = ({
  slippagePct,
  onSlippageChange,
  onClose,
  variant = "desktop",
}) => {
  const { t } = useTranslation(["common"]);

  const presets = ["0", "1", "2"];

  // Desktop variant: dropdown/popover style
  if (variant === "desktop") {
    return (
      <div className="absolute right-0 top-8 z-10 w-64 border rounded-md bg-card p-3 shadow">
        <div className="text-sm font-medium mb-2">
          {t("common:slippage", { defaultValue: "Slippage tolerance" })}
        </div>
        <div className="text-xs text-muted-foreground mb-2">
          {t("common:slippageDescription", {
            defaultValue:
              "Maximum percentage you are willing to lose due to unfavorable price changes.",
          })}
        </div>
        <div className="flex gap-2 mb-2">
          {presets.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSlippageChange(preset)}
            >
              {preset}.0%
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={slippagePct}
            onChange={(e) => onSlippageChange(e.target.value)}
            className="w-24"
          />
          <Button type="button" size="sm" onClick={onClose}>
            {t("common:save")}
          </Button>
        </div>
      </div>
    );
  }

  // Mobile variant: inline panel style
  return (
    <div className="mb-6 bg-black/40 border border-border rounded-lg p-4">
      <div className="text-sm font-medium mb-2 text-white">
        {t("common:slippage", { defaultValue: "Slippage tolerance" })}
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        {t("common:slippageDescription", {
          defaultValue:
            "Maximum percentage you are willing to lose due to unfavorable price changes.",
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {presets.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSlippageChange(preset)}
            className="border-primary text-white hover:bg-primary"
          >
            {preset}.0%
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={slippagePct}
          onChange={(e) => onSlippageChange(e.target.value)}
          className="bg-black/60 border-border text-white"
          placeholder="1.0"
        />
        <Button
          type="button"
          size="sm"
          onClick={onClose}
          className="bg-primary hover:bg-primary/80 text-white"
        >
          {t("common:save", { defaultValue: "Save" })}
        </Button>
      </div>
    </div>
  );
};

SlippageSettings.propTypes = {
  slippagePct: PropTypes.string.isRequired,
  onSlippageChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(["desktop", "mobile"]),
};
