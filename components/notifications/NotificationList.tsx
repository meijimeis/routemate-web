"use client";

import { useState, useMemo } from "react";
import NotificationItem from "./NotificationItem";
import { SupervisorNotification } from "./types";
import { useGeofence } from "./GeofenceContext";

const PAGE_SIZE = 6;

interface NotificationListProps {
  notifications: SupervisorNotification[];
  severityFilter?: string | null;
  loading?: boolean;
}

export default function NotificationList({
  notifications,
  severityFilter = null,
  loading = false,
}: NotificationListProps) {
  const { triggerViolation, focusPoint } = useGeofence();
  const [page, setPage] = useState(1);

  const filteredNotifications = useMemo(() => {
    let filtered = [...notifications];
    
    if (severityFilter) {
      filtered = filtered.filter(n => n.severity === severityFilter);
    }
    
    return filtered;
  }, [notifications, severityFilter]);

  const maxPage = Math.max(1, Math.ceil(filteredNotifications.length / PAGE_SIZE));
  const effectivePage = Math.min(page, maxPage);
  const visible = filteredNotifications.slice(0, effectivePage * PAGE_SIZE);

  return (
    <div className="bg-white rounded-lg shadow-sm border flex flex-col min-h-0 flex-1">
      {/* HEADER */}
      <div className="px-4 py-3 border-b bg-gray-50 font-semibold text-sm flex items-center justify-between">
        <span>Notifications</span>
        <span className="text-xs font-normal text-gray-600 bg-white px-2 py-1 rounded border">
          {filteredNotifications.length}
        </span>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-600">Loading notifications...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-600">
              {severityFilter ? `No ${severityFilter} events` : "No notifications"}
            </p>
          </div>
        ) : (
          visible.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onViewGeofence={() => {
                if (typeof n.lat === "number" && typeof n.lng === "number") {
                  focusPoint({ lat: n.lat, lng: n.lng });
                } else if (n.location) {
                  triggerViolation(n.location);
                }
              }}
            />
          ))
        )}
      </div>

      {/* PAGINATION */}
      {filteredNotifications.length > visible.length && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="border-t py-2 text-sm text-purple-600 hover:bg-purple-50 font-medium transition-colors"
        >
          Load more ({visible.length}/{filteredNotifications.length})
        </button>
      )}
    </div>
  );
}
