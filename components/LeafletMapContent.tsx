"use client";

import React, { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";

export type Parcel = {
  id: string;
  lat: number;
  lng: number;
  address?: string;
};

export type Rider = {
  id: string;
  lat: number;
  lng: number;
  name?: string;
};

export type Route = {
  rider_id: string;
  stops: string[];
  polylineCoords?: [number, number][];
  color?: string;
};

type MapboxMapProps = {
  center?: [number, number];
  parcels?: Parcel[];
  riders?: Rider[];
  routes?: Route[];
  zoom?: number;
  showNavigationControl?: boolean;
  styleUrl?: string;
  height?: string;
  className?: string;
  parcelMarkerVariant?: "dot" | "pin";
};

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const ROUTE_COLORS = [
  "#1D4ED8",
  "#0F766E",
  "#C2410C",
  "#BE123C",
  "#7C3AED",
  "#166534",
  "#B45309",
  "#334155",
];

const STOP_MARKER_COLORS = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#06B6D4",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
];

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isValidLatitude = (value: unknown): value is number =>
  isFiniteCoordinate(value) && value >= -90 && value <= 90;

const isValidLongitude = (value: unknown): value is number =>
  isFiniteCoordinate(value) && value >= -180 && value <= 180;

const isValidLngLatTuple = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  isValidLongitude(value[0]) &&
  isValidLatitude(value[1]);

const CENTER_EPSILON = 0.000001;

const hashString = (value: string): number => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
};

const pickPaletteColor = (
  palette: string[],
  key: string,
  fallbackIndex: number
): string => {
  if (!Array.isArray(palette) || palette.length === 0) return "#7C3AED";

  const normalizedKey = key.trim();
  if (normalizedKey.length === 0) {
    return palette[fallbackIndex % palette.length];
  }

  return palette[hashString(normalizedKey) % palette.length];
};

function MapViewportController({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    const currentCenter = map.getCenter();
    const isSameCenter =
      Math.abs(currentCenter.lng - center[0]) < CENTER_EPSILON &&
      Math.abs(currentCenter.lat - center[1]) < CENTER_EPSILON;

    // Keep user-selected zoom level unless destination center actually changes.
    if (isSameCenter) return;

    map.setView([center[1], center[0]], map.getZoom(), { animate: false });
  }, [center, map]);

  return null;
}

function buildRiderIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="leaflet-rider-marker"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function buildParcelIcon(variant: "dot" | "pin", color: string) {
  return L.divIcon({
    className: "",
    html:
      variant === "pin"
        ? `<div class="leaflet-parcel-marker-pin" style="--parcel-marker-color:${color};"></div>`
        : `<div class="leaflet-parcel-marker-dot" style="--parcel-marker-color:${color};"></div>`,
    iconSize: variant === "pin" ? [20, 20] : [14, 14],
    iconAnchor: variant === "pin" ? [10, 18] : [7, 7],
    popupAnchor: [0, -10],
  });
}

export function LeafletMapContent({
  center = [120.985, 14.5995],
  parcels = [],
  riders = [],
  routes = [],
  zoom = 13,
  showNavigationControl = true,
  styleUrl = "openstreetmap",
  height = "100%",
  className = "",
  parcelMarkerVariant = "dot",
}: MapboxMapProps) {
  void styleUrl;

  const riderIcon = useMemo(() => buildRiderIcon(), []);

  const routeLines = useMemo(
    () =>
      routes
        .map((route, index) => {
          const positions = (route.polylineCoords || [])
            .filter((point): point is [number, number] => isValidLngLatTuple(point))
            .map(([lng, lat]) => [lat, lng] as [number, number]);

          if (positions.length < 2) return null;

          const routeKey = `${route.rider_id || "no-rider"}:${route.stops.join("|") || `route-${index}`}`;
          const color = route.color || pickPaletteColor(ROUTE_COLORS, routeKey, index);

          return {
            id: `${routeKey}-${index}`,
            positions,
            color,
          };
        })
        .filter(
          (
            routeLine
          ): routeLine is { id: string; positions: [number, number][]; color: string } =>
            routeLine != null
        ),
    [routes]
  );

  const validRiders = useMemo(
    () =>
      riders.filter(
        (rider) => isValidLatitude(rider.lat) && isValidLongitude(rider.lng)
      ),
    [riders]
  );

  const validParcels = useMemo(
    () =>
      parcels.filter(
        (parcel) => isValidLatitude(parcel.lat) && isValidLongitude(parcel.lng)
      ),
    [parcels]
  );

  const parcelIcons = useMemo(
    () =>
      validParcels.map((parcel, index) => {
        const color = pickPaletteColor(STOP_MARKER_COLORS, parcel.id, index);
        return buildParcelIcon(parcelMarkerVariant, color);
      }),
    [parcelMarkerVariant, validParcels]
  );

  return (
    <div className={className} style={{ height, width: "100%" }}>
      <MapContainer
        center={[center[1], center[0]]}
        zoom={zoom}
        zoomControl={false}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
        <MapViewportController center={center} />

        {showNavigationControl && <ZoomControl position="topright" />}

        {routeLines.map((routeLine) => (
          <Polyline
            key={`route-line-${routeLine.id}`}
            positions={routeLine.positions}
            pathOptions={{
              color: routeLine.color,
              weight: 4,
              opacity: 0.8,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ))}

        {validRiders.map((rider) => (
          <Marker key={`rider-${rider.id}`} position={[rider.lat, rider.lng]} icon={riderIcon}>
            {rider.name ? <Popup>{rider.name}</Popup> : null}
          </Marker>
        ))}

        {validParcels.map((parcel, index) => (
          <Marker
            key={`parcel-${parcel.id}-${index}`}
            position={[parcel.lat, parcel.lng]}
            icon={parcelIcons[index]}
          >
            <Popup>
              {parcel.id}
              {parcel.address ? ` - ${parcel.address}` : ""}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <style jsx global>{`
        .leaflet-rider-marker {
          width: 18px;
          height: 18px;
          background: #7659f5;
          border-radius: 50%;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 5px rgba(17, 24, 39, 0.28);
        }

        .leaflet-parcel-marker-dot {
          width: 14px;
          height: 14px;
          background: var(--parcel-marker-color, #f97316);
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 5px rgba(17, 24, 39, 0.28);
        }

        .leaflet-parcel-marker-pin {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: var(--parcel-marker-color, #f2485d);
          border: 2px solid #ffffff;
          box-shadow: 0 2px 5px rgba(17, 24, 39, 0.28);
          position: relative;
        }

        .leaflet-parcel-marker-pin::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -7px;
          width: 0;
          height: 0;
          transform: translateX(-50%);
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 8px solid var(--parcel-marker-color, #f2485d);
        }
      `}</style>
    </div>
  );
}
