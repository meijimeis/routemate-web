"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ParcelGroupSettings from "./ParcelGroupSettings";
import ParcelGroupList from "./ParcelGroupList";
import ClusteredParcelMap, {
  type ClusteredParcelMapGroup,
} from "./ClusteredParcelMap";
import { supabase } from "@/lib/supabaseClient";
import {
  buildGeofenceRuntime,
  getComponentIdsForPoint,
  type GeofenceRuntime,
} from "@/lib/geofenceRuntime";

const CLUSTER_COLORS = [
  "#4C1D95",
  "#5B21B6",
  "#6D28D9",
  "#7C3AED",
  "#8B5CF6",
  "#9333EA",
  "#A855F7",
  "#C084FC",
];

type Parcel = {
  id: string;
  tracking_code: string;
  address: string;
  weight_kg: number;
  priority: string;
  status: string;
  region: string;
  cluster_name: string | null;
  lat: number | null;
  lng: number | null;
};

type ParcelGroup = ClusteredParcelMapGroup;

type ParcelDataRow = {
  id: string;
  tracking_code: string | null;
  address: string | null;
  weight_kg: number | null;
  priority: string | null;
  status: string | null;
  region: string | null;
  cluster_name: string | null;
  latitude: number | null;
  longitude: number | null;
  lat: number | null;
  lng: number | null;
};

type PersistableParcelRow = {
  id: string;
  status: string | null;
  cluster_name: string | null;
};

type GeofenceRow = {
  id?: string | null;
  name?: string | null;
  region?: string | null;
  geometry?: unknown;
};

type GroupingSettings = {
  maxWeight: number;
  minWeight: number;
  maxParcels: number;
  minParcels: number;
  maxDistanceRadius: number;
};

type LatLngParcel = Parcel & {
  lat: number;
  lng: number;
};

