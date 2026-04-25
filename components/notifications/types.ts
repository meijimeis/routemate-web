/* ===============================
   UI NOTIFICATION (USED BY COMPONENTS)
   =============================== */

export type RecommendedAction =
  | "MONITOR"
  | "CONTACT_DRIVER"
  | "REROUTE"
  | "ESCALATE";

export type Notification = {
  id: string;
  type: "geofence" | "route" | "system";
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: string;

  location?: string;
  lat?: number;
  lng?: number;

  metadata?: {
    violationType?: string;
    trafficLevel?: "LOW" | "MODERATE" | "HEAVY" | "SEVERE";

    // 🆕 Phase F5
    recommendedAction?: RecommendedAction;
    messageDraft?: string;
  };
};


export type NotificationType = "geofence" | "route" | "system";
export type Severity = "info" | "warning" | "critical";


export type TrafficSignal = {
  speedKph: number;
  congestionRatio: number; // 0 → 1
};


/* ===============================
   DOMAIN: TRAFFIC + GEOFENCE
   =============================== */

export type TrafficLevel = "LOW" | "MODERATE" | "HEAVY" | "SEVERE";

export type ViolationType =
  | "ZONE_EXIT_UNAUTHORIZED"
  | "ZONE_OVERSTAY"
  | "ZONE_MISSED_ENTRY"
  | "PARCEL_DELAY_RISK"
  | "TRAFFIC_DELAY_IMPACT"
  | "TRAFFIC_RE_ROUTE_REQUIRED";

/* ===============================
   RAW GEOFENCE VIOLATION
   (ENGINE / SIMULATION / SUPABASE)
   =============================== */

export interface GeofenceViolation {
  id: string;
  riderName: string;
  zoneName: string;

  // 📍 spatial truth
  lat: number;
  lng: number;

  violationType: ViolationType;
  baseSeverity: Severity;
  trafficLevel: TrafficLevel;

  timestamp: string;
}

export type AlertKind =
  | "ZONE_EXIT_UNAUTHORIZED"
  | "ZONE_OVERSTAY"
  | "ARRIVAL_CONFIRMED"
  | "EARLY_ARRIVAL"
  | "LATE_ARRIVAL"
  | "DELIVERY_DELAY"
  | "OFF_ROUTE"
  | "SUPERVISOR_MESSAGE"
  | "SYSTEM";

export type SupervisorNotification = {
  id: string;
  riderId: string | null;
  riderName: string;
  alertType: AlertKind;
  notificationType: NotificationType;
  severity: Severity;
  message: string;
  timestamp: string;
  location: string;
  lat: number | null;
  lng: number | null;
  geofenceId?: string | null;
  metadata?: Record<string, unknown>;
  draftMessage?: string;
};

export type GeofenceZoneShape = {
  id: string;
  name: string;
  positions: Array<[number, number]>;
  maxDwellMinutes: number;
  allowExit: boolean;
  center?: { lat: number; lng: number } | null;
  radiusMeters?: number | null;
  source?: "polygon" | "parcel";
  routeId?: string | null;
  riderId?: string | null;
  deliveryId?: string | null;
  parcelId?: string | null;
  trackingCode?: string | null;
  address?: string | null;
  expectedArrivalAt?: string | null;
  status?: "normal" | "warning" | "critical" | "completed";
};

export type ParcelGeofenceOverlay = {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  riderId: string;
  riderName: string;
  routeId: string;
  deliveryId: string | null;
  parcelId: string;
  trackingCode: string | null;
  address: string;
  expectedArrivalAt: string | null;
  status: "normal" | "warning" | "critical" | "completed";
};

export type RoutePolylineOverlay = {
  id: string;
  riderId: string;
  riderName: string;
  routeId: string;
  points: Array<[number, number]>;
  severity: Severity;
};

export type GeofenceSummaryStats = {
  exitCount: number;
  overstayCount: number;
  offRouteCount: number;
  delayedCount: number;
  arrivalCount: number;
  earlyArrivalCount: number;
  lateArrivalCount: number;
  warningZoneRows: Array<{
    zoneId: string;
    zoneName: string;
    count: number;
  }>;
};

