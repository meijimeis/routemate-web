"use client";

interface ParcelGroupSettingsProps {
  settings: {
    maxWeight: number;
    minWeight: number;
    maxParcels: number;
    minParcels: number;
    maxDistanceRadius: number;
  };
  hasComputedPreview: boolean;
  ungroupedCount: number;
  groupedCount: number;
  clusterDefinition: string;
  onAutoGroup: () => void;
  onSettingsChange: (settings: ParcelGroupSettingsProps['settings']) => void;
}

export default function ParcelGroupSettings({
  settings,
  hasComputedPreview,
  ungroupedCount,
  groupedCount,
  clusterDefinition,
  onAutoGroup,
  onSettingsChange,
}: ParcelGroupSettingsProps) {
  const handleChange = (key: keyof ParcelGroupSettingsProps["settings"], value: number) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const newSettings = { ...settings, [key]: safeValue };
    onSettingsChange(newSettings);
  };

  return (
    <>
      {/* STATS */}
      <div className="px-6 py-4 border-b space-y-3">
        <div>
          <p className="text-sm text-gray-600">Ungrouped</p>
          <p className="text-2xl font-bold text-gray-900">{hasComputedPreview ? ungroupedCount : "-"}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Grouped</p>
          <p className="text-2xl font-bold text-purple-600">{hasComputedPreview ? groupedCount : "-"}</p>
        </div>
        {!hasComputedPreview ? <p className="text-[11px] text-gray-500">Counts appear after Auto Group runs.</p> : null}
      </div>

      {/* SETTINGS */}
      <div className="px-6 py-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Parcel Grouping Settings</h3>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-900 mb-1">How Clustering Works</p>
          <p className="text-xs text-blue-800 leading-relaxed">{clusterDefinition}</p>
        </div>

        {/* Max Weight */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Max Weight (kg)
          </label>
          <input
            type="number"
            min={0}
            value={settings.maxWeight}
            onChange={(e) => handleChange("maxWeight", Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="mt-1 text-[11px] text-gray-500">Set 0 to remove the max-weight limit.</p>
        </div>

        {/* Min Weight */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Min Weight (kg)
          </label>
          <input
            type="number"
            min={0}
            value={settings.minWeight}
            onChange={(e) => handleChange("minWeight", Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="mt-1 text-[11px] text-gray-500">Set 0 to remove the minimum-weight target.</p>
        </div>

        {/* Max Parcels */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Max Parcels
          </label>
          <input
            type="number"
            min={0}
            value={settings.maxParcels}
            onChange={(e) => handleChange("maxParcels", Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="mt-1 text-[11px] text-gray-500">Set 0 to remove the max-parcel limit.</p>
        </div>

        {/* Min Parcels */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Min Parcels
          </label>
          <input
            type="number"
            min={0}
            value={settings.minParcels}
            onChange={(e) => handleChange("minParcels", Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="mt-1 text-[11px] text-gray-500">Set 0 to remove the minimum-parcel target.</p>
        </div>

        {/* Max Distance Radius */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Max Distance Radius (km)
          </label>
          <input
            type="number"
            min={0}
            value={settings.maxDistanceRadius}
            onChange={(e) => handleChange("maxDistanceRadius", Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="mt-1 text-[11px] text-gray-500">Set 0 to disable the distance-radius limit.</p>
        </div>

        {/* Auto Group Button */}
        <button
          onClick={onAutoGroup}
          className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition mt-6"
        >
          Auto Group Parcels
        </button>
      </div>
    </>
  );
}
