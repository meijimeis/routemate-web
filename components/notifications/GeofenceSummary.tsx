"use client";

import { GeofenceSummaryStats } from "./types";

type Props = {
  summary: GeofenceSummaryStats;
  onSelectZone: (zone: string) => void;
  loading?: boolean;
};

export default function GeofenceSummary({ summary, onSelectZone, loading = false }: Props) {
  const totalGeofenceAlerts = summary.exitCount + summary.overstayCount;

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="font-semibold mb-3">Live Alert Summary</h3>

      {loading ? (
        <p className="text-sm text-gray-500">Loading geofence summary...</p>
      ) : (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Geofence Exits</span>
            <span>{summary.exitCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Zone Overstays</span>
            <span>{summary.overstayCount}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>Total Geofence Alerts</span>
            <span>{totalGeofenceAlerts}</span>
          </div>
          <div className="flex justify-between text-amber-700">
            <span>Off-Route Alerts</span>
            <span>{summary.offRouteCount}</span>
          </div>
          <div className="flex justify-between text-orange-700">
            <span>Delivery Delays</span>
            <span>{summary.delayedCount}</span>
          </div>
          <div className="flex justify-between text-green-700">
            <span>Arrivals Confirmed</span>
            <span>{summary.arrivalCount}</span>
          </div>
          <div className="flex justify-between text-sky-700">
            <span>Early Arrivals</span>
            <span>{summary.earlyArrivalCount}</span>
          </div>
          <div className="flex justify-between text-rose-700">
            <span>Late Arrivals</span>
            <span>{summary.lateArrivalCount}</span>
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs text-gray-700 mb-1">Recent Zones Triggered</p>
        {loading ? (
          <p className="text-xs text-gray-500">Loading zones...</p>
        ) : summary.warningZoneRows.length === 0 ? (
          <p className="text-xs text-gray-500">No active warning zones.</p>
        ) : (
          summary.warningZoneRows.map((zone) => (
            <button
              key={zone.zoneId}
              onClick={() => onSelectZone(zone.zoneName)}
              className="flex w-full items-center justify-between text-sm text-purple-600 hover:underline"
            >
              <span>{zone.zoneName}</span>
              <span className="text-xs text-gray-500">{zone.count}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
