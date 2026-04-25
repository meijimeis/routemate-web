"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchDirections,
  LngLat,
  type DirectionsResult,
} from "@/lib/openRouteService";
import { usePlanRouteStore, Parcel, Rider } from "@/stores/usePlanRouteStore";

const DEFAULT_CENTER: [number, number] = [14.6, 121.0];
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const LEG_COLORS = [
  "#1D4ED8",
  "#0F766E",
  "#C2410C",
  "#BE123C",
  "#7C3AED",
  "#166534",
  "#B45309",
  "#334155",
];

function haversine(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function orderParcels(startLat:number, startLng:number, parcels:Parcel[]) {
  const remaining = [...parcels];
  const ordered:Parcel[] = [];

  let currLat = startLat;
  let currLng = startLng;

  while (remaining.length) {
    let nearest = 0;
    let min = Infinity;

    remaining.forEach((p, i) => {
      const d = haversine(currLat, currLng, p.lat, p.lng);
      if (d < min) {
        min = d;
        nearest = i;
      }
    });

    const next = remaining.splice(nearest, 1)[0];
    ordered.push(next);
    currLat = next.lat;
    currLng = next.lng;
  }

  return ordered;
}

function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng)
  );
}

function toFiniteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasRiderCoordinates(
  rider: Rider | null
): rider is Rider & { lat: number; lng: number } {
  return !!rider && isValidLatLng(rider.lat, rider.lng);
}

function riderProfileName(profile: unknown): string {
  if (Array.isArray(profile)) {
    const first = profile[0] as { full_name?: string | null } | undefined;
    return first?.full_name || "Unknown";
  }

  const direct = profile as { full_name?: string | null } | null;
  return direct?.full_name || "Unknown";
}

function toStopLabel(index: number) {
  let n = index;
  let label = "";

  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return label;
}

function getDistanceToPointMeters(a: LngLat, b: LngLat): number {
  return haversine(a[1], a[0], b[1], b[0]) * 1000;
}

function deriveWaypointIndexesFromGeometry(
  geometry: LngLat[],
  waypoints: LngLat[]
) {
  if (geometry.length === 0 || waypoints.length === 0) return [];

  const indexes: number[] = [];
  let searchStart = 0;

  for (const waypoint of waypoints) {
    let nearestIndex = searchStart;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = searchStart; i < geometry.length; i++) {
      const distance = getDistanceToPointMeters(geometry[i], waypoint);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    indexes.push(nearestIndex);
    searchStart = nearestIndex;
  }

  return indexes;
}

function createRiderIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="plan-route-rider-icon"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function createStartIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="plan-route-start-icon">S</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createStopIcon(label: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div class="plan-route-stop-icon" style="--plan-stop-color:${color};">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitBoundsToPoints({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const bounds = L.latLngBounds(points);
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 15,
      animate: false,
    });
  }, [map, points]);

  return null;
}

function TrackMapZoom({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const syncZoom = () => onZoomChange(map.getZoom());

    syncZoom();
    map.on("zoomend", syncZoom);

    return () => {
      map.off("zoomend", syncZoom);
    };
  }, [map, onZoomChange]);

  return null;
}

type OverviewRider = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
};

function hasOverviewRiderCoordinates(
  rider: OverviewRider
): rider is OverviewRider & { lat: number; lng: number } {
  return isValidLatLng(rider.lat, rider.lng);
}

