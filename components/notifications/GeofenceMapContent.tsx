"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Polygon,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useGeofence } from "./GeofenceContext";
import {
  GeofenceZoneShape,
  ParcelGeofenceOverlay,
  RoutePolylineOverlay,
} from "./types";

const DEFAULT_CENTER: [number, number] = [14.56, 121.03];
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type GeofenceMapContentProps = {
  zones: GeofenceZoneShape[];
  parcelGeofences: ParcelGeofenceOverlay[];
  routePolylines: RoutePolylineOverlay[];
  zoneWarningById: Record<string, number>;
};

function ZoneFocusController({
  focusedZone,
  zones,
  parcelGeofences,
}: {
  focusedZone: string | null;
  zones: GeofenceZoneShape[];
  parcelGeofences: ParcelGeofenceOverlay[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!focusedZone) return;

    const normalizedFocused = focusedZone.toLowerCase();
    const zone = zones.find((entry) => entry.name.toLowerCase() === normalizedFocused);

    if (zone) {
      const bounds = L.latLngBounds(zone.positions);
      if (!bounds.isValid()) return;

      map.fitBounds(bounds, {
        padding: [60, 60],
        animate: false,
      });
      return;
    }

    const parcelZone = parcelGeofences.find(
      (entry) =>
        entry.name.toLowerCase() === normalizedFocused ||
        entry.address.toLowerCase() === normalizedFocused
    );

    if (parcelZone) {
      map.setView([parcelZone.center.lat, parcelZone.center.lng], 16, { animate: false });
    }
  }, [focusedZone, map, parcelGeofences, zones]);

  return null;
}

function PointFocusController({ focusedPoint }: { focusedPoint: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!focusedPoint) return;

    map.setView([focusedPoint.lat, focusedPoint.lng], 15, { animate: false });
  }, [focusedPoint, map]);

  return null;
}

