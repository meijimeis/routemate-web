"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { formatSignedPercent, useAnalyticsData } from "@/components/analytics/AnalyticsDataProvider";

export default function RouteEfficiencyChart() {
  const { data, loading } = useAnalyticsData();
  const { labels, values, currentRate, average, highest, changePercent } = data.routeEfficiency;

  const points = useMemo(() => {
    const sourceValues = values.length > 0 ? values : [0, 0, 0, 0, 0];
    const maxIndex = Math.max(1, sourceValues.length - 1);

    return sourceValues.map((rawValue, index) => {
      const value = Math.max(0, Math.min(100, Math.round(rawValue)));
      const x = 70 + (490 * index) / maxIndex;
      const y = 160 - (value / 100) * 118;

      return {
        x,
        y,
        label: labels[index] || `Week ${index + 1}`,
        value,
      };
    });
  }, [labels, values]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    return `${linePath} L ${lastPoint.x} 180 L ${firstPoint.x} 180 Z`;
  }, [linePath, points]);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-5">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Route Efficiency
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 border border-green-200">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-600">{formatSignedPercent(changePercent)}</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-600">Optimization rate trend</p>
      </div>

      {loading ? (
        <div className="mb-3 h-44 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
      ) : null}

      <div className="flex-1 relative rounded-lg bg-gradient-to-b from-gray-50 to-white border border-gray-200 p-4">
        {/* Y-axis labels */}
        <div className="pointer-events-none absolute left-2 top-4 flex h-[150px] flex-col justify-between text-xs text-gray-600 font-medium">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
        </div>

        {/* Chart drawing area */}
        <div className="absolute left-10 right-4 top-4 h-[150px] w-auto">
          {/* Horizontal grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            <div className="border-t border-dashed border-gray-300" />
            <div className="border-t border-dashed border-gray-300" />
            <div className="border-t border-dashed border-gray-300" />
          </div>

          {/* Chart SVG */}
          <svg
            viewBox="0 0 600 180"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="efficiencyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Area fill */}
            <path
              d={areaPath}
              fill="url(#efficiencyGradient)"
            />

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke="#10B981"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {points.map((point, index) => (
              <g key={`${point.label}-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill="#10B981"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="8"
                  fill="#10B981"
                  opacity="0.15"
                />
              </g>
            ))}
          </svg>
        </div>

        {/* X-axis labels */}
        <div className="absolute bottom-1 left-12 right-4 flex justify-between text-xs text-gray-600 font-medium">
          {points.map((p) => (
            <span key={p.label}>{p.label}</span>
          ))}
        </div>

        {/* Tooltip */}
        <div className="absolute right-6 top-6 rounded-lg border border-gray-300 bg-white px-4 py-3 shadow-lg">
          <p className="text-xs font-medium text-gray-600">Current Rate</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{currentRate}%</p>
          <p className="mt-1 text-xs text-gray-500">{labels[labels.length - 1] || "Latest"}</p>
        </div>
      </div>

      {/* FOOTER STATS */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="text-center p-2 rounded-lg bg-gray-50">
          <p className="text-xs text-gray-600">Average</p>
          <p className="text-lg font-bold text-gray-900">{average}%</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-gray-50">
          <p className="text-xs text-gray-600">Highest</p>
          <p className="text-lg font-bold text-green-600">{highest}%</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-gray-50">
          <p className="text-xs text-gray-600">Change</p>
          <p className="text-lg font-bold text-green-600">{formatSignedPercent(changePercent)}</p>
        </div>
      </div>
    </div>
  );
}