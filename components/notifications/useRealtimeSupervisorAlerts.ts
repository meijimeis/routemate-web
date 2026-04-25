"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDeliveriesByRoute,
  getGeofences,
  getNotifications,
  getRiders,
  getRoutes,
  getViolations,
} from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import type {
  AlertKind,
  GeofenceSummaryStats,
  ParcelGeofenceOverlay,
  GeofenceZoneShape,
  NotificationType,
  RoutePolylineOverlay,
  Severity,
  SupervisorNotification,
} from "./types";

type SupabaseProfile = {
  full_name?: string | null;
};

type SupabaseRiderRow = {
  id: string;
  organization_id?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  profiles?: SupabaseProfile | SupabaseProfile[] | null;
};

type SupabaseRouteRow = {
  id: string;
  rider_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  cluster_name?: string | null;
  planned_distance_m?: number | null;
  planned_duration_s?: number | null;
  latest_snapshot_id?: string | null;
};

type SupabaseRouteSnapshotRow = {
  id?: string;
  route_id?: string;
  geometry?: unknown;
  distance_m?: number | null;
  duration_s?: number | null;
  created_at?: string | null;
};

type SupabaseParcelRow = {
  id: string;
  tracking_code?: string | null;
  address?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type SupabaseDeliveryRow = {
  id: string;
  route_id: string;
  rider_id?: string | null;
  sequence?: number | null;
  status?: string | null;
  created_at?: string | null;
  parcel_lists?: SupabaseParcelRow | SupabaseParcelRow[] | null;
};

type SupabaseGeofenceRow = {
  id: string;
  organization_id?: string | null;
  name?: string | null;
  geometry?: unknown;
  max_dwell_minutes?: number | null;
  allow_exit?: boolean | null;
  rules?: unknown;
};

type SupabaseNotificationRow = {
  id: string;
  organization_id?: string | null;
  rider_id?: string | null;
  type?: string | null;
  severity?: string | null;
  message?: string | null;
  location?: string | null;
  metadata?: unknown;
  created_at?: string | null;
  geofence_id?: string | null;
  riders?:
    | {
        profiles?: SupabaseProfile | SupabaseProfile[] | null;
      }
    | Array<{
        profiles?: SupabaseProfile | SupabaseProfile[] | null;
      }>
    | null;
};

type SupabaseViolationRow = {
  id: string;
  organization_id?: string | null;
  rider_name?: string | null;
  zone_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  violation_type?: string | null;
  base_severity?: string | null;
  traffic_level?: string | null;
  created_at?: string | null;
  geofence_id?: string | null;
};

type LocationLogInsert = {
  rider_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timestamp?: string | null;
};

type ZoneInternal = GeofenceZoneShape & {
  polygonLngLat: Array<[number, number]>;
};

type RiderRouteContext = {
  riderId: string;
  routeId: string;
  routeLabel: string;
  routeCreatedAt: string | null;
  plannedDurationSeconds: number | null;
  deliveryId: string | null;
  deliveryStatus: string | null;
  deliveryCreatedAt: string | null;
  routePolyline: Array<[number, number]>;
  parcelGeofences: Array<{
    id: string;
    riderId: string;
    riderName: string;
    routeId: string;
    routeLabel: string;
    deliveryId: string | null;
    deliveryStatus: string | null;
    parcelId: string;
    trackingCode: string | null;
    address: string;
    center: { lat: number; lng: number };
    radiusMeters: number;
    expectedArrivalAt: string | null;
    expectedArrivalMs: number | null;
    maxDwellMinutes: number;
    sequence: number;
  }>;
  destination: {
    id: string;
    lat: number;
    lng: number;
    address: string;
    trackingCode: string | null;
    expectedArrivalAt: string | null;
    expectedArrivalMs: number | null;
    radiusMeters: number;
  } | null;
};

type AlertRuntimeConfig = {
  offRouteMinDistanceKm: number;
  offRouteMinIncreaseKm: number;
  routeDeviationMinKm: number;
  offRouteMinSampleGapMs: number;
  delayWarningMinutes: number;
  delayCriticalMinutes: number;
  arrivalBufferSeconds: number;
  arrivalEarlyGraceMinutes: number;
  arrivalLateGraceMinutes: number;
  parcelDefaultRadiusMeters: number;
  parcelUrbanRadiusMeters: number;
  parcelRuralRadiusMeters: number;
  parcelMaxDwellMinutes: number;
  summaryWindowMs: number;
  defaultTrafficLevel: "LOW" | "MODERATE" | "HEAVY" | "SEVERE";
  warningWeightBySeverity: Record<Severity, number>;
  cooldownByAlertType: Record<AlertKind, number>;
  fallbackCooldownMs: number;
};

const DEFAULT_ALERT_RUNTIME_CONFIG: AlertRuntimeConfig = {
  offRouteMinDistanceKm: 1.2,
  offRouteMinIncreaseKm: 0.55,
  routeDeviationMinKm: 0.35,
  offRouteMinSampleGapMs: 90 * 1000,
  delayWarningMinutes: 45,
  delayCriticalMinutes: 90,
  arrivalBufferSeconds: 12,
  arrivalEarlyGraceMinutes: 8,
  arrivalLateGraceMinutes: 5,
  parcelDefaultRadiusMeters: 60,
  parcelUrbanRadiusMeters: 45,
  parcelRuralRadiusMeters: 95,
  parcelMaxDwellMinutes: 15,
  summaryWindowMs: 24 * 60 * 60 * 1000,
  defaultTrafficLevel: "MODERATE",
  warningWeightBySeverity: {
    info: 1,
    warning: 2,
    critical: 3,
  },
  cooldownByAlertType: {
    ZONE_EXIT_UNAUTHORIZED: 8 * 60 * 1000,
    ZONE_OVERSTAY: 15 * 60 * 1000,
    ARRIVAL_CONFIRMED: 30 * 60 * 1000,
    EARLY_ARRIVAL: 30 * 60 * 1000,
    LATE_ARRIVAL: 30 * 60 * 1000,
    OFF_ROUTE: 8 * 60 * 1000,
    DELIVERY_DELAY: 20 * 60 * 1000,
    SUPERVISOR_MESSAGE: 60 * 1000,
    SYSTEM: 5 * 60 * 1000,
  },
  fallbackCooldownMs: 10 * 60 * 1000,
};

const ROUTE_STATUS_PRIORITY: Record<string, number> = {
  in_progress: 5,
  active: 4,
  assigned: 3,
  draft: 2,
  pending: 1,
};

const CLOSED_DELIVERY_STATUSES = new Set([
  "completed",
  "delivered",
  "cancelled",
  "failed",
  "returned",
]);

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }

  return null;
}

function getRuleSources(rules: unknown): Record<string, unknown>[] {
  const root = asRecord(rules);
  const sources: Record<string, unknown>[] = [];

  if (Object.keys(root).length > 0) {
    sources.push(root);
  }

  const nestedKeys = [
    "alertConfig",
    "alert_config",
    "notificationConfig",
    "notification_config",
    "thresholds",
    "alertThresholds",
    "alert_thresholds",
    "routeAlerts",
    "route_alerts",
    "heatmap",
  ];

  for (const key of nestedKeys) {
    const nested = asRecord(root[key]);
    if (Object.keys(nested).length > 0) {
      sources.push(nested);
    }
  }

  return sources;
}

function readFromRuleSources<T>(
  ruleSources: Record<string, unknown>[],
  keys: string[],
  reader: (value: unknown) => T | null
): T | null {
  for (const source of ruleSources) {
    for (const key of keys) {
      const value = reader(source[key]);
      if (value != null) {
        return value;
      }
    }
  }

  return null;
}

function readRuleNumber(ruleSources: Record<string, unknown>[], keys: string[]): number | null {
  return readFromRuleSources(ruleSources, keys, readNumber);
}

function readRuleString(ruleSources: Record<string, unknown>[], keys: string[]): string | null {
  return readFromRuleSources(ruleSources, keys, readString);
}

function readRuleBoolean(ruleSources: Record<string, unknown>[], keys: string[]): boolean | null {
  return readFromRuleSources(ruleSources, keys, readBoolean);
}

function normalizeTrafficLevel(
  value: string | null
): AlertRuntimeConfig["defaultTrafficLevel"] | null {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized === "LOW") return "LOW";
  if (normalized === "MODERATE") return "MODERATE";
  if (normalized === "HEAVY") return "HEAVY";
  if (normalized === "SEVERE") return "SEVERE";
  return null;
}