export function PlanRouteMapContent() {
  const rider = usePlanRouteStore(s => s.selectedRider);
  const assignedParcels = usePlanRouteStore(s => s.assignedParcels);
  const [routeLine, setRouteLine] = useState<[number, number][]>([]);
  const [routeWaypointIndexes, setRouteWaypointIndexes] = useState<number[]>([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState<number | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [isRoadSnapped, setIsRoadSnapped] = useState(false);
  const [routeWarning, setRouteWarning] = useState<string | null>(null);
  const [overviewRiders, setOverviewRiders] = useState<OverviewRider[]>([]);
  const [mapZoom, setMapZoom] = useState(11);

  const riderIcon = useMemo(() => createRiderIcon(), []);
  const startIcon = useMemo(() => createStartIcon(), []);

  const isRouteMode = useMemo(() => {
    return (
      hasRiderCoordinates(rider) &&
      assignedParcels.length > 0
    );
  }, [assignedParcels.length, rider]);

  const orderedParcels = useMemo(() => {
    if (!hasRiderCoordinates(rider) || !isRouteMode) return [];

    const validParcels = assignedParcels.filter((parcel) =>
      isValidLatLng(parcel.lat, parcel.lng)
    );

    return orderParcels(rider.lat, rider.lng, validParcels);
  }, [assignedParcels, isRouteMode, rider]);

  const routeWaypoints = useMemo<LngLat[]>(() => {
    if (!hasRiderCoordinates(rider) || !isRouteMode) return [];
    return [
      [rider.lng, rider.lat],
      ...orderedParcels.map((parcel) => [parcel.lng, parcel.lat] as LngLat),
    ];
  }, [isRouteMode, orderedParcels, rider]);

  const routeLegLines = useMemo(() => {
    if (routeLine.length < 2) return [];

    if (routeWaypointIndexes.length < 2) {
      return [routeLine];
    }

    const legs = routeWaypointIndexes
      .slice(0, -1)
      .map((startIndex, legIndex) => {
        const endIndex = routeWaypointIndexes[legIndex + 1];
        const safeStart = Math.max(0, Math.min(routeLine.length - 1, startIndex));
        const safeEnd = Math.max(safeStart, Math.min(routeLine.length - 1, endIndex));
        return routeLine.slice(safeStart, safeEnd + 1);
      })
      .filter((leg) => leg.length > 1);

    return legs.length > 0 ? legs : [routeLine];
  }, [routeLine, routeWaypointIndexes]);

  const displayStops = useMemo(() => {
    const overlapCounts = new Map<string, number>();
    const baseOffsetAtZoom18 = 0.00012;
    const zoomFactor = Math.pow(2, Math.max(0, 18 - mapZoom));

    return orderedParcels.map((parcel, index) => {
      const coordinateKey = `${parcel.lat.toFixed(4)},${parcel.lng.toFixed(4)}`;
      const overlapIndex = overlapCounts.get(coordinateKey) || 0;
      overlapCounts.set(coordinateKey, overlapIndex + 1);

      const angle = (overlapIndex % 8) * (Math.PI / 4);
      const ring = Math.floor(overlapIndex / 8) + 1;
      const offsetRadius =
        overlapIndex === 0
          ? 0
          : baseOffsetAtZoom18 * zoomFactor * ring;
      const markerLat = parcel.lat + Math.sin(angle) * offsetRadius;
      const markerLng = parcel.lng + Math.cos(angle) * offsetRadius;

      return {
        parcel,
        index,
        label: toStopLabel(index),
        markerLat,
        markerLng,
        color: LEG_COLORS[index % LEG_COLORS.length],
      };
    });
  }, [mapZoom, orderedParcels]);

  const stopIcons = useMemo(
    () => displayStops.map((stop) => createStopIcon(stop.label, stop.color)),
    [displayStops]
  );

  const overviewRiderPoints = useMemo(
    () =>
      overviewRiders
        .filter(hasOverviewRiderCoordinates)
        .map((entry) => [entry.lat, entry.lng] as [number, number]),
    [overviewRiders]
  );

  const fitPoints = useMemo(() => {
    if (isRouteMode && hasRiderCoordinates(rider)) {
      const waypointPoints = routeWaypoints.map(([lng, lat]) => [lat, lng] as [number, number]);
      if (routeLine.length > 1) return routeLine;
      return waypointPoints;
    }

    return overviewRiderPoints;
  }, [isRouteMode, overviewRiderPoints, rider, routeLine, routeWaypoints]);

  useEffect(() => {
    let cancelled = false;

    const buildLegByLegRoute = async (): Promise<{
      route: DirectionsResult | null;
      warning: string | null;
    }> => {
      const stitchedGeometry: LngLat[] = [];
      const stitchedWaypointIndexes: number[] = [];
      let totalDuration = 0;
      let totalDistance = 0;
      let hasDuration = false;
      let hasDistance = false;
      let warning: string | null = null;
      let hasStraightLineFallbackLeg = false;

      for (let index = 0; index < routeWaypoints.length - 1; index++) {
        const legStart = routeWaypoints[index];
        const legEnd = routeWaypoints[index + 1];

        const legRoute = await fetchDirections(
          [legStart, legEnd],
          { profile: "motorcycle" }
        );

        if (!legRoute?.geometry?.length || legRoute.geometry.length < 2) {
          if (index === 0) {
            stitchedGeometry.push(legStart, legEnd);
            stitchedWaypointIndexes.push(0);
          } else {
            stitchedGeometry.push(legEnd);
          }

          stitchedWaypointIndexes.push(stitchedGeometry.length - 1);
          hasStraightLineFallbackLeg = true;

          if (!warning) {
            warning =
              legRoute?.error?.message ||
              `Stop ${toStopLabel(index)} appears off-road, so this leg is shown as a straight-line preview.`;
          }

          continue;
        }

        if (index === 0) {
          stitchedGeometry.push(...legRoute.geometry);
          stitchedWaypointIndexes.push(0);
        } else {
          stitchedGeometry.push(...legRoute.geometry.slice(1));
        }

        stitchedWaypointIndexes.push(stitchedGeometry.length - 1);

        if (typeof legRoute.duration === "number" && Number.isFinite(legRoute.duration)) {
          totalDuration += legRoute.duration;
          hasDuration = true;
        }

        if (typeof legRoute.distance === "number" && Number.isFinite(legRoute.distance)) {
          totalDistance += legRoute.distance;
          hasDistance = true;
        }

        if (!warning && legRoute.error?.message) {
          warning = legRoute.error.message;
        }
      }

      if (stitchedGeometry.length < 2) {
        return {
          route: null,
          warning,
        };
      }

      return {
        route: {
          geometry: stitchedGeometry,
          duration: hasDuration ? totalDuration : null,
          distance: hasDistance ? totalDistance : null,
          waypointIndexes: stitchedWaypointIndexes,
          segments: [],
          isRoadSnapped: !hasStraightLineFallbackLeg && stitchedGeometry.length > 1,
          error: null,
        },
        warning,
      };
    };

    const loadDirections = async () => {
      if (!isRouteMode || routeWaypoints.length < 2) {
        if (!cancelled) {
          setRouteLine([]);
          setRouteWaypointIndexes([]);
          setRouteDistanceMeters(null);
          setRouteDurationSeconds(null);
          setIsRouteLoading(false);
          setIsRoadSnapped(false);
          setRouteWarning(null);
        }
        return;
      }

      setIsRouteLoading(true);

      try {
        let routeWarningMessage: string | null = null;

        let route = await fetchDirections(routeWaypoints, {
          profile: "motorcycle",
        });

        if (route?.error?.message) {
          routeWarningMessage = route.error.message;
        }

        if (!route || !route.geometry || route.geometry.length < 2) {
          const legByLeg = await buildLegByLegRoute();
          route = legByLeg.route;

          if (!routeWarningMessage && legByLeg.warning) {
            routeWarningMessage = legByLeg.warning;
          }
        }

        if (cancelled) return;

        if (route?.geometry?.length && route.geometry.length > 1) {
          const mappedLine = route.geometry.map(
            ([lng, lat]) => [lat, lng] as [number, number]
          );

          const candidateIndexes =
            route.waypointIndexes.length >= routeWaypoints.length
              ? route.waypointIndexes
              : deriveWaypointIndexesFromGeometry(route.geometry, routeWaypoints);

          const normalizedIndexes = candidateIndexes
            .map((index) => Math.max(0, Math.min(mappedLine.length - 1, index)))
            .reduce((acc: number[], index) => {
              if (acc.length === 0) {
                acc.push(index);
                return acc;
              }

              acc.push(Math.max(index, acc[acc.length - 1]));
              return acc;
            }, []);

          const safeWaypointIndexes =
            normalizedIndexes.length >= 2
              ? normalizedIndexes
              : [0, mappedLine.length - 1];

          setRouteLine(mappedLine);
          setRouteWaypointIndexes(safeWaypointIndexes);
          setRouteDistanceMeters(route.distance);
          setRouteDurationSeconds(route.duration);
          setIsRoadSnapped(route.isRoadSnapped);
          setRouteWarning(routeWarningMessage);
          return;
        }

        const fallbackLine = routeWaypoints.map(
          ([lng, lat]) => [lat, lng] as [number, number]
        );

        setRouteLine(fallbackLine);
        setRouteWaypointIndexes(fallbackLine.map((_, index) => index));
        setRouteDistanceMeters(null);
        setRouteDurationSeconds(null);
        setIsRoadSnapped(false);
        setRouteWarning(
          routeWarningMessage ||
            "One or more stops are too far from roads. Showing straight-line preview."
        );
      } catch (error) {
        console.error("Error fetching route directions:", error);
        if (!cancelled) {
          const fallbackLine = routeWaypoints.map(
            ([lng, lat]) => [lat, lng] as [number, number]
          );

          setRouteLine(fallbackLine);
          setRouteWaypointIndexes(fallbackLine.map((_, index) => index));
          setRouteDistanceMeters(null);
          setRouteDurationSeconds(null);
          setIsRoadSnapped(false);
          setRouteWarning("Unable to fetch road routing right now. Showing straight-line preview.");
        }
      } finally {
        if (!cancelled) {
          setIsRouteLoading(false);
        }
      }
    };

    loadDirections();

    return () => {
      cancelled = true;
    };
  }, [isRouteMode, routeWaypoints]);

  useEffect(() => {
    let cancelled = false;

    const loadOverviewData = async () => {
      if (isRouteMode) return;

      try {
        const { data: ridersData } = await supabase
          .from("riders")
          .select(`
            id,
            current_latitude,
            current_longitude,
            profiles:profile_id (
              full_name
            )
          `);

        const riderRows = Array.isArray(ridersData)
          ? (ridersData as Array<{
              id: string;
              current_latitude?: number | null;
              current_longitude?: number | null;
              profiles?: unknown;
            }>)
          : [];

        const nextOverviewRiders: OverviewRider[] = riderRows.map((row) => ({
          id: row.id,
          name: riderProfileName(row.profiles),
          lat: toFiniteOrNull(row.current_latitude),
          lng: toFiniteOrNull(row.current_longitude),
        }));

        if (!cancelled) {
          setOverviewRiders(nextOverviewRiders);
        }
      } catch (error) {
        console.error("Error updating overview markers:", error);
        if (!cancelled) {
          setOverviewRiders([]);
        }
      }
    };

    loadOverviewData();

    return () => {
      cancelled = true;
    };
  }, [isRouteMode]);

  return (
    <>
      <div className="relative w-full h-full">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={11}
          zoomControl={false}
          zoomAnimation={false}
          fadeAnimation={false}
          markerZoomAnimation={false}
          scrollWheelZoom
          className="w-full h-full rounded-xl overflow-hidden"
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          <ZoomControl position="topright" />
          <TrackMapZoom onZoomChange={setMapZoom} />
          <FitBoundsToPoints points={fitPoints} />

          {isRouteMode && hasRiderCoordinates(rider) ? (
            <>
              <Marker position={[rider.lat, rider.lng]} icon={startIcon}>
                <Popup>Start (S): {rider.name || "Unknown"}</Popup>
              </Marker>

              {displayStops.map((stop, index) => (
                <Marker
                  key={stop.parcel.id}
                  position={[stop.markerLat, stop.markerLng]}
                  icon={stopIcons[index] || createStopIcon(stop.label, stop.color)}
                >
                  <Popup>
                    Stop {stop.label}: {stop.parcel.address}
                  </Popup>
                </Marker>
              ))}

              {routeLine.length > 1 ? (
                <>
                  <Polyline
                    positions={routeLine}
                    pathOptions={{
                      color: LEG_COLORS[4],
                      weight: 6.5,
                      opacity: 0.8,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />

                  {routeLegLines.map((legLine, legIndex) => (
                    <Polyline
                      key={`road-leg-${legIndex}`}
                      positions={legLine}
                      pathOptions={{
                        color: LEG_COLORS[legIndex % LEG_COLORS.length],
                        weight: 5.5,
                        opacity: 0.8,
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                    />
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              {overviewRiders.filter(hasOverviewRiderCoordinates).map((entry) => (
                <Marker
                  key={entry.id}
                  position={[entry.lat, entry.lng]}
                  icon={riderIcon}
                >
                  <Popup>Rider: {entry.name}</Popup>
                </Marker>
              ))}
            </>
          )}
        </MapContainer>

        {!isRouteMode ? (
          <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[320px] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-900">Plan Route Preview</p>
            <p className="text-[11px] text-gray-700">
              Select a rider and add parcel stops to render clustered stop markers and route legs.
            </p>
          </div>
        ) : null}

        {isRouteMode && isRouteLoading ? (
          <div className="pointer-events-none absolute inset-0 z-[480] flex items-center justify-center">
            <div className="rounded-lg border border-gray-200 bg-white/95 px-4 py-2 text-sm font-medium text-gray-700 shadow">
              Loading route preview...
            </div>
          </div>
        ) : null}

        {isRouteMode ? (
          <div className="absolute left-3 top-3 z-[500] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-900">
              {isRoadSnapped
                ? "Road-Routed Preview"
                : "Fallback Preview (Non Road-Snapped)"}
            </p>
            <p className="text-[11px] text-gray-700">S = rider start, A/B/C... = ordered stops, colors match stop markers to route legs</p>
            <p className="text-[11px] text-gray-600">
              Assigned stops: {assignedParcels.length} • Rendered markers: {displayStops.length}
            </p>
            {routeDistanceMeters !== null || routeDurationSeconds !== null ? (
              <p className="text-[11px] text-gray-600">
                {routeDistanceMeters !== null
                  ? `${(routeDistanceMeters / 1000).toFixed(2)} km`
                  : "-- km"}
                {" • "}
                {routeDurationSeconds !== null
                  ? `${Math.max(1, Math.round(routeDurationSeconds / 60))} min`
                  : "-- min"}
              </p>
            ) : null}
            {routeWarning ? (
              <p className="mt-1 max-w-[280px] text-[10px] font-medium text-amber-700">{routeWarning}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <style jsx global>{`
        .plan-route-rider-icon {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #7c3aed;
          border: 2px solid #fff;
          box-shadow: 0 2px 5px rgba(17, 24, 39, 0.28);
        }

        .plan-route-start-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #7c3aed;
          color: #fff;
          border: 2px solid #fff;
          box-shadow: 0 2px 6px rgba(17, 24, 39, 0.3);
          font-size: 12px;
          font-weight: 800;
          line-height: 24px;
          text-align: center;
        }

        .plan-route-stop-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--plan-stop-color, #f97316);
          color: #fff;
          border: 2px solid #fff;
          box-shadow: 0 2px 5px rgba(17, 24, 39, 0.28);
          font-size: 12px;
          font-weight: 700;
          line-height: 24px;
          text-align: center;
        }
      `}</style>
    </>
  );
}
