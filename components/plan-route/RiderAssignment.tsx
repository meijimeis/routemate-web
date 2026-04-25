"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getGeofences, getLatestRiderLocation, getRiders } from "@/lib/api";
import { usePlanRouteStore, Parcel, Rider } from "@/stores/usePlanRouteStore";
import { MapPin, CheckCircle2 } from "lucide-react";
import {
  buildGeofenceRuntime,
  getComponentIdsForPoint,
  isPointInsideGeofences,
} from "@/lib/geofenceRuntime";

type RiderRow = {
  id: string;
  capacity?: number | null;
  status?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  current_location_at?: string | null;
  profiles?:
    | {
        full_name?: string | null;
      }
    | Array<{
        full_name?: string | null;
      }>
    | null;
};

type SuggestedRider = Rider & {
  distance: number;
  hasLiveLocation: boolean;
};

type ClusterRow = {
  id: string;
  cluster_name?: string | null;
  address?: string | null;
  weight_kg?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  parcel_list_items?: Array<{ parcel_id: string }>;
};

type GeofenceRow = {
  id?: string | null;
  name?: string | null;
  region?: string | null;
  geometry?: unknown;
};

type RouteDebugSnapshot = {
  source: string;
  expectedClusterMembers: number | null;
  resolvedExplicitMembers: number | null;
  clusterRowsCount: number;
  finalEligibleStops: number;
  reason: string | null;
};

const INDIVIDUAL_PREFIX = "parcel:";

const toFiniteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeClusterName = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const hasRiderCoordinates = (
  rider: Rider | null
): rider is Rider & { lat: number; lng: number } =>
  !!rider &&
  typeof rider.lat === "number" &&
  Number.isFinite(rider.lat) &&
  typeof rider.lng === "number" &&
  Number.isFinite(rider.lng);

function getProfileName(
  profiles:
    | {
        full_name?: string | null;
      }
    | Array<{
        full_name?: string | null;
      }>
    | null
    | undefined
) {
  if (Array.isArray(profiles)) {
    return profiles[0]?.full_name || "Unknown";
  }

  return profiles?.full_name || "Unknown";
}

/* ================= HELPERS ================= */

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapParcelListRows(rows: ClusterRow[], fallbackLabel: string): Parcel[] {
  return rows.map((row, index) => {
    const latitude = toFiniteOrNull(row.latitude);
    const longitude = toFiniteOrNull(row.longitude);

    return {
      id: row.id,
      address: row.address || `${fallbackLabel} item ${index + 1}`,
      weight_kg: Number(row.weight_kg || 0),
      lat: latitude ?? Number.NaN,
      lng: longitude ?? Number.NaN,
    };
  });
}

/* ================= COMPONENT ================= */

