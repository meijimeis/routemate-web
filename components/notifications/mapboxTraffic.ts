import {
  estimateTypicalDurationSeconds,
  fetchDirections,
} from "@/lib/openRouteService";

type RouteTrafficResult = {
  duration: number;
  duration_typical: number;
};

export async function fetchTrafficBetweenPoints(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RouteTrafficResult | null> {
  const route = await fetchDirections(
    [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    { profile: "motorcycle" }
  );

  if (!route || typeof route.duration !== "number") return null;

  const durationTypical = estimateTypicalDurationSeconds(route.distance, 45);

  return {
    duration: route.duration,
    duration_typical: durationTypical,
  };
}
