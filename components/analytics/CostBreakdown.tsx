import { PieChart } from "lucide-react";
import { formatCurrency, useAnalyticsData } from "@/components/analytics/AnalyticsDataProvider";

function toSafeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function CostBreakdown() {
  const { data, loading } = useAnalyticsData();
  const costs = data.costBreakdown.map((cost) => ({
    ...cost,
    value: Math.max(0, toSafeNumber(cost.value)),
    percentage: Math.max(0, toSafeNumber(cost.percentage)),
  }));
  const total = costs.reduce((sum, c) => sum + c.value, 0);

  const circles = total > 0
    ? costs.reduce(
        (acc, c, i) => {
          const computedPercent = (c.value / total) * 100;
          const percent = Math.max(0, Math.min(100, toSafeNumber(computedPercent)));
          const dash = `${percent} ${Math.max(0, 100 - percent)}`;
          const offset = Number.isFinite(acc.cumulative) ? -acc.cumulative : 0;
          acc.cumulative += percent;
          acc.circles.push({
            i,
            percent,
            dash,
            offset,
            color: c.color,
          });
          return acc;
        },
        { cumulative: 0, circles: [] as Array<{i: number; percent: number; dash: string; offset: number; color: string}> }
      ).circles
    : [];

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">Cost Breakdown</h3>
          <PieChart className="w-4 h-4 text-gray-500" />
        </div>
        <p className="text-xs text-gray-600">Monthly operational expenses</p>
      </div>

      {loading ? (
        <div className="mb-3 h-40 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
      ) : null}

      <div className="flex flex-col gap-4 flex-1">
        {/* Donut Chart */}
        <div className="flex justify-center">
          <div className="relative h-[120px] w-[120px]">
            <svg viewBox="0 0 42 42" className="h-full w-full">
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke="#F3F4F6"
                strokeWidth="4"
              />

              {circles.map((item) => (
                <circle
                  key={item.i}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="4"
                  strokeDasharray={item.dash}
                  strokeDashoffset={item.offset}
                  strokeLinecap="round"
                />
              ))}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-sm font-bold text-gray-900">{formatCurrency(total)}</p>
              <p className="text-xs text-gray-600">Total</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-2">
          {costs.map((c) => (
            <div key={c.label} className="flex items-center justify-between rounded-lg p-2 hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ background: c.color }}
                />
                <span className="text-sm text-gray-700">{c.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-right text-xs font-semibold text-gray-900">
                  {formatCurrency(c.value)}
                </span>
                <span className="w-8 text-right text-xs text-gray-500">
                  {total > 0
                    ? Math.round((c.value / total) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}