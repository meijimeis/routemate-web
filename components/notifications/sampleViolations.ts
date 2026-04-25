import { GeofenceViolation } from "./types";

export const SAMPLE_VIOLATIONS: GeofenceViolation[] = [
  {
    id: "v1",
    riderName: "Driver B",
    zoneName: "Makati",
    lat: 14.5547,
    lng: 121.0244,
    violationType: "ZONE_EXIT_UNAUTHORIZED",
    baseSeverity: "critical",
    trafficLevel: "HEAVY",
    timestamp: "2026-01-26T14:45:00Z",
  },
  {
    id: "v2",
    riderName: "Driver A",
    zoneName: "Mandaluyong",
    lat: 14.5794,
    lng: 121.0369,
    violationType: "ZONE_OVERSTAY",
    baseSeverity: "warning",
    trafficLevel: "MODERATE",
    timestamp: "2026-01-26T14:30:00Z",
  },
];
