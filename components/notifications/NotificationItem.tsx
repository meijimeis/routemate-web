// components/notifications/NotificationItem.tsx
"use client";

import { SupervisorNotification } from "./types";
import { formatTime } from "./formatTime";
import { AlertTriangle, AlertCircle, Info, MessageSquare, MapPin } from "lucide-react";

type Props = {
  notification: SupervisorNotification;
  onViewGeofence: () => void;
};

const severityConfig = {
  critical: {
    bg: "bg-red-50",
    border: "border-l-4 border-red-500",
    badge: "bg-red-100 text-red-800",
    icon: AlertTriangle,
    label: "Critical",
  },
  warning: {
    bg: "bg-yellow-50",
    border: "border-l-4 border-yellow-500",
    badge: "bg-yellow-100 text-yellow-800",
    icon: AlertCircle,
    label: "Warning",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-l-4 border-blue-500",
    badge: "bg-blue-100 text-blue-800",
    icon: Info,
    label: "Info",
  },
};

const alertTypeLabels: Record<string, string> = {
  ZONE_EXIT_UNAUTHORIZED: "Zone Exit",
  ZONE_OVERSTAY: "Zone Overstay",
  ARRIVAL_CONFIRMED: "Arrival Confirmed",
  EARLY_ARRIVAL: "Early Arrival",
  LATE_ARRIVAL: "Late Arrival",
  OFF_ROUTE: "Off Route",
  DELIVERY_DELAY: "Delivery Delay",
  SUPERVISOR_MESSAGE: "Supervisor Message",
  SYSTEM: "System",
};

export default function NotificationItem({
  notification,
  onViewGeofence,
}: Props) {
  const config = severityConfig[notification.severity as keyof typeof severityConfig];
  const IconComponent = config.icon;
  const messageText = String(notification.message || "");
  const riderNameText = String(notification.riderName || "Unknown Rider");
  const alertTypeKey = String(notification.alertType || "SYSTEM");
  const alertTypeText = alertTypeLabels[alertTypeKey] || alertTypeKey;
  const locationText = String(notification.location || "");
  const trafficLevel =
    typeof notification.metadata?.trafficLevel === "string"
      ? notification.metadata.trafficLevel
      : null;

  return (
    <div className={`p-3 rounded-lg border-l-4 ${config.bg} ${config.border}`}>
      <div className="flex gap-3">
        {/* ICON */}
        <div className="flex-shrink-0 mt-0.5">
          <IconComponent className="w-4 h-4" style={{
            color: {
              critical: '#dc2626',
              warning: '#ca8a04',
              info: '#2563eb',
            }[notification.severity]
          }} />
        </div>

        {/* CONTENT */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {/* SEVERITY BADGE */}
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${config.badge}`}>
                  {config.label}
                </span>
                <span className="text-xs text-gray-500">
                  {formatTime(notification.timestamp)}
                </span>
              </div>

              {/* MAIN MESSAGE */}
              <p className="font-medium text-sm text-gray-900 mb-1">
                {messageText}
              </p>

              <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px] text-gray-700">
                <span className="font-semibold text-gray-800">{riderNameText}</span>
                <span className="rounded bg-white px-1.5 py-0.5 border border-gray-200">
                  {alertTypeText}
                </span>
              </div>

              {/* LOCATION */}
              {notification.location && (
                <div className="flex items-center gap-1 text-xs text-gray-700 mb-2">
                  <MapPin className="w-3 h-3" />
                  {locationText}
                </div>
              )}

              {/* TRAFFIC CONTEXT */}
              {trafficLevel && (
                <p className="text-xs text-gray-700 mb-2">
                  Traffic: <span className="font-medium">{trafficLevel}</span>
                </p>
              )}

              {/* ACTION BUTTONS */}
              <div className="flex gap-2">
                <button
                  onClick={onViewGeofence}
                  className="text-xs text-purple-600 hover:text-purple-700 font-semibold hover:underline"
                >
                  View Location →
                </button>

                {notification.draftMessage && (
                  <button
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("OPEN_MESSAGE_DRAFT", {
                          detail: {
                            riderId: notification.riderId,
                            riderName: notification.riderName,
                            message: notification.draftMessage,
                            sourceNotificationId: notification.id,
                          },
                        })
                      );
                    }}
                    className="text-xs text-purple-600 hover:text-purple-700 font-semibold hover:underline flex items-center gap-1"
                  >
                    <MessageSquare className="w-3 h-3" />
                    Draft Message
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
