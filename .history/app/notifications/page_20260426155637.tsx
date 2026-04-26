"use client";

import { useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import NotificationList from "@/components/notifications/NotificationList";
import GeofenceMap from "@/components/notifications/GeofenceMap";
import GeofenceSummary from "@/components/notifications/GeofenceSummary";
import GeofenceCreatePanel from "@/components/notifications/GeofenceCreatePanel";
import MessagePanel from "@/components/notifications/MessagePanel";
import { GeofenceProvider, useGeofence } from "@/components/notifications/GeofenceContext";
import { useRealtimeSupervisorAlerts } from "@/components/notifications/useRealtimeSupervisorAlerts";

function NotificationsContent() {
  const { setFocusedZone } = useGeofence();
  const {
    alerts,
    zones,
    parcelGeofences,
    routePolylines,
    zoneWarningById,
    summary,
    loading,
    error,
  } = useRealtimeSupervisorAlerts();

  const handleSelectZone = useCallback(
    (zoneName: string) => {
      setFocusedZone(zoneName);
    },
    [setFocusedZone]
  );

  return (
    <DashboardLayout>
      {/* HEADER */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* MAIN LAYOUT */}
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)]">
        {/* LEFT - NOTIFICATIONS & MESSAGES */}
        <div className="col-span-5 flex flex-col gap-4 overflow-hidden min-h-0">
          <NotificationList notifications={alerts} severityFilter={null} loading={loading} />
          <MessagePanel />
        </div>

        {/* RIGHT - MAP & ZONES */}
        <div className="col-span-7 flex flex-col gap-4 overflow-hidden">
          <div className="shrink-0">
            <GeofenceCreatePanel />
          </div>

          <div className="flex-1 min-h-[400px] overflow-hidden rounded-xl border border-gray-100 shadow-sm bg-white">
            <GeofenceMap
              zones={zones}
              parcelGeofences={parcelGeofences}
              routePolylines={routePolylines}
              zoneWarningById={zoneWarningById}
            />
          </div>
          <div className="rounded-xl border border-gray-100 shadow-sm overflow-auto bg-white">
            <GeofenceSummary summary={summary} onSelectZone={handleSelectZone} loading={loading} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function NotificationsPage() {
  return (
    <GeofenceProvider>
      <NotificationsContent />
    </GeofenceProvider>
  );
}
