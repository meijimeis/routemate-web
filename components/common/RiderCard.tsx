"use client";

import { ChevronDown } from "lucide-react";

interface RiderCardProps {
  name: string;
  status?: string;
  capacity?: number;
  isSelected?: boolean;
  onClick?: () => void;
  showChevron?: boolean;
  compact?: boolean;
}

export default function RiderCard({
  name,
  status,
  capacity,
  isSelected = false,
  onClick,
  showChevron = false,
  compact = false,
}: RiderCardProps) {
  const displayName = name || "Unknown";
  const initial = displayName.charAt(0).toUpperCase();

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${
          isSelected ? "bg-purple-100" : "bg-gray-50 hover:bg-gray-100"
        }`}
        onClick={onClick}
      >
        <div
          className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
            isSelected
              ? "bg-purple-500 text-white"
              : "bg-purple-100 text-purple-700"
          }`}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-black truncate">{displayName}</p>
          {status && <p className="text-xs text-gray-600 truncate">{status}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
        isSelected
          ? "bg-purple-50 border-purple-400"
          : "border-gray-200 hover:bg-gray-50"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div
          className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
            isSelected
              ? "bg-purple-500 text-white"
              : "bg-purple-100 text-purple-700"
          }`}
        >
          {initial}
        </div>

        <div className="text-left">
          <p className="font-medium text-sm text-black">{displayName}</p>
          {capacity !== undefined && (
            <p className="text-xs text-gray-600">Capacity: {capacity} kg</p>
          )}
          {status && !capacity && (
            <p className="text-xs text-gray-600">{status}</p>
          )}
        </div>
      </div>

      {showChevron && (
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 ${
            isSelected ? "text-purple-500" : "text-gray-700"
          }`}
        />
      )}
    </div>
  );
}
