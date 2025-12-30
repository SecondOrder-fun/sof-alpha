/**
 * Quantity Stepper
 * Numeric input with increment/decrement buttons
 */

import PropTypes from "prop-types";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const QuantityStepper = ({
  value,
  onChange,
  min = 1,
  max = Infinity,
  step = 1,
  className = "",
}) => {
  const handleIncrement = () => {
    const newValue = Math.min(value + step, max);
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(value - step, min);
    onChange(newValue);
  };

  const handleInputChange = (e) => {
    const newValue = parseInt(e.target.value) || min;
    const clampedValue = Math.max(min, Math.min(max, newValue));
    onChange(clampedValue);
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Button
        variant="outline"
        size="icon"
        onClick={handleDecrement}
        disabled={value <= min}
        className="h-12 w-12 border-[#6b6b6b] text-white hover:bg-[#6b6b6b]/20 disabled:opacity-30"
      >
        <Minus className="w-5 h-5" />
      </Button>

      <Input
        type="number"
        value={value}
        onChange={handleInputChange}
        min={min}
        max={max}
        className="flex-1 h-12 text-center text-white text-lg font-semibold bg-[#130013]/30 border-[#6b6b6b]"
      />

      <Button
        variant="outline"
        size="icon"
        onClick={handleIncrement}
        disabled={value >= max}
        className="h-12 w-12 border-[#6b6b6b] text-white hover:bg-[#6b6b6b]/20 disabled:opacity-30"
      >
        <Plus className="w-5 h-5" />
      </Button>
    </div>
  );
};

QuantityStepper.propTypes = {
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  className: PropTypes.string,
};

export default QuantityStepper;
