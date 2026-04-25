"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_CENTER: [number, number] = [14.6, 121.0];
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const CLUSTER_COLORS = [
  "#8B5CF6", // purple
  "#22C55E", // green
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#EC4899", // pink
  "#10B981", // teal
  "#EF4444", // red
  "#6366F1", // indigo
  "#84CC16", // lime
  "#14B8A6", // cyan
];

type Parcel = {
  id: string;
  latitude: number;
  longitude: number;
  cluster_name: string | null;
};

type Cluster = {
  name: string;
  parcels: Parcel[];
  lat: number;
  lng: number;
  color: string;
  index: number;
};

function getClusterColorByIndex(index: number) {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

function createClusterIcon(color: string, index: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:40px;height:40px;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;box-shadow:0 8px 16px rgba(15,23,42,0.24);border:2px solid #fff;background:${color};">${index}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function createParcelIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;border-radius:9999px;border:1px solid #fff;box-shadow:0 2px 4px rgba(15,23,42,0.2);background:${color};"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function FitBoundsToClusters({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points);
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, {
      padding: [32, 32],
      maxZoom: 14,
      animate: true,
    });
  }, [map, points]);

  return null;
}

type ViewMode = "cluster" | "parcel";

export function MapPreviewContent({ view, selected, onSelectCluster }: { view: ViewMode; selected: Cluster | null; onSelectCluster: (cluster: Cluster | null) => void }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
        .from("parcel_lists")
        .select("id, latitude, longitude, cluster_name")
        .eq("status", "pending")
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (error) {
        console.error("MAP FETCH ERROR:", error);
        return;
      }

      const rows = Array.isArray(data)
        ? (data as Parcel[])
        : [];

      const grouped: Record<string, Parcel[]> = {};

      rows.forEach((p) => {
        if (!p.cluster_name) return;
        if (!grouped[p.cluster_name]) grouped[p.cluster_name] = [];
        grouped[p.cluster_name].push(p);
      });

      const computed: Cluster[] = Object.entries(grouped).map(
        ([name, parcels], index) => {
          const lat =
            parcels.reduce((s, p) => s + p.latitude, 0) / parcels.length;
          const lng =
            parcels.reduce((s, p) => s + p.longitude, 0) / parcels.length;

          return {
            name,
            parcels,
            lat,
            lng,
            index: index + 1,
            color: getClusterColorByIndex(index),
          };
        }
      );

      setClusters(computed);
    }

    fetchData();
  }, []);

  const fitPoints = useMemo(() => {
    if (view === "cluster") {
      return clusters.map((cluster) => [cluster.lat, cluster.lng] as [number, number]);
    }

    return clusters.flatMap((cluster) =>
      cluster.parcels.map((parcel) => [parcel.latitude, parcel.longitude] as [number, number])
    );
  }, [clusters, view]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={11}
      zoomControl={false}
      scrollWheelZoom
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
      <ZoomControl position="topright" />
      <FitBoundsToClusters points={fitPoints} />

      {/* ===== CLUSTER VIEW ===== */}
      {view === "cluster" &&
        clusters.map((cluster) => (
          <Marker
            key={cluster.name}
            position={[cluster.lat, cluster.lng]}
            icon={createClusterIcon(cluster.color, cluster.index)}
            eventHandlers={{
              click: () => onSelectCluster(cluster),
            }}
          >
            {selected?.name === cluster.name ? (
              <Popup closeButton={false} closeOnClick={false}>
                <div className="text-sm">
                  <div className="font-semibold">
                    Cluster {cluster.index}
                  </div>
                  <div className="text-gray-700">
                    {cluster.parcels.length} parcels
                  </div>
                </div>
              </Popup>
            ) : null}
          </Marker>
        ))}

      {/* ===== PARCEL VIEW ===== */}
      {view === "parcel" &&
        clusters.flatMap((cluster) =>
          cluster.parcels.map((p) => (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={createParcelIcon(cluster.color)}
            />
          ))
        )}
    </MapContainer>
  );
}
