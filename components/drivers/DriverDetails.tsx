"use client";

import { Save, Package } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useDriverStore } from "@/stores/useDriverStore";

const LIVE_TRACKING_STORAGE_KEY = "dashboard.liveTracking.v1";

type Assignment = {
  id: string;
  shipment_id: string;
  address: string;
  weight_kg: number;
  status: string;
  type: "parcel" | "cluster";
  route_id?: string | null;
  rider_id?: string | null;
  parcel_cluster_id?: string | null;
  delivery_count?: number;
  sequence_order?: number | null;
};

type DeliveryRow = {
  id: string;
  route_id?: string | null;
  sequence?: number | null;
  status?: string | null;
  parcel_id?: string | null;
  parcel_list_id?: string | null;
  parcel_cluster_id?: string | null;
  shipment_tracking_id?: string | null;
  rider_id?: string | null;
};

export default function DriverDetails() {
  const driver = useDriverStore((state) => state.selectedDriver);
  const setSelectedDriver = useDriverStore((s) => s.setSelectedDriver);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [capacity, setCapacity] = useState<number>(0);
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  const focusedShipmentId = (searchParams.get("shipmentId") || "").trim().toLowerCase();
  const focusedDeliveryId = (searchParams.get("deliveryId") || "").trim().toLowerCase();

  const fetchAssignments = useCallback(async () => {
    if (!driver?.id) {
      console.log('No driver ID, skipping fetch');
      return;
    }
    
    setLoadingAssignments(true);
    try {
      const baseDeliverySelect = `
        id,
        route_id,
        sequence,
        status,
        parcel_id,
        parcel_list_id,
        parcel_cluster_id,
        shipment_tracking_id,
        rider_id
      `;

      const legacyDeliverySelect = `
        id,
        route_id,
        sequence,
        status,
        parcel_id,
        parcel_list_id,
        shipment_tracking_id,
        rider_id
      `;

      const baseResult = await supabase
        .from("deliveries")
        .select(baseDeliverySelect)
        .eq("rider_id", driver.id)
        .order("sequence", { ascending: true });

      let deliveries: DeliveryRow[] | null = (baseResult.data || null) as DeliveryRow[] | null;
      let deliveryError = baseResult.error;

      const missingClusterColumn =
        !!deliveryError &&
        (() => {
          const lower = String(deliveryError.message || "").toLowerCase();
          return lower.includes("parcel_cluster_id") || lower.includes("deliveries_parcel_cluster_id_fkey");
        })();

      if (missingClusterColumn) {
        const fallback = await supabase
          .from("deliveries")
          .select(legacyDeliverySelect)
          .eq("rider_id", driver.id)
          .order("sequence", { ascending: true });

        deliveries = (fallback.data || null) as DeliveryRow[] | null;
        deliveryError = fallback.error;
      }

      if (deliveryError) {
        console.error("Error fetching deliveries:", deliveryError?.message || deliveryError);
        setAssignments([]);
        return;
      }

      console.log(`Fetched ${deliveries?.length || 0} deliveries for rider ${driver.id}`);

      const parcelListIds = Array.from(
        new Set(
          (deliveries || [])
            .flatMap((row) => [row.parcel_id, row.parcel_list_id, row.parcel_cluster_id])
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        )
      );

      const parcelById = new Map<string, {
        id: string;
        tracking_code?: string | null;
        cluster_name?: string | null;
        address?: string | null;
        parcel_count?: number | null;
        weight_kg?: number | null;
        status?: string | null;
      }>();

      if (parcelListIds.length > 0) {
        const { data: parcelRows, error: parcelRowsError } = await supabase
          .from("parcel_lists")
          .select("id, tracking_code, cluster_name, address, parcel_count, weight_kg, status")
          .in("id", parcelListIds);

        if (parcelRowsError) {
          console.warn("Failed to hydrate delivery parcel rows:", parcelRowsError.message);
        } else {
          (parcelRows || []).forEach((parcel) => {
            if (typeof parcel?.id !== "string" || parcel.id.length === 0) return;
            parcelById.set(parcel.id, parcel);
          });
        }
      }

      const stopStatsByDeliveryId = new Map<string, { pending: number; total: number }>();
      const deliveryIds = (deliveries || [])
        .map((row) => (typeof row.id === "string" ? row.id : null))
        .filter((id): id is string => Boolean(id));

      if (deliveryIds.length > 0) {
        const { data: deliveryStops, error: deliveryStopsError } = await supabase
          .from("delivery_stops")
          .select("delivery_id, status")
          .in("delivery_id", deliveryIds);

        if (deliveryStopsError) {
          const message = String(deliveryStopsError?.message || "").toLowerCase();
          const isMissingStopsTable =
            message.includes("delivery_stops") &&
            (message.includes("does not exist") || message.includes("schema cache"));

          if (!isMissingStopsTable) {
            console.warn("Failed to hydrate delivery stop stats:", deliveryStopsError.message);
          }
        } else {
          (deliveryStops || []).forEach((stop) => {
            const deliveryId = typeof stop?.delivery_id === "string" ? stop.delivery_id : null;
            if (!deliveryId) return;

            const existing = stopStatsByDeliveryId.get(deliveryId) || { pending: 0, total: 0 };
            existing.total += 1;

            const normalizedStatus = String(stop?.status || "").toLowerCase();
            if (!["completed", "cancelled", "failed"].includes(normalizedStatus)) {
              existing.pending += 1;
            }

            stopStatsByDeliveryId.set(deliveryId, existing);
          });
        }
      }

      // Use deliveries data
      const normalizedRows: Assignment[] = (deliveries || [])
        .map((d) => {
          const parcelByKey = (value?: string | null) => {
            if (typeof value !== "string" || value.trim().length === 0) return null;
            return parcelById.get(value) || null;
          };

          const parcel =
            parcelByKey(d.parcel_id) ||
            parcelByKey(d.parcel_list_id) ||
            parcelByKey(d.parcel_cluster_id) ||
            null;
          const shipmentTrackingId =
            typeof d.shipment_tracking_id === "string"
              ? d.shipment_tracking_id.trim()
              : "";

          const explicitClusterId =
            typeof d.parcel_cluster_id === "string"
              ? d.parcel_cluster_id.trim()
              : "";

          const inferredLegacyClusterId =
            !d.parcel_id && typeof d.parcel_list_id === "string"
              ? d.parcel_list_id.trim()
              : "";

          const clusterId = explicitClusterId || inferredLegacyClusterId;

          const clusterByParcelClusterId = clusterId ? parcelById.get(clusterId) || null : null;

          const clusterTracking =
            typeof clusterByParcelClusterId?.tracking_code === "string"
              ? clusterByParcelClusterId.tracking_code.trim()
              : "";

          const clusterName =
            typeof clusterByParcelClusterId?.cluster_name === "string"
              ? clusterByParcelClusterId.cluster_name.trim()
              : "";

          const shipmentId =
            clusterId
              ? clusterTracking || clusterName || `Cluster ${clusterId.slice(0, 8)}`
              : shipmentTrackingId || parcel?.tracking_code?.trim() || d.parcel_list_id || d.parcel_id || d.id;

          const sequenceOrder = Number.isFinite(Number(d.sequence)) ? Number(d.sequence) : Number.MAX_SAFE_INTEGER;
          const clusterParcelCount = Math.max(1, Number(clusterByParcelClusterId?.parcel_count || 1));
          const clusterWeight = Number(clusterByParcelClusterId?.weight_kg || 0);
          const perStopClusterWeight = clusterWeight > 0 ? clusterWeight / clusterParcelCount : 0;
          const stopStats = stopStatsByDeliveryId.get(d.id) || null;
          const pendingStops = stopStats ? stopStats.pending : 0;
          const totalStops = stopStats ? stopStats.total : 0;

          return {
            id: d.id,
            shipment_id: shipmentId,
            address:
              clusterId
                ? clusterName || clusterByParcelClusterId?.address || parcel?.address || "Cluster delivery"
                : parcel?.address || "No address",
            weight_kg: clusterId ? perStopClusterWeight : Number(parcel?.weight_kg || 0),
            status:
              clusterId && totalStops > 0 && pendingStops === 0
                ? "completed"
                : d.status || parcel?.status || clusterByParcelClusterId?.status || "pending",
            type: clusterId ? ("cluster" as const) : ("parcel" as const),
            route_id: d.route_id || null,
            rider_id: d.rider_id || null,
            parcel_cluster_id: clusterId || null,
            delivery_count: clusterId ? (pendingStops > 0 ? pendingStops : totalStops || 1) : 1,
            sequence_order: sequenceOrder,
          };
        });

      const clusterAssignmentsById = new Map<string, Assignment>();
      const individualAssignments: Assignment[] = [];

      normalizedRows.forEach((row) => {
        const clusterId = (row.parcel_cluster_id || "").trim();
        const rowDeliveryCount = Math.max(1, Number(row.delivery_count || 1));

        if (!clusterId) {
          individualAssignments.push(row);
          return;
        }

        const existing = clusterAssignmentsById.get(clusterId);
        if (!existing) {
          clusterAssignmentsById.set(clusterId, {
            ...row,
            id: row.id,
            type: "cluster",
            delivery_count: rowDeliveryCount,
          });
          return;
        }

        existing.delivery_count = Number(existing.delivery_count || 0) + rowDeliveryCount;
        existing.weight_kg = Number(existing.weight_kg || 0) + Number(row.weight_kg || 0);
        existing.sequence_order = Math.min(
          Number(existing.sequence_order ?? Number.MAX_SAFE_INTEGER),
          Number(row.sequence_order ?? Number.MAX_SAFE_INTEGER)
        );
      });

      const combined: Assignment[] = [
        ...Array.from(clusterAssignmentsById.values()),
        ...individualAssignments,
      ].sort(
        (left, right) =>
          Number(left.sequence_order ?? Number.MAX_SAFE_INTEGER) -
          Number(right.sequence_order ?? Number.MAX_SAFE_INTEGER)
      );

      console.log(`Total assignments: ${combined.length}`, combined);
      setAssignments(combined);
    } catch (err) {
      console.error("Error fetching assignments:", err);
    } finally {
      setLoadingAssignments(false);
    }
  }, [driver?.id]);

  const handleSaveCapacity = async () => {
    if (!driver?.id) return;
    
    setSaving(true);
    setError(null);
    try {
      const { updateRiderCapacity } = await import("@/lib/api");
      await updateRiderCapacity(driver.id, capacity);
      
      // Update the store
      setSelectedDriver({
        ...driver,
        capacity_kg: capacity,
      });
      
      setEditingCapacity(false);
    } catch (err) {
      console.error("Error updating capacity:", err);
      setError("Failed to update. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleTrackAssignment = (assignment: Assignment) => {
    const trackingQuery =
      assignment.shipment_id?.trim() ||
      (assignment.type === "cluster" ? assignment.parcel_cluster_id : null)?.trim() ||
      assignment.id;

    try {
      window.localStorage.setItem(
        LIVE_TRACKING_STORAGE_KEY,
        JSON.stringify({
          deliveryId: assignment.id,
          routeId: assignment.route_id || null,
          query: trackingQuery,
        })
      );
    } catch (error) {
      console.error("Failed to persist assignment tracking context:", error);
    }

    const params = new URLSearchParams();
    params.set("trackDeliveryId", assignment.id);

    if (assignment.route_id) {
      params.set("trackRouteId", assignment.route_id);
    }

    if (trackingQuery) {
      params.set("trackShipmentId", trackingQuery);
    }

    router.push(`/?${params.toString()}`);
  };

  useEffect(() => {
    if (driver) {
      setCapacity(driver.capacity_kg || 0);
      fetchAssignments();
    }
  }, [driver, fetchAssignments]);

  if (!driver) {
    return (
      <div className="h-full rounded-2xl bg-white/70 backdrop-blur p-6 shadow flex items-center justify-center">
        <p className="text-gray-500">Select a driver to view details</p>
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl bg-white/70 backdrop-blur p-6 shadow flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-blue-700">
          {driver.name.charAt(0)}
        </div>
        <div>
          <p className="font-semibold text-black">{driver.name}</p>
          <p className="text-xs text-gray-500 capitalize">{driver.vehicle_type}</p>
        </div>
      </div>

      {/* Capacity Edit Section */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm font-medium text-gray-700 mb-3">Rider Capacity</p>
        
        {!editingCapacity ? (
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold text-blue-600">{capacity} kg</p>
            <button
              onClick={() => setEditingCapacity(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(Math.max(0, parseInt(e.target.value) || 0))}
              min="0"
              className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingCapacity(false);
                  setCapacity(driver.capacity_kg || 0);
                  setError(null);
                }}
                className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCapacity}
                disabled={saving}
                className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Driver Info */}
      <div className="space-y-3 text-sm mb-6">
        <div className="flex justify-between">
          <span className="text-gray-600">Status</span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            driver.status === "idle"
              ? "bg-green-100 text-green-700"
              : driver.status === "on_delivery"
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-700"
          }`}>
            {driver.status.replace("_", " ")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Vehicle Type</span>
          <span className="font-medium text-black">{driver.vehicle_type}</span>
        </div>
      </div>

      {/* Assigned Parcels */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-4 w-4 text-gray-700" />
          <h4 className="font-semibold text-sm text-black">Assigned Parcels</h4>
          <span className="text-xs text-gray-500 ml-auto">{assignments.length}</span>
        </div>

        {focusedShipmentId || focusedDeliveryId ? (
          <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] text-blue-800">
            Showing tracked shipment context from Dashboard.
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
          {loadingAssignments ? (
            <p className="text-xs text-gray-500">Loading...</p>
          ) : assignments.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">No assigned parcels</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((parcel) => {
                const isFocused =
                  (focusedDeliveryId.length > 0 && parcel.id.toLowerCase() === focusedDeliveryId) ||
                  (focusedShipmentId.length > 0 && (
                    parcel.shipment_id.toLowerCase() === focusedShipmentId ||
                    (parcel.parcel_cluster_id || "").toLowerCase() === focusedShipmentId
                  ));

                return (
                <button
                  key={parcel.id}
                  type="button"
                  onClick={() => handleTrackAssignment(parcel)}
                  title="Open this assignment in Dashboard live tracker"
                  className={`w-full p-2 bg-white rounded-lg border text-left transition ${
                    isFocused
                      ? "border-blue-500 ring-1 ring-blue-300"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="grid min-h-[76px] grid-rows-[auto_auto_auto] gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[11px] font-semibold text-[#1F2340]">
                        {parcel.shipment_id}
                      </p>
                      <span className={`shrink-0 text-xs font-medium whitespace-nowrap px-1.5 py-0.5 rounded ${
                        parcel.type === "cluster"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-orange-100 text-orange-700"
                      }`}>
                        {parcel.type === "cluster" ? "Cluster" : "Parcel"}
                      </span>
                    </div>

                    <p className="truncate text-xs font-medium text-black">{parcel.address}</p>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-600 truncate">
                        {parcel.type === "cluster"
                          ? `${parcel.delivery_count || 0} stops • ${(parcel.weight_kg || 0).toFixed(1)} kg • ${parcel.status.replace("_", " ")}`
                          : `${parcel.weight_kg} kg • ${parcel.status.replace("_", " ")}`}
                      </p>
                      <p className="shrink-0 text-[10px] font-semibold text-blue-700">Track in Dashboard</p>
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
