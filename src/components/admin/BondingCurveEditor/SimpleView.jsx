// src/components/admin/BondingCurveEditor/SimpleView.jsx
// Simple parameter-based view for linear bonding curves

import PropTypes from "prop-types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const SimpleView = ({
  maxTickets,
  numSteps,
  basePrice,
  priceDelta,
  isCustom,
  setMaxTickets,
  setNumSteps,
  setBasePrice,
  setPriceDelta,
  resetToLinear,
}) => {
  // Computed values for display
  const stepSize = numSteps > 0 ? Math.ceil(maxTickets / numSteps) : 0;
  const finalPrice = basePrice + (numSteps - 1) * priceDelta;

  return (
    <div className="space-y-4">
      {isCustom && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
              Custom Curve
            </Badge>
            <span className="text-sm text-amber-700 dark:text-amber-300">
              Curve has been manually edited
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetToLinear}
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Reset to Linear
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Max Tickets</label>
          <Input
            type="number"
            min={1}
            value={maxTickets}
            onChange={(e) => setMaxTickets(Number(e.target.value) || 1)}
            disabled={isCustom}
          />
          <p className="text-xs text-muted-foreground">
            Total ticket supply
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Number of Steps</label>
          <Input
            type="number"
            min={1}
            max={100}
            value={numSteps}
            onChange={(e) => setNumSteps(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            disabled={isCustom}
          />
          <p className="text-xs text-muted-foreground">
            {stepSize.toLocaleString()} tickets per step
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Initial Price (SOF)</label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            value={basePrice}
            onChange={(e) => setBasePrice(Number(e.target.value) || 0.01)}
            disabled={isCustom}
          />
          <p className="text-xs text-muted-foreground">
            Starting price per ticket
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Step Price Increase (SOF)</label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={priceDelta}
            onChange={(e) => setPriceDelta(Number(e.target.value) || 0)}
            disabled={isCustom}
          />
          <p className="text-xs text-muted-foreground">
            Price increase per step
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="p-3 rounded-lg bg-muted/50 border">
        <h4 className="text-sm font-medium mb-2">Curve Summary</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Price Range:</span>
            <p className="font-mono">
              {basePrice.toFixed(2)} → {finalPrice.toFixed(2)} SOF
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Tickets per Step:</span>
            <p className="font-mono">{stepSize.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total Steps:</span>
            <p className="font-mono">{numSteps}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

SimpleView.propTypes = {
  maxTickets: PropTypes.number.isRequired,
  numSteps: PropTypes.number.isRequired,
  basePrice: PropTypes.number.isRequired,
  priceDelta: PropTypes.number.isRequired,
  isCustom: PropTypes.bool.isRequired,
  setMaxTickets: PropTypes.func.isRequired,
  setNumSteps: PropTypes.func.isRequired,
  setBasePrice: PropTypes.func.isRequired,
  setPriceDelta: PropTypes.func.isRequired,
  resetToLinear: PropTypes.func.isRequired,
};

export default SimpleView;