function resolveRuntimeConfigFromGeofences(
  geofenceRows: SupabaseGeofenceRow[]
): AlertRuntimeConfig {
  const resolved: AlertRuntimeConfig = {
    ...DEFAULT_ALERT_RUNTIME_CONFIG,
    warningWeightBySeverity: {
      ...DEFAULT_ALERT_RUNTIME_CONFIG.warningWeightBySeverity,
    },
    cooldownByAlertType: {
      ...DEFAULT_ALERT_RUNTIME_CONFIG.cooldownByAlertType,
    },
  };

  geofenceRows.forEach((zone) => {
    const ruleSources = getRuleSources(zone.rules);
    if (ruleSources.length === 0) return;

    const offRouteMinDistanceKm = readRuleNumber(ruleSources, [
      "offRouteMinDistanceKm",
      "off_route_min_distance_km",
    ]);
    if (offRouteMinDistanceKm != null && offRouteMinDistanceKm > 0) {
      resolved.offRouteMinDistanceKm = offRouteMinDistanceKm;
    }

    const offRouteMinIncreaseKm = readRuleNumber(ruleSources, [
      "offRouteMinIncreaseKm",
      "off_route_min_increase_km",
    ]);
    if (offRouteMinIncreaseKm != null && offRouteMinIncreaseKm > 0) {
      resolved.offRouteMinIncreaseKm = offRouteMinIncreaseKm;
    }

    const routeDeviationMinKm = readRuleNumber(ruleSources, [
      "routeDeviationMinKm",
      "route_deviation_min_km",
      "routePathDeviationMinKm",
      "route_path_deviation_min_km",
    ]);
    if (routeDeviationMinKm != null && routeDeviationMinKm > 0) {
      resolved.routeDeviationMinKm = routeDeviationMinKm;
    }

    const offRouteMinSampleGapMs = readRuleNumber(ruleSources, [
      "offRouteMinSampleGapMs",
      "off_route_min_sample_gap_ms",
    ]);
    if (offRouteMinSampleGapMs != null && offRouteMinSampleGapMs > 0) {
      resolved.offRouteMinSampleGapMs = offRouteMinSampleGapMs;
    } else {
      const offRouteMinSampleGapSeconds = readRuleNumber(ruleSources, [
        "offRouteMinSampleGapSeconds",
        "off_route_min_sample_gap_seconds",
      ]);
      if (offRouteMinSampleGapSeconds != null && offRouteMinSampleGapSeconds > 0) {
        resolved.offRouteMinSampleGapMs = offRouteMinSampleGapSeconds * 1000;
      }
    }

    const delayWarningMinutes = readRuleNumber(ruleSources, [
      "delayWarningMinutes",
      "delay_warning_minutes",
    ]);
    if (delayWarningMinutes != null && delayWarningMinutes > 0) {
      resolved.delayWarningMinutes = delayWarningMinutes;
    }

    const delayCriticalMinutes = readRuleNumber(ruleSources, [
      "delayCriticalMinutes",
      "delay_critical_minutes",
    ]);
    if (delayCriticalMinutes != null && delayCriticalMinutes > 0) {
      resolved.delayCriticalMinutes = delayCriticalMinutes;
    }

    const arrivalBufferSeconds = readRuleNumber(ruleSources, [
      "arrivalBufferSeconds",
      "arrival_buffer_seconds",
      "arrivalHoldSeconds",
      "arrival_hold_seconds",
    ]);
    if (arrivalBufferSeconds != null && arrivalBufferSeconds > 0) {
      resolved.arrivalBufferSeconds = arrivalBufferSeconds;
    }

    const arrivalEarlyGraceMinutes = readRuleNumber(ruleSources, [
      "arrivalEarlyGraceMinutes",
      "arrival_early_grace_minutes",
      "earlyArrivalGraceMinutes",
      "early_arrival_grace_minutes",
    ]);
    if (arrivalEarlyGraceMinutes != null && arrivalEarlyGraceMinutes >= 0) {
      resolved.arrivalEarlyGraceMinutes = arrivalEarlyGraceMinutes;
    }

    const arrivalLateGraceMinutes = readRuleNumber(ruleSources, [
      "arrivalLateGraceMinutes",
      "arrival_late_grace_minutes",
      "lateArrivalGraceMinutes",
      "late_arrival_grace_minutes",
    ]);
    if (arrivalLateGraceMinutes != null && arrivalLateGraceMinutes >= 0) {
      resolved.arrivalLateGraceMinutes = arrivalLateGraceMinutes;
    }

    const parcelDefaultRadiusMeters = readRuleNumber(ruleSources, [
      "parcelDefaultRadiusMeters",
      "parcel_default_radius_meters",
      "geofenceRadiusMeters",
      "geofence_radius_meters",
    ]);
    if (parcelDefaultRadiusMeters != null && parcelDefaultRadiusMeters > 0) {
      resolved.parcelDefaultRadiusMeters = parcelDefaultRadiusMeters;
    }

    const parcelUrbanRadiusMeters = readRuleNumber(ruleSources, [
      "parcelUrbanRadiusMeters",
      "parcel_urban_radius_meters",
      "urbanRadiusMeters",
      "urban_radius_meters",
    ]);
    if (parcelUrbanRadiusMeters != null && parcelUrbanRadiusMeters > 0) {
      resolved.parcelUrbanRadiusMeters = parcelUrbanRadiusMeters;
    }

    const parcelRuralRadiusMeters = readRuleNumber(ruleSources, [
      "parcelRuralRadiusMeters",
      "parcel_rural_radius_meters",
      "ruralRadiusMeters",
      "rural_radius_meters",
    ]);
    if (parcelRuralRadiusMeters != null && parcelRuralRadiusMeters > 0) {
      resolved.parcelRuralRadiusMeters = parcelRuralRadiusMeters;
    }

    const parcelMaxDwellMinutes = readRuleNumber(ruleSources, [
      "parcelMaxDwellMinutes",
      "parcel_max_dwell_minutes",
      "maxParcelDwellMinutes",
      "max_parcel_dwell_minutes",
    ]);
    if (parcelMaxDwellMinutes != null && parcelMaxDwellMinutes > 0) {
      resolved.parcelMaxDwellMinutes = parcelMaxDwellMinutes;
    }

    const summaryWindowMs = readRuleNumber(ruleSources, [
      "summaryWindowMs",
      "summary_window_ms",
    ]);
    if (summaryWindowMs != null && summaryWindowMs > 0) {
      resolved.summaryWindowMs = summaryWindowMs;
    } else {
      const summaryWindowMinutes = readRuleNumber(ruleSources, [
        "summaryWindowMinutes",
        "summary_window_minutes",
      ]);
      if (summaryWindowMinutes != null && summaryWindowMinutes > 0) {
        resolved.summaryWindowMs = summaryWindowMinutes * 60 * 1000;
      } else {
        const summaryWindowHours = readRuleNumber(ruleSources, [
          "summaryWindowHours",
          "summary_window_hours",
        ]);
        if (summaryWindowHours != null && summaryWindowHours > 0) {
          resolved.summaryWindowMs = summaryWindowHours * 60 * 60 * 1000;
        }
      }
    }

    const trafficLevel = normalizeTrafficLevel(
      readRuleString(ruleSources, [
        "defaultTrafficLevel",
        "default_traffic_level",
        "trafficLevelDefault",
        "traffic_level_default",
      ])
    );
    if (trafficLevel) {
      resolved.defaultTrafficLevel = trafficLevel;
    }

    const infoWeight = readRuleNumber(ruleSources, [
      "warningWeightInfo",
      "warning_weight_info",
      "heatWeightInfo",
      "heat_weight_info",
    ]);
    if (infoWeight != null && infoWeight > 0) {
      resolved.warningWeightBySeverity.info = Math.round(infoWeight);
    }

    const warningWeight = readRuleNumber(ruleSources, [
      "warningWeightWarning",
      "warning_weight_warning",
      "heatWeightWarning",
      "heat_weight_warning",
    ]);
    if (warningWeight != null && warningWeight > 0) {
      resolved.warningWeightBySeverity.warning = Math.round(warningWeight);
    }

    const criticalWeight = readRuleNumber(ruleSources, [
      "warningWeightCritical",
      "warning_weight_critical",
      "heatWeightCritical",
      "heat_weight_critical",
    ]);
    if (criticalWeight != null && criticalWeight > 0) {
      resolved.warningWeightBySeverity.critical = Math.round(criticalWeight);
    }

    const exitCooldownMs = readRuleNumber(ruleSources, [
      "zoneExitCooldownMs",
      "zone_exit_cooldown_ms",
    ]);
    const exitCooldownMinutes = readRuleNumber(ruleSources, [
      "zoneExitCooldownMinutes",
      "zone_exit_cooldown_minutes",
    ]);
    if (exitCooldownMs != null && exitCooldownMs > 0) {
      resolved.cooldownByAlertType.ZONE_EXIT_UNAUTHORIZED = exitCooldownMs;
    } else if (exitCooldownMinutes != null && exitCooldownMinutes > 0) {
      resolved.cooldownByAlertType.ZONE_EXIT_UNAUTHORIZED = exitCooldownMinutes * 60 * 1000;
    }

    const overstayCooldownMs = readRuleNumber(ruleSources, [
      "zoneOverstayCooldownMs",
      "zone_overstay_cooldown_ms",
    ]);
    const overstayCooldownMinutes = readRuleNumber(ruleSources, [
      "zoneOverstayCooldownMinutes",
      "zone_overstay_cooldown_minutes",
    ]);
    if (overstayCooldownMs != null && overstayCooldownMs > 0) {
      resolved.cooldownByAlertType.ZONE_OVERSTAY = overstayCooldownMs;
    } else if (overstayCooldownMinutes != null && overstayCooldownMinutes > 0) {
      resolved.cooldownByAlertType.ZONE_OVERSTAY = overstayCooldownMinutes * 60 * 1000;
    }

    const offRouteCooldownMs = readRuleNumber(ruleSources, [
      "offRouteCooldownMs",
      "off_route_cooldown_ms",
    ]);
    const offRouteCooldownMinutes = readRuleNumber(ruleSources, [
      "offRouteCooldownMinutes",
      "off_route_cooldown_minutes",
    ]);
    if (offRouteCooldownMs != null && offRouteCooldownMs > 0) {
      resolved.cooldownByAlertType.OFF_ROUTE = offRouteCooldownMs;
    } else if (offRouteCooldownMinutes != null && offRouteCooldownMinutes > 0) {
      resolved.cooldownByAlertType.OFF_ROUTE = offRouteCooldownMinutes * 60 * 1000;
    }

    const delayCooldownMs = readRuleNumber(ruleSources, [
      "delayCooldownMs",
      "delay_cooldown_ms",
      "deliveryDelayCooldownMs",
      "delivery_delay_cooldown_ms",
    ]);
    const delayCooldownMinutes = readRuleNumber(ruleSources, [
      "delayCooldownMinutes",
      "delay_cooldown_minutes",
      "deliveryDelayCooldownMinutes",
      "delivery_delay_cooldown_minutes",
    ]);
    if (delayCooldownMs != null && delayCooldownMs > 0) {
      resolved.cooldownByAlertType.DELIVERY_DELAY = delayCooldownMs;
    } else if (delayCooldownMinutes != null && delayCooldownMinutes > 0) {
      resolved.cooldownByAlertType.DELIVERY_DELAY = delayCooldownMinutes * 60 * 1000;
    }

    const fallbackCooldownMs = readRuleNumber(ruleSources, [
      "fallbackCooldownMs",
      "fallback_cooldown_ms",
      "defaultCooldownMs",
      "default_cooldown_ms",
    ]);
    const fallbackCooldownMinutes = readRuleNumber(ruleSources, [
      "fallbackCooldownMinutes",
      "fallback_cooldown_minutes",
      "defaultCooldownMinutes",
      "default_cooldown_minutes",
    ]);
    if (fallbackCooldownMs != null && fallbackCooldownMs > 0) {
      resolved.fallbackCooldownMs = fallbackCooldownMs;
    } else if (fallbackCooldownMinutes != null && fallbackCooldownMinutes > 0) {
      resolved.fallbackCooldownMs = fallbackCooldownMinutes * 60 * 1000;
    }
  });

  if (resolved.delayCriticalMinutes < resolved.delayWarningMinutes) {
    resolved.delayCriticalMinutes = resolved.delayWarningMinutes;
  }

  if (resolved.parcelUrbanRadiusMeters > resolved.parcelRuralRadiusMeters) {
    resolved.parcelUrbanRadiusMeters = resolved.parcelRuralRadiusMeters;
  }

  if (resolved.parcelDefaultRadiusMeters < resolved.parcelUrbanRadiusMeters) {
    resolved.parcelDefaultRadiusMeters = resolved.parcelUrbanRadiusMeters;
  }

  return resolved;
}

