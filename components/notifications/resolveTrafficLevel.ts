import { TrafficLevel } from "./types";

export function resolveTrafficLevel({
  speedKph,
  congestionRatio,
}: {
  speedKph: number;
  congestionRatio: number; // 0–1
}): TrafficLevel {
  if (congestionRatio > 0.8 || speedKph < 10) return "SEVERE";
  if (congestionRatio > 0.6 || speedKph < 20) return "HEAVY";
  if (congestionRatio > 0.4 || speedKph < 30) return "MODERATE";
  return "LOW";
}
