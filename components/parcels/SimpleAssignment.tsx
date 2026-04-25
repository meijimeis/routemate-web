"use client";

import { useEffect, useState, useCallback } from "react";
import { Truck, Package, CheckCircle, AlertCircle } from "lucide-react";

type Parcel = {
  id: string;
  tracking_code: string;
  address: string;
  weight_kg: number;
  priority: string;
};

type Rider = {
  id: string;
  name: string;
  vehicle_type: "motorcycle";
  capacity_kg: number;
  status: string;
};

export default function SimpleAssignment() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { getOrgUnassignedParcels, getRiders } = await import("@/lib/api");
      
      const [parcelsList, ridersList] = await Promise.all([
        getOrgUnassignedParcels(),
        getRiders(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedParcels = (parcelsList || []).map((p: any) => ({
        id: p.id,
        tracking_code: p.tracking_code,
        address: p.address,
        weight_kg: p.weight_kg || 0,
        priority: p.priority || 'normal',
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedRiders: Rider[] = (ridersList || []).map((r: any) => ({
        id: r.id,
        name: r.profiles?.full_name || "Unknown",
        vehicle_type: "motorcycle" as const,
        capacity_kg: r.capacity || 0,
        status: r.status,
      }));

      setParcels(mappedParcels);
      setRiders(mappedRiders);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAssignParcel = async (parcelId: string, riderId: string) => {
    setAssigning(parcelId);
    setMessage(null);

    try {
      const { assignParcelToRider } = await import("@/lib/api");
      await assignParcelToRider(parcelId, riderId);

      // Remove parcel from the list
      setParcels(parcels.filter(p => p.id !== parcelId));
      setMessage({ type: 'success', text: 'Parcel assigned successfully!' });

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to assign parcel:", err);
      setMessage({ type: 'error', text: 'Failed to assign parcel. Please try again.' });

      // Clear message after 5 seconds
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setAssigning(null);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/70 backdrop-blur p-6 shadow">
        <div className="text-center text-gray-600">Loading parcels and riders...</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/70 backdrop-blur p-6 shadow space-y-6">


      {/* Message Toast */}
      {message && (
        <div className={`p-3 rounded-lg flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {parcels.length === 0 ? (
        <div className="text-center py-8 text-gray-600">
          <Package className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p className="font-medium">No unassigned parcels</p>
          <p className="text-sm">All parcels have been assigned!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {parcels.map((parcel) => (
            <div key={parcel.id} className="p-4 border rounded-lg bg-gray-50">
              {/* Parcel Info */}
              <div className="mb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{parcel.tracking_code}</p>
                    <p className="text-xs text-gray-600 mt-1">{parcel.address}</p>
                    <span className={`inline-block text-xs px-2 py-1 rounded mt-2 ${
                      parcel.priority === 'high' 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {parcel.weight_kg} kg • {parcel.priority}
                    </span>
                  </div>
                </div>
              </div>

              {/* Rider Buttons */}
              <div className="grid grid-cols-1 gap-2">
                {riders.length === 0 ? (
                  <p className="text-xs text-gray-600 text-center">No available riders</p>
                ) : (
                  riders.map((rider) => {
                    const canAssign = rider.capacity_kg >= parcel.weight_kg && rider.status !== 'inactive';
                    return (
                      <button
                        key={rider.id}
                        onClick={() => handleAssignParcel(parcel.id, rider.id)}
                        disabled={!canAssign || assigning === parcel.id}
                        className={`p-2 rounded-lg text-sm flex items-center gap-2 transition ${
                          canAssign
                            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <Truck className="h-4 w-4" />
                        <span className="flex-1 text-left">
                          {rider.name} • {rider.capacity_kg} kg capacity
                        </span>
                        {assigning === parcel.id ? (
                          <span className="text-xs font-medium">Assigning...</span>
                        ) : canAssign ? (
                          <span className="text-xs">→</span>
                        ) : (
                          <span className="text-xs">Insufficient capacity</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