function buildZonesInternal(geofenceRows: SupabaseGeofenceRow[]): ZoneInternal[] {
  return geofenceRows
    .map((zone) => {
      const polygonLngLat = extractZoneCoordinates(zone.geometry);
      if (polygonLngLat.length < 3) return null;

      const name = readString(zone.name) || `Zone ${zone.id.slice(0, 6).toUpperCase()}`;
      const ruleSources = getRuleSources(zone.rules);

      const maxDwellRaw =
        readNumber(zone.max_dwell_minutes) ??
        readRuleNumber(ruleSources, ["maxDwellMinutes", "max_dwell_minutes"]);

      const allowExit =
        readBoolean(zone.allow_exit) ??
        readRuleBoolean(ruleSources, ["allowExit", "allow_exit"]) ??
        false;

      return {
        id: zone.id,
        name,
        polygonLngLat,
        positions: polygonLngLat.map(([lng, lat]) => [lat, lng] as [number, number]),
        maxDwellMinutes: maxDwellRaw != null && maxDwellRaw > 0 ? maxDwellRaw : 20,
        allowExit,
      };
    })
    .filter((zone): zone is ZoneInternal => Boolean(zone));
}

function findContainingZone(
  lat: number,
  lng: number,
  zones: ZoneInternal[]
): ZoneInternal | null {
  for (const zone of zones) {
    if (isPointInPolygon([lng, lat], zone.polygonLngLat)) {
      return zone;
    }
  }

  return null;
}

function normalizeSeverity(value: string | null): Severity {
  const normalized = (value || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "warning") return "warning";
  return "info";
}

function normalizeNotificationType(value: string | null, alertType: AlertKind): NotificationType {
  const normalized = (value || "").toLowerCase();
  if (normalized === "geofence") return "geofence";
  if (normalized === "route" || normalized === "delivery") return "route";
  if (normalized === "system") return "system";

  if (
    alertType === "ZONE_EXIT_UNAUTHORIZED" ||
    alertType === "ZONE_OVERSTAY" ||
    alertType === "ARRIVAL_CONFIRMED" ||
    alertType === "EARLY_ARRIVAL" ||
    alertType === "LATE_ARRIVAL"
  ) {
    return "geofence";
  }

  if (alertType === "OFF_ROUTE" || alertType === "DELIVERY_DELAY") {
    return "route";
  }

  return "system";
}

function normalizeAlertType(value: string | null, fallback: NotificationType): AlertKind {
  const normalized = (value || "").trim().toUpperCase();

  if (
    normalized === "ZONE_EXIT_UNAUTHORIZED" ||
    normalized === "ZONE_OVERSTAY" ||
    normalized === "ARRIVAL_CONFIRMED" ||
    normalized === "EARLY_ARRIVAL" ||
    normalized === "LATE_ARRIVAL" ||
    normalized === "OFF_ROUTE" ||
    normalized === "DELIVERY_DELAY" ||
    normalized === "SUPERVISOR_MESSAGE" ||
    normalized === "SYSTEM"
  ) {
    return normalized;
  }

  if (fallback === "geofence") return "ZONE_EXIT_UNAUTHORIZED";
  if (fallback === "route") return "OFF_ROUTE";
  return "SYSTEM";
}

function firstProfileName(profiles: SupabaseProfile | SupabaseProfile[] | null | undefined): string | null {
  const profile = toArray(profiles)[0];
  return readString(profile?.full_name);
}

function extractZoneCoordinates(geometry: unknown): Array<[number, number]> {
  const parseLngLat = (point: unknown): [number, number] | null => {
    if (!Array.isArray(point) || point.length < 2) return null;

    const first = readNumber(point[0]);
    const second = readNumber(point[1]);

    if (first == null || second == null) return null;

    // Prefer GeoJSON ordering [lng, lat], but auto-correct if values look swapped.
    if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
      return [first, second];
    }

    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
      return [second, first];
    }

    return null;
  };

  const extractFirstRing = (candidate: unknown): Array<[number, number]> => {
    if (!Array.isArray(candidate)) return [];

    const directRing = candidate
      .map((point) => parseLngLat(point))
      .filter((point): point is [number, number] => Boolean(point));

    if (directRing.length >= 3) {
      return directRing;
    }

    for (const nested of candidate) {
      const nestedRing = extractFirstRing(nested);
      if (nestedRing.length >= 3) {
        return nestedRing;
      }
    }

    return [];
  };

  const root = asRecord(geometry);
  const nestedGeometry = asRecord(root.geometry);
  const candidates = [root.coordinates, nestedGeometry.coordinates, geometry];

  for (const candidate of candidates) {
    const ring = extractFirstRing(candidate);
    if (ring.length >= 3) {
      return ring;
    }
  }

  return [];
}

function isPointInPolygon(point: [number, number], polygon: Array<[number, number]>): boolean {
  let inside = false;
  const [x, y] = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function haversineKm(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const r = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

function haversineMeters(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  return haversineKm(fromLat, fromLng, toLat, toLng) * 1000;
}

function isUrbanAddress(address: string | null, region: string | null): boolean {
  const source = `${address || ""} ${region || ""}`.toLowerCase();
  if (!source.trim()) return false;

  const urbanHints = [
    "metro manila",
    "manila",
    "quezon city",
    "makati",
    "pasig",
    "taguig",
    "pasay",
    "mandaluyong",
    "cebu city",
    "davao city",
    "poblacion",
    "city",
  ];

  return urbanHints.some((hint) => source.includes(hint));
}

function resolveParcelRadiusMeters({
  address,
  region,
  runtimeConfig,
}: {
  address: string | null;
  region: string | null;
  runtimeConfig: AlertRuntimeConfig;
}): number {
  if (isUrbanAddress(address, region)) {
    return runtimeConfig.parcelUrbanRadiusMeters;
  }

  if ((region || "").trim().length > 0) {
    return runtimeConfig.parcelRuralRadiusMeters;
  }

  return runtimeConfig.parcelDefaultRadiusMeters;
}

function extractRoutePolylineLatLng(geometry: unknown): Array<[number, number]> {
  const root = asRecord(geometry);
  const nestedGeometry = asRecord(root.geometry);
  const candidates = [root.coordinates, nestedGeometry.coordinates, geometry];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    const points: Array<[number, number]> = [];

    for (const point of candidate) {
      if (!Array.isArray(point) || point.length < 2) continue;

      const lng = readNumber(point[0]);
      const lat = readNumber(point[1]);
      if (lat == null || lng == null) continue;

      points.push([lat, lng]);
    }

    if (points.length >= 2) {
      return points;
    }
  }

  return [];
}

function pointToSegmentDistanceKm(
  point: [number, number],
  start: [number, number],
  end: [number, number]
): number {
  const [lat, lng] = point;
  const [lat1, lng1] = start;
  const [lat2, lng2] = end;

  const avgLatRad = ((lat + lat1 + lat2) / 3) * (Math.PI / 180);
  const metersPerLat = 111_320;
  const metersPerLng = Math.max(1, 111_320 * Math.cos(avgLatRad));

  const px = lng * metersPerLng;
  const py = lat * metersPerLat;
  const x1 = lng1 * metersPerLng;
  const y1 = lat1 * metersPerLat;
  const x2 = lng2 * metersPerLng;
  const y2 = lat2 * metersPerLat;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const segmentLengthSq = dx * dx + dy * dy;

  if (segmentLengthSq <= 0) {
    const fallbackMeters = Math.hypot(px - x1, py - y1);
    return fallbackMeters / 1000;
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / segmentLengthSq));
  const projectionX = x1 + t * dx;
  const projectionY = y1 + t * dy;

  return Math.hypot(px - projectionX, py - projectionY) / 1000;
}

