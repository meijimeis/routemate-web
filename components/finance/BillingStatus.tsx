"use client";

import { formatCurrency, useFinanceData } from "./FinanceDataProvider";

const STATUS_CLASS = {
  Paid: "bg-[#DCFCE7] text-[#16A34A]",
  Pending: "bg-[#FEF3C7] text-[#D97706]",
  Overdue: "bg-[#FEE2E2] text-[#DC2626]",
};

export default function BillingStatus() {
  const { data, loading } = useFinanceData();
  const rows = data.billingStatus.rows;

  return (
    <div className="p-6">
      <h3 className="mb-5 text-[20px] font-semibold text-[#1F2937]">
        Billing Status
      </h3>

      {loading ? <p className="mb-3 text-xs text-gray-500">Loading billing status...</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-gray-300 text-left text-[12px] uppercase tracking-wide text-gray-700">
              <th className="pb-3 font-medium">Client</th>
              <th className="pb-3 font-medium">Revenue</th>
              <th className="pb-3 font-medium">Status</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-[#F1F5F9] transition hover:bg-[#F9FAFB]"
              >
                <td className="py-4 font-medium text-[#111827]">
                  {row.client}
                </td>

                <td className="py-4 text-[#374151]">{formatCurrency(row.amount)}</td>

                <td className="py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                      STATUS_CLASS[row.status] || STATUS_CLASS.Pending
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}

            {!loading && rows.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-sm text-gray-500" colSpan={3}>
                  No billing entries available yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
        <span className="text-[15px] font-semibold text-[#1F2937]">
          Total Receivables
        </span>

        <span className="text-[16px] font-semibold text-[#111827]">
          {formatCurrency(data.billingStatus.totalReceivables)}
        </span>
      </div>
    </div>
  );
}