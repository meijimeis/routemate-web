"use client";

import { formatCurrency, useAnalyticsData } from "@/components/analytics/AnalyticsDataProvider";
import { User, Award } from "lucide-react";

export default function RiderPerformance() {
  const { data, loading, error } = useAnalyticsData();
  const riders = data.riderPerformance;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Top Riders
          </h3>
          <Award className="w-4 h-4 text-gray-500" />
        </div>
        <p className="text-xs text-gray-600">Weekly performance leaders</p>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Rider analytics is temporarily stale. Showing latest available leaderboard.
        </p>
      ) : null}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      ) : riders.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">No data available</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Rider</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Deliveries</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Revenue</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Efficiency</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {riders.map((rider) => (
                <tr
                  key={rider.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* RANK */}
                  <td className="px-4 py-3">
                    {rider.rank === 1 && <span className="text-lg">🥇</span>}
                    {rider.rank === 2 && <span className="text-lg">🥈</span>}
                    {rider.rank === 3 && <span className="text-lg">🥉</span>}
                    {rider.rank > 3 && <span className="text-xs font-bold text-gray-500">#{rider.rank}</span>}
                  </td>

                  {/* NAME */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-purple-600" />
                      </div>
                      <span className="font-medium text-gray-900">{rider.name}</span>
                    </div>
                  </td>

                  {/* DELIVERIES */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-semibold text-gray-900">{rider.deliveries}</span>
                  </td>

                  {/* REVENUE */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-green-600">{formatCurrency(rider.revenue)}</span>
                  </td>

                  {/* EFFICIENCY */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="relative w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                          style={{ width: `${rider.efficiency}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-900 w-8">{rider.efficiency}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FOOTER */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <a href="/drivers" className="text-sm font-medium text-purple-600 hover:text-purple-700">
          View all riders →
        </a>
      </div>
    </div>
  );
}