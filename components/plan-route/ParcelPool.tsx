"use client";

import { useEffect, useState, useCallback } from "react";
import { getAllParcels, getGeofences } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { usePlanRouteStore } from "@/stores/usePlanRouteStore";
import { Boxes, MapPin, Package, RefreshCcw } from "lucide-react";
import {
  buildGeofenceRuntime,
  getComponentIdsForPoint,
  isPointInsideGeofences,
  pointsShareMergedGeofenceComponent,
} from "@/lib/geofenceRuntime";

type ParcelCluster = {
  parcel_cluster_id?: string;
  cluster_name: string;
  parcel_count: number;
  total_weight_kg?: number | null;
  status: string;
};

type IndividualParcel = {
  id: string;
  tracking_code?: string | null;
  address?: string | null;
  weight_kg?: number | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cluster_name?: string | null;
};

type GeofenceRow = {
  id?: string | null;
  name?: string | null;
  region?: string | null;
  geometry?: unknown;
};

type DeliveryRow = {
  parcel_id?: string | null;
  parcel_list_id?: string | null;
};

type DeliveryStopRow = {
  parcel_list_id?: string | null;
};

const INDIVIDUAL_PREFIX = "parcel:";
const POOL_CLUSTER_STATUSES = ["pending", "acquired", "unassigned"];
const POOL_ASSIGNABLE_STATUS_SET = new Set(POOL_CLUSTER_STATUSES);

const normalizeStatus = (status?: string | null) => (status || "").trim().toLowerCase();

const isPoolEligibleStatus = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  return POOL_ASSIGNABLE_STATUS_SET.has(normalized);
};

