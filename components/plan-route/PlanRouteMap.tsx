"use client";

import dynamic from "next/dynamic";

const PlanRouteMapContent = dynamic(
  () =>
    import("./PlanRouteMapContent").then((mod) => ({
      default: mod.PlanRouteMapContent,
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

export default function PlanRouteMap() {
  return <PlanRouteMapContent />;
}
