import { GeofenceViolation } from "./types";
import { TrafficSignal } from "./types";
import { resolveTrafficLevel } from "./resolveTrafficLevel";
import { v4 as uuidv4 } from "uuid";

export function geofenceEventToViolation({
  riderName,
  zoneName,
  lat,
  lng,
  event,
  trafficSignal,
}: {
  riderName: string;
  zoneName: string;
  lat: number;
  lng: number;
  event: "ENTER" | "EXIT";
  trafficSignal: TrafficSignal;
}): GeofenceViolation {
  const trafficLevel = resolveTrafficLevel(trafficSignal);

  return {
    id: uuidv4(),
    riderName,
    zoneName,
    lat,
    lng,
    violationType:
      event === "EXIT"
        ? "ZONE_EXIT_UNAUTHORIZED"
        : "ZONE_MISSED_ENTRY",

    baseSeverity: event === "EXIT" ? "critical" : "info",

    // ✅ derived, not hardcoded
    trafficLevel,

    timestamp: new Date().toISOString(),
  };
}
