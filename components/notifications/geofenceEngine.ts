// components/notifications/geofenceEngine.ts

import { Notification } from "./types";
import { Geofence } from "./geofenceData";
import { v4 as uuidv4 } from "uuid";

/* ===============================
   TYPES
   =============================== */

export type GeofenceState = Record<string, boolean>;

type RiderPosition = {
  id: string;
  lat: number;
  lng: number;
};

/* ===============================
   POINT-IN-POLYGON (Ray Casting)
   =============================== */

function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  let inside = false;
  const [x, y] = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/* ===============================
   GEOFENCE DETECTION ENGINE
   =============================== */

export function detectGeofenceNotifications({
  rider,
  geofences,
  prevState,
}: {
  rider: RiderPosition;
  geofences: Geofence[];
  prevState: GeofenceState;
}): {
  notifications: Notification[];
  newState: GeofenceState;
} {
  const notifications: Notification[] = [];
  const newState: GeofenceState = { ...prevState };

  for (const zone of geofences) {
    const inside = isPointInPolygon(
      [rider.lng, rider.lat],
      zone.coordinates
    );

    const wasInside = prevState[zone.id] ?? false;

    /* ===============================
       EXIT EVENT
       =============================== */
    if (!inside && wasInside) {
      notifications.push({
        id: uuidv4(),
        type: "geofence",
        severity: "critical",
        message: `Driver exited ${zone.name} Zone`,
        location: zone.name,
        timestamp: new Date().toISOString(),
      });
    }

    /* ===============================
       ENTRY EVENT
       =============================== */
    if (inside && !wasInside) {
      notifications.push({
        id: uuidv4(),
        type: "geofence",
        severity: "info",
        message: `Driver entered ${zone.name} Zone`,
        location: zone.name,
        timestamp: new Date().toISOString(),
      });
    }

    newState[zone.id] = inside;
  }

  return { notifications, newState };
}
