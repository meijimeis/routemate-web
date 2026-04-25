"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createFinanceBillingEntry,
  createFinanceCostEntry,
  createFinancePayoutEntry,
  getFinanceDashboardData,
} from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

export type DashboardTimeRange = "7d" | "30d" | "90d" | "all";

type FinanceOverviewData = {
  totalRevenue: number;
  netProfit: number;
  avgCostPerRoute: number;
  revenueTrendPercent: number;
  netProfitTrendPercent: number;
  avgCostTrendPercent: number;
};

type FinanceCostBreakdownRow = {
  label: string;
  amount: number;
  percent: number;
  colorClass: string;
};

type FinanceRouteProfitData = {
  labels: string[];
  revenue: number[];
  costs: number[];
  latestRevenue: number;
  latestCost: number;
  latestProfit: number;
};

type FinancePayoutRow = {
  label: string;
  amount: number;
};

type FinanceRiderEarningRow = {
  id: string;
  riderName: string;
  distanceKm: number;
  cost: number;
  revenue: number;
};

type FinanceFuelEfficiencyData = {
  kmPerLiter: number | null;
  totalDistanceKm: number;
  fuelLiters: number;
};

type FinanceTrendBar = {
  label: string;
  amount: number;
  percent: number;
};

type FinanceTrendsData = {
  bars: FinanceTrendBar[];
  weeklyGrowthPercent: number;
  bestDay: string;
};

type FinanceBillingRow = {
  id: string;
  client: string;
  amount: number;
  status: "Paid" | "Pending" | "Overdue";
};

type FinanceBillingStatusData = {
  rows: FinanceBillingRow[];
  totalReceivables: number;
};

type FinanceMeta = {
  usesEstimatedCosts: boolean;
  selectedTimeRange?: DashboardTimeRange;
  selectedRegion?: string;
  availableRegions?: string[];
};

export type FinanceDashboardData = {
  overview: FinanceOverviewData;
  costBreakdown: FinanceCostBreakdownRow[];
  routeProfit: FinanceRouteProfitData;
  riderPayouts: FinancePayoutRow[];
  riderEarnings: FinanceRiderEarningRow[];
  fuelEfficiency: FinanceFuelEfficiencyData;
  trends: FinanceTrendsData;
  billingStatus: FinanceBillingStatusData;
  meta: FinanceMeta;
};

export const DEFAULT_FINANCE_DASHBOARD_DATA: FinanceDashboardData = {
  overview: {
    totalRevenue: 0,
    netProfit: 0,
    avgCostPerRoute: 0,
    revenueTrendPercent: 0,
    netProfitTrendPercent: 0,
    avgCostTrendPercent: 0,
  },
  costBreakdown: [
    { label: "Fuel", amount: 0, percent: 0, colorClass: "bg-[#8B5CF6]" },
    { label: "Maintenance", amount: 0, percent: 0, colorClass: "bg-[#22C55E]" },
    { label: "Insurance", amount: 0, percent: 0, colorClass: "bg-[#60A5FA]" },
    { label: "Other", amount: 0, percent: 0, colorClass: "bg-[#F472B6]" },
  ],
  routeProfit: {
    labels: ["--", "--", "--"],
    revenue: [0, 0, 0],
    costs: [0, 0, 0],
    latestRevenue: 0,
    latestCost: 0,
    latestProfit: 0,
  },
  riderPayouts: [
    { label: "Base Pay", amount: 0 },
    { label: "Incentives", amount: 0 },
    { label: "Overtime", amount: 0 },
  ],
  riderEarnings: [],
  fuelEfficiency: {
    kmPerLiter: null,
    totalDistanceKm: 0,
    fuelLiters: 0,
  },
  trends: {
    bars: [
      { label: "Mon", amount: 0, percent: 0 },
      { label: "Tue", amount: 0, percent: 0 },
      { label: "Wed", amount: 0, percent: 0 },
      { label: "Thu", amount: 0, percent: 0 },
      { label: "Fri", amount: 0, percent: 0 },
      { label: "Sat", amount: 0, percent: 0 },
      { label: "Sun", amount: 0, percent: 0 },
    ],
    weeklyGrowthPercent: 0,
    bestDay: "-",
  },
  billingStatus: {
    rows: [],
    totalReceivables: 0,
  },
  meta: {
    usesEstimatedCosts: true,
    selectedTimeRange: "30d",
    selectedRegion: "all",
    availableRegions: [],
  },
};

