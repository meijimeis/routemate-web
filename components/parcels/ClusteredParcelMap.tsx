"use client";

import dynamic from "next/dynamic";

export type ClusteredParcelMapGroup = {
  id: string;
  label: string;
  color: string;
  parcels: Array<{
    id: string;
    tracking_code: string;
    address: string;
    weight_kg: number;
    lat: number;
    lng: number;
  }>;
  totalWeight: number;
  centroid: {
    lat: number;
    lng: number;
  };
  isUnderTarget: boolean;
  maxDistanceKm: number;
};

type ClusteredParcelMapProps = {
  groups: ClusteredParcelMapGroup[];
  focusGroupId?: string | null;
};

const ClusteredParcelMapContent = dynamic(
  () =>
    import("./ClusteredParcelMapContent").then((mod) => ({
      default: mod.ClusteredParcelMapContent,
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

export default function ClusteredParcelMap(props: ClusteredParcelMapProps) {
  return <ClusteredParcelMapContent {...props} />;
}
