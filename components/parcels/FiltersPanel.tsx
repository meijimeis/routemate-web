"use client";

import { useState } from "react";

export default function FiltersPanel() {
  const [search, setSearch] = useState("");
  const [searchAddress, setSearchAddress] = useState("");

  // Display filters
  const [weightRange, setWeightRange] = useState(50);
  const [priority, setPriority] = useState({
    normal: false,
    express: false,
  });

  // Grouping settings
  const [maxWeight, setMaxWeight] = useState<number | "">(50);
  const [maxParcels, setMaxParcels] = useState<number | "">("");
  const [maxRadius, setMaxRadius] = useState<number | "">("");

  // Optional post-processing rules
  const [minWeight, setMinWeight] = useState<number | "">("");
  const [minParcels, setMinParcels] = useState<number | "">("");

  return (
    <div className="bg-transparent rounded-2xl border border-[#E5E7EB] p-4 space-y-5">
      <h3 className="text-lg font-semibold text-[#1F2937]">Filters</h3>

      {/* SEARCH FILTERS */}
      <div className="space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parcel ID, cluster, rider..."
          className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />

        <input
          value={searchAddress}
          onChange={(e) => setSearchAddress(e.target.value)}
          placeholder="Search address..."
          className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* DISPLAY FILTERS */}
      <div>
        <label className="text-sm font-medium text-[#1F2937] block mb-2">
          Weight Filter
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={weightRange}
            onChange={(e) => setWeightRange(Number(e.target.value))}
            className="w-full accent-purple-500"
          />
          <span className="text-sm text-[#6B7280] whitespace-nowrap">
            0 kg – {weightRange} kg
          </span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-[#1F2937] block mb-2">
          Priority
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-[#374151]">
            <input
              type="checkbox"
              checked={priority.normal}
              onChange={(e) =>
                setPriority((prev) => ({ ...prev, normal: e.target.checked }))
              }
              className="accent-purple-500"
            />
            Normal
          </label>

          <label className="flex items-center gap-2 text-sm text-[#374151]">
            <input
              type="checkbox"
              checked={priority.express}
              onChange={(e) =>
                setPriority((prev) => ({ ...prev, express: e.target.checked }))
              }
              className="accent-purple-500"
            />
            Express
          </label>
        </div>
      </div>

      {/* GROUPING SETTINGS */}
      <div className="border-t border-[#E5E7EB] pt-4 space-y-3">
        <h4 className="text-sm font-semibold text-[#1F2937]">
          Grouping Settings
        </h4>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-sm font-medium text-[#1F2937] block mb-1">
              Max Weight (kg) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={maxWeight}
              onChange={(e) =>
                setMaxWeight(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="Required capacity limit"
              className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-xs text-[#6B7280] mt-1">
              Main hard constraint for grouping.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-[#1F2937] block mb-1">
              Max Parcels (optional)
            </label>
            <input
              type="number"
              min={1}
              value={maxParcels}
              onChange={(e) =>
                setMaxParcels(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              placeholder="Leave blank for no parcel limit"
              className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-xs text-[#6B7280] mt-1">
              Optional operational limit only.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-[#1F2937] block mb-1">
              Max Distance Radius (km, optional)
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={maxRadius}
              onChange={(e) =>
                setMaxRadius(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              placeholder="Leave blank for flexible optimization"
              className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-xs text-[#6B7280] mt-1">
              Leave blank so grouping is not overly restricted.
            </p>
          </div>
        </div>
      </div>

      {/* ADVANCED / POST-PROCESSING */}
      <div className="border-t border-[#E5E7EB] pt-4 space-y-3">
        <h4 className="text-sm font-semibold text-[#1F2937]">
          Advanced Post-Processing
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-[#1F2937] block mb-1">
              Min Weight (optional)
            </label>
            <input
              type="number"
              min={0}
              value={minWeight}
              onChange={(e) =>
                setMinWeight(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              placeholder="Used for merge validation"
              className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[#1F2937] block mb-1">
              Min Parcels (optional)
            </label>
            <input
              type="number"
              min={0}
              value={minParcels}
              onChange={(e) =>
                setMinParcels(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              placeholder="Used for merge validation"
              className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <p className="text-xs text-[#6B7280]">
        </p>
      </div>
    </div>
  );
}