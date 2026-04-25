"use client";

import { useAnalyticsData } from "@/components/analytics/AnalyticsDataProvider";
import { Package, Zap, Clock, DollarSign, TrendingDown, MapPin, TrendingUp } from "lucide-react";

const iconMap: { [key: string]: React.ComponentType<{ className?: string }> } = {
  "Total\nDeliveries": Package,
  "Optimized\nRate": Zap,
  "Avg Delivery\nTime": Clock,
  "Revenue": DollarSign,
  "Cost per\nRoute": TrendingDown,
  "Avg Stops": MapPin,
};

export default function PerformanceOverview() {
  const { data, loading, error } = useAnalyticsData();
  const stats = data.performanceOverview;

  return (
    <div className="p-6">
      <h3 className="mb-5 text-lg font-semibold text-gray-900">
        Performance Overview
      </h3>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Failed to refresh analytics data. Showing the latest available values.
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {stats.map((item) => {
            const Icon = iconMap[item.icon];
            const isPositive = item.change.startsWith("+");
            const trendColor = item.trend === "up" 
              ? isPositive ? "text-green-600" : "text-red-600"
              : isPositive ? "text-red-600" : "text-green-600";
            const bgColor = item.trend === "up" 
              ? isPositive ? "bg-green-50" : "bg-red-50"
              : isPositive ? "bg-red-50" : "bg-green-50";

            return (
              <div
                key={item.label}
                className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow"
              >
                {/* HEADER */}
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {item.label}
                  </span>
                  {Icon && (
                    <div className={`${bgColor} p-2 rounded-lg`}>
                      <Icon className="w-4 h-4 text-gray-700" />
                    </div>
                  )}
                </div>

                {/* VALUE */}
                <div className="mb-2">
                  <p className="text-2xl md:text-xl font-bold text-gray-900">
                    {item.value}
                  </p>
                </div>

                {/* TREND */}
                <div className={`flex items-center gap-1 ${trendColor}`}>
                  {item.trend === "up" ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span className="text-sm font-semibold">{item.change}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}