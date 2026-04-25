"use client";

import { DollarSign, TrendingUp, Wallet } from "lucide-react";
import { formatCurrency, formatSignedPercent, useFinanceData } from "./FinanceDataProvider";

const CARD_META = [
  {
    label: "Total Revenue",
    key: "totalRevenue",
    color: "text-orange-500",
    iconBg: "bg-orange-100",
    icon: DollarSign,
    trendKey: "revenueTrendPercent",
  },
  {
    label: "Net Profit",
    key: "netProfit",
    color: "text-green-600",
    iconBg: "bg-green-100",
    icon: TrendingUp,
    trendKey: "netProfitTrendPercent",
  },
  {
    label: "Avg Cost / Route",
    key: "avgCostPerRoute",
    color: "text-purple-600",
    iconBg: "bg-purple-100",
    icon: Wallet,
    trendKey: "avgCostTrendPercent",
  },
] as const;

export default function FinanceOverview() {
  const { data, loading, error } = useFinanceData();

  const stats = CARD_META.map((card) => ({
    label: card.label,
    value: formatCurrency(data.overview[card.key]),
    trend: formatSignedPercent(data.overview[card.trendKey]),
    color: card.color,
    iconBg: card.iconBg,
    icon: card.icon,
  }));

  return (
    <div className="p-6">
      <h3 className="text-[20px] font-semibold text-[#1F2937] mb-5">
        Key Metrics
      </h3>

      {error ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {error}
        </p>
      ) : null}

      {loading ? <p className="mb-3 text-xs text-gray-500">Loading finance overview...</p> : null}

      <div className="flex items-center divide-x divide-gray-200">
        {stats.map((s, i) => {
          const Icon = s.icon;

          return (
            <div
              key={s.label}
              className={`flex-1 px-5 ${i === 0 ? "pl-0" : ""}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.iconBg}`}
                >
                  <Icon size={18} className={s.color} />
                </div>

                <span className="text-sm text-gray-700">{s.label}</span>
              </div>

              <p className="text-[28px] font-semibold text-[#111827]">
                {s.value}
              </p>

              <p className="text-sm text-gray-700 mt-1">
                <span className={`${s.color} font-medium`}>
                  {s.trend}
                </span>{" "}
                vs baseline
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}