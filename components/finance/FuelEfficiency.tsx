"use client";

import { Fuel } from "lucide-react";
import { useFinanceData } from "./FinanceDataProvider";

export default function FuelEfficiency() {
  const { data, loading } = useFinanceData();
  const kmPerLiter = data.fuelEfficiency.kmPerLiter;

  return (
    <div className="p-6">
      <h3 className="mb-5 text-[20px] font-semibold text-[#1F2937]">
        Fuel Efficiency
      </h3>

      {loading ? <p className="mb-3 text-xs text-gray-500">Loading fuel efficiency...</p> : null}

      <div className="flex items-center justify-between rounded-[18px] bg-[#F7F8FC] px-5 py-5">
        <div>
          <p className="text-[30px] font-semibold leading-none text-[#16A34A]">
            {kmPerLiter != null ? `${kmPerLiter.toFixed(1)} km/L` : "--"}
          </p>
          <p className="mt-2 text-[14px] text-[#6B7280]">
            {kmPerLiter != null
              ? "Average efficiency from logged fuel liters and rider distance"
              : "Add fuel liters in finance cost entries to compute live efficiency"}
          </p>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#DCFCE7]">
          <Fuel size={22} className="text-[#16A34A]" />
        </div>
      </div>
    </div>
  );
}