import { TrendingUp, Download } from "lucide-react";
import { formatCurrency, useAnalyticsData } from "@/components/analytics/AnalyticsDataProvider";

export default function ProfitabilityByRegion() {
  const { data, loading } = useAnalyticsData();
  const regions = data.profitabilityByRegion;
  const max = Math.max(1, ...regions.map((r) => r.value));
  const totalRevenue = data.totalRegionalRevenue;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Profitability by Region
          </h3>
          <button className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 text-xs font-medium hover:underline">
            <Download className="w-3 h-3" />
            Export
          </button>
        </div>
        <p className="text-xs text-gray-600">Profit margin % by region</p>
      </div>

      {loading ? (
        <div className="mb-3 h-36 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
      ) : null}

      {regions.length === 0 ? (
        <div className="mb-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600">
          No regional data available yet.
        </div>
      ) : null}

      {/* CHART */}
      <div className="flex-1 flex items-end justify-between gap-4 mb-4 min-h-[160px]">
        {regions.map((r) => {
          const height = (r.value / max) * 100;

          return (
            <div
              key={r.label}
              className="flex flex-col items-center gap-2 flex-1"
            >
              {/* VALUE LABEL */}
              <div className="text-xs font-bold text-gray-900 h-4">
                {r.value}%
              </div>

              {/* BAR */}
              <div className="flex items-end justify-center w-full h-[100px] relative">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-purple-500 to-purple-400 hover:from-purple-600 hover:to-purple-500 transition-colors shadow-sm"
                  style={{ height: `${height}%` }}
                />
              </div>

              {/* LABEL */}
              <div className="text-center">
                <p className="text-xs font-medium text-gray-900">{r.label}</p>
                <p className="text-xs text-gray-600 mt-0.5">{formatCurrency(r.revenue)}</p>
              </div>

              {/* TREND */}
              <div
                className={`flex items-center gap-0.5 text-xs font-semibold ${
                  r.trendDirection === "up" ? "text-green-600" : "text-red-600"
                }`}
              >
                <TrendingUp className={`w-3 h-3 ${r.trendDirection === "down" ? "rotate-180" : ""}`} />
                {r.trend}
              </div>
            </div>
          );
        })}
      </div>

      {/* SUMMARY */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Total Regional Revenue</span>
          <span className="text-lg font-bold text-gray-900">{formatCurrency(totalRevenue)}</span>
        </div>
      </div>
    </div>
  );
}