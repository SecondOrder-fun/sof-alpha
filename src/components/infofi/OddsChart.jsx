// src/components/infofi/OddsChart.jsx
import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

/**
 * OddsChart Component
 * Displays odds over time for a prediction market
 * X-axis: Time (from market start to raffle season end)
 * Y-axis: Probability (0-100%)
 * Green line: YES odds
 * Red line: NO odds
 */
const OddsChart = ({ marketId }) => {
  const { t } = useTranslation("market");
  const [timeRange, setTimeRange] = React.useState("ALL");

  // Fetch historical odds data
  const {
    data: oddsHistory,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["oddsHistory", marketId, timeRange],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/infofi/markets/${marketId}/history?range=${timeRange}`
      );
      if (!response.ok) throw new Error("Failed to fetch odds history");
      return response.json();
    },
    enabled: !!marketId,
    retry: 1, // Only retry once
  });

  // Transform data for Recharts - NO MOCK DATA
  const chartData = React.useMemo(() => {
    if (!oddsHistory?.dataPoints || oddsHistory.dataPoints.length === 0) {
      return null; // Return null if no data available
    }

    return oddsHistory.dataPoints.map((point) => ({
      timestamp: new Date(point.timestamp).toISOString(),
      yes: point.yes_bps / 100, // Convert basis points to percentage
      no: point.no_bps / 100,
    }));
  }, [oddsHistory]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;

    const data = payload[0].payload;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs text-muted-foreground mb-2">
          {format(parseISO(data.timestamp), "MMM d, yyyy HH:mm")}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-emerald-600">
              {t("yes")}
            </span>
            <span className="text-sm font-bold text-emerald-600">
              {data.yes.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-rose-600">{t("no")}</span>
            <span className="text-sm font-bold text-rose-600">
              {data.no.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  CustomTooltip.propTypes = {
    active: PropTypes.bool,
    payload: PropTypes.array,
  };

  // Format X-axis labels
  const formatXAxis = (timestamp) => {
    try {
      const date = parseISO(timestamp);

      switch (timeRange) {
        case "1H":
        case "6H":
          return format(date, "HH:mm");
        case "1D":
          return format(date, "HH:mm");
        case "1W":
          return format(date, "MMM d");
        case "1M":
          return format(date, "MMM d");
        case "ALL":
        default:
          return format(date, "MMM");
      }
    } catch {
      return "";
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          {t("loadingChart")}
        </div>
      </div>
    );
  }

  // Show error message if data cannot be retrieved
  if (error || !chartData || chartData.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">
            {t("cannotRetrieveChartData")}
          </p>
          {error && <p className="text-xs text-red-500">{error.message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-emerald-500"></div>
              <span className="text-muted-foreground">{t("yes")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-rose-500"></div>
              <span className="text-muted-foreground">{t("no")}</span>
            </div>
          </div>
        </div>

        <Tabs value={timeRange} onValueChange={setTimeRange}>
          <TabsList className="h-8">
            <TabsTrigger value="1H" className="text-xs px-2">
              1H
            </TabsTrigger>
            <TabsTrigger value="6H" className="text-xs px-2">
              6H
            </TabsTrigger>
            <TabsTrigger value="1D" className="text-xs px-2">
              1D
            </TabsTrigger>
            <TabsTrigger value="1W" className="text-xs px-2">
              1W
            </TabsTrigger>
            <TabsTrigger value="1M" className="text-xs px-2">
              1M
            </TabsTrigger>
            <TabsTrigger value="ALL" className="text-xs px-2">
              {t("all")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Chart */}
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatXAxis}
              stroke="#9ca3af"
              style={{ fontSize: "12px" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickFormatter={(value) => `${value}%`}
              stroke="#9ca3af"
              style={{ fontSize: "12px" }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="yes"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="no"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

OddsChart.propTypes = {
  marketId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    .isRequired,
};

export default OddsChart;
