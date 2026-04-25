import {
  GeofenceViolation,
  Severity,
  ViolationType,
} from "./types";

import {
  resolveViolationSeverity,
  resolveRecommendedAction,
} from "./violationRules";

/* ===============================
   MESSAGE TEMPLATES
   =============================== */

const MESSAGE_TEMPLATES: Record<
  ViolationType,
  (v: GeofenceViolation) => string
> = {
  ZONE_EXIT_UNAUTHORIZED: (v) =>
    `${v.riderName} exited ${v.zoneName} without authorization`,

  ZONE_OVERSTAY: (v) =>
    `${v.riderName} overstayed in ${v.zoneName}`,

  ZONE_MISSED_ENTRY: (v) =>
    `${v.riderName} did not enter ${v.zoneName} as scheduled`,

  PARCEL_DELAY_RISK: (v) =>
    `Parcel delivery risk detected for ${v.riderName}`,

  TRAFFIC_DELAY_IMPACT: (v) =>
    `Traffic delay affecting ${v.riderName} near ${v.zoneName}`,

  TRAFFIC_RE_ROUTE_REQUIRED: (v) =>
    `Reroute required for ${v.riderName} due to traffic`,
};

/* ===============================
   MESSAGE DRAFT GENERATOR (F5)
   =============================== */

function buildMessageDraft(
  violation: GeofenceViolation
): string | undefined {
  switch (violation.violationType) {
    case "ZONE_EXIT_UNAUTHORIZED":
      return `Hi ${violation.riderName}, you have exited the ${violation.zoneName} zone. Please return immediately or contact dispatch.`;

    case "ZONE_OVERSTAY":
      return `Hi ${violation.riderName}, you have exceeded the allowed time in ${violation.zoneName}. Please update your status.`;

    case "ZONE_MISSED_ENTRY":
      return `Hi ${violation.riderName}, you missed the scheduled entry into ${violation.zoneName}. Please confirm your position.`;

    case "TRAFFIC_DELAY_IMPACT":
      return `Hi ${violation.riderName}, heavy traffic may affect your route near ${violation.zoneName}. Stand by for instructions.`;

    case "TRAFFIC_RE_ROUTE_REQUIRED":
      return `Hi ${violation.riderName}, rerouting is required due to traffic conditions. Please follow updated instructions.`;

    default:
      return undefined;
  }
}

/* ===============================
   BUILD NOTIFICATION (FINAL)
   =============================== */

export function buildNotification(
  violation: GeofenceViolation
) {
  const severity: Severity = resolveViolationSeverity({
    violationType: violation.violationType,
    trafficLevel: violation.trafficLevel,
  });

  const recommendedAction = resolveRecommendedAction({
    violationType: violation.violationType,
    trafficLevel: violation.trafficLevel,
  });

  return {
    id: violation.id,
    type: "geofence" as const,
    severity,

    message:
      MESSAGE_TEMPLATES[violation.violationType]?.(violation) ??
      "Geofence violation detected",

    timestamp: violation.timestamp,

    // 📍 spatial context
    location: violation.zoneName,
    lat: violation.lat,
    lng: violation.lng,

    // 🧠 decision intelligence
    metadata: {
      violationType: violation.violationType,
      trafficLevel: violation.trafficLevel,
      recommendedAction,
      messageDraft: buildMessageDraft(violation),
    },
  };
}