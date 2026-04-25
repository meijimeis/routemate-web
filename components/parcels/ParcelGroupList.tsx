"use client";

import { Loader, MapPin, Package, RefreshCw } from "lucide-react";

type ParcelGroup = {
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
  isUnderTarget: boolean;
  maxDistanceKm: number;
};

interface ParcelGroupListProps {
  groups: ParcelGroup[];
  loading: boolean;
  hasComputedPreview: boolean;
  onAutoGroup: () => void;
  emptyMessage?: string | null;
}

export default function ParcelGroupList({
  groups,
  loading,
  hasComputedPreview,
  onAutoGroup,
  emptyMessage,
}: ParcelGroupListProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
        <Package className="w-12 h-12 text-gray-300" />
        <p className="text-gray-600 font-medium">
          {hasComputedPreview ? "No cluster-ready parcels found" : "No preview yet"}
        </p>
        <p className="text-sm text-gray-500">
          {hasComputedPreview
            ? emptyMessage || "No cluster-ready groups matched your current settings."
            : "Set your cluster limits and click Auto Group Parcels to generate a preview."}
        </p>
        <button
          onClick={onAutoGroup}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {hasComputedPreview ? "Recalculate Clusters" : "Auto Group Parcels"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-3 border-b bg-white flex items-center justify-between">
        <p className="text-xs text-gray-600">Parcel membership by cluster</p>
        <button
          onClick={onAutoGroup}
          className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recluster
        </button>
      </div>

      <div className="space-y-3 p-4">
        {groups.map((group) => (
          <details key={group.id} open className="rounded-lg border border-gray-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="font-semibold text-gray-900">Cluster {group.label}</span>
                    {group.isUnderTarget ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        Below target
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-gray-600">
                    {group.parcels.length} parcel(s) • {group.totalWeight.toFixed(1)} kg • spread {group.maxDistanceKm.toFixed(2)} km
                  </p>
                </div>

                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  {group.label}
                </span>
              </div>
            </summary>

            <div className="border-t border-gray-100 px-4 py-3">
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {group.parcels.map((parcel) => (
                  <div key={parcel.id} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{parcel.tracking_code}</p>
                        <p className="text-xs text-gray-600 truncate">{parcel.address}</p>
                        <p className="mt-1 text-[11px] text-gray-500 inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {parcel.lat.toFixed(5)}, {parcel.lng.toFixed(5)}
                        </p>
                      </div>

                      <span className="text-xs font-medium text-gray-700 whitespace-nowrap">
                        {parcel.weight_kg.toFixed(1)} kg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