function distanceToPolylineKm(point: [number, number], polyline: Array<[number, number]>): number | null {
  if (polyline.length === 0) return null;

  if (polyline.length === 1) {
    return haversineKm(point[0], point[1], polyline[0][0], polyline[0][1]);
  }

  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const distance = pointToSegmentDistanceKm(point, polyline[i], polyline[i + 1]);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

function computeExpectedArrivalMs({
  routeCreatedAt,
  plannedDurationSeconds,
  sequence,
  totalStops,
}: {
  routeCreatedAt: string | null;
  plannedDurationSeconds: number | null;
  sequence: number;
  totalStops: number;
}): number | null {
  const routeStartMs = new Date(routeCreatedAt || "").getTime();
  if (!Number.isFinite(routeStartMs)) return null;

  const safeStops = Math.max(1, totalStops);
  const safeSequence = Math.max(1, Math.min(sequence, safeStops));
  const ratio = safeSequence / safeStops;

  const durationSeconds =
    plannedDurationSeconds && plannedDurationSeconds > 0
      ? plannedDurationSeconds
      : safeStops * 12 * 60;

  return Math.round(routeStartMs + durationSeconds * ratio * 1000);
}

function sortByNewest<T extends { timestamp?: string; created_at?: string | null }>(
  rows: T[]
): T[] {
  return [...rows].sort((left, right) => {
    const leftTs = new Date(left.timestamp || left.created_at || "").getTime();
    const rightTs = new Date(right.timestamp || right.created_at || "").getTime();
    return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0);
  });
}

function getRoutePriority(status: string | null | undefined): number {
  const normalized = (status || "").toLowerCase();
  return ROUTE_STATUS_PRIORITY[normalized] || 0;
}

function choosePreferredRoute(current: SupabaseRouteRow, incoming: SupabaseRouteRow): SupabaseRouteRow {
  const currentPriority = getRoutePriority(current.status);
  const incomingPriority = getRoutePriority(incoming.status);

  if (incomingPriority > currentPriority) return incoming;
  if (incomingPriority < currentPriority) return current;

  const currentTs = new Date(current.created_at || "").getTime();
  const incomingTs = new Date(incoming.created_at || "").getTime();

  if ((Number.isFinite(incomingTs) ? incomingTs : 0) > (Number.isFinite(currentTs) ? currentTs : 0)) {
    return incoming;
  }

  return current;
}

function pickDeliveryParcel(
  delivery: SupabaseDeliveryRow | null
): SupabaseParcelRow | null {
  if (!delivery) return null;
  return toArray(delivery.parcel_lists)[0] || null;
}

function pickActiveDelivery(deliveries: SupabaseDeliveryRow[]): SupabaseDeliveryRow | null {
  const ordered = [...deliveries].sort(
    (left, right) => Number(left.sequence || 0) - Number(right.sequence || 0)
  );

  const active = ordered.find(
    (delivery) => !CLOSED_DELIVERY_STATUSES.has((delivery.status || "").toLowerCase())
  );

  return active || ordered[0] || null;
}

function buildDraftMessage(alertType: AlertKind, riderName: string, location: string): string {
  if (alertType === "ARRIVAL_CONFIRMED") {
    return `Hi ${riderName}, arrival at ${location} has been confirmed. Please proceed to the next stop when ready.`;
  }

  if (alertType === "EARLY_ARRIVAL") {
    return `Hi ${riderName}, you arrived earlier than expected at ${location}. Please verify handoff timing and continue as planned.`;
  }

  if (alertType === "LATE_ARRIVAL") {
    return `Hi ${riderName}, arrival at ${location} is later than expected. Please share blocker details and updated ETA.`;
  }

  if (alertType === "ZONE_EXIT_UNAUTHORIZED") {
    return `Hi ${riderName}, you exited ${location}. Please return to your assigned geofence and confirm status.`;
  }

  if (alertType === "ZONE_OVERSTAY") {
    return `Hi ${riderName}, you have overstayed at ${location}. Please provide an update and proceed with your route.`;
  }

  if (alertType === "OFF_ROUTE") {
    return `Hi ${riderName}, you appear off-route near ${location}. Please return to the planned route or confirm reroute.`;
  }

  if (alertType === "DELIVERY_DELAY") {
    return `Hi ${riderName}, delivery timing is delayed near ${location}. Please share ETA and any blocker.`;
  }

  return `Hi ${riderName}, please check your latest route alert and confirm status.`;
}

type EmitAlertInput = {
  riderId: string;
  riderName: string;
  alertType: AlertKind;
  severity: Severity;
  message: string;
  location: string;
  lat: number;
  lng: number;
  geofenceId?: string | null;
  routeId?: string | null;
  deliveryId?: string | null;
  eventKey: string;
  createViolation?: boolean;
  violationType?: string | null;
  metadata?: Record<string, unknown>;
};

