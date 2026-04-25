"use client";

import dynamic from "next/dynamic";
import type { SelectionPoint } from "./SelectionPointsMapContent";

type SelectionPointsMapProps = {
  points: SelectionPoint[];
  selectedPointIds?: string[];
  emptyLabel?: string;
};

const SelectionPointsMapContent = dynamic(
  () =>
    import("./SelectionPointsMapContent").then((mod) => ({
      default: mod.SelectionPointsMapContent,
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
          color: "#6b7280",
          fontSize: "0.875rem",
        }}
      >
        Loading map...
      </div>
    ),
  }
);

export default function SelectionPointsMap(props: SelectionPointsMapProps) {
  return <SelectionPointsMapContent {...props} />;
}

export type { SelectionPoint };
