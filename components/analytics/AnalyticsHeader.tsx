"use client";

import { useMemo } from "react";
import { RefreshCcw } from "lucide-react";
import { useAnalyticsData } from "@/components/analytics/AnalyticsDataProvider";

const TIME_RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "all", label: "All Time" },
] as const;

export default function AnalyticsHeader() {
  const {
    loading,
    region,
    timeRange,
    availableRegions,
    refresh,
    setRegion,
    setTimeRange,
  } = useAnalyticsData();

  const regionOptions = useMemo(() => {
    return ["all", ...availableRegions.filter((item) => item.trim().length > 0)];
  }, [availableRegions]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
      <select
        value={timeRange}
        onChange={(event) => setTimeRange(event.target.value as "7d" | "30d" | "90d" | "all")}
        className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {TIME_RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={region}
        onChange={(event) => setRegion(event.target.value)}
        className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {regionOptions.map((option) => (
          <option key={option} value={option}>
            {option === "all" ? "All Regions" : option}
          </option>
        ))}
      </select>

      <button
        onClick={() => {
          void refresh();
        }}
        className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
        disabled={loading}
      >
        <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
        Refresh
      </button>
    </div>
  );
}