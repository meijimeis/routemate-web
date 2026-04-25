import { TrafficLevel } from "./types";

export function resolveTrafficLevel(
  duration: number,
  typical: number
): TrafficLevel {
  const ratio = duration / typical;

  if (ratio <= 1.1) return "LOW";
  if (ratio <= 1.3) return "MODERATE";
  if (ratio <= 1.6) return "HEAVY";
  return "SEVERE";
}
