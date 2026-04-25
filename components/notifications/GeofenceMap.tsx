"use client";

import dynamic from "next/dynamic";
import {
  GeofenceZoneShape,
  ParcelGeofenceOverlay,
  RoutePolylineOverlay,
} from "./types";

const GeofenceMapContent = dynamic(
  () =>
    import("./GeofenceMapContent").then((mod) => ({
      default: mod.GeofenceMapContent,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full rounded-lg overflow-hidden flex items-center justify-center bg-gray-100">
        Loading map...
      </div>
    ),
  }
);

type GeofenceMapProps = {
  zones: GeofenceZoneShape[];
  parcelGeofences?: ParcelGeofenceOverlay[];
  routePolylines?: RoutePolylineOverlay[];
  zoneWarningById: Record<string, number>;
};

export default function GeofenceMap({
  zones,
  parcelGeofences = [],
  routePolylines = [],
  zoneWarningById,
}: GeofenceMapProps) {
  return (
    <GeofenceMapContent
      zones={zones}
      parcelGeofences={parcelGeofences}
      routePolylines={routePolylines}
      zoneWarningById={zoneWarningById}
    />
  );
}