export default function AnalyticsActions() {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      {/* Primary Action */}
      <button className="rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 px-5 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 transition">
        Export Report
      </button>

      {/* Secondary Buttons */}
      <button className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
        Configure Alert
      </button>

      <button className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
        Plan Capacity
      </button>

      <button className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
        Show Insights
      </button>
    </div>
  );
}