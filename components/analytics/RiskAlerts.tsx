import { AlertTriangle, AlertCircle, TrendingDown, Clock } from "lucide-react";
import { useAnalyticsData } from "@/components/analytics/AnalyticsDataProvider";

const iconMap = {
  clock: Clock,
  "alert-triangle": AlertTriangle,
  "trending-down": TrendingDown,
  "alert-circle": AlertCircle,
};

function getAlertStyles(level: string) {
  switch (level) {
    case "critical":
      return {
        container: "bg-red-50 border-l-4 border-red-500",
        dot: "bg-red-500",
        badge: "bg-red-100 text-red-800",
        text: "text-red-900",
      };
    case "warning":
      return {
        container: "bg-yellow-50 border-l-4 border-yellow-500",
        dot: "bg-yellow-500",
        badge: "bg-yellow-100 text-yellow-800",
        text: "text-yellow-900",
      };
    default:
      return {
        container: "bg-blue-50 border-l-4 border-blue-500",
        dot: "bg-blue-500",
        badge: "bg-blue-100 text-blue-800",
        text: "text-blue-900",
      };
  }
}

export default function RiskAlerts() {
  const { data, loading } = useAnalyticsData();
  const alerts = data.riskAlerts;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Risk Alerts</h3>
          <p className="text-xs text-gray-600 mt-1">System detected {alerts.length} active issues</p>
        </div>
      </div>

      {loading ? (
        <div className="mb-3 h-28 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
      ) : null}

      <div className="space-y-3">
        {alerts.map((alert, i) => {
          const styles = getAlertStyles(alert.level);
          const IconComponent = iconMap[alert.icon] || AlertCircle;

          return (
            <div
              key={i}
              className={`rounded-lg p-4 flex items-center justify-between transition-colors hover:shadow-md ${styles.container}`}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className={`${styles.dot} p-2 rounded-lg`}>
                  <IconComponent className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className={`font-semibold text-sm ${styles.text}`}>
                    {alert.label}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {alert.value} occurrences {alert.context}
                  </p>
                </div>
              </div>

              <button
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${styles.badge} hover:shadow-md transition-shadow`}
              >
                {alert.action}
              </button>
            </div>
          );
        })}
      </div>

      {/* NO CRITICAL ALERTS MESSAGE */}
      {alerts.filter(a => a.level === 'critical').length === 0 && (
        <div className="mt-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg">
          <p className="text-sm font-medium text-green-900">
            ✓ All systems operating normally
          </p>
        </div>
      )}
    </div>
  );
}