type FinanceCostEntryInput = {
  category: "FUEL" | "MAINTENANCE" | "INSURANCE" | "OTHER";
  amount: number;
  fuel_liters?: number | null;
  notes?: string;
  region?: string;
  incurred_at?: string;
};

type FinancePayoutEntryInput = {
  rider_id?: string | null;
  payout_type: "BASE_PAY" | "INCENTIVE" | "OVERTIME" | "OTHER";
  amount: number;
  status?: "PAID" | "PENDING" | "OVERDUE";
  payout_date?: string;
  reference?: string;
  region?: string;
};

type FinanceBillingEntryInput = {
  reference_label: string;
  amount: number;
  status?: "PAID" | "PENDING" | "OVERDUE";
  billed_at?: string;
  due_at?: string | null;
  paid_at?: string | null;
  notes?: string;
  region?: string;
};

type FinanceDataContextValue = {
  data: FinanceDashboardData;
  loading: boolean;
  error: string | null;
  timeRange: DashboardTimeRange;
  region: string;
  availableRegions: string[];
  savingEntry: boolean;
  setTimeRange: (next: DashboardTimeRange) => void;
  setRegion: (next: string) => void;
  refresh: () => Promise<void>;
  createCostEntry: (input: FinanceCostEntryInput) => Promise<{ success: boolean; error?: string }>;
  createPayoutEntry: (input: FinancePayoutEntryInput) => Promise<{ success: boolean; error?: string }>;
  createBillingEntry: (input: FinanceBillingEntryInput) => Promise<{ success: boolean; error?: string }>;
};

const FinanceDataContext = createContext<FinanceDataContextValue | null>(null);

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatSignedPercent(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const sign = safeValue > 0 ? "+" : safeValue < 0 ? "-" : "";
  return `${sign}${Math.abs(safeValue).toFixed(1)}%`;
}

export function FinanceDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<FinanceDashboardData>(DEFAULT_FINANCE_DASHBOARD_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("30d");
  const [region, setRegion] = useState<string>("all");
  const [savingEntry, setSavingEntry] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = (await getFinanceDashboardData(undefined, {
        timeRange,
        region,
      })) as FinanceDashboardData | null;
      if (result) {
        setData(result);
      } else {
        setData(DEFAULT_FINANCE_DASHBOARD_DATA);
      }
    } catch (loadError) {
      console.error("[Finance] Failed to load finance dashboard data:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Failed to load finance data.");
      setData(DEFAULT_FINANCE_DASHBOARD_DATA);
    } finally {
      setLoading(false);
    }
  }, [region, timeRange]);

  const createCostEntryHandler = useCallback(
    async (input: FinanceCostEntryInput) => {
      setSavingEntry(true);
      try {
        const result = await createFinanceCostEntry(input);
        if (!result?.success) {
          return { success: false, error: result?.error || "Failed to save cost entry." };
        }

        await refresh();
        return { success: true };
      } finally {
        setSavingEntry(false);
      }
    },
    [refresh]
  );

  const createPayoutEntryHandler = useCallback(
    async (input: FinancePayoutEntryInput) => {
      setSavingEntry(true);
      try {
        const result = await createFinancePayoutEntry(input);
        if (!result?.success) {
          return { success: false, error: result?.error || "Failed to save payout entry." };
        }

        await refresh();
        return { success: true };
      } finally {
        setSavingEntry(false);
      }
    },
    [refresh]
  );

  const createBillingEntryHandler = useCallback(
    async (input: FinanceBillingEntryInput) => {
      setSavingEntry(true);
      try {
        const result = await createFinanceBillingEntry(input);
        if (!result?.success) {
          return { success: false, error: result?.error || "Failed to save billing entry." };
        }

        await refresh();
        return { success: true };
      } finally {
        setSavingEntry(false);
      }
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`finance-dashboard-live-${timeRange}-${region}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_cost_entries" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_payout_entries" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_billing_entries" },
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
      savingEntry,
      setTimeRange,
      setRegion,
      refresh,
      createCostEntry: createCostEntryHandler,
      createPayoutEntry: createPayoutEntryHandler,
      createBillingEntry: createBillingEntryHandler,
    }),
    [
      createBillingEntryHandler,
      createCostEntryHandler,
      createPayoutEntryHandler,
      data,
      error,
      loading,
      refresh,
      region,
      savingEntry,
      timeRange,
    ]
  );

  return <FinanceDataContext.Provider value={contextValue}>{children}</FinanceDataContext.Provider>;
}

export function useFinanceData() {
  const context = useContext(FinanceDataContext);
  if (!context) {
    throw new Error("useFinanceData must be used inside FinanceDataProvider");
  }
  return context;
}
