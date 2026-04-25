import {
  Severity,
  TrafficLevel,
  ViolationType,
  RecommendedAction,
} from "./types";

/* ===============================
   BASE SEVERITY (LOGIC, NOT UI)
   =============================== */

const BASE_SEVERITY: Record<ViolationType, Severity> = {
  ZONE_EXIT_UNAUTHORIZED: "critical",
  ZONE_OVERSTAY: "warning",
  ZONE_MISSED_ENTRY: "warning",

  PARCEL_DELAY_RISK: "warning",

  TRAFFIC_DELAY_IMPACT: "info",
  TRAFFIC_RE_ROUTE_REQUIRED: "critical",
};

/* ===============================
   TRAFFIC ESCALATION RULES
   =============================== */

const TRAFFIC_ESCALATION: Record<
  TrafficLevel,
  Partial<Record<Severity, Severity>>
> = {
  LOW: {},

  MODERATE: {
    info: "warning",
  },

  HEAVY: {
    info: "warning",
    warning: "critical",
  },

  SEVERE: {
    info: "critical",
    warning: "critical",
  },
};

/* ===============================
   FINAL RESOLUTION FUNCTION
   =============================== */

export function resolveViolationSeverity({
  violationType,
  trafficLevel,
}: {
  violationType: ViolationType;
  trafficLevel: TrafficLevel;
}): Severity {
  const base = BASE_SEVERITY[violationType];
  const escalation = TRAFFIC_ESCALATION[trafficLevel];

  return escalation?.[base] ?? base;
}

export function resolveRecommendedAction({
  violationType,
  trafficLevel,
}: {
  violationType: ViolationType;
  trafficLevel: TrafficLevel;
}): RecommendedAction {

  if (violationType === "ZONE_EXIT_UNAUTHORIZED") {
    if (trafficLevel === "SEVERE") return "ESCALATE";
    if (trafficLevel === "HEAVY") return "CONTACT_DRIVER";
    return "MONITOR";
  }

  if (violationType === "ZONE_OVERSTAY") {
    if (trafficLevel === "SEVERE") return "REROUTE";
    return "CONTACT_DRIVER";
  }

  if (violationType === "TRAFFIC_DELAY_IMPACT") {
    return "REROUTE";
  }

  return "MONITOR";
}