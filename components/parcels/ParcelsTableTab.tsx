"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { RefreshCcw, Search } from "lucide-react";
import SelectionPointsMap, { type SelectionPoint } from "./SelectionPointsMap";

type ParcelRow = {
  id: string;
  tracking_code?: string | null;
  recipient_name?: string | null;
  address?: string | null;
  region?: string | null;
  priority?: string | null;
  status?: string | null;
  payment_type?: string | null;
  weight_kg?: number | null;
  cluster_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
};

type SortDirection = "asc" | "desc";
type SortKey =
  | "tracking_code"
  | "recipient_name"
  | "address"
  | "region"
  | "weight_kg"
  | "priority"
  | "payment_type"
  | "status"
  | "cluster_name"
  | "created_at";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function getStatusClass(status?: string | null) {
  switch ((status || "").toLowerCase()) {
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "assigned":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "in_transit":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "delivered":
      return "bg-green-50 text-green-700 border-green-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function hasCoordinates(
  row: ParcelRow
): row is ParcelRow & { latitude: number; longitude: number } {
  return (
    typeof row.latitude === "number" &&
    Number.isFinite(row.latitude) &&
    typeof row.longitude === "number" &&
    Number.isFinite(row.longitude)
  );
}

export default function ParcelsTableTab() {
  const [rows, setRows] = useState<ParcelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const { getAllParcels } = await import("@/lib/api");
      const data = await getAllParcels();
      setRows(Array.isArray(data) ? (data as ParcelRow[]) : []);
    } catch (err) {
      console.error("Failed to fetch all parcels:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const individualRows = useMemo(
    () => rows.filter((row) => !row.cluster_name || row.cluster_name.trim().length === 0),
    [rows]
  );

  const statuses = useMemo(() => {
    const values = new Set<string>();
    individualRows.forEach((row) => {
      if (row.status) values.add(row.status);
    });
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [individualRows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return individualRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      return [
        row.id,
        row.tracking_code,
        row.recipient_name,
        row.address,
        row.region,
        row.cluster_name,
        row.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [individualRows, query, statusFilter]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];

    sorted.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];

      if (sortKey === "weight_kg") {
        const leftNum = typeof left === "number" ? left : 0;
        const rightNum = typeof right === "number" ? right : 0;
        return sortDirection === "asc" ? leftNum - rightNum : rightNum - leftNum;
      }

      if (sortKey === "created_at") {
        const leftDate = left ? new Date(String(left)).getTime() : 0;
        const rightDate = right ? new Date(String(right)).getTime() : 0;
        return sortDirection === "asc" ? leftDate - rightDate : rightDate - leftDate;
      }

      const leftText = String(left || "").toLowerCase();
      const rightText = String(right || "").toLowerCase();
      const compare = leftText.localeCompare(rightText);
      return sortDirection === "asc" ? compare : -compare;
    });

    return sorted;
  }, [filteredRows, sortKey, sortDirection]);

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

  useEffect(() => {
    if (sortedRows.length === 0) {
      setSelectedParcelId(null);
      return;
    }

    if (selectedParcelId && sortedRows.some((row) => row.id === selectedParcelId)) {
      return;
    }

    const firstMappable = sortedRows.find(hasCoordinates);
    setSelectedParcelId(firstMappable?.id || sortedRows[0].id);
  }, [selectedParcelId, sortedRows]);

  const selectedRow = useMemo(
    () => sortedRows.find((row) => row.id === selectedParcelId) || null,
    [selectedParcelId, sortedRows]
  );

  const mapPoints = useMemo<SelectionPoint[]>(
    () =>
      sortedRows
        .filter(hasCoordinates)
        .map((row) => ({
          id: row.id,
          lat: row.latitude,
          lng: row.longitude,
          title: row.tracking_code || row.id,
          subtitle: row.address || row.region || "No address",
          color: "#7C3AED",
        })),
    [sortedRows]
  );

  const selectedPointIds = useMemo(() => {
    if (!selectedParcelId) return [];
    return mapPoints.some((point) => point.id === selectedParcelId)
      ? [selectedParcelId]
      : [];
  }, [mapPoints, selectedParcelId]);

  return (
    <div className="grid h-full min-h-[520px] grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-8 bg-white rounded-lg shadow border border-gray-200 h-full flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Individual Parcels</h2>
            <p className="text-xs text-gray-600 mt-1">
              {sortedRows.length} of {individualRows.length} parcels shown
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
              placeholder="Search by tracking code, address, region..."
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
          Tip: Click a row to focus its location on the map. Purple dots are parcels with valid coordinates.
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-gray-600 text-center">Loading parcels...</div>
          ) : sortedRows.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-gray-600 text-center">No parcels matched your filter.</div>
          ) : (
            <table className="w-full min-w-[1300px] text-sm">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("tracking_code")}>Tracking{sortArrow("tracking_code")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("recipient_name")}>Recipient{sortArrow("recipient_name")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("address")}>Address{sortArrow("address")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("region")}>Region{sortArrow("region")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("weight_kg")}>Weight (kg){sortArrow("weight_kg")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("priority")}>Priority{sortArrow("priority")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("payment_type")}>Payment{sortArrow("payment_type")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("status")}>Status{sortArrow("status")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Coordinates</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort("created_at")}>Created{sortArrow("created_at")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {sortedRows.map((row) => {
                  const isSelected = selectedParcelId === row.id;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedParcelId(row.id)}
                      className={`cursor-pointer ${isSelected ? "bg-violet-50" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{row.tracking_code || "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{row.recipient_name || "-"}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[280px] truncate">{row.address || "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{row.region || "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{row.weight_kg ?? 0}</td>
                      <td className="px-4 py-3 text-gray-700">{row.priority || "normal"}</td>
                      <td className="px-4 py-3 text-gray-700">{row.payment_type || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded-full border text-xs font-medium ${getStatusClass(row.status)}`}>
                          {row.status || "unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                        {typeof row.latitude === "number" && typeof row.longitude === "number"
                          ? `${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.id}</td>
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
          <h3 className="font-semibold text-sm text-gray-900">Parcel Location Map</h3>
          <p className="mt-1 text-xs text-gray-600">
            {selectedRow
              ? hasCoordinates(selectedRow)
                ? `${selectedRow.tracking_code || selectedRow.id} selected`
                : "Selected parcel has no coordinates"
              : "Select a parcel row to focus on map"}
          </p>
        </div>

        <div className="flex-1 overflow-hidden">
          <SelectionPointsMap
            points={mapPoints}
            selectedPointIds={selectedPointIds}
            emptyLabel="No parcel coordinates are available for map preview."
          />
        </div>
      </div>
    </div>
  );
}
