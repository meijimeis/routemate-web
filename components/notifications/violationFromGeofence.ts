import { GeofenceViolation, TrafficLevel } from "./types";
import { v4 as uuidv4 } from "uuid";

export function geofenceEventToViolation({
  riderName,
  zoneName,
  lat,
  lng,
  event,
  trafficLevel = "MODERATE", // ✅ default fallback
}: {
  riderName: string;
  zoneName: string;
  lat: number;
  lng: number;
  event: "ENTER" | "EXIT";
  trafficLevel?: TrafficLevel;
}): GeofenceViolation {
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
    trafficLevel,
    timestamp: new Date().toISOString(),
  };
}
