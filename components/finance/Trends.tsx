"use client";

import { Download } from "lucide-react";
import { formatSignedPercent, useFinanceData } from "./FinanceDataProvider";

export default function Trends() {
  const { data, loading } = useFinanceData();
  const bars = data.trends.bars;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-[20px] font-semibold text-[#1F2937]">
          Trends
        </h3>

        <button className="flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#6B7280] transition hover:bg-gray-50">
          <Download size={16} />
          Export Report
        </button>
      </div>

      {loading ? <p className="mb-3 text-xs text-gray-500">Loading weekly trends...</p> : null}

      <div className="rounded-[18px] bg-[#F7F8FC] p-4">
        <div className="flex h-[160px] items-end justify-between gap-3">
          {bars.map((bar, index) => (
            <div key={`${bar.label}-${index}`} className="flex flex-1 flex-col items-center gap-3">
              <div className="flex h-[120px] items-end">
                <div
                  className="w-full rounded-[10px] bg-gradient-to-t from-purple-600 to-indigo-400"
                  style={{
                    height: `${Math.max(4, Math.min(100, bar.percent))}%`,
                    minWidth: "24px",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-[13px] text-[#8A94A6]">
          {bars.map((bar) => (
            <span key={bar.label}>{bar.label}</span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
        <div>
          <p className="text-[13px] text-[#8A94A6]">Weekly Growth</p>
          <p className="text-[18px] font-semibold text-[#111827]">
            {formatSignedPercent(data.trends.weeklyGrowthPercent)}
          </p>
        </div>

        <div>
          <p className="text-right text-[13px] text-[#8A94A6]">Best Day</p>
          <p className="text-right text-[18px] font-semibold text-[#111827]">{data.trends.bestDay}</p>
        </div>
      </div>
    </div>
  );
}