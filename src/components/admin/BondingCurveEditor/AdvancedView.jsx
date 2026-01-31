// src/components/admin/BondingCurveEditor/AdvancedView.jsx
// Advanced table/card view for editing individual bond steps

import PropTypes from "prop-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, AlertCircle, PlusCircle } from "lucide-react";

const StepCard = ({
  step,
  index,
  prevRangeTo,
  isLast,
  maxTickets,
  onUpdate,
  onRemove,
  canRemove,
  validationError,
}) => {
  const ticketsInStep = step.rangeTo - prevRangeTo;

  return (
    <div className={`p-3 rounded-lg border ${validationError ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "bg-card"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            Step {index + 1}
          </Badge>
          {isLast && (
            <Badge variant="secondary" className="text-xs">
              Final
            </Badge>
          )}
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Range: {prevRangeTo.toLocaleString()} →
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={prevRangeTo + 1}
              max={isLast ? maxTickets : undefined}
              value={step.rangeTo}
              onChange={(e) => onUpdate("rangeTo", Number(e.target.value))}
              className="font-mono"
              disabled={isLast} // Last step must equal maxTickets
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              ({ticketsInStep.toLocaleString()} tickets)
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Price (SOF)</label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            value={step.price}
            onChange={(e) => onUpdate("price", Number(e.target.value))}
            className="font-mono"
          />
        </div>
      </div>

      {validationError && (
        <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          {validationError}
        </div>
      )}
    </div>
  );
};

StepCard.propTypes = {
  step: PropTypes.shape({
    rangeTo: PropTypes.number.isRequired,
    price: PropTypes.number.isRequired,
    priceScaled: PropTypes.string,
  }).isRequired,
  index: PropTypes.number.isRequired,
  prevRangeTo: PropTypes.number.isRequired,
  isLast: PropTypes.bool.isRequired,
  maxTickets: PropTypes.number.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  canRemove: PropTypes.bool.isRequired,
  validationError: PropTypes.string,
};

// Insert between button component
const InsertBetweenButton = ({ onClick, afterIndex }) => (
  <div className="flex items-center justify-center py-1">
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-6 px-2 text-xs text-muted-foreground hover:text-blue-600 hover:bg-blue-50 gap-1"
      title={`Insert step between ${afterIndex + 1} and ${afterIndex + 2}`}
    >
      <PlusCircle className="h-3 w-3" />
      <span>Insert between</span>
    </Button>
  </div>
);

InsertBetweenButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  afterIndex: PropTypes.number.isRequired,
};

const AdvancedView = ({
  steps,
  maxTickets,
  updateStep,
  addStep,
  removeStep,
  insertStepBetween,
  validationErrors,
}) => {
  // Build per-step validation error map
  const stepErrors = {};
  validationErrors.forEach((error) => {
    const match = error.match(/Step (\d+)/);
    if (match) {
      const stepNum = parseInt(match[1], 10);
      stepErrors[stepNum - 1] = error;
    }
  });

  return (
    <div className="space-y-3">
      {/* Global errors */}
      {validationErrors.filter((e) => !e.match(/Step \d+/)).length > 0 && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30">
          {validationErrors
            .filter((e) => !e.match(/Step \d+/))
            .map((error, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            ))}
        </div>
      )}

      {/* Step cards with insert buttons between */}
      <div className="space-y-0 max-h-[400px] overflow-y-auto pr-1">
        {steps.map((step, index) => (
          <div key={index}>
            <StepCard
              step={step}
              index={index}
              prevRangeTo={index === 0 ? 0 : steps[index - 1].rangeTo}
              isLast={index === steps.length - 1}
              maxTickets={maxTickets}
              onUpdate={(field, value) => updateStep(index, field, value)}
              onRemove={() => removeStep(index)}
              canRemove={steps.length > 1}
              validationError={stepErrors[index]}
            />
            {/* Insert between button (not after last step) */}
            {index < steps.length - 1 && (
              <InsertBetweenButton
                onClick={() => insertStepBetween(index)}
                afterIndex={index}
              />
            )}
          </div>
        ))}
      </div>

      {/* Add step button */}
      <Button
        type="button"
        variant="outline"
        onClick={addStep}
        className="w-full flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Step at End
      </Button>

      {/* Summary */}
      <div className="p-3 rounded-lg bg-muted/50 border text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Steps:</span>
          <span className="font-mono">{steps.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Price Range:</span>
          <span className="font-mono">
            {steps.length > 0 ? `${steps[0].price.toFixed(2)} → ${steps[steps.length - 1].price.toFixed(2)} SOF` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Tickets:</span>
          <span className="font-mono">
            {steps.length > 0 ? steps[steps.length - 1].rangeTo.toLocaleString() : 0}
          </span>
        </div>
      </div>
    </div>
  );
};

AdvancedView.propTypes = {
  steps: PropTypes.arrayOf(
    PropTypes.shape({
      rangeTo: PropTypes.number.isRequired,
      price: PropTypes.number.isRequired,
      priceScaled: PropTypes.string,
    })
  ).isRequired,
  maxTickets: PropTypes.number.isRequired,
  updateStep: PropTypes.func.isRequired,
  addStep: PropTypes.func.isRequired,
  removeStep: PropTypes.func.isRequired,
  insertStepBetween: PropTypes.func.isRequired,
  validationErrors: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default AdvancedView;
