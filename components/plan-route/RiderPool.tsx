"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import RiderCard from "@/components/common/RiderCard";
import { getRiders } from "@/lib/api";
import { usePlanRouteStore, Rider } from "@/stores/usePlanRouteStore";

type RiderRow = {
  id: string;
  capacity?: number | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  current_location_at?: string | null;
  profiles?: {
    full_name?: string | null;
  } | null;
};

const toFiniteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export default function RiderPool() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const setSelectedRider = usePlanRouteStore((s) => s.setSelectedRider);
  const selectedRider = usePlanRouteStore((s) => s.selectedRider);

  useEffect(() => {
    const loadRiders = async () => {
      try {
        setLoading(true);
        const data = await getRiders(undefined);
        const rows = Array.isArray(data) ? (data as RiderRow[]) : [];

        const mappedData: Rider[] = rows.map((rider) => ({
          id: rider.id,
          name: rider.profiles?.full_name || "Unknown",
          capacity_kg: rider.capacity || 0,
          lat: toFiniteOrNull(rider.current_latitude),
          lng: toFiniteOrNull(rider.current_longitude),
          location_updated_at: rider.current_location_at || null,
        }));

        setRiders(mappedData);
      } catch (err) {
        console.error("Failed to load riders:", err);
      } finally {
        setLoading(false);
      }
    };
    loadRiders();
  }, []);

  const filteredRiders = riders.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Rider Pool</h3>
        <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-full">
          {filteredRiders.length}/{riders.length}
        </span>
      </div>

      {/* SEARCH */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search riders..."
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 border text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>

      {/* RIDER LIST */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-xs text-gray-500 text-center py-4">Loading riders...</p>
        ) : filteredRiders.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">
            {riders.length === 0 ? 'No riders available' : 'No matching riders'}
          </p>
        ) : (
          filteredRiders.map((r) => (
            <RiderCard
              key={r.id}
              name={r.name}
              capacity={r.capacity_kg}
              status={r.lat !== null && r.lng !== null ? "Live location" : "No live location"}
              isSelected={selectedRider?.id === r.id}
              onClick={() => setSelectedRider(r)}
              showChevron={true}
            />
          ))
        )}
      </div>
    </div>
  );
}
