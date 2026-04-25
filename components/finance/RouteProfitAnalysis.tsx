"use client";

import { formatCurrency, useFinanceData } from "./FinanceDataProvider";

const CHART_WIDTH = 520;
const CHART_HEIGHT = 150;

function getX(index: number, length: number): number {
  if (length <= 1) return 0;
  return (index / (length - 1)) * CHART_WIDTH;
}

function getY(value: number, maxValue: number): number {
  if (maxValue <= 0) return CHART_HEIGHT;
  return CHART_HEIGHT - (value / maxValue) * CHART_HEIGHT;
}

function buildLinePath(values: number[], maxValue: number): string {
  if (!values.length) return "";

  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${getX(index, values.length)} ${getY(value, maxValue)}`)
    .join(" ");
}

function buildAreaPath(values: number[], maxValue: number): string {
  if (!values.length) return "";

  const line = buildLinePath(values, maxValue);
  const lastX = getX(values.length - 1, values.length);
  return `${line} L ${lastX} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`;
}

export default function RouteProfitAnalysis() {
  const { data, loading } = useFinanceData();

  const labels = data.routeProfit.labels;
  const revenueValues = data.routeProfit.revenue;
  const costValues = data.routeProfit.costs;
  const maxValue = Math.max(1, ...revenueValues, ...costValues);

  const revenueLine = buildLinePath(revenueValues, maxValue);
  const costLine = buildLinePath(costValues, maxValue);
  const revenueArea = buildAreaPath(revenueValues, maxValue);
  const costArea = buildAreaPath(costValues, maxValue);

  const latestIndex = Math.max(0, labels.length - 1);
  const latestX = getX(latestIndex, labels.length);
  const latestRevenueY = getY(revenueValues[latestIndex] || 0, maxValue);
  const latestCostY = getY(costValues[latestIndex] || 0, maxValue);

  const axisValues = [maxValue, maxValue * 0.66, maxValue * 0.33, 0];

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between">
        <h3 className="text-[20px] font-semibold text-[#1F2937]">Profit Trend</h3>

        <p className="text-[18px] font-semibold text-[#111827]">{formatCurrency(data.routeProfit.latestProfit)}</p>
      </div>

      {loading ? <p className="mb-3 text-xs text-gray-500">Loading profit trend...</p> : null}

      <div className="relative h-[210px] w-full">
        <div className="pointer-events-none absolute left-0 top-3 flex h-[150px] flex-col justify-between text-[13px] text-[#8A94A6]">
          {axisValues.map((value, index) => (
            <span key={index}>{formatCurrency(value)}</span>
          ))}
        </div>

        <div className="absolute left-14 right-3 top-3 h-[150px]">
          <div className="absolute inset-0 flex flex-col justify-between">
            <div className="border-t border-dashed border-[#E5E7EB]" />
            <div className="border-t border-dashed border-[#E5E7EB]" />
            <div className="border-t border-dashed border-[#E5E7EB]" />
            <div className="border-t border-[#E5E7EB]" />
          </div>

          <div className="absolute top-0 h-full border-l border-dashed border-[#D1D5DB]" style={{ left: `${(latestX / CHART_WIDTH) * 100}%` }} />

          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="financeRevenueFillDynamic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C55E" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#22C55E" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="financeExpenseFillDynamic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F472B6" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#F472B6" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            <path d={revenueArea} fill="url(#financeRevenueFillDynamic)" />
            <path d={costArea} fill="url(#financeExpenseFillDynamic)" />

            <path d={revenueLine} fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
            <path d={costLine} fill="none" stroke="#FF5C9A" strokeWidth="3" strokeLinecap="round" />

            <circle cx={latestX} cy={latestRevenueY} r="7.5" fill="#22C55E" />
            <circle cx={latestX} cy={latestRevenueY} r="11" fill="none" stroke="#DCFCE7" strokeWidth="3" />

            <circle cx={latestX} cy={latestCostY} r="7.5" fill="#FF5C9A" />
            <circle cx={latestX} cy={latestCostY} r="11" fill="none" stroke="#FBCFE8" strokeWidth="3" />
          </svg>

          <div className="absolute right-0 top-[-6px] text-[14px] font-semibold text-[#111827]">
            {formatCurrency(data.routeProfit.latestRevenue)}
          </div>

          <div className="absolute right-0 top-[112px] text-[14px] font-semibold text-[#111827]">
            {formatCurrency(data.routeProfit.latestCost)}
          </div>
        </div>

        <div className="absolute bottom-[36px] left-14 right-3 flex justify-between text-[13px] text-[#667085]">
          {labels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#22C55E]" />
              <span className="text-[14px] text-[#374151]">Revenue</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#FF5C9A]" />
              <span className="text-[14px] text-[#374151]">Expenses</span>
            </div>
          </div>

          <div className="text-[14px] text-[#667085]">
            Total cost <span className="ml-2 text-[16px] font-semibold text-[#111827]">{formatCurrency(data.routeProfit.latestCost)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}