export default function RiderAssignment() {
  const clusterName = usePlanRouteStore((s) => s.selectedClusterName);
  const selectedRider = usePlanRouteStore((s) => s.selectedRider);
  const setSelectedRider = usePlanRouteStore((s) => s.setSelectedRider);
  const setAssignedParcels = usePlanRouteStore((s) => s.setAssignedParcels);

  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [eligibilityMessage, setEligibilityMessage] = useState<string | null>(null);
  const [routeDebugSnapshot, setRouteDebugSnapshot] = useState<RouteDebugSnapshot | null>(null);

  /* ================= FETCH DATA ================= */

  const fetchParcels = useCallback(async () => {
    if (!clusterName) return;

    try {
      setEligibilityMessage(null);

      const debugContext: RouteDebugSnapshot = {
        source: "pending",
        expectedClusterMembers: null,
        resolvedExplicitMembers: null,
        clusterRowsCount: 0,
        finalEligibleStops: 0,
        reason: null,
      };

      const pushDebugSnapshot = (overrides: Partial<RouteDebugSnapshot> = {}) => {
        setRouteDebugSnapshot({
          ...debugContext,
          ...overrides,
        });
      };

      const geofenceRowsRaw = await getGeofences(undefined);
      const geofenceRuntime = buildGeofenceRuntime(
        Array.isArray(geofenceRowsRaw) ? (geofenceRowsRaw as GeofenceRow[]) : []
      );

      const finalizeEligibleParcels = (candidateParcels: Parcel[], sourceLabel: string) => {
        if (geofenceRuntime.zones.length === 0) {
          setParcels([]);
          setEligibilityMessage("No organization geofences are configured, so this selection cannot be routed.");
          pushDebugSnapshot({ source: sourceLabel, finalEligibleStops: 0, reason: "missing_geofences" });
          return;
        }

        const parcelsWithCoordinates = candidateParcels.filter(
          (parcel) => Number.isFinite(parcel.lat) && Number.isFinite(parcel.lng)
        );

        if (parcelsWithCoordinates.length === 0 || parcelsWithCoordinates.length !== candidateParcels.length) {
          setParcels([]);
          setEligibilityMessage("Selected parcel data is missing coordinates required for geofence validation.");
          pushDebugSnapshot({ source: sourceLabel, finalEligibleStops: 0, reason: "missing_coordinates" });
          return;
        }

        const allInsideGeofences = parcelsWithCoordinates.every((parcel) =>
          isPointInsideGeofences(parcel.lat, parcel.lng, geofenceRuntime)
        );

        if (!allInsideGeofences) {
          setParcels([]);
          setEligibilityMessage("Selected parcel is outside your organization geofences.");
          pushDebugSnapshot({ source: sourceLabel, finalEligibleStops: 0, reason: "parcels_outside_org_geofence" });
          return;
        }

        if (!hasRiderCoordinates(selectedRider)) {
          setParcels([]);
          setEligibilityMessage("Select a rider with live location to validate super-geofence routing.");
          pushDebugSnapshot({ source: sourceLabel, finalEligibleStops: 0, reason: "rider_missing_location" });
          return;
        }

        if (!isPointInsideGeofences(selectedRider.lat, selectedRider.lng, geofenceRuntime)) {
          setParcels([]);
          setEligibilityMessage("Selected rider is outside your organization geofences.");
          pushDebugSnapshot({ source: sourceLabel, finalEligibleStops: 0, reason: "rider_outside_org_geofence" });
          return;
        }

        const riderComponentIds = getComponentIdsForPoint(selectedRider.lat, selectedRider.lng, geofenceRuntime);
        if (riderComponentIds.length === 0) {
          setParcels([]);
          setEligibilityMessage("Selected rider is not inside a routable geofence zone.");
          pushDebugSnapshot({ source: sourceLabel, finalEligibleStops: 0, reason: "rider_missing_component" });
          return;
        }

        const riderComponentSet = new Set(riderComponentIds);
        const allInSameRiderGeofence = parcelsWithCoordinates.every((parcel) => {
          const parcelComponentIds = getComponentIdsForPoint(parcel.lat, parcel.lng, geofenceRuntime);
          return parcelComponentIds.some((componentId) => riderComponentSet.has(componentId));
        });

        if (!allInSameRiderGeofence) {
          setParcels([]);
          setEligibilityMessage(
            "Selected parcel(s) are in a different super geofence area than the selected rider."
          );
          pushDebugSnapshot({ source: sourceLabel, finalEligibleStops: 0, reason: "different_super_geofence" });
          return;
        }

        setParcels(parcelsWithCoordinates);
        setEligibilityMessage(null);
        pushDebugSnapshot({ source: sourceLabel, finalEligibleStops: parcelsWithCoordinates.length, reason: null });
      };

      if (clusterName.startsWith(INDIVIDUAL_PREFIX)) {
        const parcelId = clusterName.replace(INDIVIDUAL_PREFIX, "");

        const { data: singleParcel } = await supabase
          .from("parcel_lists")
          .select("id, address, weight_kg, latitude, longitude")
          .eq("id", parcelId)
          .neq("status", "assigned")
          .maybeSingle();

        type SingleParcelData = {
          id: string;
          address: string;
          weight_kg: number;
          latitude: number;
          longitude: number;
        };

        const mapped: Parcel[] = singleParcel
          ? [
              {
                id: (singleParcel as SingleParcelData).id,
                address: (singleParcel as SingleParcelData).address,
                weight_kg: (singleParcel as SingleParcelData).weight_kg,
                lat: toFiniteOrNull((singleParcel as SingleParcelData).latitude) ?? Number.NaN,
                lng: toFiniteOrNull((singleParcel as SingleParcelData).longitude) ?? Number.NaN,
              },
            ]
          : [];

        if (mapped.length > 0) {
          finalizeEligibleParcels(mapped, "single_parcel_list");
          return;
        }

        const { data: singleParcelFromParcels } = await supabase
          .from("parcels")
          .select("id, lat, lng")
          .eq("id", parcelId)
          .maybeSingle();

        type SingleParcelFallback = {
          id: string;
          lat: number | null;
          lng: number | null;
        };

        const fallbackMapped: Parcel[] = singleParcelFromParcels
          ? [
              {
                id: (singleParcelFromParcels as SingleParcelFallback).id,
                address: `Parcel ${(singleParcelFromParcels as SingleParcelFallback).id.slice(0, 8)}`,
                weight_kg: 0,
                lat: toFiniteOrNull((singleParcelFromParcels as SingleParcelFallback).lat) ?? Number.NaN,
                lng: toFiniteOrNull((singleParcelFromParcels as SingleParcelFallback).lng) ?? Number.NaN,
              },
            ]
          : [];

        finalizeEligibleParcels(fallbackMapped, "single_parcels_table");
        return;
      }

      // First, try to fetch parcel clusters with explicit item links.
      const normalizedClusterName = normalizeClusterName(clusterName);
      if (!normalizedClusterName) {
        throw new Error("Selected cluster name is invalid.");
      }

      const { data: clusterRowsRaw, error: clusterRowsError } = await supabase
        .from("parcel_lists")
        .select(`
          id,
          cluster_name,
          address,
          weight_kg,
          latitude,
          longitude,
          status,
          parcel_list_items (
            parcel_id
          )
        `)
        .not("cluster_name", "is", null)
        .in("status", ["pending", "acquired", "unassigned"]);

      if (clusterRowsError) {
        throw clusterRowsError;
      }

      const clusterRows = Array.isArray(clusterRowsRaw)
        ? (clusterRowsRaw as ClusterRow[]).filter(
            (row) => normalizeClusterName(row.cluster_name) === normalizedClusterName
          )
        : [];

      debugContext.clusterRowsCount = clusterRows.length;

      const explicitCluster = clusterRows.find(
        (row) => Array.isArray(row.parcel_list_items) && row.parcel_list_items.length > 0
      );

      type ListItem = { parcel_id: string };
      type ParcelData = { id: string; lat: number; lng: number; status?: string };

      if (explicitCluster?.parcel_list_items && explicitCluster.parcel_list_items.length > 0) {
        // This cluster has explicit parcel members.
        const parcelIds = (explicitCluster.parcel_list_items as ListItem[]).map((item) => item.parcel_id);
        debugContext.expectedClusterMembers = parcelIds.length;
        
        const { data: parcelData } = await supabase
          .from("parcels")
          .select("id, lat, lng, status")
          .in("id", parcelIds);

        const mapped: Parcel[] =
          (parcelData as ParcelData[] | null)?.map((p) => ({
            id: p.id,
            address: `Location (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`,
            weight_kg: 0,
            lat: p.lat,
            lng: p.lng,
          })) || [];

        debugContext.resolvedExplicitMembers = mapped.length;

        if (mapped.length === parcelIds.length && mapped.length > 0) {
          finalizeEligibleParcels(mapped, "explicit_cluster_items");
          return;
        }

        if (mapped.length > 0 && mapped.length < parcelIds.length) {
          console.warn(
            "Cluster explicit-member lookup returned partial parcel coordinates; falling back to parcel_list rows.",
            {
              clusterName,
              expectedMembers: parcelIds.length,
              resolvedMembers: mapped.length,
            }
          );
        }
      }

      const mappedFromLists = mapParcelListRows(clusterRows, clusterName);
      finalizeEligibleParcels(mappedFromLists, "cluster_rows_fallback");
    } catch (err) {
      console.error("Failed to fetch parcels:", err);
      setParcels([]);
      setEligibilityMessage("Failed to validate geofence eligibility for the selected parcel(s).");
      setRouteDebugSnapshot((prev) => ({
        source: prev?.source || "error",
        expectedClusterMembers: prev?.expectedClusterMembers ?? null,
        resolvedExplicitMembers: prev?.resolvedExplicitMembers ?? null,
        clusterRowsCount: prev?.clusterRowsCount ?? 0,
        finalEligibleStops: 0,
        reason: "exception",
      }));
    }
  }, [clusterName, selectedRider]);

  const fetchRiders = useCallback(async () => {
    try {
      const data = await getRiders(undefined);
      const rows = Array.isArray(data) ? (data as RiderRow[]) : [];

      const mappedData: Rider[] = await Promise.all(
        rows.map(async (rider) => {
          let latitude = toFiniteOrNull(rider.current_latitude);
          let longitude = toFiniteOrNull(rider.current_longitude);
          let locationUpdatedAt = rider.current_location_at || null;

          if (latitude === null || longitude === null) {
            const latestRaw = await getLatestRiderLocation(rider.id);
            const latest = (latestRaw || null) as {
              latitude?: number | null;
              longitude?: number | null;
              timestamp?: string | null;
            } | null;

            if (latest) {
              const fallbackLat = toFiniteOrNull(latest.latitude);
              const fallbackLng = toFiniteOrNull(latest.longitude);

              if (fallbackLat !== null && fallbackLng !== null) {
                latitude = fallbackLat;
                longitude = fallbackLng;
              }

              if (latest.timestamp && !locationUpdatedAt) {
                locationUpdatedAt = latest.timestamp;
              }
            }
          }

          return {
            id: rider.id,
            name: getProfileName(rider.profiles),
            capacity_kg: rider.capacity || 0,
            lat: latitude,
            lng: longitude,
            location_updated_at: locationUpdatedAt,
          };
        })
      );

      setRiders(mappedData);
    } catch (err) {
      console.error("Failed to fetch riders:", err);
      setRiders([]);
    }
  }, []);

  useEffect(() => {
    if (!clusterName) return;

    fetchParcels();
  }, [clusterName, selectedRider, fetchParcels]);

  useEffect(() => {
    if (!clusterName) return;

    fetchRiders();
  }, [clusterName, fetchRiders]);

  /* ================= COMPUTED ================= */

  const totalWeight = useMemo(
    () =>
      parcels.reduce((sum: number, p: Parcel) => {
        const weight = Number(p.weight_kg);
        return sum + (Number.isFinite(weight) ? weight : 0);
      }, 0),
    [parcels]
  );

  const parcelsWithCoordinates = useMemo(
    () => parcels.filter((p) => isFiniteNumber(p.lat) && isFiniteNumber(p.lng)),
    [parcels]
  );

  const clusterCenter = useMemo(() => {
    if (parcelsWithCoordinates.length === 0) return null;

    return {
      lat:
        parcelsWithCoordinates.reduce((s: number, p: Parcel) => s + p.lat, 0) /
        parcelsWithCoordinates.length,
      lng:
        parcelsWithCoordinates.reduce((s: number, p: Parcel) => s + p.lng, 0) /
        parcelsWithCoordinates.length,
    };
  }, [parcelsWithCoordinates]);

  const suggestedRiders = useMemo(() => {
    if (riders.length === 0) return [];

    const rankedRiders: SuggestedRider[] = riders
      .filter((r: Rider) => r.capacity_kg >= totalWeight || r.id === selectedRider?.id)
      .map((r): SuggestedRider => {
        const hasLiveLocation = hasRiderCoordinates(r);

        return {
          ...r,
          hasLiveLocation,
          distance:
            hasLiveLocation && clusterCenter
              ? haversine(clusterCenter.lat, clusterCenter.lng, r.lat, r.lng)
              : Number.POSITIVE_INFINITY,
        };
      })
      .sort((a, b) => {
        if (a.id === selectedRider?.id && b.id !== selectedRider?.id) return -1;
        if (b.id === selectedRider?.id && a.id !== selectedRider?.id) return 1;

        if (a.hasLiveLocation !== b.hasLiveLocation) {
          return a.hasLiveLocation ? -1 : 1;
        }

        if (Number.isFinite(a.distance) && Number.isFinite(b.distance)) {
          return a.distance - b.distance;
        }

        return a.name.localeCompare(b.name);
      });

    if (selectedRider && !rankedRiders.some((r) => r.id === selectedRider.id)) {
      const hasLiveLocation = hasRiderCoordinates(selectedRider);
      rankedRiders.unshift({
        ...selectedRider,
        hasLiveLocation,
        distance: hasLiveLocation && clusterCenter
          ? haversine(clusterCenter.lat, clusterCenter.lng, selectedRider.lat, selectedRider.lng)
          : Number.POSITIVE_INFINITY,
      });
    }

    return rankedRiders;
  }, [riders, totalWeight, clusterCenter, selectedRider]);

  /* ================= ACTION ================= */

  async function assign() {
    if (!selectedRider) return;

    try {
      setIsAssigning(true);

      // Planning step only; persistence happens in Rider Route confirmation.
      setAssignedParcels(parcels);
    } catch (err) {
      console.error("Assignment error:", err);
      alert(`Failed to assign: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsAssigning(false);
    }
  }

  if (!clusterName) {
    return (
      <div className="bg-white rounded-xl p-4 text-sm">
        Select an individual or cluster parcel to assign
      </div>
    );
  }

  const canAddToRoute = Boolean(selectedRider) && !isAssigning && parcels.length > 0;
  const disabledReason = !selectedRider
    ? "Select a rider to continue"
    : parcels.length === 0
      ? "No parcel rows were loaded for this selection"
      : null;

  /* ================= UI ================= */

  return (
    <div className="bg-white rounded-xl p-4 shadow space-y-4">
      <h3 className="font-semibold">Rider Assignment</h3>

      {/* CLUSTER INFO */}
      <p className="text-sm">
        Selection: <strong>{clusterName.startsWith(INDIVIDUAL_PREFIX) ? "Individual Parcel" : clusterName}</strong>
      </p>

      {/* PARCEL LIST */}
      <ul className="text-sm space-y-1">
        {parcels.map((p: Parcel) => (
          <li key={p.id} className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-orange-500" />
            {p.address}
          </li>
        ))}
      </ul>

      {/* SUGGESTED RIDERS */}
      <div>
        <p className="text-sm font-medium mb-2">Suggested Rider(s)</p>

        <div className="space-y-2">
          {suggestedRiders.map((r: SuggestedRider) => (
            <button
              key={r.id}
              onClick={() => setSelectedRider(r)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border text-left
                ${
                  selectedRider?.id === r.id
                    ? "border-purple-500 bg-purple-50"
                    : "hover:bg-gray-50"
                }`}
            >
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-gray-700">
                  {r.capacity_kg} kg capacity
                  {r.hasLiveLocation ? ` · ${r.distance.toFixed(1)} km` : " · location pending"}
                </p>
              </div>

              {selectedRider?.id === r.id && (
                <CheckCircle2 className="text-green-500 h-5 w-5" />
              )}
            </button>
          ))}

          {suggestedRiders.length === 0 && (
            <p className="text-xs text-gray-700">
              No available riders found for this parcel load
            </p>
          )}
        </div>
      </div>

      {/* ASSIGN BUTTON */}
      <button
        disabled={!canAddToRoute}
        onClick={assign}
        className="w-full bg-purple-600 text-white py-2 rounded disabled:opacity-50"
      >
        {isAssigning ? 'Preparing...' : 'Add to Route Plan'}
      </button>

      {!canAddToRoute && disabledReason && (
        <p className="text-xs text-gray-600">{disabledReason}</p>
      )}

      {eligibilityMessage ? (
        <p className="text-xs text-red-700">{eligibilityMessage}</p>
      ) : null}

      {routeDebugSnapshot ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">Route Debug Snapshot</p>
          <div className="mt-1 space-y-0.5 text-[11px] text-gray-700">
            <p>Source: {routeDebugSnapshot.source}</p>
            <p>Expected cluster members: {routeDebugSnapshot.expectedClusterMembers ?? "-"}</p>
            <p>Resolved explicit members: {routeDebugSnapshot.resolvedExplicitMembers ?? "-"}</p>
            <p>Cluster rows fetched: {routeDebugSnapshot.clusterRowsCount}</p>
            <p>Final eligible stops: {routeDebugSnapshot.finalEligibleStops}</p>
            <p>Reason: {routeDebugSnapshot.reason ?? "ok"}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
