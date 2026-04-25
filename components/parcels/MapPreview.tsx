"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

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

const MapPreviewContent = dynamic(
  () =>
    import("./MapPreviewContent").then((mod) => ({
      default: mod.MapPreviewContent,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "100%",
          width: "100%",
          backgroundColor: "#f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
        }}
      >
        Loading map...
      </div>
    ),
  }
);

export default function MapPreview() {
  const [view, setView] = useState<"cluster" | "parcel">("cluster");
  const [selected, setSelected] = useState<Cluster | null>(null);

  return (
    <div className="relative h-full w-full rounded-xl overflow-hidden border bg-white">
      {/* VIEW TOGGLE */}
      <div className="absolute top-3 right-3 z-10 bg-white rounded-lg shadow flex overflow-hidden">
        <button
          onClick={() => setView("cluster")}
          className={`px-4 py-1 text-sm font-medium ${
            view === "cluster"
              ? "bg-purple-600 text-white"
              : "text-gray-700"
          }`}
        >
          Clusters
        </button>

        <button
          onClick={() => setView("parcel")}
          className={`px-4 py-1 text-sm font-medium ${
            view === "parcel"
              ? "bg-purple-600 text-white"
              : "text-gray-700"
          }`}
        >
          Parcels
        </button>
      </div>

      <MapPreviewContent view={view} selected={selected} onSelectCluster={setSelected} />
    </div>
  );
}
