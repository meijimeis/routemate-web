"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";

const DEFAULT_CENTER: [number, number] = [14.6, 121.0];
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type SelectionPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  color?: string;
};

type SelectionPointsMapContentProps = {
  points: SelectionPoint[];
  selectedPointIds?: string[];
  emptyLabel?: string;
};

function FocusPoints({ points }: { points: SelectionPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14, { animate: false });
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, {
      padding: [28, 28],
      maxZoom: 14,
      animate: false,
    });
  }, [map, points]);

  return null;
}

export function SelectionPointsMapContent({
  points,
  selectedPointIds = [],
  emptyLabel = "No coordinates to display.",
}: SelectionPointsMapContentProps) {
  const selectedSet = useMemo(() => new Set(selectedPointIds), [selectedPointIds]);

  const focusPoints = useMemo(() => {
    if (selectedSet.size === 0) return points;

    const selectedOnly = points.filter((point) => selectedSet.has(point.id));
    return selectedOnly.length > 0 ? selectedOnly : points;
  }, [points, selectedSet]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={11}
        zoomControl={false}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
        <ZoomControl position="topright" />
        <FocusPoints points={focusPoints} />

        {points.map((point) => {
          const isSelected = selectedSet.has(point.id);
          const baseColor = point.color || "#7C3AED";

          return (
            <CircleMarker
              key={point.id}
              center={[point.lat, point.lng]}
              radius={isSelected ? 8 : 6}
              pathOptions={{
                color: isSelected ? "#111827" : baseColor,
                weight: isSelected ? 3 : 2,
                fillColor: baseColor,
                fillOpacity: isSelected ? 1 : 0.75,
              }}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold text-gray-900">{point.title}</p>
                  {point.subtitle ? <p className="text-gray-600">{point.subtitle}</p> : null}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {points.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center px-4">
          <p className="rounded border border-gray-200 bg-white/95 px-3 py-2 text-xs text-gray-600 shadow">
            {emptyLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}
