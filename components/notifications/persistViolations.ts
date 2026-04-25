import { supabase } from "@/lib/supabaseClient";
import { GeofenceViolation } from "./types";

export async function persistViolation(v: GeofenceViolation) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const response = await fetch("/api/violations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      id: v.id,
      rider_name: v.riderName,
      zone_name: v.zoneName,
      lat: v.lat,
      lng: v.lng,
      violation_type: v.violationType,
      base_severity: v.baseSeverity,
      traffic_level: v.trafficLevel,
      timestamp: v.timestamp,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Failed to persist violation" }));
    throw new Error(data.error || "Failed to persist violation");
  }
}
