"use client";

import { useEffect, useState, useCallback } from "react";
import { Package, Zap, MapPin, Loader, CheckCircle, AlertCircle } from "lucide-react";

type UnassignedParcel = {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  region?: string;
  status: string;
};

type ParcelCluster = {
  parcel_cluster_id: string;
  cluster_name: string;
  parcel_count: number;
  total_weight_kg?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  has_explicit_membership?: boolean;
};

type Rider = {
  id: string;
  profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
};

const getRiderName = (rider: Rider) => {
  if (Array.isArray(rider.profiles)) {
    return rider.profiles[0]?.full_name || "Unknown rider";
  }

  return rider.profiles?.full_name || "Unknown rider";
};

export default function ParcelConsolidationPanel() {
  const [unassignedParcels, setUnassignedParcels] = useState<UnassignedParcel[]>([]);
  const [parcelClusters, setParcelClusters] = useState<ParcelCluster[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingClusters, setCreatingClusters] = useState(false);
  const [assigningClusterId, setAssigningClusterId] = useState<string | null>(null);
  const [distanceThreshold, setDistanceThreshold] = useState(2000);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { getUnassignedRawParcels, getParcelClusters, getRiders } = await import("@/lib/api");

      const [parcels, clusters, allRiders] = await Promise.all([
        getUnassignedRawParcels(),
        getParcelClusters(),
        getRiders(),
      ]);

      setUnassignedParcels(parcels || []);
      setParcelClusters(clusters || []);
      setRiders(allRiders || []);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setMessage({ type: "error", text: "Failed to load parcel cluster data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateClusters = async () => {
    if (unassignedParcels.length === 0) {
      setMessage({ type: "error", text: "No unassigned parcels to cluster" });
      return;
    }

    setCreatingClusters(true);
    setMessage(null);

    try {
      const { createParcelClustersByProximity } = await import("@/lib/api");
      const results = await createParcelClustersByProximity(distanceThreshold);

      if (results && results.length > 0) {
        setMessage({
          type: "success",
          text: `Successfully created ${results.length} parcel cluster(s).`,
        });
        await fetchData();
      } else {
        setMessage({
          type: "error",
          text: "No parcel clusters were created. Try adjusting distance threshold.",
        });
      }
    } catch (err) {
      console.error("Parcel cluster creation error:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Parcel cluster creation failed",
      });
    } finally {
      setCreatingClusters(false);
    }
  };

  const handleAssignToRider = async (clusterId: string, riderId: string) => {
    setAssigningClusterId(clusterId);
    setMessage(null);

    try {
      const { assignParcelClusterToRider } = await import("@/lib/api");
      const result = await assignParcelClusterToRider(clusterId, riderId);

      setMessage({
        type: "success",
        text: `Assigned ${result.totalDeliveries} cluster delivery record(s) to rider.`,
      });
      await fetchData();
    } catch (err) {
      console.error("Assignment error:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Cluster assignment failed",
      });
    } finally {
      setAssigningClusterId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/70 backdrop-blur p-8 shadow">
        <div className="flex items-center justify-center text-gray-600">
          <Loader className="animate-spin mr-2" />
          Loading parcel clusters...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg p-4 flex items-start gap-3 ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          )}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      <div className="rounded-2xl bg-white/70 backdrop-blur p-6 shadow">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Unassigned Parcels
          </h2>
          <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
            {unassignedParcels.length}
          </span>
        </div>

        {unassignedParcels.length > 0 ? (
          <div className="space-y-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Distance Threshold (meters)
              </label>
              <input
                type="number"
                value={distanceThreshold}
                onChange={(e) => setDistanceThreshold(parseInt(e.target.value) || 2000)}
                min="500"
                max="10000"
                step="100"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              />
              <p className="text-xs text-gray-500 mt-1">
                Nearby unassigned parcels inside this threshold will become parcel clusters.
              </p>
            </div>

            <button
              onClick={handleCreateClusters}
              disabled={creatingClusters}
              className="w-full px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition"
            >
              {creatingClusters ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Creating Clusters...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Create Parcel Clusters
                </>
              )}
            </button>

            <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto border border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Sample of unassigned parcels (first 10)
              </p>
              <div className="space-y-3">
                {unassignedParcels.slice(0, 10).map((parcel) => (
                  <div key={parcel.id} className="text-sm bg-white rounded p-3 border border-gray-100">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 font-medium truncate">
                          {parcel.address || "Address not provided"}
                        </p>
                        <p className="text-gray-600 text-xs font-mono mt-1">
                          {parcel.latitude?.toFixed(4)}, {parcel.longitude?.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {unassignedParcels.length > 10 && (
                <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-200">
                  ...and {unassignedParcels.length - 10} more
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No unassigned parcels. Great job!</p>
          </div>
        )}
      </div>

      {parcelClusters.length > 0 && (
        <div className="rounded-2xl bg-white/70 backdrop-blur p-6 shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Parcel Clusters ({parcelClusters.length})
          </h2>

          <div className="space-y-4">
            {parcelClusters.map((cluster) => (
              <div
                key={cluster.parcel_cluster_id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{cluster.cluster_name}</p>
                    <p className="text-sm text-gray-600">
                      {cluster.parcel_count} parcels
                      {cluster.total_weight_kg ? ` • ${cluster.total_weight_kg.toFixed(1)} kg` : ""}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-3 py-1 rounded-full ${
                      cluster.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {cluster.status}
                  </span>
                </div>

                <div className="bg-gray-50 rounded p-3 mb-4">
                  <p className="text-xs text-gray-600 mb-2">Center Location:</p>
                  <p className="text-sm text-gray-900 font-mono">
                    {cluster.latitude?.toFixed(4)}, {cluster.longitude?.toFixed(4)}
                  </p>
                </div>

                {cluster.status === "pending" && riders.length > 0 ? (
                  <div className="flex gap-2">
                    <select
                      id={`rider-select-${cluster.parcel_cluster_id}`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      defaultValue=""
                    >
                      <option value="">Select a rider...</option>
                      {riders.map((rider) => (
                        <option key={rider.id} value={rider.id}>
                          {getRiderName(rider)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const select = document.getElementById(
                          `rider-select-${cluster.parcel_cluster_id}`
                        ) as HTMLSelectElement;
                        if (select.value) {
                          handleAssignToRider(cluster.parcel_cluster_id, select.value);
                        }
                      }}
                      disabled={assigningClusterId === cluster.parcel_cluster_id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition disabled:cursor-wait"
                    >
                      {assigningClusterId === cluster.parcel_cluster_id ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin inline mr-1" />
                          Assigning...
                        </>
                      ) : (
                        "Assign to Rider"
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm text-center">
                    {cluster.status !== "pending" ? "Already assigned" : "No riders available"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