type ParcelGroupOutput = {
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

function hasCoordinates(parcel: Parcel): parcel is LatLngParcel {
  return (
    typeof parcel.lat === "number" &&
    Number.isFinite(parcel.lat) &&
    typeof parcel.lng === "number" &&
    Number.isFinite(parcel.lng)
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
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

function getCentroid(parcels: LatLngParcel[]) {
  const total = parcels.reduce(
    (acc, parcel) => ({
      lat: acc.lat + parcel.lat,
      lng: acc.lng + parcel.lng,
    }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: total.lat / parcels.length,
    lng: total.lng / parcels.length,
  };
}

function getMaxDistanceFromCentroid(
  parcels: LatLngParcel[],
  centroid: { lat: number; lng: number }
) {
  return parcels.reduce((maxDistance, parcel) => {
    const distance = haversineKm(centroid.lat, centroid.lng, parcel.lat, parcel.lng);
    return Math.max(maxDistance, distance);
  }, 0);
}

function getClusterLabel(index: number) {
  let n = index;
  let label = "";

  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return label;
}

function sanitizeSettings(settings: GroupingSettings): GroupingSettings {
  return {
    maxWeight: Number.isFinite(settings.maxWeight) ? Math.max(0, settings.maxWeight) : 25,
    minWeight: Number.isFinite(settings.minWeight) ? Math.max(0, settings.minWeight) : 5,
    maxParcels: Number.isFinite(settings.maxParcels) ? Math.max(0, Math.floor(settings.maxParcels)) : 6,
    minParcels: Number.isFinite(settings.minParcels) ? Math.max(0, Math.floor(settings.minParcels)) : 2,
    maxDistanceRadius: Number.isFinite(settings.maxDistanceRadius)
      ? Math.max(0, settings.maxDistanceRadius)
      : 3,
  };
}

const BLOCKED_CLUSTER_STATUSES = new Set(["assigned", "delivered", "cancelled"]);

function isClusterPersistBlocked(status: string | null | undefined) {
  return BLOCKED_CLUSTER_STATUSES.has((status || "").toLowerCase());
}

function buildDistanceClusters(
  sourceParcels: Parcel[],
  rawSettings: GroupingSettings,
  componentIdsByParcelId: Map<string, number[]>
): ParcelGroupOutput[] {
  const settings = sanitizeSettings(rawSettings);
  const maxWeightLimit = settings.maxWeight > 0 ? settings.maxWeight : Number.POSITIVE_INFINITY;
  const maxParcelsLimit = settings.maxParcels > 0 ? settings.maxParcels : Number.POSITIVE_INFINITY;
  const minWeightTarget = settings.minWeight > 0 ? settings.minWeight : 0;
  const minParcelsTarget = settings.minParcels > 0 ? settings.minParcels : 0;
  const maxDistanceRadiusLimit =
    settings.maxDistanceRadius > 0
      ? settings.maxDistanceRadius
      : Number.POSITIVE_INFINITY;

  const candidates = sourceParcels
    .filter((parcel) => {
      const status = (parcel.status || "").toLowerCase();
      const isClusterized = Boolean(parcel.cluster_name && parcel.cluster_name.trim().length > 0);
      const componentIds = componentIdsByParcelId.get(parcel.id) || [];

      if (isClusterized) return false;
      if (status === "assigned" || status === "delivered" || status === "cancelled") return false;
      if (componentIds.length === 0) return false;

      return true;
    })
    .filter(hasCoordinates)
    .sort((a, b) => {
      const left = a.tracking_code || a.id;
      const right = b.tracking_code || b.id;
      return left.localeCompare(right);
    });

  const groups: ParcelGroupOutput[] = [];
  const remaining = [...candidates];

  while (remaining.length > 0) {
    const seed = remaining.shift();
    if (!seed) break;

    const members: LatLngParcel[] = [seed];
    let sharedComponentIds = new Set(componentIdsByParcelId.get(seed.id) || []);
    let clusterWeight = Math.max(0, seed.weight_kg || 0);
    let centroid = { lat: seed.lat, lng: seed.lng };

    while (members.length < maxParcelsLimit) {
      let bestCandidateIndex = -1;
      let bestDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const candidateComponentIds = componentIdsByParcelId.get(candidate.id) || [];

        if (candidateComponentIds.length === 0) continue;

        const hasSharedComponent = candidateComponentIds.some((componentId) =>
          sharedComponentIds.has(componentId)
        );

        if (!hasSharedComponent) continue;

        const nextWeight = clusterWeight + Math.max(0, candidate.weight_kg || 0);
        if (nextWeight > maxWeightLimit) continue;

        const distanceToCentroid = haversineKm(
          centroid.lat,
          centroid.lng,
          candidate.lat,
          candidate.lng
        );

        if (distanceToCentroid > maxDistanceRadiusLimit) continue;

        if (distanceToCentroid < bestDistance) {
          bestDistance = distanceToCentroid;
          bestCandidateIndex = i;
        }
      }

      if (bestCandidateIndex < 0) break;

      const [chosen] = remaining.splice(bestCandidateIndex, 1);
      const chosenComponentIds = componentIdsByParcelId.get(chosen.id) || [];

      sharedComponentIds = new Set(
        Array.from(sharedComponentIds).filter((componentId) =>
          chosenComponentIds.includes(componentId)
        )
      );

      members.push(chosen);
      clusterWeight += Math.max(0, chosen.weight_kg || 0);
      centroid = getCentroid(members);
    }

    const label = getClusterLabel(groups.length);
    const maxDistanceKm = getMaxDistanceFromCentroid(members, centroid);

    groups.push({
      id: `cluster-${label}`,
      label,
      color: CLUSTER_COLORS[groups.length % CLUSTER_COLORS.length],
      parcels: members.map((parcel) => ({
        id: parcel.id,
        tracking_code: parcel.tracking_code,
        address: parcel.address,
        weight_kg: parcel.weight_kg,
        lat: parcel.lat,
        lng: parcel.lng,
      })),
      totalWeight: Number(clusterWeight.toFixed(2)),
      centroid,
      isUnderTarget:
        members.length < minParcelsTarget ||
        clusterWeight < minWeightTarget,
      maxDistanceKm: Number(maxDistanceKm.toFixed(2)),
    });
  }

  return groups;
}

export default function ParcelsViewRefactored() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [groups, setGroups] = useState<ParcelGroup[]>([]);
  const [hasComputedPreview, setHasComputedPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [clusterizeMessage, setClusterizeMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [geofenceRuntime, setGeofenceRuntime] = useState<GeofenceRuntime | null>(null);
  const [settings, setSettings] = useState<GroupingSettings>({
    maxWeight: 25,
    minWeight: 5,
    maxParcels: 6,
    minParcels: 2,
    maxDistanceRadius: 3,
  });

  const fetchParcels = useCallback(async () => {
    setLoading(true);

    try {
      const { getParcels, getGeofences } = await import("@/lib/api");
      const [data, geofenceRowsRaw] = await Promise.all([
        getParcels(),
        getGeofences(undefined),
      ]);

      const rows = Array.isArray(data) ? (data as ParcelDataRow[]) : [];
      const geofenceRows = Array.isArray(geofenceRowsRaw)
        ? (geofenceRowsRaw as GeofenceRow[])
        : [];
      const mapped: Parcel[] = rows.map((p) => ({
        id: p.id,
        tracking_code: p.tracking_code || p.id,
        address: p.address || "No address",
        weight_kg: p.weight_kg || 0,
        priority: p.priority || "normal",
        status: p.status || "unassigned",
        region: p.region || "unknown",
        cluster_name: p.cluster_name,
        lat: typeof p.latitude === "number" ? p.latitude : p.lat,
        lng: typeof p.longitude === "number" ? p.longitude : p.lng,
      }));

      setParcels(mapped);
  setGeofenceRuntime(buildGeofenceRuntime(geofenceRows));
      setGroups([]);
      setHasComputedPreview(false);
    } catch (err) {
      console.error("Failed to fetch parcels:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchParcels();
  }, [fetchParcels]);

  const handleSettingsChange = (newSettings: GroupingSettings) => {
    setClusterizeMessage(null);
    setSettings(newSettings);
    setGroups([]);
    setHasComputedPreview(false);
  };

  const parcelComponentIdsById = useMemo(() => {
    const componentIdsById = new Map<string, number[]>();
    if (!geofenceRuntime) return componentIdsById;

    parcels.forEach((parcel) => {
      if (!hasCoordinates(parcel)) {
        componentIdsById.set(parcel.id, []);
        return;
      }

      componentIdsById.set(
        parcel.id,
        getComponentIdsForPoint(parcel.lat, parcel.lng, geofenceRuntime)
      );
    });

    return componentIdsById;
  }, [geofenceRuntime, parcels]);

  const recomputeClusters = () => {
    setClusterizeMessage(null);

    if (!geofenceRuntime || geofenceRuntime.zones.length === 0) {
      setGroups([]);
      setHasComputedPreview(true);
      setClusterizeMessage({
        type: "error",
        text: "No organization geofences found. Add geofences before clusterizing parcels.",
      });
      return;
    }

    setGroups(buildDistanceClusters(parcels, settings, parcelComponentIdsById));
    setHasComputedPreview(true);
  };

  const clusterReadyGroups = useMemo(
    () => (hasComputedPreview ? groups.filter((group) => !group.isUnderTarget) : []),
    [groups, hasComputedPreview]
  );

  const groupedParcelIds = useMemo(() => {
    const ids = new Set<string>();
    clusterReadyGroups.forEach((group) => {
      group.parcels.forEach((parcel) => ids.add(parcel.id));
    });
    return ids;
  }, [clusterReadyGroups]);

  const clusterizableParcels = useMemo(
    () =>
      parcels.filter((parcel) => {
        const status = (parcel.status || "").toLowerCase();
        const isClusterized = Boolean(parcel.cluster_name && parcel.cluster_name.trim().length > 0);

        if (isClusterized) return false;
        if (status === "assigned" || status === "delivered" || status === "cancelled") return false;
        if ((parcelComponentIdsById.get(parcel.id) || []).length === 0) return false;

        return hasCoordinates(parcel);
      }),
    [parcelComponentIdsById, parcels]
  );

  const clusterizableButMissingCoordinatesCount = useMemo(
    () =>
      parcels.filter((parcel) => {
        const status = (parcel.status || "").toLowerCase();
        const isClusterized = Boolean(parcel.cluster_name && parcel.cluster_name.trim().length > 0);

        if (isClusterized) return false;
        if (status === "assigned" || status === "delivered" || status === "cancelled") return false;
        if ((parcelComponentIdsById.get(parcel.id) || []).length === 0) return false;

        return !hasCoordinates(parcel);
      }).length,
    [parcelComponentIdsById, parcels]
  );

  const groupedCount = useMemo(
    () =>
      hasComputedPreview
        ? clusterReadyGroups.reduce((sum, group) => sum + group.parcels.length, 0)
        : 0,
    [clusterReadyGroups, hasComputedPreview]
  );

  const ungroupedCount = useMemo(
    () =>
      hasComputedPreview
        ? clusterizableParcels.filter((parcel) => !groupedParcelIds.has(parcel.id)).length
        : 0,
    [clusterizableParcels, groupedParcelIds, hasComputedPreview]
  );

  const flaggedClusters = useMemo(
    () => (hasComputedPreview ? groups.filter((group) => group.isUnderTarget).length : 0),
    [groups, hasComputedPreview]
  );

  const emptyPreviewMessage = useMemo(() => {
    if (!hasComputedPreview) return null;
    if (clusterReadyGroups.length > 0) return null;

    if (clusterizableParcels.length === 0) {
      if (!geofenceRuntime || geofenceRuntime.zones.length === 0) {
        return "No organization geofences found. Add geofences before clusterizing parcels.";
      }

      if (clusterizableButMissingCoordinatesCount > 0) {
        return "No cluster-ready parcels found. Add valid latitude and longitude for parcels inside your geofences.";
      }

      return "No eligible unclustered parcels are currently available inside your geofences.";
    }

    return "No groups matched the current limits. Relax your limits or set optional limits to 0 to disable them.";
  }, [
    clusterReadyGroups.length,
    clusterizableButMissingCoordinatesCount,
    clusterizableParcels.length,
    geofenceRuntime,
    hasComputedPreview,
  ]);

  const clusterDefinition =
    "Set your limits, then click Auto Group Parcels to build a preview. A value of 0 disables that specific limit (optional). Nothing is saved automatically. Review the preview and use Confirm Clusterize only when you are ready to save those exact groups.";

  function buildClusterName(label: string, index: number, timestamp: string) {
    return `Cluster-${label}-${timestamp}-${String(index + 1).padStart(2, "0")}`;
  }

  const confirmClusterize = async () => {
    if (!hasComputedPreview) {
      setClusterizeMessage({
        type: "error",
        text: "Click Auto Group Parcels first to generate a cluster preview.",
      });
      return;
    }

    if (clusterReadyGroups.length === 0) {
      setClusterizeMessage({
        type: "error",
        text: "No cluster-ready parcel groups found. Try adjusting your settings and auto-group again.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Create ${clusterReadyGroups.length} parcel cluster(s) now? This will save the clustered result for route planning.`
    );

    if (!confirmed) return;

    setIsConfirming(true);
    setClusterizeMessage(null);

    try {
      const { getCurrentOrganizationId } = await import("@/lib/api");
      const organizationId = await getCurrentOrganizationId();
      if (!organizationId) {
        throw new Error("No organization found for this supervisor.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be logged in to confirm clusterization.");
      }

      const consolidatedAt = new Date().toISOString();
      const timestamp = consolidatedAt.replace(/[-:TZ.]/g, "").slice(0, 12);
      let savedClusterCount = 0;
      let savedParcelCount = 0;
      let conflictedParcelCount = 0;

      for (let i = 0; i < clusterReadyGroups.length; i += 1) {
        const group = clusterReadyGroups[i];
        const parcelIds = group.parcels.map((parcel) => parcel.id);

        if (parcelIds.length === 0) continue;

        const { data: latestRows, error: latestRowsError } = await supabase
          .from("parcel_lists")
          .select("id, status, cluster_name")
          .eq("organization_id", organizationId)
          .in("id", parcelIds);

        if (latestRowsError) {
          throw new Error(latestRowsError.message);
        }

        const safeRows = Array.isArray(latestRows)
          ? (latestRows as PersistableParcelRow[])
          : [];

        const eligibleParcelIds = safeRows
          .filter((row) => !row.cluster_name && !isClusterPersistBlocked(row.status))
          .map((row) => row.id);

        const staleOrLockedCount = parcelIds.length - eligibleParcelIds.length;
        if (staleOrLockedCount > 0) {
          conflictedParcelCount += staleOrLockedCount;
        }

        if (eligibleParcelIds.length === 0) {
          continue;
        }

        const clusterName = buildClusterName(group.label, i, timestamp);

        const { data, error } = await supabase
          .from("parcel_lists")
          .update({
            cluster_name: clusterName,
            status: "pending",
            consolidated_at: consolidatedAt,
            supervisor_id: user.id,
          })
          .eq("organization_id", organizationId)
          .is("cluster_name", null)
          .in("id", eligibleParcelIds)
          .select("id");

        if (error) {
          throw new Error(error.message);
        }

        const updatedCount = Array.isArray(data) ? data.length : 0;
        if (updatedCount > 0) {
          savedClusterCount += 1;
          savedParcelCount += updatedCount;
        }

        if (updatedCount < eligibleParcelIds.length) {
          conflictedParcelCount += eligibleParcelIds.length - updatedCount;
        }
      }

      if (savedClusterCount === 0 || savedParcelCount === 0) {
        setClusterizeMessage({
          type: "error",
          text:
            conflictedParcelCount > 0
              ? `No parcel clusters were saved. ${conflictedParcelCount} parcel(s) changed state or were already clusterized. Refresh and Auto Group again.`
              : "No parcel clusters were saved from this preview. Refresh parcels and try Auto Group again.",
        });

        return;
      }

      const conflictSuffix =
        conflictedParcelCount > 0
          ? ` ${conflictedParcelCount} parcel(s) were skipped because they changed state or were already clusterized.`
          : "";

      setClusterizeMessage({
        type: "success",
        text: `Saved ${savedClusterCount} parcel cluster(s) with ${savedParcelCount} parcel(s).${conflictSuffix}`,
      });

      await fetchParcels();
    } catch (error) {
      console.error("Failed to confirm parcel clusters:", error);
      setClusterizeMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save parcel clusters.",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="grid h-full min-h-[520px] grid-cols-12 gap-6">
      {/* LEFT - SETTINGS PANEL */}
      <div className="col-span-3 h-full bg-white rounded-lg shadow border border-gray-200 overflow-auto flex flex-col">
        <ParcelGroupSettings
          settings={settings}
          hasComputedPreview={hasComputedPreview}
          onSettingsChange={handleSettingsChange}
          onAutoGroup={recomputeClusters}
          ungroupedCount={ungroupedCount}
          groupedCount={groupedCount}
          clusterDefinition={clusterDefinition}
        />
      </div>

      {/* CENTER - PARCEL LIST */}
      <div className="col-span-4 h-full bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Clusterize Preview</h2>
          <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
            {hasComputedPreview ? clusterReadyGroups.length : 0} ready clusters
          </span>
        </div>

        <div className="px-6 py-3 border-b bg-white">
          <p className="text-xs text-gray-600 leading-relaxed">{clusterDefinition}</p>
          {hasComputedPreview ? (
            <p className="text-xs text-gray-500 mt-2">
              Needs review: <span className="font-semibold text-amber-700">{flaggedClusters}</span>
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-2">Click Auto Group Parcels to generate the preview list and map.</p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={confirmClusterize}
              disabled={isConfirming || !hasComputedPreview || clusterReadyGroups.length === 0}
              className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConfirming ? "Saving Clusters..." : "Confirm Clusterize"}
            </button>
            <span className="text-[11px] text-gray-500">Saves this clusterization result to your parcel clusters.</span>
          </div>

          {clusterizeMessage ? (
            <p
              className={`mt-2 text-xs font-medium ${
                clusterizeMessage.type === "success" ? "text-green-700" : "text-red-700"
              }`}
            >
              {clusterizeMessage.text}
            </p>
          ) : null}
        </div>

        <ParcelGroupList
          groups={clusterReadyGroups}
          loading={loading}
          hasComputedPreview={hasComputedPreview}
          onAutoGroup={recomputeClusters}
          emptyMessage={emptyPreviewMessage}
        />
      </div>

      {/* RIGHT - MAP */}
      <div className="col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b bg-gray-50 font-semibold text-sm">Clusterize Map</div>
        <div className="flex-1 overflow-hidden">
          <ClusteredParcelMap groups={clusterReadyGroups} />
        </div>
      </div>
    </div>
  );
}