function MapPlacementController({
  onPick,
}: {
  onPick: (point: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click: (event) => {
      onPick({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function getZoneHeatStyle({
  warningScore,
  maxWarning,
  isFocused,
  isViolation,
}: {
  warningScore: number;
  maxWarning: number;
  isFocused: boolean;
  isViolation: boolean;
}) {
  if (isViolation) {
    return {
      color: "#b91c1c",
      fillColor: "#ef4444",
      fillOpacity: 0.22,
      weight: 3,
    };
  }

  const ratio = maxWarning > 0 ? warningScore / maxWarning : 0;

  if (ratio >= 0.75) {
    return {
      color: "#9f1239",
      fillColor: "#f43f5e",
      fillOpacity: isFocused ? 0.2 : 0.14,
      weight: isFocused ? 2.5 : 2,
    };
  }

  if (ratio >= 0.45) {
    return {
      color: "#b45309",
      fillColor: "#fb923c",
      fillOpacity: isFocused ? 0.18 : 0.12,
      weight: isFocused ? 2.5 : 2,
    };
  }

  if (ratio > 0) {
    return {
      color: "#a16207",
      fillColor: "#facc15",
      fillOpacity: isFocused ? 0.14 : 0.1,
      weight: isFocused ? 2.5 : 2,
    };
  }

  return {
    color: "#6d28d9",
    fillColor: "#8b5cf6",
    fillOpacity: isFocused ? 0.1 : 0.07,
    weight: isFocused ? 2.5 : 2,
  };
}

export function GeofenceMapContent({
  zones,
  parcelGeofences,
  routePolylines,
  zoneWarningById,
}: GeofenceMapContentProps) {
  const {
    focusedZone,
    focusedPoint,
    draftGeofencePoint,
    setDraftGeofencePoint,
    violationZone,
  } = useGeofence();

  const normalizedViolationZone = (violationZone || "").toLowerCase();

  const mapCenter = useMemo<[number, number]>(() => {
    const firstPoint = zones[0]?.positions?.[0];
    if (firstPoint) return firstPoint;

    const firstParcelZone = parcelGeofences[0];
    if (firstParcelZone) {
      return [firstParcelZone.center.lat, firstParcelZone.center.lng];
    }

    return DEFAULT_CENTER;
  }, [parcelGeofences, zones]);

  const maxWarning = useMemo(() => {
    const values = Object.values(zoneWarningById);
    if (values.length === 0) return 0;
    return Math.max(...values);
  }, [zoneWarningById]);

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden">
      <MapContainer
        center={mapCenter}
        zoom={11}
        zoomControl={false}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
        <ZoomControl position="topright" />
        <ZoneFocusController focusedZone={focusedZone} zones={zones} parcelGeofences={parcelGeofences} />
        <PointFocusController focusedPoint={focusedPoint} />
        <MapPlacementController onPick={setDraftGeofencePoint} />

        {routePolylines.map((route) => (
          <Polyline
            key={route.id}
            positions={route.points}
            pathOptions={{
              color:
                route.severity === "critical"
                  ? "#b91c1c"
                  : route.severity === "warning"
                  ? "#d97706"
                  : "#2563eb",
              weight: route.severity === "critical" ? 5 : 4,
              opacity: 0.8,
              dashArray: route.severity === "critical" ? "8 6" : undefined,
            }}
          />
        ))}

        {parcelGeofences.map((zone) => {
          const styleByStatus = {
            completed: { color: "#15803d", fillColor: "#4ade80" },
            critical: { color: "#b91c1c", fillColor: "#ef4444" },
            warning: { color: "#a16207", fillColor: "#f59e0b" },
            normal: { color: "#6d28d9", fillColor: "#8b5cf6" },
          } as const;

          const style = styleByStatus[zone.status];

          return (
            <Circle
              key={zone.id}
              center={[zone.center.lat, zone.center.lng]}
              radius={zone.radiusMeters}
              pathOptions={{
                color: style.color,
                fillColor: style.fillColor,
                fillOpacity: 0.06,
                weight: 2,
              }}
            />
          );
        })}

        {parcelGeofences.map((zone) => (
          <CircleMarker
            key={`${zone.id}:marker`}
            center={[zone.center.lat, zone.center.lng]}
            radius={4}
            pathOptions={{
              color:
                zone.status === "completed"
                  ? "#15803d"
                  : zone.status === "critical"
                  ? "#b91c1c"
                  : zone.status === "warning"
                  ? "#a16207"
                  : "#6d28d9",
              fillColor:
                zone.status === "completed"
                  ? "#22c55e"
                  : zone.status === "critical"
                  ? "#ef4444"
                  : zone.status === "warning"
                  ? "#f59e0b"
                  : "#8b5cf6",
              fillOpacity: 0.9,
              weight: 1,
            }}
          />
        ))}

        {zones.map((zone) => {
          const warningScore = zoneWarningById[zone.id] || 0;
          const isViolation = zone.name.toLowerCase() === normalizedViolationZone;
          const isFocused =
            Boolean(focusedZone) && zone.name.toLowerCase() === focusedZone?.toLowerCase();
          const style = getZoneHeatStyle({
            warningScore,
            maxWarning,
            isFocused,
            isViolation,
          });

          return (
            <Polygon
              key={zone.id}
              positions={zone.positions}
              pathOptions={style}
            />
          );
        })}

        {focusedPoint ? (
          <CircleMarker
            center={[focusedPoint.lat, focusedPoint.lng]}
            radius={8}
            pathOptions={{
              color: "#ef4444",
              fillColor: "#ef4444",
              fillOpacity: 0.85,
              weight: 2,
            }}
          />
        ) : null}

        {draftGeofencePoint ? (
          <CircleMarker
            center={[draftGeofencePoint.lat, draftGeofencePoint.lng]}
            radius={7}
            pathOptions={{
              color: "#0f766e",
              fillColor: "#14b8a6",
              fillOpacity: 0.92,
              weight: 2,
            }}
          />
        ) : null}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm">
        <p className="text-[11px] font-semibold text-gray-700">Route + Geofence Monitoring</p>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-600">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
          Warning
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400 ml-2" />
          Route Risk
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500 ml-2" />
          Critical
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 ml-2" />
          Completed
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-500 ml-2" />
          Placement
        </div>
      </div>

      {zones.length === 0 && parcelGeofences.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/65">
          <p className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            No active geofence zones found for this organization.
          </p>
        </div>
      ) : null}
    </div>
  );
}
