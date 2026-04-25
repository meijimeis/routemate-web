"use client";

import { useEffect, useState, useCallback } from "react";
import { getParcels } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

/* ================= TYPES ================= */
type Parcel = {
  id: string;
  tracking_code: string;
  address: string;
  weight_kg: number;
  region: string;
  cluster_name: string;
};

type Cluster = {
  cluster_name: string;
  parcels: Parcel[];
};

const PAGE_SIZE = 3; // clusters per page

export default function ParcelClusterCard() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  /* ================= FETCH ================= */
  const fetchClusters = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getParcels(undefined);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const grouped = (data || []).reduce((acc: Record<string, Parcel[]>, parcel: any) => {
        if (!parcel.cluster_name) return acc;
        if (!acc[parcel.cluster_name]) acc[parcel.cluster_name] = [];
        acc[parcel.cluster_name].push({
          id: parcel.id,
          tracking_code: parcel.tracking_code,
          address: parcel.address,
          weight_kg: parcel.weight_kg,
          region: parcel.region,
          cluster_name: parcel.cluster_name,
        });
        return acc;
      }, {});

      const clusterArray: Cluster[] = Object.entries(grouped).map(
        ([cluster_name, parcels]) => ({
          cluster_name,
          parcels: parcels as Parcel[],
        })
      );

      setClusters(clusterArray);
    } catch (err) {
      console.error("FETCH CLUSTER ERROR:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  /* ================= PAGINATION ================= */
  const paginatedClusters = clusters.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE
  );

  /* ================= UNGROUP ================= */
  const ungroupCluster = useCallback(async (ids: string[]) => {
    await supabase
      .from("parcel_lists")
      .update({ status: "unassigned", cluster_name: null })
      .in("id", ids);

    fetchClusters();
  }, [fetchClusters]);

  /* ================= UI ================= */
  if (loading) {
    return (
      <p className="text-sm text-gray-700">
        Loading parcel clusters...
      </p>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="text-sm text-gray-700 py-6 text-center">
        No clustered parcels yet
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl p-4 shadow-md w-full">

      {/* 🔑 FIXED HEIGHT + SCROLL (SAME AS UNGROUPED PARCELS) */}
      <div
        style={{
          height: "250px",
          overflowY: "scroll",
        }}
        className="space-y-3 pr-2 border rounded-xl bg-gray-50"
      >
        {paginatedClusters.map((cluster: Cluster) => {
          const totalWeight = cluster.parcels.reduce(
            (sum: number, p: Parcel) => sum + p.weight_kg,
            0
          );

          return (
            <div
              key={cluster.cluster_name}
              className="bg-white rounded-xl shadow-md p-3 mx-2"
            >
              {/* CLUSTER HEADER */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {cluster.cluster_name}
                  </p>
                  <p className="text-xs text-gray-700">
                    {cluster.parcels.length} parcels • {totalWeight} kg
                  </p>
                </div>

                <button
                  onClick={() =>
                    ungroupCluster(cluster.parcels.map((p: Parcel) => p.id))
                  }
                  className="text-xs px-2 py-1 border rounded-md hover:bg-gray-100"
                >
                  Ungroup
                </button>
              </div>

              {/* PARCEL LIST (COMPACT) */}
              <div className="space-y-1">
                {cluster.parcels.map((p: Parcel) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-gray-50 rounded-lg p-2 border"
                  >
                    <div>
                      <p className="text-xs font-medium text-gray-900">
                        {p.address}
                      </p>
                      <p className="text-[10px] text-gray-700">
                        {p.region}
                      </p>
                    </div>

                    <span className="text-xs text-gray-700">
                      {p.weight_kg} kg
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* PAGINATION */}
      <div className="flex justify-between items-center mt-4">
        <button
          disabled={page === 0}
          onClick={() => setPage((p: number) => Math.max(p - 1, 0))}
          className="text-sm px-3 py-1 rounded-md bg-gray-100 disabled:opacity-50"
        >
          Previous
        </button>

        <span className="text-xs text-gray-700">
          Page {page + 1}
        </span>

        <button
          disabled={(page + 1) * PAGE_SIZE >= clusters.length}
          onClick={() => setPage((p: number) => p + 1)}
          className="text-sm px-3 py-1 rounded-md bg-gray-100 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