function hasCoordinates(parcel: IndividualParcel) {
  const latitude = Number(parcel.latitude);
  const longitude = Number(parcel.longitude);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

function hasRiderCoordinates(rider: { lat: number | null; lng: number | null } | null): rider is {
  lat: number;
  lng: number;
} {
  return (
    !!rider &&
    typeof rider.lat === "number" &&
    Number.isFinite(rider.lat) &&
    typeof rider.lng === "number" &&
    Number.isFinite(rider.lng)
  );
}

export default function ParcelPool() {
  const [parcelClusters, setParcelClusters] = useState<ParcelCluster[]>([]);
  const [individualParcels, setIndividualParcels] = useState<IndividualParcel[]>([]);
  const [eligibilityHint, setEligibilityHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedClusterName = usePlanRouteStore((s) => s.selectedClusterName);
  const selectedRider = usePlanRouteStore((s) => s.selectedRider);
  const setSelectedClusterName = usePlanRouteStore((s) => s.setSelectedClusterName);

  const fetchPoolData = useCallback(async () => {
    try {
      setLoading(true);

      const [parcelRows, geofencesRaw] = await Promise.all([
        getAllParcels(undefined),
        getGeofences(undefined),
      ]);

      const parcels = Array.isArray(parcelRows) ? (parcelRows as IndividualParcel[]) : [];
      const runtime = buildGeofenceRuntime(
        Array.isArray(geofencesRaw) ? (geofencesRaw as GeofenceRow[]) : []
      );

      const parcelIds = Array.from(
        new Set(
          parcels
            .map((parcel) => parcel.id)
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        )
      );

      const blockedParcelIds = new Set<string>();

      if (parcelIds.length > 0) {
        const [deliveriesByParcelResponse, deliveriesByParcelListResponse, deliveryStopsResponse] = await Promise.all([
          supabase
            .from("deliveries")
            .select("parcel_id")
            .in("parcel_id", parcelIds),
          supabase
            .from("deliveries")
            .select("parcel_list_id")
            .in("parcel_list_id", parcelIds),
          supabase
            .from("delivery_stops")
            .select("parcel_list_id")
            .in("parcel_list_id", parcelIds),
        ]);

        if (deliveriesByParcelResponse.error) {
          console.warn("Failed to check delivery conflicts by parcel_id:", deliveriesByParcelResponse.error.message);
        }

        if (deliveriesByParcelListResponse.error) {
          console.warn(
            "Failed to check delivery conflicts by parcel_list_id:",
            deliveriesByParcelListResponse.error.message
          );
        }

        if (deliveryStopsResponse.error) {
          console.warn("Failed to check delivery stop conflicts:", deliveryStopsResponse.error.message);
        }

        (deliveriesByParcelResponse.data as DeliveryRow[] | null)?.forEach((deliveryRow) => {
          const linkedId = deliveryRow?.parcel_id;
          if (typeof linkedId === "string" && linkedId.length > 0) {
            blockedParcelIds.add(linkedId);
          }
        });

        (deliveriesByParcelListResponse.data as DeliveryRow[] | null)?.forEach((deliveryRow) => {
          const linkedId = deliveryRow?.parcel_list_id;
          if (typeof linkedId === "string" && linkedId.length > 0) {
            blockedParcelIds.add(linkedId);
          }
        });

        (deliveryStopsResponse.data as DeliveryStopRow[] | null)?.forEach((stopRow) => {
          const linkedId = stopRow?.parcel_list_id;
          if (typeof linkedId === "string" && linkedId.length > 0) {
            blockedParcelIds.add(linkedId);
          }
        });
      }

      if (runtime.zones.length === 0) {
        setParcelClusters([]);
        setIndividualParcels([]);
        setEligibilityHint("No organization geofences are configured.");
        return;
      }

      if (!selectedRider) {
        setParcelClusters([]);
        setIndividualParcels([]);
        setEligibilityHint("Select a rider to view parcels in the same super geofence area.");
        return;
      }

      if (!hasRiderCoordinates(selectedRider)) {
        setParcelClusters([]);
        setIndividualParcels([]);
        setEligibilityHint("Selected rider has no live location, so geofence-matched parcels cannot be determined.");
        return;
      }

      const riderComponentIds = getComponentIdsForPoint(selectedRider.lat, selectedRider.lng, runtime);
      if (riderComponentIds.length === 0) {
        setParcelClusters([]);
        setIndividualParcels([]);
        setEligibilityHint("Selected rider is outside organization geofences.");
        return;
      }

      const riderComponentIdSet = new Set(riderComponentIds);
      setEligibilityHint(null);

      const sharesSelectedRiderGeofence = (parcel: IndividualParcel) => {
        if (!hasCoordinates(parcel)) return false;

        const parcelComponentIds = getComponentIdsForPoint(
          parcel.latitude as number,
          parcel.longitude as number,
          runtime
        );

        return parcelComponentIds.some((componentId) => riderComponentIdSet.has(componentId));
      };

      const statusEligibleParcels = parcels.filter((parcel) =>
        isPoolEligibleStatus(parcel.status) &&
        !blockedParcelIds.has(parcel.id)
      );

      const eligiblePoolParcels = statusEligibleParcels.filter((parcel) => {
        if (!hasCoordinates(parcel)) return false;

        return (
          isPointInsideGeofences(parcel.latitude as number, parcel.longitude as number, runtime) &&
          sharesSelectedRiderGeofence(parcel)
        );
      });

      const clusterParcelsByName = new Map<string, IndividualParcel[]>();

      parcels
        .filter((parcel) => typeof parcel.cluster_name === "string" && parcel.cluster_name.trim().length > 0)
        .forEach((parcel) => {
          const clusterName = (parcel.cluster_name || "").trim();
          if (!clusterParcelsByName.has(clusterName)) {
            clusterParcelsByName.set(clusterName, []);
          }

          clusterParcelsByName.get(clusterName)?.push(parcel);
        });

      const eligibleClusterNames = new Set<string>();
      clusterParcelsByName.forEach((clusterParcels, clusterName) => {
        const allClusterParcelsAssignable = clusterParcels.every((parcel) => {
          return isPoolEligibleStatus(parcel.status) && !blockedParcelIds.has(parcel.id);
        });

        if (!allClusterParcelsAssignable) {
          return;
        }

        const allClusterParcelsHaveCoordinates = clusterParcels.every((parcel) => hasCoordinates(parcel));
        if (!allClusterParcelsHaveCoordinates) {
          return;
        }

        const allClusterParcelsInsideGeofences = clusterParcels.every((parcel) =>
          isPointInsideGeofences(parcel.latitude as number, parcel.longitude as number, runtime)
        );

        if (!allClusterParcelsInsideGeofences) {
          return;
        }

        const allClusterParcelsShareRiderGeofence = clusterParcels.every((parcel) =>
          sharesSelectedRiderGeofence(parcel)
        );

        if (!allClusterParcelsShareRiderGeofence) {
          return;
        }

        const points = clusterParcels
          .map((parcel) => {
            if (!hasCoordinates(parcel)) return null;
            return { lat: parcel.latitude as number, lng: parcel.longitude as number };
          })
          .filter((point): point is { lat: number; lng: number } => point != null);

        if (points.length === 0 || points.length !== clusterParcels.length) {
          return;
        }

        if (!pointsShareMergedGeofenceComponent(points, runtime)) {
          return;
        }

        eligibleClusterNames.add(clusterName);
      });

      const mergedClusters = Array.from(eligibleClusterNames)
        .map((clusterName) => {
          const clusterParcels = clusterParcelsByName.get(clusterName) || [];
          const representativeId = clusterParcels
            .map((parcel) => parcel.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
            .sort((left, right) => left.localeCompare(right))[0];

          const totalWeightKg = clusterParcels.reduce(
            (sum, parcel) => sum + Number(parcel.weight_kg || 0),
            0
          );

          return {
            parcel_cluster_id: representativeId,
            cluster_name: clusterName,
            parcel_count: clusterParcels.length,
            total_weight_kg: totalWeightKg,
            status: normalizeStatus(clusterParcels[0]?.status) || "pending",
          } as ParcelCluster;
        })
        .sort((left, right) => {
        const leftName = (left.cluster_name || "").toLowerCase();
        const rightName = (right.cluster_name || "").toLowerCase();
        return leftName.localeCompare(rightName);
      });

      setParcelClusters(mergedClusters);
      setIndividualParcels(
        eligiblePoolParcels
          .filter((parcel) => !parcel.cluster_name)
          .filter(hasCoordinates)
      );
    } catch (err) {
      console.error("Failed to fetch parcel pool data:", err);
      setParcelClusters([]);
      setIndividualParcels([]);
      setEligibilityHint("Failed to load geofence-matched parcel pool.");
    } finally {
      setLoading(false);
    }
  }, [selectedRider]);

  useEffect(() => {
    if (!selectedClusterName) return;

    if (selectedClusterName.startsWith(INDIVIDUAL_PREFIX)) {
      const selectedParcelId = selectedClusterName.replace(INDIVIDUAL_PREFIX, "");
      const stillVisible = individualParcels.some((parcel) => parcel.id === selectedParcelId);

      if (!stillVisible) {
        setSelectedClusterName(null);
      }

      return;
    }

    const stillVisible = parcelClusters.some(
      (cluster) => cluster.cluster_name === selectedClusterName
    );

    if (!stillVisible) {
      setSelectedClusterName(null);
    }
  }, [individualParcels, parcelClusters, selectedClusterName, setSelectedClusterName]);

  useEffect(() => {
    fetchPoolData();
  }, [fetchPoolData]);

  const totalClusterParcels = parcelClusters.reduce(
    (sum, cluster) => sum + (cluster.parcel_count || 0),
    0
  );

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 pb-3 border-b">
        <h3 className="font-semibold text-sm">Parcel Pool</h3>
        <button
          onClick={fetchPoolData}
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50 text-gray-700"
          title="Refresh parcel pool"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="rounded-lg border bg-blue-50 border-blue-200 p-2">
          <p className="text-blue-700">Cluster Parcels</p>
          <p className="font-semibold text-blue-900">{totalClusterParcels}</p>
        </div>
        <div className="rounded-lg border bg-amber-50 border-amber-200 p-2">
          <p className="text-amber-700">Individual Parcels</p>
          <p className="font-semibold text-amber-900">{individualParcels.length}</p>
        </div>
      </div>

      {eligibilityHint ? (
        <p className="mb-3 text-[11px] text-amber-700">{eligibilityHint}</p>
      ) : null}

      {loading ? (
        <p className="text-xs text-gray-500 text-center py-4">Loading parcel pool...</p>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col gap-3">
          <div className="flex-1 min-h-0 border rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                <Boxes className="w-3.5 h-3.5 text-blue-700" />
                Cluster Parcels
              </p>
              <span className="text-[11px] text-gray-500">{parcelClusters.length} clusters</span>
            </div>

            {parcelClusters.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">No cluster parcels available.</p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {parcelClusters.map((cluster) => {
                  const isActive = selectedClusterName === cluster.cluster_name;

                  return (
                    <button
                      key={cluster.parcel_cluster_id || cluster.cluster_name}
                      onClick={() => setSelectedClusterName(cluster.cluster_name)}
                      className={`w-full p-2 rounded-lg border text-left transition ${
                        isActive
                          ? "border-purple-500 bg-purple-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <p className="text-xs font-medium text-gray-900">{cluster.cluster_name}</p>
                      <p className="text-[11px] text-gray-600">
                        {cluster.parcel_count} parcels • {(cluster.total_weight_kg || 0).toFixed(1)} kg
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 border rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-amber-700" />
                Individual Parcels
              </p>
              <span className="text-[11px] text-gray-500">{individualParcels.length} items</span>
            </div>

            {individualParcels.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">No individual parcels with coordinates.</p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {individualParcels.map((parcel) => {
                  const selectionKey = `${INDIVIDUAL_PREFIX}${parcel.id}`;
                  const isActive = selectedClusterName === selectionKey;

                  return (
                    <button
                      key={parcel.id}
                      onClick={() => setSelectedClusterName(selectionKey)}
                      className={`w-full p-2 rounded-lg border text-left transition ${
                        isActive
                          ? "border-purple-500 bg-purple-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <p className="text-xs font-medium text-gray-900 truncate">
                        {parcel.tracking_code || parcel.id}
                      </p>
                      <p className="text-[11px] text-gray-600 truncate">
                        {parcel.address || "No address"}
                      </p>
                      <p className="text-[11px] text-gray-600 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {parcel.weight_kg || 0} kg
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