export function useRealtimeSupervisorAlerts() {
  const [alerts, setAlerts] = useState<SupervisorNotification[]>([]);
  const [zones, setZones] = useState<GeofenceZoneShape[]>([]);
  const [violations, setViolations] = useState<SupabaseViolationRow[]>([]);
  const [routeContexts, setRouteContexts] = useState<RiderRouteContext[]>([]);
  const [runtimeConfig, setRuntimeConfig] = useState<AlertRuntimeConfig>(
    DEFAULT_ALERT_RUNTIME_CONFIG
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const organizationIdRef = useRef<string | null>(null);
  const riderIdsRef = useRef<Set<string>>(new Set());
  const riderNameByIdRef = useRef<Map<string, string>>(new Map());
  const zonesInternalRef = useRef<ZoneInternal[]>([]);
  const routeContextByRiderRef = useRef<Map<string, RiderRouteContext>>(new Map());

  const riderZoneStateRef = useRef<Record<string, Record<string, boolean>>>({});
  const riderZoneInsideSinceRef = useRef<Record<string, Record<string, string>>>({});
  const riderDistanceRef = useRef<Record<string, { distanceKm: number; atMs: number }>>({});
  const parcelMonitorStateRef = useRef<
    Record<
      string,
      {
        inside: boolean;
        insideSinceMs: number | null;
        arrivedAtMs: number | null;
        arrivalAlertType: AlertKind | null;
        overstayAlerted: boolean;
      }
    >
  >({});
  const alertCooldownRef = useRef<Map<string, number>>(new Map());
  const routeRefreshTimerRef = useRef<number | null>(null);
  const hasHydratedRef = useRef(false);
  const hydrateRetryTimerRef = useRef<number | null>(null);
  const hydrateAttemptsRef = useRef(0);
  const isHydratingRef = useRef(false);

  const toSupervisorNotification = useCallback((row: SupabaseNotificationRow): SupervisorNotification | null => {
    const metadata = asRecord(row.metadata);
    const riderId =
      readString(row.rider_id) ||
      readString(metadata.riderId) ||
      readString(metadata.rider_id) ||
      null;

    const riderProfile = toArray(row.riders)[0];
    const riderName =
      readString(metadata.driverName) ||
      firstProfileName(riderProfile?.profiles) ||
      (riderId ? riderNameByIdRef.current.get(riderId) : null) ||
      "Unknown Driver";

    const notificationType = normalizeNotificationType(readString(row.type), "SYSTEM");
    const alertType = normalizeAlertType(
      readString(metadata.alertType) || readString(metadata.violationType),
      notificationType
    );

    const lat = readNumber(metadata.lat ?? metadata.latitude);
    const lng = readNumber(metadata.lng ?? metadata.longitude);

    const location =
      readString(row.location) ||
      readString(metadata.zoneName) ||
      readString(metadata.destinationAddress) ||
      (lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Unknown location");

    const timestamp = readString(row.created_at) || new Date().toISOString();
    const message = readString(row.message) || "Route alert generated.";
    const severity = normalizeSeverity(readString(row.severity));

    return {
      id: row.id,
      riderId,
      riderName,
      alertType,
      notificationType,
      severity,
      message,
      timestamp,
      location,
      lat,
      lng,
      geofenceId: readString(row.geofence_id),
      metadata,
      draftMessage: readString(metadata.messageDraft) || buildDraftMessage(alertType, riderName, location),
    };
  }, []);

  const upsertAlert = useCallback((nextAlert: SupervisorNotification) => {
    setAlerts((prev) => {
      const withoutCurrent = prev.filter((alert) => alert.id !== nextAlert.id);
      return sortByNewest([...withoutCurrent, nextAlert]);
    });
  }, []);

  const applyGeofenceRows = useCallback((geofenceRows: SupabaseGeofenceRow[]) => {
    const nextZonesInternal = buildZonesInternal(geofenceRows);
    zonesInternalRef.current = nextZonesInternal;

    setZones(
      nextZonesInternal.map((zone) => ({
        id: zone.id,
        name: zone.name,
        positions: zone.positions,
        maxDwellMinutes: zone.maxDwellMinutes,
        allowExit: zone.allowExit,
      }))
    );

    setRuntimeConfig(resolveRuntimeConfigFromGeofences(geofenceRows));
  }, []);

  const refreshRouteContexts = useCallback(async () => {
    const routesRaw = (await getRoutes(undefined)) as SupabaseRouteRow[];
    const routeRows = Array.isArray(routesRaw) ? routesRaw : [];

    const pickedRoutes = new Map<string, SupabaseRouteRow>();

    routeRows.forEach((route) => {
      const riderId = readString(route.rider_id);
      if (!riderId) return;

      const existing = pickedRoutes.get(riderId);
      if (!existing) {
        pickedRoutes.set(riderId, route);
        return;
      }

      pickedRoutes.set(riderId, choosePreferredRoute(existing, route));
    });

    const nextContexts = new Map<string, RiderRouteContext>();

    await Promise.all(
      Array.from(pickedRoutes.entries()).map(async ([riderId, route]) => {
        const riderName =
          riderNameByIdRef.current.get(riderId) || `Rider ${riderId.slice(0, 6).toUpperCase()}`;

        const deliveriesRaw = (await getDeliveriesByRoute(route.id)) as SupabaseDeliveryRow[];
        const deliveries = Array.isArray(deliveriesRaw) ? deliveriesRaw : [];

        const { data: snapshotRowRaw } = await supabase
          .from("route_snapshots")
          .select("id, route_id, geometry, distance_m, duration_s, created_at")
          .eq("route_id", route.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const snapshotRow = snapshotRowRaw as SupabaseRouteSnapshotRow | null;
        const routePolyline = extractRoutePolylineLatLng(snapshotRow?.geometry);

        const routeCreatedAt = readString(route.created_at);
        const plannedDurationSeconds =
          readNumber(route.planned_duration_s) ?? readNumber(snapshotRow?.duration_s);

        const sortedDeliveries = [...deliveries].sort(
          (left, right) => Number(left.sequence || 0) - Number(right.sequence || 0)
        );

        const openDeliveries = sortedDeliveries.filter(
          (delivery) => !CLOSED_DELIVERY_STATUSES.has((delivery.status || "").toLowerCase())
        );

        const deliveriesForGeofences = openDeliveries.length > 0 ? openDeliveries : sortedDeliveries;
        const safeStopCount = Math.max(1, deliveriesForGeofences.length);

        const parcelGeofences = deliveriesForGeofences
          .map((delivery, index) => {
            const parcel = pickDeliveryParcel(delivery);
            const centerLat = readNumber(parcel?.latitude);
            const centerLng = readNumber(parcel?.longitude);

            if (centerLat == null || centerLng == null) {
              return null;
            }

            const sequenceRaw = Number(delivery.sequence || index + 1);
            const sequence = Number.isFinite(sequenceRaw) && sequenceRaw > 0 ? sequenceRaw : index + 1;

            const expectedArrivalMs = computeExpectedArrivalMs({
              routeCreatedAt,
              plannedDurationSeconds,
              sequence,
              totalStops: safeStopCount,
            });

            const expectedArrivalAt = expectedArrivalMs
              ? new Date(expectedArrivalMs).toISOString()
              : null;

            const address = readString(parcel?.address) || "Unknown destination";
            const radiusMeters = resolveParcelRadiusMeters({
              address,
              region: readString(parcel?.region),
              runtimeConfig,
            });

            const parcelId = readString(parcel?.id) || `parcel-${route.id}-${sequence}`;
            const deliveryId = readString(delivery.id);

            return {
              id: `${riderId}:${route.id}:${deliveryId || parcelId}`,
              riderId,
              riderName,
              routeId: route.id,
              routeLabel:
                readString(route.cluster_name) ||
                `Route ${route.id.slice(0, 6).toUpperCase()}`,
              deliveryId,
              deliveryStatus: readString(delivery.status),
              parcelId,
              trackingCode: readString(parcel?.tracking_code),
              address,
              center: {
                lat: centerLat,
                lng: centerLng,
              },
              radiusMeters,
              expectedArrivalAt,
              expectedArrivalMs,
              maxDwellMinutes: runtimeConfig.parcelMaxDwellMinutes,
              sequence,
            };
          })
          .filter(
            (geofence): geofence is RiderRouteContext["parcelGeofences"][number] =>
              Boolean(geofence)
          );

        const activeDelivery = pickActiveDelivery(deliveries);
        const parcel = pickDeliveryParcel(activeDelivery);

        const destinationLat = readNumber(parcel?.latitude);
        const destinationLng = readNumber(parcel?.longitude);

        const activeParcelGeofence =
          parcelGeofences.find((zone) => zone.deliveryId === readString(activeDelivery?.id)) ||
          parcelGeofences[0] ||
          null;

        nextContexts.set(riderId, {
          riderId,
          routeId: route.id,
          routeLabel:
            readString(route.cluster_name) ||
            `Route ${route.id.slice(0, 6).toUpperCase()}`,
          routeCreatedAt,
          plannedDurationSeconds,
          deliveryId: readString(activeDelivery?.id),
          deliveryStatus: readString(activeDelivery?.status),
          deliveryCreatedAt: readString(activeDelivery?.created_at),
          routePolyline,
          parcelGeofences,
          destination:
            activeParcelGeofence
              ? {
                  id: activeParcelGeofence.id,
                  lat: activeParcelGeofence.center.lat,
                  lng: activeParcelGeofence.center.lng,
                  address: activeParcelGeofence.address,
                  trackingCode: activeParcelGeofence.trackingCode,
                  expectedArrivalAt: activeParcelGeofence.expectedArrivalAt,
                  expectedArrivalMs: activeParcelGeofence.expectedArrivalMs,
                  radiusMeters: activeParcelGeofence.radiusMeters,
                }
              : destinationLat != null && destinationLng != null
              ? {
                  id: `${route.id}:fallback-destination`,
                  lat: destinationLat,
                  lng: destinationLng,
                  address: readString(parcel?.address) || "Unknown destination",
                  trackingCode: readString(parcel?.tracking_code),
                  expectedArrivalAt: null,
                  expectedArrivalMs: null,
                  radiusMeters: runtimeConfig.parcelDefaultRadiusMeters,
                }
              : null,
        });
      })
    );

    routeContextByRiderRef.current = nextContexts;
    setRouteContexts(Array.from(nextContexts.values()));
  }, [runtimeConfig]);

  const scheduleRouteContextRefresh = useCallback(() => {
    if (routeRefreshTimerRef.current != null) {
      window.clearTimeout(routeRefreshTimerRef.current);
    }

    routeRefreshTimerRef.current = window.setTimeout(() => {
      routeRefreshTimerRef.current = null;
      void refreshRouteContexts();
    }, 600);
  }, [refreshRouteContexts]);

  const emitAlert = useCallback(
    async ({
      riderId,
      riderName,
      alertType,
      severity,
      message,
      location,
      lat,
      lng,
      geofenceId,
      routeId,
      deliveryId,
      eventKey,
      createViolation,
      violationType,
      metadata,
    }: EmitAlertInput) => {
      const nowMs = Date.now();
      const cooldown =
        runtimeConfig.cooldownByAlertType[alertType] || runtimeConfig.fallbackCooldownMs;
      const lastSentAt = alertCooldownRef.current.get(eventKey) || 0;

      if (nowMs - lastSentAt < cooldown) {
        return;
      }

      alertCooldownRef.current.set(eventKey, nowMs);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        alertCooldownRef.current.delete(eventKey);
        return;
      }

      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          riderId,
          type:
            alertType === "ZONE_EXIT_UNAUTHORIZED" ||
            alertType === "ZONE_OVERSTAY" ||
            alertType === "ARRIVAL_CONFIRMED" ||
            alertType === "EARLY_ARRIVAL" ||
            alertType === "LATE_ARRIVAL"
              ? "geofence"
              : "route",
          alertType,
          severity,
          message,
          location,
          lat,
          lng,
          geofenceId,
          routeId,
          deliveryId,
          eventKey,
          createViolation: createViolation ?? true,
          violationType,
          metadata: {
            ...metadata,
            eventKey,
            routeId,
            deliveryId,
            trafficLevel: runtimeConfig.defaultTrafficLevel,
            driverName: riderName,
            messageDraft: buildDraftMessage(alertType, riderName, location),
            destinationAddress: location,
          },
        }),
      });

      if (!response.ok) {
        alertCooldownRef.current.delete(eventKey);
        return;
      }

      const result = (await response.json()) as {
        row?: SupabaseNotificationRow;
        violation?: SupabaseViolationRow;
      };

      if (result.row) {
        const normalized = toSupervisorNotification(result.row);
        if (normalized) {
          upsertAlert(normalized);
        }
      }

      if (result.violation) {
        setViolations((prev) => {
          const withoutCurrent = prev.filter((violation) => violation.id !== result.violation?.id);
          return sortByNewest([...withoutCurrent, result.violation as SupabaseViolationRow]);
        });
      }
    },
    [runtimeConfig, toSupervisorNotification, upsertAlert]
  );

  const processLocationInsert = useCallback(
    async (row: LocationLogInsert) => {
      const riderId = readString(row.rider_id);
      if (!riderId || !riderIdsRef.current.has(riderId)) return;

      const lat = readNumber(row.latitude);
      const lng = readNumber(row.longitude);

      if (lat == null || lng == null) return;

      const riderName = riderNameByIdRef.current.get(riderId) || "Unknown Driver";
      const eventTime = readString(row.timestamp) || new Date().toISOString();
      const eventMs = Number.isFinite(new Date(eventTime).getTime())
        ? new Date(eventTime).getTime()
        : Date.now();

      const riderZoneState = riderZoneStateRef.current[riderId] || {};
      const riderInsideSince = riderZoneInsideSinceRef.current[riderId] || {};

      for (const zone of zonesInternalRef.current) {
        const inside = isPointInPolygon([lng, lat], zone.polygonLngLat);
        const hasPreviousState = Object.prototype.hasOwnProperty.call(riderZoneState, zone.id);
        const wasInside = hasPreviousState ? riderZoneState[zone.id] : inside;

        if (!hasPreviousState) {
          riderZoneState[zone.id] = inside;
          if (inside) {
            riderInsideSince[zone.id] = eventTime;
          }
          continue;
        }

        if (inside && !wasInside) {
          riderInsideSince[zone.id] = eventTime;
        }

        if (!inside && wasInside) {
          delete riderInsideSince[zone.id];

          if (!zone.allowExit) {
            void emitAlert({
              riderId,
              riderName,
              alertType: "ZONE_EXIT_UNAUTHORIZED",
              severity: "critical",
              message: `${riderName} exited ${zone.name} without authorization.`,
              location: zone.name,
              lat,
              lng,
              geofenceId: zone.id,
              eventKey: `${riderId}:${zone.id}:exit`,
              metadata: {
                zoneName: zone.name,
              },
            });
          }
        }

        if (inside) {
          const sinceIso = riderInsideSince[zone.id] || eventTime;
          const sinceMs = Number.isFinite(new Date(sinceIso).getTime())
            ? new Date(sinceIso).getTime()
            : eventMs;
          const dwellMinutes = (eventMs - sinceMs) / (1000 * 60);

          if (dwellMinutes >= zone.maxDwellMinutes) {
            void emitAlert({
              riderId,
              riderName,
              alertType: "ZONE_OVERSTAY",
              severity: "warning",
              message: `${riderName} overstayed in ${zone.name} for ${Math.round(dwellMinutes)} minute(s).`,
              location: zone.name,
              lat,
              lng,
              geofenceId: zone.id,
              eventKey: `${riderId}:${zone.id}:overstay`,
              metadata: {
                zoneName: zone.name,
                dwellMinutes: Math.round(dwellMinutes),
              },
            });
          }
        }

        riderZoneState[zone.id] = inside;
      }

      riderZoneStateRef.current[riderId] = riderZoneState;
      riderZoneInsideSinceRef.current[riderId] = riderInsideSince;

      const activeZone = findContainingZone(lat, lng, zonesInternalRef.current);
      const activeZoneName = activeZone?.name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      const routeContext = routeContextByRiderRef.current.get(riderId);
      if (!routeContext) return;

      const parcelGeofences = routeContext.parcelGeofences;
      const parcelKeys = new Set(parcelGeofences.map((zone) => zone.id));

      Object.keys(parcelMonitorStateRef.current).forEach((key) => {
        if (key.startsWith(`${riderId}:`) && !parcelKeys.has(key)) {
          delete parcelMonitorStateRef.current[key];
        }
      });

      for (const parcelZone of parcelGeofences) {
        const state =
          parcelMonitorStateRef.current[parcelZone.id] ||
          {
            inside: false,
            insideSinceMs: null,
            arrivedAtMs: null,
            arrivalAlertType: null,
            overstayAlerted: false,
          };

        const distanceToParcelMeters = haversineMeters(
          lat,
          lng,
          parcelZone.center.lat,
          parcelZone.center.lng
        );

        const insideParcelZone = distanceToParcelMeters <= parcelZone.radiusMeters;

        if (insideParcelZone) {
          if (!state.inside) {
            state.insideSinceMs = eventMs;
          }

          const insideSeconds = state.insideSinceMs
            ? (eventMs - state.insideSinceMs) / 1000
            : 0;

          if (!state.arrivedAtMs && insideSeconds >= runtimeConfig.arrivalBufferSeconds) {
            state.arrivedAtMs = eventMs;

            const expectedArrivalMs = parcelZone.expectedArrivalMs;
            const arrivalDeltaMinutes =
              expectedArrivalMs != null
                ? (eventMs - expectedArrivalMs) / (1000 * 60)
                : null;

            let arrivalType: AlertKind = "ARRIVAL_CONFIRMED";
            let arrivalSeverity: Severity = "info";

            if (arrivalDeltaMinutes != null) {
              if (arrivalDeltaMinutes > runtimeConfig.arrivalLateGraceMinutes) {
                arrivalType = "LATE_ARRIVAL";
                arrivalSeverity = "warning";
              } else if (arrivalDeltaMinutes < -runtimeConfig.arrivalEarlyGraceMinutes) {
                arrivalType = "EARLY_ARRIVAL";
              }
            }

            state.arrivalAlertType = arrivalType;

            const arrivalLabel =
              arrivalType === "LATE_ARRIVAL"
                ? "late"
                : arrivalType === "EARLY_ARRIVAL"
                ? "early"
                : "on time";

            void emitAlert({
              riderId,
              riderName,
              alertType: arrivalType,
              severity: arrivalSeverity,
              message: `${riderName} arrived ${arrivalLabel} at ${parcelZone.address}.`,
              location: parcelZone.address,
              lat,
              lng,
              geofenceId: null,
              routeId: parcelZone.routeId,
              deliveryId: parcelZone.deliveryId,
              eventKey: `${parcelZone.id}:arrival`,
              createViolation: arrivalType === "LATE_ARRIVAL",
              violationType: arrivalType === "LATE_ARRIVAL" ? "PARCEL_DELAY_RISK" : null,
              metadata: {
                zoneType: "parcel_geofence",
                parcelId: parcelZone.parcelId,
                trackingCode: parcelZone.trackingCode,
                geofenceRadiusMeters: parcelZone.radiusMeters,
                expectedArrivalAt: parcelZone.expectedArrivalAt,
                actualArrivalAt: new Date(eventMs).toISOString(),
                arrivalDeltaMinutes:
                  arrivalDeltaMinutes != null ? Math.round(arrivalDeltaMinutes) : null,
                routeLabel: routeContext.routeLabel,
                sequence: parcelZone.sequence,
                confidence: "high",
              },
            });
          }

          if (state.arrivedAtMs != null) {
            const dwellMinutesSinceArrival = (eventMs - state.arrivedAtMs) / (1000 * 60);
            if (
              !state.overstayAlerted &&
              dwellMinutesSinceArrival >= parcelZone.maxDwellMinutes
            ) {
              state.overstayAlerted = true;

              const overstaySeverity: Severity =
                dwellMinutesSinceArrival >= parcelZone.maxDwellMinutes + 10
                  ? "critical"
                  : "warning";

              void emitAlert({
                riderId,
                riderName,
                alertType: "ZONE_OVERSTAY",
                severity: overstaySeverity,
                message: `${riderName} overstayed at ${parcelZone.address} for ${Math.round(
                  dwellMinutesSinceArrival
                )} minute(s).`,
                location: parcelZone.address,
                lat,
                lng,
                geofenceId: null,
                routeId: parcelZone.routeId,
                deliveryId: parcelZone.deliveryId,
                eventKey: `${parcelZone.id}:overstay`,
                createViolation: true,
                violationType: "ZONE_OVERSTAY",
                metadata: {
                  zoneType: "parcel_geofence",
                  parcelId: parcelZone.parcelId,
                  trackingCode: parcelZone.trackingCode,
                  geofenceRadiusMeters: parcelZone.radiusMeters,
                  dwellMinutes: Math.round(dwellMinutesSinceArrival),
                  routeLabel: routeContext.routeLabel,
                  sequence: parcelZone.sequence,
                  confidence: "high",
                },
              });
            }
          }
        } else {
          state.insideSinceMs = null;
        }

        state.inside = insideParcelZone;
        parcelMonitorStateRef.current[parcelZone.id] = state;
      }

      if (!routeContext.destination) return;

      const distanceKm = haversineKm(
        lat,
        lng,
        routeContext.destination.lat,
        routeContext.destination.lng
      );

      const routeDeviationKm = distanceToPolylineKm([lat, lng], routeContext.routePolyline);
      const farFromRoute =
        routeDeviationKm != null && routeDeviationKm >= runtimeConfig.routeDeviationMinKm;

      const previousDistance = riderDistanceRef.current[riderId];
      if (previousDistance) {
        const sampleGapMs = eventMs - previousDistance.atMs;
        const distanceIncreaseKm = distanceKm - previousDistance.distanceKm;
        const farFromDestination = distanceKm >= runtimeConfig.offRouteMinDistanceKm;
        const movingAway = distanceIncreaseKm >= runtimeConfig.offRouteMinIncreaseKm;

        if (
          sampleGapMs >= runtimeConfig.offRouteMinSampleGapMs &&
          farFromDestination &&
          (movingAway || farFromRoute)
        ) {
          const highConfidence = farFromRoute && farFromDestination && movingAway;
          const offRouteSeverity: Severity = highConfidence ? "critical" : "warning";

          void emitAlert({
            riderId,
            riderName,
            alertType: "OFF_ROUTE",
            severity: offRouteSeverity,
            message: `${riderName} appears off-route from the assigned destination.`,
            location: activeZoneName,
            lat,
            lng,
            geofenceId: activeZone?.id || null,
            routeId: routeContext.routeId,
            deliveryId: routeContext.deliveryId,
            eventKey: `${riderId}:${routeContext.deliveryId || routeContext.routeId}:off-route`,
            metadata: {
              distanceKm: Number(distanceKm.toFixed(2)),
              routeDeviationKm:
                routeDeviationKm != null ? Number(routeDeviationKm.toFixed(2)) : null,
              routeLabel: routeContext.routeLabel,
              zoneName: activeZone?.name || null,
              zoneId: activeZone?.id || null,
              currentLat: lat,
              currentLng: lng,
              destinationAddress: routeContext.destination.address,
              confidence: highConfidence ? "high" : "medium",
              conditions: {
                farFromRoute,
                farFromDestination,
                movingAway,
              },
            },
          });
        }
      }

      riderDistanceRef.current[riderId] = {
        distanceKm,
        atMs: eventMs,
      };

      const destinationState = parcelMonitorStateRef.current[routeContext.destination.id];
      if (destinationState?.arrivedAtMs) return;

      let delayMinutes: number | null = null;

      if (routeContext.destination.expectedArrivalMs != null) {
        delayMinutes = (eventMs - routeContext.destination.expectedArrivalMs) / (1000 * 60);
      } else {
        const delayReferenceIso = routeContext.deliveryCreatedAt || routeContext.routeCreatedAt;
        const referenceMs = new Date(delayReferenceIso || "").getTime();
        if (Number.isFinite(referenceMs)) {
          delayMinutes = (eventMs - referenceMs) / (1000 * 60);
        }
      }

      const delayWarningThreshold =
        routeContext.destination.expectedArrivalMs != null
          ? runtimeConfig.arrivalLateGraceMinutes
          : runtimeConfig.delayWarningMinutes;

      const delayCriticalThreshold =
        routeContext.destination.expectedArrivalMs != null
          ? Math.max(runtimeConfig.delayCriticalMinutes, runtimeConfig.arrivalLateGraceMinutes * 3)
          : runtimeConfig.delayCriticalMinutes;

      if (delayMinutes == null || delayMinutes < delayWarningThreshold) return;

      const delaySeverity: Severity =
        delayMinutes >= delayCriticalThreshold ? "critical" : "warning";

      void emitAlert({
        riderId,
        riderName,
        alertType: "DELIVERY_DELAY",
        severity: delaySeverity,
        message: `${riderName} has a delivery delay on ${routeContext.routeLabel}.`,
        location: activeZone?.name || routeContext.destination.address,
        lat,
        lng,
        geofenceId: activeZone?.id || null,
        routeId: routeContext.routeId,
        deliveryId: routeContext.deliveryId,
        eventKey: `${riderId}:${routeContext.deliveryId || routeContext.routeId}:delay`,
        metadata: {
          delayMinutes: Math.round(delayMinutes),
          routeLabel: routeContext.routeLabel,
          zoneName: activeZone?.name || null,
          zoneId: activeZone?.id || null,
          currentLat: lat,
          currentLng: lng,
          destinationAddress: routeContext.destination.address,
          expectedArrivalAt: routeContext.destination.expectedArrivalAt,
          confidence: farFromRoute ? "high" : "medium",
        },
      });
    },
    [emitAlert, runtimeConfig]
  );

  const hydrateData = useCallback(async () => {
    if (isHydratingRef.current) return;
    isHydratingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const [geofenceRowsRaw, riderRowsRaw, notificationRowsRaw, violationRowsRaw] = await Promise.all([
        getGeofences(undefined),
        getRiders(undefined),
        getNotifications(undefined),
        getViolations(undefined),
      ]);

      const geofenceRows = (Array.isArray(geofenceRowsRaw) ? geofenceRowsRaw : []) as SupabaseGeofenceRow[];
      const riderRows = (Array.isArray(riderRowsRaw) ? riderRowsRaw : []) as SupabaseRiderRow[];
      const notificationRows = (Array.isArray(notificationRowsRaw)
        ? notificationRowsRaw
        : []) as SupabaseNotificationRow[];
      const violationRows = (Array.isArray(violationRowsRaw)
        ? violationRowsRaw
        : []) as SupabaseViolationRow[];

      const organizationId =
        readString(riderRows[0]?.organization_id) ||
        readString(geofenceRows[0]?.organization_id) ||
        readString(notificationRows[0]?.organization_id) ||
        readString(violationRows[0]?.organization_id) ||
        null;

      organizationIdRef.current = organizationId;

      riderIdsRef.current = new Set(riderRows.map((rider) => rider.id));
      riderNameByIdRef.current = new Map(
        riderRows.map((rider) => [
          rider.id,
          firstProfileName(rider.profiles) || `Rider ${rider.id.slice(0, 6).toUpperCase()}`,
        ])
      );

      applyGeofenceRows(geofenceRows);

      const activeZones = zonesInternalRef.current;

      riderZoneStateRef.current = {};
      riderZoneInsideSinceRef.current = {};
      parcelMonitorStateRef.current = {};

      riderRows.forEach((rider) => {
        const riderId = rider.id;
        const lat = readNumber(rider.current_latitude);
        const lng = readNumber(rider.current_longitude);

        riderZoneStateRef.current[riderId] = {};
        riderZoneInsideSinceRef.current[riderId] = {};

        if (lat == null || lng == null) return;

        activeZones.forEach((zone) => {
          const inside = isPointInPolygon([lng, lat], zone.polygonLngLat);
          riderZoneStateRef.current[riderId][zone.id] = inside;
          if (inside) {
            riderZoneInsideSinceRef.current[riderId][zone.id] = new Date().toISOString();
          }
        });
      });

      setAlerts(
        sortByNewest(
          notificationRows
            .map((row) => toSupervisorNotification(row))
            .filter((row): row is SupervisorNotification => Boolean(row))
        )
      );

      setViolations(sortByNewest(violationRows));

      await refreshRouteContexts();
    } catch (loadError) {
      console.error("[Notifications] Failed to load realtime alerts:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Failed to load notifications.");
    } finally {
      isHydratingRef.current = false;
      setLoading(false);
    }
  }, [applyGeofenceRows, refreshRouteContexts, toSupervisorNotification]);

  useEffect(() => {
    if (hasHydratedRef.current) return;

    let cancelled = false;

    const runHydration = async () => {
      await hydrateData();
      if (cancelled) return;

      if (organizationIdRef.current) {
        hasHydratedRef.current = true;
        return;
      }

      hydrateAttemptsRef.current += 1;

      if (hydrateAttemptsRef.current >= 3) {
        hasHydratedRef.current = true;
        return;
      }

      hydrateRetryTimerRef.current = window.setTimeout(() => {
        void runHydration();
      }, 1200);
    };

    void runHydration();

    return () => {
      cancelled = true;

      if (hydrateRetryTimerRef.current != null) {
        window.clearTimeout(hydrateRetryTimerRef.current);
        hydrateRetryTimerRef.current = null;
      }
    };
  }, [hydrateData]);

  useEffect(() => {
    if (loading) return;

    const intervalId = window.setInterval(() => {
      void refreshRouteContexts();
    }, 120 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loading, refreshRouteContexts]);

  useEffect(() => {
    if (loading) return;

    const organizationId = organizationIdRef.current;
    if (!organizationId) return;

    const notificationsChannel = supabase
      .channel(`supervisor-notifications-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const eventType = payload.eventType;

          if (eventType === "DELETE") {
            const previous = payload.old as { id?: string; organization_id?: string | null };
            if (readString(previous.organization_id) !== organizationId) return;

            if (typeof previous.id === "string") {
              setAlerts((prev) => prev.filter((item) => item.id !== previous.id));
            }
            return;
          }

          const nextRow = payload.new as SupabaseNotificationRow;
          if (readString(nextRow.organization_id) !== organizationId) return;

          const normalized = toSupervisorNotification(nextRow);
          if (!normalized) return;

          upsertAlert(normalized);
        }
      )
      .subscribe();

    const violationsChannel = supabase
      .channel(`supervisor-violations-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "violations",
        },
        (payload) => {
          const eventType = payload.eventType;

          if (eventType === "DELETE") {
            const previous = payload.old as { id?: string; organization_id?: string | null };
            if (readString(previous.organization_id) !== organizationId) return;

            if (typeof previous.id === "string") {
              setViolations((prev) => prev.filter((item) => item.id !== previous.id));
            }
            return;
          }

          const nextRow = payload.new as SupabaseViolationRow;
          if (readString(nextRow.organization_id) !== organizationId) return;

          setViolations((prev) => {
            const withoutCurrent = prev.filter((item) => item.id !== nextRow.id);
            return sortByNewest([...withoutCurrent, nextRow]);
          });
        }
      )
      .subscribe();

    const locationChannel = supabase
      .channel(`supervisor-location-monitor-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "location_logs",
        },
        (payload) => {
          const nextRow = payload.new as LocationLogInsert;
          void processLocationInsert(nextRow);
        }
      )
      .subscribe();

    const geofencesChannel = supabase
      .channel(`supervisor-geofences-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "geofences",
        },
        (payload) => {
          const eventType = payload.eventType;
          if (eventType === "DELETE") {
            const previous = payload.old as { organization_id?: string | null };
            if (readString(previous.organization_id) !== organizationId) return;
          } else {
            const next = payload.new as { organization_id?: string | null };
            if (readString(next.organization_id) !== organizationId) return;
          }

          void (async () => {
            const geofenceRowsRaw = await getGeofences(undefined);
            const geofenceRows = (Array.isArray(geofenceRowsRaw)
              ? geofenceRowsRaw
              : []) as SupabaseGeofenceRow[];
            applyGeofenceRows(geofenceRows);
          })();
        }
      )
      .subscribe();

    const routeContextChannel = supabase
      .channel(`supervisor-route-context-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "routes",
        },
        (payload) => {
          const eventType = payload.eventType;

          if (eventType === "DELETE") {
            const previous = payload.old as { rider_id?: string | null };
            const riderId = readString(previous.rider_id);
            if (riderId && !riderIdsRef.current.has(riderId)) return;
          } else {
            const next = payload.new as { rider_id?: string | null };
            const riderId = readString(next.rider_id);
            if (riderId && !riderIdsRef.current.has(riderId)) return;
          }

          scheduleRouteContextRefresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deliveries",
        },
        (payload) => {
          const eventType = payload.eventType;

          if (eventType === "DELETE") {
            const previous = payload.old as { rider_id?: string | null };
            const riderId = readString(previous.rider_id);
            if (riderId && !riderIdsRef.current.has(riderId)) return;
          } else {
            const next = payload.new as { rider_id?: string | null };
            const riderId = readString(next.rider_id);
            if (riderId && !riderIdsRef.current.has(riderId)) return;
          }

          scheduleRouteContextRefresh();
        }
      )
      .subscribe();

    return () => {
      if (routeRefreshTimerRef.current != null) {
        window.clearTimeout(routeRefreshTimerRef.current);
        routeRefreshTimerRef.current = null;
      }

      void supabase.removeChannel(notificationsChannel);
      void supabase.removeChannel(violationsChannel);
      void supabase.removeChannel(locationChannel);
      void supabase.removeChannel(geofencesChannel);
      void supabase.removeChannel(routeContextChannel);
    };
  }, [
    applyGeofenceRows,
    loading,
    processLocationInsert,
    scheduleRouteContextRefresh,
    toSupervisorNotification,
    upsertAlert,
  ]);

  const zoneWarningById = useMemo(() => {
    const scoreByZoneId: Record<string, number> = {};
    const zoneIdByName = new Map<string, string>();

    zones.forEach((zone) => {
      zoneIdByName.set(zone.name.toLowerCase(), zone.id);
    });

    const cutoff = Date.now() - runtimeConfig.summaryWindowMs;

    alerts.forEach((alert) => {
      const timestampMs = new Date(alert.timestamp).getTime();
      if (!Number.isFinite(timestampMs) || timestampMs < cutoff) return;

      let zoneId =
        readString(alert.geofenceId) || zoneIdByName.get(alert.location.toLowerCase()) || null;

      if (!zoneId && typeof alert.lat === "number" && typeof alert.lng === "number") {
        zoneId = findContainingZone(alert.lat, alert.lng, zonesInternalRef.current)?.id || null;
      }

      if (!zoneId) return;

      const weight = runtimeConfig.warningWeightBySeverity[alert.severity] || 1;
      scoreByZoneId[zoneId] = (scoreByZoneId[zoneId] || 0) + weight;
    });

    violations.forEach((violation) => {
      const timestampMs = new Date(violation.created_at || "").getTime();
      if (!Number.isFinite(timestampMs) || timestampMs < cutoff) return;

      let zoneId =
        readString(violation.geofence_id) ||
        zoneIdByName.get((readString(violation.zone_name) || "").toLowerCase()) ||
        null;

      const violationLat = readNumber(violation.lat);
      const violationLng = readNumber(violation.lng);
      if (!zoneId && violationLat != null && violationLng != null) {
        zoneId = findContainingZone(violationLat, violationLng, zonesInternalRef.current)?.id || null;
      }

      if (!zoneId) return;

      const severity = normalizeSeverity(readString(violation.base_severity));
      const weight = runtimeConfig.warningWeightBySeverity[severity] || 1;
      scoreByZoneId[zoneId] = (scoreByZoneId[zoneId] || 0) + weight;
    });

    return scoreByZoneId;
  }, [alerts, runtimeConfig, violations, zones]);

  const summary = useMemo<GeofenceSummaryStats>(() => {
    const cutoff = Date.now() - runtimeConfig.summaryWindowMs;

    const recentAlerts = alerts.filter((alert) => {
      const timestampMs = new Date(alert.timestamp).getTime();
      return Number.isFinite(timestampMs) && timestampMs >= cutoff;
    });

    const exitCount = recentAlerts.filter((alert) => alert.alertType === "ZONE_EXIT_UNAUTHORIZED").length;
    const overstayCount = recentAlerts.filter((alert) => alert.alertType === "ZONE_OVERSTAY").length;
    const offRouteCount = recentAlerts.filter((alert) => alert.alertType === "OFF_ROUTE").length;
    const delayedCount = recentAlerts.filter((alert) => alert.alertType === "DELIVERY_DELAY").length;
    const arrivalCount = recentAlerts.filter((alert) => alert.alertType === "ARRIVAL_CONFIRMED").length;
    const earlyArrivalCount = recentAlerts.filter((alert) => alert.alertType === "EARLY_ARRIVAL").length;
    const lateArrivalCount = recentAlerts.filter((alert) => alert.alertType === "LATE_ARRIVAL").length;

    const warningZoneRows = zones
      .map((zone) => ({
        zoneId: zone.id,
        zoneName: zone.name,
        count: zoneWarningById[zone.id] || 0,
      }))
      .filter((zone) => zone.count > 0)
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);

    return {
      exitCount,
      overstayCount,
      offRouteCount,
      delayedCount,
      arrivalCount,
      earlyArrivalCount,
      lateArrivalCount,
      warningZoneRows,
    };
  }, [alerts, runtimeConfig, zoneWarningById, zones]);

  const parcelGeofences = useMemo<ParcelGeofenceOverlay[]>(() => {
    const deliverySeverity = new Map<string, Severity>();
    const severityRank: Record<Severity, number> = {
      info: 1,
      warning: 2,
      critical: 3,
    };

    alerts.forEach((alert) => {
      const metadata = asRecord(alert.metadata);
      const routeId = readString(metadata.routeId);
      const deliveryId = readString(metadata.deliveryId);
      if (!routeId || !deliveryId) return;

      const key = `${routeId}:${deliveryId}`;
      const existing = deliverySeverity.get(key);
      if (!existing || severityRank[alert.severity] > severityRank[existing]) {
        deliverySeverity.set(key, alert.severity);
      }
    });

    return routeContexts.flatMap((context) =>
      context.parcelGeofences.map((zone) => {
        const deliveryKey = zone.deliveryId ? `${zone.routeId}:${zone.deliveryId}` : null;
        const alertSeverity = deliveryKey ? deliverySeverity.get(deliveryKey) : undefined;

        let status: ParcelGeofenceOverlay["status"] = "normal";
        if (CLOSED_DELIVERY_STATUSES.has((zone.deliveryStatus || "").toLowerCase())) {
          status = "completed";
        } else if (alertSeverity === "critical") {
          status = "critical";
        } else if (alertSeverity === "warning") {
          status = "warning";
        }

        return {
          id: zone.id,
          name: zone.trackingCode || zone.address,
          center: zone.center,
          radiusMeters: zone.radiusMeters,
          riderId: zone.riderId,
          riderName: zone.riderName,
          routeId: zone.routeId,
          deliveryId: zone.deliveryId,
          parcelId: zone.parcelId,
          trackingCode: zone.trackingCode,
          address: zone.address,
          expectedArrivalAt: zone.expectedArrivalAt,
          status,
        };
      })
    );
  }, [alerts, routeContexts]);

  const routePolylines = useMemo<RoutePolylineOverlay[]>(() => {
    const severityRank: Record<Severity, number> = {
      info: 1,
      warning: 2,
      critical: 3,
    };

    const severityByRoute = new Map<string, Severity>();
    alerts.forEach((alert) => {
      const metadata = asRecord(alert.metadata);
      const routeId = readString(metadata.routeId);
      if (!routeId) return;

      const existing = severityByRoute.get(routeId);
      if (!existing || severityRank[alert.severity] > severityRank[existing]) {
        severityByRoute.set(routeId, alert.severity);
      }
    });

    return routeContexts
      .filter((context) => context.routePolyline.length >= 2)
      .map((context) => ({
        id: `${context.routeId}:${context.riderId}`,
        riderId: context.riderId,
        riderName:
          riderNameByIdRef.current.get(context.riderId) ||
          `Rider ${context.riderId.slice(0, 6).toUpperCase()}`,
        routeId: context.routeId,
        points: context.routePolyline,
        severity: severityByRoute.get(context.routeId) || "info",
      }));
  }, [alerts, routeContexts]);

  return {
    alerts,
    zones,
    parcelGeofences,
    routePolylines,
    zoneWarningById,
    summary,
    loading,
    error,
  };
}
