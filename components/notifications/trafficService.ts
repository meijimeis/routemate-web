"use client";

import { TrafficLevel } from "./types";
import {
  estimateTypicalDurationSeconds,
  fetchDirections,
} from "@/lib/openRouteService";

type LatLng = {
  lat: number;
  lng: number;
};

/**
 * Converts duration ratio to traffic level
 */
function resolveTrafficLevelFromRatio(ratio: number): TrafficLevel {
  if (ratio < 1.2) return "LOW";
  if (ratio < 1.5) return "MODERATE";
  if (ratio < 2.0) return "HEAVY";
  return "SEVERE";
}

/**
 * Fetch traffic between two points
 */
export async function fetchTrafficLevel(
  from: LatLng,
  to: LatLng
): Promise<TrafficLevel> {
  const route = await fetchDirections(
    [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    { profile: "motorcycle" }
  );

  if (!route || typeof route.duration !== "number") {
    return "MODERATE";
  }

  const typicalDuration = estimateTypicalDurationSeconds(route.distance, 45);
  const trafficRatio = route.duration / typicalDuration;

  if (!Number.isFinite(trafficRatio) || trafficRatio <= 0) {
    return "MODERATE";
  }

  return resolveTrafficLevelFromRatio(trafficRatio);
}
