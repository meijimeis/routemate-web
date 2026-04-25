"use client";

import dynamic from "next/dynamic";

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

const LeafletMapContent = dynamic(
  () =>
    import("./LeafletMapContent").then((mod) => ({
      default: mod.LeafletMapContent,
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

export default function MapboxMap(props: MapboxMapProps) {
  return <LeafletMapContent {...props} />;
}
