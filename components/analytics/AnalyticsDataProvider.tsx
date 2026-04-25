"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAnalyticsDashboardData } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

export type DashboardTimeRange = "7d" | "30d" | "90d" | "all";

export type AnalyticsPerformanceStat = {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: string;
};

export type AnalyticsRouteEfficiency = {
  labels: string[];
  values: number[];
  currentRate: number;
  average: number;
  highest: number;
  changePercent: number;
};

export type AnalyticsParcelDemand = {
  heatmap: number[][];
  days: string[];
  hours: string[];
  peakText: string;
};

export type AnalyticsRiderPerformanceRow = {
  id: string;
  rank: number;
  name: string;
  deliveries: number;
  revenue: number;
  efficiency: number;
  rating: number;
};

export type AnalyticsCostBreakdownRow = {
  label: string;
  value: number;
  percentage: number;
  color: string;
};

export type AnalyticsRegionProfitRow = {
  label: string;
  value: number;
  revenue: number;
  trend: string;
  trendDirection: "up" | "down";
};

export type AnalyticsRiskAlertRow = {
  label: string;
  value: number;
  context: string;
  level: "critical" | "warning" | "info";
  icon: "clock" | "alert-triangle" | "trending-down" | "alert-circle";
  action: string;
};

export type AnalyticsDashboardData = {
  performanceOverview: AnalyticsPerformanceStat[];
  routeEfficiency: AnalyticsRouteEfficiency;
  parcelDemand: AnalyticsParcelDemand;
  riderPerformance: AnalyticsRiderPerformanceRow[];
  costBreakdown: AnalyticsCostBreakdownRow[];
  profitabilityByRegion: AnalyticsRegionProfitRow[];
  totalRegionalRevenue: number;
  riskAlerts: AnalyticsRiskAlertRow[];
  meta: {
    usesEstimatedCosts: boolean;
    selectedTimeRange?: DashboardTimeRange;
    selectedRegion?: string;
    availableRegions?: string[];
  };
};

const DEFAULT_PERFORMANCE: AnalyticsPerformanceStat[] = [
  { label: "Total Deliveries", value: "0", change: "0%", trend: "up", icon: "Total\nDeliveries" },
  { label: "Optimized Rate", value: "0%", change: "0%", trend: "up", icon: "Optimized\nRate" },
  { label: "Avg Delivery Time", value: "0 min", change: "0%", trend: "down", icon: "Avg Delivery\nTime" },
  { label: "Revenue", value: "$0.0k", change: "0%", trend: "up", icon: "Revenue" },
  { label: "Cost per Route", value: "$0.00", change: "0%", trend: "down", icon: "Cost per\nRoute" },
  { label: "Avg Stops", value: "0.0", change: "0%", trend: "up", icon: "Avg Stops" },
];

export const DEFAULT_ANALYTICS_DASHBOARD_DATA: AnalyticsDashboardData = {
  performanceOverview: DEFAULT_PERFORMANCE,
  routeEfficiency: {
    labels: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"],
    values: [0, 0, 0, 0, 0],
    currentRate: 0,
    average: 0,
    highest: 0,
    changePercent: 0,
  },
  parcelDemand: {
    heatmap: Array.from({ length: 5 }, () => Array.from({ length: 7 }, () => 0)),
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    hours: ["8AM", "12PM", "4PM", "8PM", "12AM"],
    peakText: "No peak data yet",
  },
  riderPerformance: [],
  costBreakdown: [
    { label: "Fuel", value: 0, percentage: 0, color: "#3B82F6" },
    { label: "Maintenance", value: 0, percentage: 0, color: "#8B5CF6" },
    { label: "Labor", value: 0, percentage: 0, color: "#EC4899" },
    { label: "Operations", value: 0, percentage: 0, color: "#F59E0B" },
  ],
  profitabilityByRegion: [],
  totalRegionalRevenue: 0,
  riskAlerts: [
    {
      label: "Delayed Routes",
      value: 0,
      context: "this week",
      level: "info",
      icon: "clock",
      action: "Review Routes",
    },
    {
      label: "Failed Deliveries",
      value: 0,
      context: "this month",
      level: "info",
      icon: "alert-triangle",
      action: "Investigate",
    },
    {
      label: "Capacity Issues",
      value: 0,
      context: "live load",
      level: "info",
      icon: "trending-down",
      action: "Optimize",
    },
    {
      label: "Rider No-Shows",
      value: 0,
      context: "live status",
      level: "info",
      icon: "alert-circle",
      action: "Follow Up",
    },
  ],
  meta: {
    usesEstimatedCosts: true,
    selectedTimeRange: "30d",
    selectedRegion: "all",
    availableRegions: [],
  },
};

type AnalyticsDataContextValue = {
  data: AnalyticsDashboardData;
  loading: boolean;
  error: string | null;
  timeRange: DashboardTimeRange;
  region: string;
  availableRegions: string[];
  setTimeRange: (next: DashboardTimeRange) => void;
  setRegion: (next: string) => void;
  refresh: () => Promise<void>;
};

const AnalyticsDataContext = createContext<AnalyticsDataContextValue | null>(null);

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatSignedPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Number(safe.toFixed(1));
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded}%`;
  return "0%";
}

export function AnalyticsDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AnalyticsDashboardData>(DEFAULT_ANALYTICS_DASHBOARD_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("30d");
  const [region, setRegion] = useState<string>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = (await getAnalyticsDashboardData(undefined, {
        timeRange,
        region,
      })) as AnalyticsDashboardData | null;
      if (result) {
        setData(result);
      } else {
        setData(DEFAULT_ANALYTICS_DASHBOARD_DATA);
      }
    } catch (loadError) {
      console.error("[Analytics] Failed to load analytics dashboard data:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Failed to load analytics data.");
      setData(DEFAULT_ANALYTICS_DASHBOARD_DATA);
    } finally {
      setLoading(false);
    }
  }, [region, timeRange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`analytics-dashboard-live-${timeRange}-${region}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analytics" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parcel_lists" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "violations" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, region, timeRange]);

  const contextValue = useMemo(
    () => ({
      data,
      loading,
      error,
      timeRange,
      region,
      availableRegions: Array.isArray(data.meta?.availableRegions) ? data.meta.availableRegions : [],
      setTimeRange,
      setRegion,
      refresh,
    }),
    [data, loading, error, refresh, region, timeRange]
  );

  return <AnalyticsDataContext.Provider value={contextValue}>{children}</AnalyticsDataContext.Provider>;
}

export function useAnalyticsData() {
  const context = useContext(AnalyticsDataContext);
  if (!context) {
    throw new Error("useAnalyticsData must be used inside AnalyticsDataProvider");
  }
  return context;
}
