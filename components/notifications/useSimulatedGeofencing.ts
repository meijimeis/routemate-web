"use client";

import { useEffect, useRef } from "react";
import { SIMULATED_RIDERS } from "./simulateRider";
import { moveRider } from "./simulateMovement";
import { GEOFENCES } from "./geofenceData";
import { detectGeofenceNotifications } from "./geofenceEngine";
import { geofenceEventToViolation } from "./violationFromGeofence";
import { fetchTrafficLevel } from "./trafficService";
import { persistViolation } from "./persistViolations";

export function useSimulatedGeofencing() {
  const ridersRef = useRef(SIMULATED_RIDERS);

  /**
   * Tracks per-rider per-zone inside/outside state
   * {
   *   riderId: { zoneId: boolean }
   * }
   */
  const geofenceStateRef = useRef<
    Record<string, Record<string, boolean>>
  >({});

  useEffect(() => {
    const interval = setInterval(() => {
      ridersRef.current = ridersRef.current.map((rider) => {
        const previousPosition = {
          lat: rider.lat,
          lng: rider.lng,
        };

        const moved = moveRider(rider);

        const prevState =
          geofenceStateRef.current[rider.id] ?? {};

        const { notifications, newState } =
          detectGeofenceNotifications({
            rider: {
              id: rider.id,
              lat: moved.lat,
              lng: moved.lng,
            },
            geofences: GEOFENCES,
            prevState,
          });

        geofenceStateRef.current[rider.id] = newState;

        notifications.forEach((n) => {
  if (!n.location) return;

  const zoneName = n.location; // ✅ capture & lock type
  const event =
    n.message.includes("exited") ? "EXIT" : "ENTER";

  (async () => {
    try {
      const trafficLevel = await fetchTrafficLevel(
        previousPosition,
        { lat: moved.lat, lng: moved.lng }
      );

      const violation = geofenceEventToViolation({
        riderName: rider.name,
        zoneName, // ✅ now guaranteed string
        lat: moved.lat,
        lng: moved.lng,
        event,
        trafficLevel,
      });

      persistViolation(violation).catch(console.error);
    } catch (err) {
      console.error("Traffic fetch failed:", err);
    }
  })();
});


        return moved;
      });
    }, 3000); // every 3 seconds

    return () => clearInterval(interval);
  }, []);
}
