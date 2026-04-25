"use client";

import { formatCurrency, useFinanceData } from "./FinanceDataProvider";

export default function RiderPayouts() {
  const { data, loading } = useFinanceData();
  const items = data.riderPayouts;
  const totalPayouts = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="p-6">
      <h3 className="mb-5 text-[20px] font-semibold text-[#1F2937]">
        Rider Payouts
      </h3>

      {loading ? <p className="mb-3 text-xs text-gray-500">Loading rider payouts...</p> : null}

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-[12px] bg-[#F7F8FC] px-4 py-3"
          >
            <span className="text-[14px] text-[#374151]">
              {item.label}
            </span>

            <span className="text-[14px] font-medium text-[#111827]">
              {formatCurrency(item.amount)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
        <span className="text-[15px] font-semibold text-[#1F2937]">
          Total
        </span>

        <span className="text-[16px] font-semibold text-[#111827]">
          {formatCurrency(totalPayouts)}
        </span>
      </div>
    </div>
  );
}