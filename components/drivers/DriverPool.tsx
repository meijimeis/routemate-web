"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import RiderCard from "@/components/common/RiderCard";
import { useDriverStore } from "@/stores/useDriverStore";

type Driver = {
  id: string;
  name: string;
  vehicle_type: "motorcycle";
  capacity_kg: number;
  status: string;
  organization_id?: string;
};

export default function DriverPool() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const selectedDriver = useDriverStore((s) => s.selectedDriver);
  const setSelectedDriver = useDriverStore((s) => s.setSelectedDriver);
  const searchParams = useSearchParams();
  const hasAppliedQuerySelection = useRef(false);

  const riderIdFromQuery = (searchParams.get("riderId") || "").trim();

  const getProfileName = useCallback((profiles: unknown): string => {
    if (Array.isArray(profiles)) {
      const first = profiles[0] as { full_name?: string | null } | undefined;
      return first?.full_name?.trim() || "";
    }

    const direct = profiles as { full_name?: string | null } | null;
    return direct?.full_name?.trim() || "";
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const { getRiders } = await import("@/lib/api");
      const ridersList = await getRiders(undefined);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedData: Driver[] = (ridersList || []).map((rider: any) => ({
        id: rider.id,
        name: getProfileName(rider.profiles),
        vehicle_type: "motorcycle" as const,
        capacity_kg: rider.capacity || 0,
        status: rider.status || "unavailable",
        organization_id: rider.organization_id,
      }));
      setDrivers(mappedData);
    } catch (err) {
      console.error("Error fetching drivers:", err);
    }
  }, [getProfileName]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  useEffect(() => {
    if (!riderIdFromQuery) {
      hasAppliedQuerySelection.current = false;
      return;
    }

    if (drivers.length === 0 || hasAppliedQuerySelection.current) return;

    const matchedDriver = drivers.find((driver) => driver.id === riderIdFromQuery);
    if (!matchedDriver) return;

    setSelectedDriver(matchedDriver);
    hasAppliedQuerySelection.current = true;
  }, [drivers, riderIdFromQuery, setSelectedDriver]);

  return (
    <div className="h-full rounded-2xl bg-white/70 backdrop-blur p-4 shadow overflow-y-auto">
      <h3 className="font-semibold mb-4 text-black">Drivers</h3>

      <div className="space-y-2">
        {drivers.map((driver) => (
          <RiderCard
            key={driver.id}
            name={driver.name}
            capacity={driver.capacity_kg}
            status={driver.status}
            isSelected={selectedDriver?.id === driver.id}
            onClick={() => setSelectedDriver(driver)}
            compact={true}
          />
        ))}
      </div>
    </div>
  );
}
