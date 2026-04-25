"use client";

import { MapPin, CheckCircle, TrendingUp, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useDriverStore } from "@/stores/useDriverStore";
import { getAnalyticsByRider, getLatestRiderLocation } from "@/lib/api";

export default function DriverActivity() {
  const selectedDriver = useDriverStore((s) => s.selectedDriver);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [analytics, setAnalytics] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadDriverData = async () => {
      if (!selectedDriver?.id) return;
      setLoading(true);
      try {
        const [analyticsData, locationData] = await Promise.all([
          getAnalyticsByRider(selectedDriver.id),
          getLatestRiderLocation(selectedDriver.id),
        ]);
        setAnalytics(analyticsData);
        setLocation(locationData);
      } catch (err) {
        console.error("Failed to load driver activity:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDriverData();
  }, [selectedDriver?.id]);

  if (!selectedDriver) {
    return (
      <div className="h-full rounded-2xl bg-white/70 backdrop-blur p-6 shadow flex items-center justify-center">
        <p className="text-gray-500">Select a driver to view activity</p>
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl bg-white/70 backdrop-blur p-6 shadow overflow-y-auto">
      <h3 className="font-semibold mb-6 text-black">Activity</h3>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-medium text-gray-700">Last Location</p>
            </div>
            <p className="text-sm font-medium text-black">
              {location ? `${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)}` : "—"}
            </p>
          </div>

          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-xs font-medium text-gray-700">Deliveries Completed</p>
            </div>
            <p className="text-sm font-medium text-black">
              {analytics?.today_deliveries_completed || 0} of {analytics?.today_deliveries_total || 0}
            </p>
          </div>

          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <p className="text-xs font-medium text-gray-700">On-Time Rate</p>
            </div>
            <p className="text-sm font-medium text-purple-600">
              {analytics?.on_time_percentage || 0}%
            </p>
          </div>

          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-orange-600" />
              <p className="text-xs font-medium text-gray-700">Today&apos;s Earnings</p>
            </div>
            <p className="text-sm font-medium text-black">
              ${(analytics?.today_earnings || 0).toFixed(2)}
            </p>
          </div>

          <div className="text-xs text-gray-600 space-y-2 pt-2 border-t">
            <div className="flex justify-between">
              <span>Distance Driven</span>
              <span className="font-medium">{(analytics?.today_distance || 0).toFixed(1)} km</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

