"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ClusteredParcelMap, {
  type ClusteredParcelMapGroup,
} from "./ClusteredParcelMap";

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

type ClusterRow = {
  parcel_cluster_id?: string | null;
  cluster_name: string;
  parcel_count?: number | null;
  total_weight_kg?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  created_at?: string | null;
  has_explicit_membership?: boolean | null;
};

type ClusterParcelPointRow = {
  id: string;
  cluster_name?: string | null;
  tracking_code?: string | null;
  address?: string | null;
  weight_kg?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type SortDirection = "asc" | "desc";
type SortKey =
  | "cluster_name"
  | "parcel_count"
  | "total_weight_kg"
  | "status"
  | "created_at";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
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

function hasCoordinates(
  row: Pick<ClusterRow, "latitude" | "longitude">
): row is { latitude: number; longitude: number } {
  return (
    typeof row.latitude === "number" &&
    Number.isFinite(row.latitude) &&
    typeof row.longitude === "number" &&
    Number.isFinite(row.longitude)
  );
}

function getStatusClass(status?: string | null) {
  switch ((status || "").toLowerCase()) {
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "acquired":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "assigned":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "active":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "in_transit":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "delivered":
    case "completed":
      return "bg-green-50 text-green-700 border-green-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

export default function ClusteredParcelsTableTab() {
  const [rows, setRows] = useState<ClusterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedClusterName, setSelectedClusterName] = useState<string | null>(null);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [clusterParcelsByName, setClusterParcelsByName] = useState<Record<string, ClusterParcelPointRow[]>>({});

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const { getParcelClusters } = await import("@/lib/api");
      const data = await getParcelClusters(undefined, []);
      setRows(Array.isArray(data) ? (data as ClusterRow[]) : []);
    } catch (error) {
      console.error("Failed to fetch clustered parcels:", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const statuses = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      if (row.status) values.add(row.status);
    });

    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      return [
        row.cluster_name,
        row.status,
        row.parcel_cluster_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [query, rows, statusFilter]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];

    sorted.sort((a, b) => {
      if (sortKey === "parcel_count") {
        const left = Number(a.parcel_count || 0);
        const right = Number(b.parcel_count || 0);
        return sortDirection === "asc" ? left - right : right - left;
      }

      if (sortKey === "total_weight_kg") {
        const left = Number(a.total_weight_kg || 0);
        const right = Number(b.total_weight_kg || 0);
        return sortDirection === "asc" ? left - right : right - left;
      }

      if (sortKey === "created_at") {
        const left = a.created_at ? new Date(a.created_at).getTime() : 0;
        const right = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortDirection === "asc" ? left - right : right - left;
      }

      const leftText = String(a[sortKey] || "").toLowerCase();
      const rightText = String(b[sortKey] || "").toLowerCase();
      const compare = leftText.localeCompare(rightText);
      return sortDirection === "asc" ? compare : -compare;
    });

    return sorted;
  }, [filteredRows, sortDirection, sortKey]);

  const labeledRows = useMemo(
    () =>
      sortedRows.map((row, index) => ({
        ...row,
        clusterLabel: getClusterLabel(index),
        clusterColor: CLUSTER_COLORS[index % CLUSTER_COLORS.length],
      })),
    [sortedRows]
  );

  const selectedLabeledRow = useMemo(
    () => labeledRows.find((row) => row.cluster_name === selectedClusterName) || null,
    [labeledRows, selectedClusterName]
  );

  useEffect(() => {
    if (!selectedClusterName) return;

    const stillExists = labeledRows.some((row) => row.cluster_name === selectedClusterName);
    if (!stillExists) {
      setSelectedClusterName(null);
    }
  }, [labeledRows, selectedClusterName]);

  useEffect(() => {
    let cancelled = false;

    const loadClusterParcels = async () => {
      const clusterNames = labeledRows
        .map((row) => row.cluster_name)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

      if (clusterNames.length === 0) {
        setClusterParcelsByName({});
        return;
      }

      setLoadingPoints(true);

      try {
        const { data, error } = await supabase
          .from("parcel_lists")
          .select("id, cluster_name, tracking_code, address, weight_kg, latitude, longitude")
          .in("cluster_name", clusterNames)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .neq("status", "cancelled");

        if (error) {
          throw error;
        }

        const rowsWithPoints = Array.isArray(data) ? (data as ClusterParcelPointRow[]) : [];
        const nextByCluster: Record<string, ClusterParcelPointRow[]> = {};

        rowsWithPoints.forEach((row) => {
          const clusterName = (row.cluster_name || "").trim();
          if (!clusterName) return;

          if (!nextByCluster[clusterName]) {
            nextByCluster[clusterName] = [];
          }

          nextByCluster[clusterName].push(row);
        });

        if (!cancelled) {
          setClusterParcelsByName(nextByCluster);
        }
      } catch (error) {
        console.error("Failed to fetch clustered parcel points:", error);
        if (!cancelled) {
          setClusterParcelsByName({});
        }
      } finally {
        if (!cancelled) {
          setLoadingPoints(false);
        }
      }
    };

    void loadClusterParcels();

    return () => {
      cancelled = true;
    };
  }, [labeledRows]);

  const mapGroups = useMemo<ClusteredParcelMapGroup[]>(() => {
    return labeledRows
      .map((row) => {
        const rawPoints = clusterParcelsByName[row.cluster_name] || [];

        const parcels = rawPoints
          .filter(
            (point) =>
              typeof point.latitude === "number" &&
              Number.isFinite(point.latitude) &&
              typeof point.longitude === "number" &&
              Number.isFinite(point.longitude)
          )
          .map((point) => ({
            id: point.id,
            tracking_code: point.tracking_code || point.id,
            address: point.address || "No address",
            weight_kg: Number(point.weight_kg || 0),
            lat: point.latitude as number,
            lng: point.longitude as number,
          }));

        const centroid = hasCoordinates(row)
          ? { lat: row.latitude, lng: row.longitude }
          : parcels.length > 0
          ? {
              lat: parcels.reduce((sum, point) => sum + point.lat, 0) / parcels.length,
              lng: parcels.reduce((sum, point) => sum + point.lng, 0) / parcels.length,
            }
          : null;

        if (!centroid) return null;

        const safeParcels =
          parcels.length > 0
            ? parcels
            : [
                {
                  id: `centroid-${row.cluster_name}`,
                  tracking_code: row.cluster_name,
                  address: "Cluster centroid",
                  weight_kg: 0,
                  lat: centroid.lat,
                  lng: centroid.lng,
                },
              ];

        const maxDistanceKm = safeParcels.reduce((maxDistance, parcel) => {
          const distance = haversineKm(centroid.lat, centroid.lng, parcel.lat, parcel.lng);
          return Math.max(maxDistance, distance);
        }, 0);

        return {
          id: row.cluster_name,
          label: row.clusterLabel,
          color: row.clusterColor,
          parcels: safeParcels,
          totalWeight: Number(row.total_weight_kg || 0),
          centroid,
          isUnderTarget: false,
          maxDistanceKm: Number(maxDistanceKm.toFixed(2)),
        };
      })
      .filter((group): group is ClusteredParcelMapGroup => Boolean(group));
  }, [clusterParcelsByName, labeledRows]);

  const selectedGroup = useMemo(
    () => mapGroups.find((group) => group.id === selectedClusterName) || null,
    [mapGroups, selectedClusterName]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "created_at" ? "desc" : "asc");
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="grid h-full min-h-[520px] grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-8 bg-white rounded-lg shadow border border-gray-200 h-full flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Clustered Parcels</h2>
            <p className="text-xs text-gray-600 mt-1">
              {sortedRows.length} of {rows.length} clusters shown
            </p>
          </div>
          <button
            onClick={fetchRows}
            className="px-3 py-2 rounded border text-sm text-gray-700 hover:bg-white flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="px-6 py-3 border-b bg-white flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by cluster name or status..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : status}
              </option>
            ))}
          </select>
        </div>

        <div className="mx-6 mt-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-900">
          Guide: Click a cluster row to focus the map. Colors and labels (Cluster A, B, C...) match between table and map.
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-gray-600 text-center">Loading clustered parcels...</div>
          ) : sortedRows.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-gray-600 text-center">No clustered parcels matched your filter.</div>
          ) : (
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("cluster_name")}>Cluster Name{sortArrow("cluster_name")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Source Key</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("parcel_count")}>Parcels{sortArrow("parcel_count")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("total_weight_kg")}>Total Weight (kg){sortArrow("total_weight_kg")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("status")}>Status{sortArrow("status")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Centroid</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("created_at")}>Created{sortArrow("created_at")}</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {labeledRows.map((row) => {
                  const isSelected = selectedClusterName === row.cluster_name;

                  return (
                    <tr
                      key={row.parcel_cluster_id || row.cluster_name}
                      onClick={() =>
                        setSelectedClusterName((prev) =>
                          prev === row.cluster_name ? null : row.cluster_name
                        )
                      }
                      className={`cursor-pointer ${isSelected ? "bg-violet-50" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: row.clusterColor }}
                          />
                          {`Cluster ${row.clusterLabel}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">{row.cluster_name}</td>
                      <td className="px-4 py-3 text-gray-700">{Number(row.parcel_count || 0)}</td>
                      <td className="px-4 py-3 text-gray-700">{Number(row.total_weight_kg || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded-full border text-xs font-medium ${getStatusClass(row.status)}`}>
                          {row.status || "unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                        {hasCoordinates(row)
                          ? `${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(row.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="col-span-12 lg:col-span-4 bg-white rounded-lg shadow border border-gray-200 h-full overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-sm text-gray-900">Cluster Map</h3>
          <p className="mt-1 text-xs text-gray-600">
            {selectedLabeledRow
              ? `Cluster ${selectedLabeledRow.clusterLabel} • ${selectedGroup?.parcels.length || 0} point(s)`
              : `Showing all clusters (${mapGroups.length}). Click a row to focus one cluster.`}
          </p>
          {loadingPoints ? (
            <p className="mt-1 text-xs text-gray-500">Loading cluster points...</p>
          ) : null}
        </div>

        <div className="flex-1 overflow-hidden">
          <ClusteredParcelMap
            groups={mapGroups}
            focusGroupId={selectedClusterName}
          />
        </div>
      </div>
    </div>
  );
}
