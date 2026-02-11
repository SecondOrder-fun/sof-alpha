// src/components/curve/MiniCurveChart.jsx
import PropTypes from "prop-types";
import { useMemo } from "react";
import { formatUnits } from "viem";
import {
  AreaChart,
  Area,
  XAxis,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * MiniCurveChart
 * Responsive mini bonding curve visualization using Recharts.
 * Renders a stepped area chart that fills its container.
 */
const MiniCurveChart = ({ curveSupply, allBondSteps, currentStep }) => {
  const chartData = useMemo(() => {
    const steps = Array.isArray(allBondSteps) ? allBondSteps : [];
    if (steps.length === 0) return [];

    const pts = [];
    let prevX = 0n;
    for (const s of steps) {
      const x2 = BigInt(s?.rangeTo ?? 0);
      const price = Number(formatUnits(s?.price ?? 0n, 18));
      // Start of step segment
      pts.push({ supply: Number(prevX), price });
      // End of step segment
      pts.push({ supply: Number(x2), price });
      prevX = x2;
    }
    return pts;
  }, [allBondSteps]);

  const currentSupply = Number(curveSupply ?? 0n);

  // Find the price at current supply by walking the steps
  const priceAtSupply = useMemo(() => {
    const steps = Array.isArray(allBondSteps) ? allBondSteps : [];
    for (const s of steps) {
      if (currentSupply <= Number(BigInt(s?.rangeTo ?? 0))) {
        return Number(formatUnits(s?.price ?? 0n, 18));
      }
    }
    if (steps.length > 0) {
      return Number(formatUnits(steps[steps.length - 1]?.price ?? 0n, 18));
    }
    return 0;
  }, [allBondSteps, currentSupply]);

  if (chartData.length === 0) {
    return <Skeleton className="w-full h-full rounded-none" />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={chartData}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="hsl(var(--primary))"
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor="hsl(var(--primary))"
              stopOpacity={0.05}
            />
          </linearGradient>
        </defs>
        <XAxis dataKey="supply" type="number" hide />
        <Area
          type="stepAfter"
          dataKey="price"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#curveGradient)"
          isAnimationActive={false}
        />
        {currentSupply > 0 && (
          <ReferenceLine
            x={currentSupply}
            stroke="#f97316"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
        )}
        {currentSupply > 0 && priceAtSupply > 0 && (
          <ReferenceDot
            x={currentSupply}
            y={priceAtSupply}
            r={4}
            fill="#f97316"
            stroke="hsl(var(--background))"
            strokeWidth={2}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
};

MiniCurveChart.propTypes = {
  curveSupply: PropTypes.any,
  allBondSteps: PropTypes.array,
  currentStep: PropTypes.object,
};

export default MiniCurveChart;
