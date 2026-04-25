"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  LayerGroup,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { ClusteredParcelMapGroup } from "./ClusteredParcelMap";

const DEFAULT_CENTER: [number, number] = [14.6, 121.0];
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function createParcelIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:11px;height:11px;border-radius:999px;border:1.5px solid #fff;background:${color};box-shadow:0 2px 5px rgba(15,23,42,0.28);"></div>`,
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5],
  });
}

function createClusterIcon(color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:999px;border:2px solid #fff;background:${color};color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(15,23,42,0.35);">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitToParcelBounds({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const bounds = L.latLngBounds(points);
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, {
      padding: [28, 28],
      maxZoom: 15,
      animate: false,
    });
  }, [map, points]);

  return null;
}

type ClusteredParcelMapContentProps = {
  groups: ClusteredParcelMapGroup[];
  focusGroupId?: string | null;
};

export function ClusteredParcelMapContent({ groups, focusGroupId = null }: ClusteredParcelMapContentProps) {
  const focusGroup = useMemo(
    () => (focusGroupId ? groups.find((group) => group.id === focusGroupId) || null : null),
    [focusGroupId, groups]
  );

  const renderedGroups = useMemo(
    () => (focusGroup ? [focusGroup] : groups),
    [focusGroup, groups]
  );

  const parcelPoints = useMemo(
    () => {
      const sourceGroups = renderedGroups;

      return sourceGroups.flatMap((group) =>
        group.parcels.map((parcel) => [parcel.lat, parcel.lng] as [number, number])
      );
    },
    [renderedGroups]
  );

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
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
        <ZoomControl position="topright" />
        <FitToParcelBounds points={parcelPoints} />

        {renderedGroups.map((group) => {
          const clusterIcon = createClusterIcon(group.color, group.label);

          return (
            <LayerGroup key={group.id}>
              <Marker
                position={[group.centroid.lat, group.centroid.lng]}
                icon={clusterIcon}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold">Cluster {group.label}</div>
                    <div>{group.parcels.length} parcels</div>
                    <div>{group.totalWeight.toFixed(1)} kg</div>
                  </div>
                </Popup>
              </Marker>

              {group.parcels.map((parcel) => (
                <Marker
                  key={parcel.id}
                  position={[parcel.lat, parcel.lng]}
                  icon={createParcelIcon(group.color)}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{parcel.tracking_code}</div>
                      <div className="text-gray-700">{parcel.address}</div>
                      <div className="text-gray-600 mt-1">Cluster {group.label}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </LayerGroup>
          );
        })}
      </MapContainer>

      <div className="absolute left-3 bottom-3 z-[500] rounded-lg border border-gray-200 bg-white/95 p-2 shadow-sm max-w-[220px]">
        {renderedGroups.length === 0 ? (
          <p className="text-[11px] text-gray-600">Click Auto Group Parcels to display cluster markers and legend.</p>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-gray-900 mb-1">Cluster Legend</p>
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {renderedGroups.map((group) => (
                <div key={`${group.id}-legend`} className="flex items-center gap-2 text-[11px] text-gray-700">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  <span>
                    {group.label}: {group.parcels.length} parcel(s)
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
