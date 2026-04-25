import { Calendar } from "lucide-react";
import { useAnalyticsData } from "@/components/analytics/AnalyticsDataProvider";

function getHeatColor(value: number) {
  if (value >= 0.75) return { bg: "bg-purple-600", text: "text-purple-600" };
  if (value >= 0.45) return { bg: "bg-purple-300", text: "text-purple-300" };
  return { bg: "bg-purple-100", text: "text-purple-100" };
}

export default function ParcelDemand() {
  const { data, loading } = useAnalyticsData();
  const { heatmap, days, hours, peakText } = data.parcelDemand;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Parcel Demand Heatmap
          </h3>
          <Calendar className="w-4 h-4 text-gray-500" />
        </div>
        <p className="text-xs text-gray-600">Peak delivery times by day and hour</p>
      </div>

      {loading ? (
        <div className="mb-3 h-44 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
      ) : null}

      <div className="flex-1 flex flex-col gap-4 min-h-[250px]">
        {/* HEATMAP */}
        <div className="rounded-lg bg-gradient-to-b from-gray-50 to-white border border-gray-200 p-4">
          {/* HOURS LABELS (left side) */}
          <div className="flex gap-2">
            <div className="w-12 flex flex-col justify-between text-xs font-medium text-gray-600 pr-2">
              <span>Peak</span>
              {hours.map((h) => (
                <span key={h} className="text-center">{h}</span>
              ))}
              <span>Low</span>
            </div>

            {/* HEATMAP GRID */}
            <div className="flex-1">
              <div className="grid grid-cols-7 gap-1">
                {heatmap.flatMap((row, rowIndex) =>
                  row.map((value, colIndex) => {
                    const colors = getHeatColor(value);
                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        className={`h-8 rounded-md ${colors.bg} hover:opacity-75 transition-opacity cursor-pointer ring-1 ring-white`}
                        title={`${days[colIndex]} ${hours[rowIndex]}: ${Math.round(value * 100)}%`}
                      />
                    );
                  })
                )}
              </div>

              {/* DAY LABELS (bottom) */}
              <div className="grid grid-cols-7 gap-1 mt-3">
                {days.map((day) => (
                  <div key={day} className="text-xs font-medium text-gray-600 text-center">
                    {day}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* LEGEND */}
        <div className="flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-purple-100" />
            <span className="text-xs text-gray-600">Low</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-purple-300" />
            <span className="text-xs text-gray-600">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-purple-600" />
            <span className="text-xs text-gray-600">High</span>
          </div>
        </div>

        {/* INSIGHTS */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-900">
            <span className="font-semibold">Peak Slot:</span> {peakText}
          </p>
        </div>
      </div>
    </div>
  );
}