"use client";

import { useEffect, useState, useCallback } from "react";
import Papa from "papaparse";
import { getCurrentOrganizationId, getParcels } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

type Parcel = {
  id: string;
  tracking_code: string;
  address: string;
  weight_kg: number;
};

const PAGE_SIZE = 20;

export default function UngroupedParcels() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  /* =========================
     FETCH PARCELS
  ========================= */
  const fetchParcels = useCallback(async (pageIndex: number) => {
    setLoading(true);

    try {
      const data = await getParcels(undefined);
      const ungroupedParcels = (data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => p.status === "unassigned")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({
          id: p.id,
          tracking_code: p.tracking_code,
          address: p.address,
          weight_kg: p.weight_kg,
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE;
      const paginatedParcels = ungroupedParcels.slice(from, to);
      
      setParcels(paginatedParcels);
      setHasMore(paginatedParcels.length === PAGE_SIZE);
    } catch (err) {
      console.error("FETCH ERROR:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParcels(page);
  }, [page, fetchParcels]);

  /* =========================
     CSV UPLOAD
  ========================= */
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: Papa.ParseResult<Record<string, string>>) => {
        const organizationId = await getCurrentOrganizationId();
        if (!organizationId) {
          console.error("No organization found for current user");
          return;
        }

        const rows = results.data.map((row) => ({
          organization_id: organizationId,
          tracking_code: row.tracking_code,
          recipient_name: row.recipient_name,
          address: row.address,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          weight_kg: Number(row.weight_kg),
          priority: row.priority || "normal",
          payment_type: row.payment_type || "cod",
          region: row.region,
          status: "unassigned",
        }));

        const { error } = await supabase
          .from("parcel_lists")
          .insert(rows);

        if (error) {
          console.error("CSV UPLOAD ERROR:", error);
          return;
        }

        fetchParcels(page);
      },
    });
  };

  /* =========================
     UI
  ========================= */
  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl p-4 shadow-md w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-md font-semibold text-gray-900">
          Ungrouped Parcels
        </h3>

        {/* Upload Button */}
        <label className="cursor-pointer w-8 h-8 bg-purple-600 text-white rounded-lg flex items-center justify-center text-sm">
          +
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCSVUpload}
          />
        </label>
      </div>

      {/* FIXED CARD BODY */}
      <div
        style={{
          height: "200px",
          overflowY: "scroll",
        }}
        className="space-y-2 pr-2 border rounded-xl bg-gray-50"
      >
        {loading && (
          <p className="text-sm text-gray-700 p-4">
            Loading parcels...
          </p>
        )}

        {!loading && parcels.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center h-full text-gray-700">
            <p className="text-sm font-medium">
              No Data Available
            </p>
            <p className="text-xs">
              Upload a CSV file to add parcels
            </p>
          </div>
        )}

        {!loading &&
          parcels.map((p, index) => (
            <div
              key={p.id}
              className="flex items-center justify-between bg-white rounded-xl p-3 shadow-md mx-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-md bg-purple-600 text-white text-xs flex items-center justify-center">
                  {page * PAGE_SIZE + index + 1}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {p.tracking_code}
                  </p>
                  <p className="text-xs text-gray-700">
                    {p.address}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  {p.weight_kg} kg
                </span>
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center">
                  ✓
                </span>
              </div>
            </div>
          ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(p - 1, 0))}
          className="text-sm px-3 py-1 rounded-md bg-gray-100 disabled:opacity-50"
        >
          Previous
        </button>

        <span className="text-xs text-gray-700">
          Page {page + 1}
        </span>

        <button
          disabled={!hasMore}
          onClick={() => setPage((p) => p + 1)}
          className="text-sm px-3 py-1 rounded-md bg-gray-100 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
