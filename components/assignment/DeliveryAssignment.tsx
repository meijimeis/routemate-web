"use client";

import { useEffect, useState } from "react";
import {
  getRiders,
  getOrgUnassignedParcels,
  assignParcelsToRider,
} from "@/lib/api";
import RiderCard from "@/components/common/RiderCard";
import { CheckCircle, AlertCircle, Loader } from "lucide-react";

interface Rider {
  id: string;
  profile_id?: string;
  organization_id?: string;
  vehicle_type?: string | null;
  capacity?: number;
  status?: string;
  profiles?: { full_name: string } | { full_name: string }[];
}

interface Parcel {
  id: string;
  tracking_code: string;
  address: string;
  weight_kg: number;
  priority: string;
  region: string;
}

export default function DeliveryAssignment() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedRider, setSelectedRider] = useState<string>("");
  const [selectedParcels, setSelectedParcels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  // Fetch riders and parcels on mount.
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const [ridersList, parcelsList] = await Promise.all([
          getRiders(undefined),
          getOrgUnassignedParcels(undefined),
        ]);
        setRiders(ridersList || []);
        setParcels(parcelsList || []);
      } catch (err) {
        setError("Failed to load riders and parcels");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  const toggleParcel = (parcelId: string) => {
    setSelectedParcels((prev) => {
      const updated = new Set(prev);
      if (updated.has(parcelId)) {
        updated.delete(parcelId);
      } else {
        updated.add(parcelId);
      }
      return updated;
    });
  };

  const selectAllParcels = () => {
    if (selectedParcels.size === parcels.length) {
      setSelectedParcels(new Set());
    } else {
      setSelectedParcels(new Set(parcels.map((p) => p.id)));
    }
  };

  const handleAssign = async () => {
    if (!selectedRider) {
      setError("Please select a rider");
      return;
    }

    if (selectedParcels.size === 0) {
      setError("Please select at least one parcel");
      return;
    }

    setAssigning(true);
    setError("");
    setSuccess("");

    try {
      const result = await assignParcelsToRider(
        selectedRider,
        Array.from(selectedParcels),
        null,
        undefined
      );

      setSuccess(
        `Successfully assigned ${result.totalDeliveries} deliveries to rider`
      );
      setSelectedRider("");
      setSelectedParcels(new Set());

      const parcelsList = await getOrgUnassignedParcels(undefined);
      setParcels(parcelsList || []);

      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to assign deliveries";
      setError(errorMsg);
    } finally {
      setAssigning(false);
    }
  };

  const selectedRiderData = riders.find((r) => r.id === selectedRider);
  const getFullName = (profiles: Rider["profiles"]): string => {
    if (!profiles) return "Unknown";
    if (Array.isArray(profiles)) return profiles[0]?.full_name || "Unknown";
    return profiles.full_name || "Unknown";
  };

  const selectedRiderName = getFullName(selectedRiderData?.profiles);
  const selectedRiderCapacity = selectedRiderData?.capacity || 0;
  const totalWeight = Array.from(selectedParcels).reduce((sum, id) => {
    const parcel = parcels.find((p) => p.id === id);
    return sum + (parcel?.weight_kg || 0);
  }, 0);

  if (loading) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <Loader className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[520px] min-w-[1120px] grid-cols-12 gap-6">
      <div className="col-span-4 flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b bg-gray-50 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Rider</h3>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {riders.length === 0 ? (
            <div className="flex h-full min-h-[180px] items-center justify-center text-gray-500">
              No riders available
            </div>
          ) : (
            <div className="space-y-2">
              {riders.map((rider) => (
                <RiderCard
                  key={rider.id}
                  name={getFullName(rider.profiles)}
                  capacity={rider.capacity}
                  status={rider.status}
                  isSelected={selectedRider === rider.id}
                  onClick={() => setSelectedRider(rider.id)}
                />
              ))}
            </div>
          )}

          {selectedRider && (
            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-900">
                Selected: {selectedRiderName}
              </p>
              <p className="text-sm text-blue-700">
                Capacity: {selectedRiderCapacity} kg
              </p>
              <p className="mt-1 text-sm text-blue-700">
                Weight of selected parcels: {totalWeight.toFixed(1)} kg
              </p>
              {totalWeight > selectedRiderCapacity && (
                <p className="mt-2 text-sm font-medium text-red-600">
                  Warning: exceeds rider capacity.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="col-span-5 flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b bg-gray-50 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Unassigned Parcels ({parcels.length})
          </h3>
          {parcels.length > 0 && (
            <button
              onClick={selectAllParcels}
              className="text-sm font-medium text-purple-600 hover:text-purple-700"
            >
              {selectedParcels.size === parcels.length
                ? "Deselect All"
                : "Select All"}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {parcels.length === 0 ? (
            <div className="flex h-full min-h-[180px] items-center justify-center text-gray-500">
              No unassigned parcels
            </div>
          ) : (
            <div className="space-y-2">
              {parcels.map((parcel) => (
                <div
                  key={parcel.id}
                  onClick={() => toggleParcel(parcel.id)}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition ${
                    selectedParcels.has(parcel.id)
                      ? "border-purple-600 bg-purple-50"
                      : "border-gray-200 hover:border-purple-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedParcels.has(parcel.id)}
                    onChange={() => {}}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {parcel.tracking_code}
                    </p>
                    <p className="truncate text-xs text-gray-600">
                      {parcel.address}
                    </p>
                    <div className="mt-1 flex gap-2 text-xs text-gray-500">
                      <span>{parcel.weight_kg} kg</span>
                      {parcel.priority && (
                        <span className="rounded bg-yellow-100 px-2 py-0.5 text-yellow-800">
                          {parcel.priority}
                        </span>
                      )}
                      {parcel.region && <span>{parcel.region}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t px-6 py-3 text-sm text-gray-600">
          {selectedParcels.size} of {parcels.length} selected
        </div>
      </div>

      <div className="col-span-3 flex h-full flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        {error && (
          <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        <button
          onClick={handleAssign}
          disabled={!selectedRider || selectedParcels.size === 0 || assigning}
          className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {assigning ? (
            <span className="flex items-center justify-center gap-2">
              <Loader className="h-4 w-4 animate-spin" />
              Assigning...
            </span>
          ) : (
            `Assign ${selectedParcels.size} Parcel${selectedParcels.size !== 1 ? "s" : ""}`
          )}
        </button>

        <div className="mt-4 space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <p>
            <strong>Selected Rider:</strong>{" "}
            {selectedRider ? selectedRiderName : "None"}
          </p>
          <p>
            <strong>Selected Parcels:</strong> {selectedParcels.size}
          </p>
          <p>
            <strong>Total Weight:</strong> {totalWeight.toFixed(1)} kg
          </p>
        </div>
      </div>
    </div>
  );
}
