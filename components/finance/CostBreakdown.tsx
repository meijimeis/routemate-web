"use client";

import { formatCurrency, useFinanceData } from "./FinanceDataProvider";

export default function CostBreakdown() {
  const { data, loading } = useFinanceData();
  const items = data.costBreakdown;
  const totalCost = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="p-6">
      <h3 className="mb-5 text-[20px] font-semibold text-[#1F2937]">
        Cost Breakdown
      </h3>

      {loading ? <p className="mb-3 text-xs text-gray-500">Loading cost breakdown...</p> : null}

      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between text-[14px]">
              <span className="text-[#1F2937]">{item.label}</span>
              <span className="font-medium text-[#1F2937]">{formatCurrency(item.amount)}</span>
            </div>

            <div className="h-2 rounded-full bg-[#ECEEF3]">
              <div
                className={`h-2 rounded-full ${item.colorClass}`}
                style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {!loading && totalCost <= 0 ? (
        <p className="mt-4 text-xs text-gray-500">No cost entries found for this period.</p>
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
        <span className="text-[15px] font-semibold text-[#1F2937]">Total</span>
        <div className="text-[15px] text-[#667085]">
          Total cost{" "}
          <span className="font-semibold text-[#111827]">{formatCurrency(totalCost)}</span>
        </div>
      </div>
    </div>
  );
}