"use client";

import { formatCurrency, useFinanceData } from "./FinanceDataProvider";

export default function RiderEarnings() {
  const { data, loading } = useFinanceData();
  const rows = data.riderEarnings;

  return (
    <div className="p-6">
      <h3 className="mb-5 text-[20px] font-semibold text-[#1F2937]">
        Rider Earnings
      </h3>

      {loading ? <p className="mb-3 text-xs text-gray-500">Loading rider earnings...</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-gray-300 text-left text-[12px] uppercase tracking-wide text-gray-700">
              <th className="pb-3 font-medium">Rider</th>
              <th className="pb-3 font-medium">Distance</th>
              <th className="pb-3 font-medium">Cost</th>
              <th className="pb-3 font-medium">Revenue</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-[#F1F5F9] transition hover:bg-[#F9FAFB]"
              >
                <td className="py-4 font-medium text-[#111827]">{row.riderName}</td>

                <td className="py-4 text-[#374151]">{row.distanceKm.toFixed(1)} km</td>

                <td className="py-4 text-[#374151]">{formatCurrency(row.cost)}</td>

                <td className="py-4">
                  <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-[13px] font-semibold text-[#16A34A]">
                    {formatCurrency(row.revenue)}
                  </span>
                </td>
              </tr>
            ))}

            {!loading && rows.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-sm text-gray-500" colSpan={4}>
                  No rider earnings data found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}