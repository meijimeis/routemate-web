"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bike,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  ExternalLink,
  MapPin,
  Navigation,
  UserRound,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import DashboardLayout from "@/components/layout/DashboardLayout";
import MapboxMap, {
  type Parcel as MapParcel,
  type Rider as MapRider,
  type Route as MapRoute,
} from "@/components/MapboxMap";
import { fetchDirections, type LngLat } from "@/lib/openRouteService";
import {
  findDeliveryByShipmentOrTrackingId,
  getAnalytics,
  getDeliveriesByRoute,
  getLatestRiderLocation,
  getNotifications,
  getParcels,
  getRiderLocationHistory,
  getRiders,
  getRoutes,
  getViolations,
} from "@/lib/api";
import { getUserOrganization } from "@/lib/organizationService";

type RouteRecord = {
  id: string;
  rider_id: string | null;
  cluster_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  riders?:
    | {
        id?: string;
        profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }>;
      }
    | Array<{
        id?: string;
        profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }>;
      }>
    | null;
};

type RiderRecord = {
  id: string;
  vehicle_type?: "motorcycle" | null;
  capacity?: number | null;
  status?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  current_location_at?: string | null;
  updated_at?: string | null;
  profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
};

type AnalyticsRecord = {
  rider_id: string;
  today_earnings?: number | null;
  today_deliveries_completed?: number | null;
  today_deliveries_total?: number | null;
  on_time_percentage?: number | null;
};

type ViolationRecord = {
  id: string;
  rider_name?: string | null;
  zone_name?: string | null;
  base_severity?: string | null;
  created_at?: string | null;
};

type NotificationRecord = {
  id: string;
  rider_id?: string | null;
  type?: string | null;
  severity?: string | null;
  created_at?: string | null;
};

type ParcelListRecord = {
  id: string;
  tracking_code?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  weight_kg?: number | null;
  status?: string | null;
};

type OrganizationRecord = {
  id: string;
  name: string;
  code?: string | null;
};

type DeliveryRecord = {
  id: string;
  route_id: string;
  parcel_id?: string | null;
  parcel_cluster_id?: string | null;
  parcel_list_id?: string | null;
  shipment_tracking_id?: string | null;
  delivery_type?: "parcel" | "cluster" | null;
  delivery_stops_total?: number | null;
  delivery_stops_completed?: number | null;
  completed_at?: string | null;
  rider_id?: string | null;
  sequence?: number | null;
  status?: string | null;
  parcel_lists?: ParcelListRecord | ParcelListRecord[] | null;
  parcel_clusters?: ParcelListRecord | ParcelListRecord[] | null;
  delivery_stops?: DeliveryStopRecord[] | DeliveryStopRecord | null;
  routes?: RouteRecord | RouteRecord[] | null;
  riders?: RiderRecord | RiderRecord[] | null;
};

type DeliveryStopRecord = {
  id: string;
  delivery_id: string;
  stop_sequence?: number | null;
  parcel_id?: string | null;
  parcel_list_id?: string | null;
  shipment_tracking_id?: string | null;
  destination_address?: string | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  weight_kg?: number | null;
  status?: string | null;
  delivered_at?: string | null;
};

type LocationLog = {
  latitude?: number | null;
  longitude?: number | null;
  timestamp?: string | null;
};

type Severity = "critical" | "warning" | "info" | "none";

type PersistedTracking = {
  deliveryId: string | null;
  routeId: string | null;
  query: string;
};

const DEFAULT_CENTER: [number, number] = [121.01, 14.61];
const LIVE_TRACKING_STORAGE_KEY = "dashboard.liveTracking.v1";
const ROUTE_SEGMENT_COLORS = [
  "#1D4ED8",
  "#0F766E",
  "#C2410C",
  "#BE123C",
  "#7C3AED",
  "#166534",
  "#B45309",
  "#334155",
];

const getRouteSegmentColor = (index: number): string =>
  ROUTE_SEGMENT_COLORS[index % ROUTE_SEGMENT_COLORS.length];

const toArray = <T,>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const getProfileName = (
  profiles: { full_name?: string | null } | Array<{ full_name?: string | null }> | null | undefined
): string => {
  const first = toArray(profiles)[0];
  return first?.full_name?.trim() || "Unknown";
};

const getRouteRiderName = (route: RouteRecord, ridersById: Map<string, RiderRecord>): string => {
  const joinedRider = toArray(route.riders)[0];
  const joinedName = getProfileName(joinedRider?.profiles);
  if (joinedName !== "Unknown") return joinedName;

  if (route.rider_id) {
    const rider = ridersById.get(route.rider_id);
    if (rider) return getProfileName(rider.profiles);
  }

  return "Unknown";
};

const getRouteLabel = (route: RouteRecord): string => {
  if (route.cluster_name && route.cluster_name.trim().length > 0) return route.cluster_name;
  return `Route ${route.id.slice(0, 6).toUpperCase()}`;
};

const getDeliveryParcel = (delivery?: DeliveryRecord | null): ParcelListRecord | null => {
  if (!delivery) return null;
  const parcel = toArray(delivery.parcel_lists)[0] || toArray(delivery.parcel_clusters)[0];
  return parcel || null;
};

const isClusterDelivery = (delivery?: DeliveryRecord | null): boolean => {
  if (!delivery) return false;

  const deliveryType = String(delivery.delivery_type || "").trim().toLowerCase();
  if (deliveryType === "cluster") return true;

  const explicitClusterId = String(delivery.parcel_cluster_id || "").trim();
  if (explicitClusterId.length > 0) return true;

  const clusterRow = toArray(delivery.parcel_clusters)[0];
  return Boolean(clusterRow);
};

const getClusterTrackingId = (delivery?: DeliveryRecord | null): string => {
  if (!delivery || !isClusterDelivery(delivery)) return "";

  const clusterRow = toArray(delivery.parcel_clusters)[0] as
    | { tracking_code?: string | null; cluster_name?: string | null; id?: string | null }
    | undefined;

  const clusterTrackingCode = String(clusterRow?.tracking_code || "").trim();
  if (clusterTrackingCode.length > 0) return clusterTrackingCode;

  const clusterName = String(clusterRow?.cluster_name || "").trim();
  if (clusterName.length > 0) return clusterName;

  const clusterId = String(
    delivery.parcel_cluster_id || delivery.parcel_list_id || clusterRow?.id || ""
  ).trim();

  if (clusterId.length > 0) {
    return `CLUSTER-${clusterId.slice(0, 8).toUpperCase()}`;
  }

  return "";
};

const getDeliveryShipmentId = (delivery?: DeliveryRecord | null): string => {
  if (!delivery) return "--";

  const clusterTrackingId = getClusterTrackingId(delivery);
  if (clusterTrackingId) return clusterTrackingId;

  const trackingCode = getDeliveryParcel(delivery)?.tracking_code?.trim();
  if (trackingCode) return trackingCode;

  const shipmentTrackingId = (delivery.shipment_tracking_id || '').trim();
  if (shipmentTrackingId) return shipmentTrackingId;

  if (delivery.parcel_list_id) return delivery.parcel_list_id;
  if (delivery.parcel_id) return delivery.parcel_id;

  return delivery.id;
};

const getDeliveryWeight = (delivery?: DeliveryRecord | null): number => {
  const parcel = getDeliveryParcel(delivery);
  const raw = Number(parcel?.weight_kg ?? 0);
  return Number.isFinite(raw) ? raw : 0;
};

const getDeliveryClusterId = (delivery?: DeliveryRecord | null): string | null => {
  if (!delivery) return null;

  const explicitClusterId = (delivery.parcel_cluster_id || "").trim();
  if (explicitClusterId) return explicitClusterId;

  const parcelListId = (delivery.parcel_list_id || "").trim();

  if (isClusterDelivery(delivery) && parcelListId) {
    return parcelListId;
  }

  return null;
};

const DELIVERY_STOP_TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed"]);

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const HISTORY_COORD_EPSILON = 0.000001;
const HISTORY_SHORT_GAP_MS = 5 * 60 * 1000;
const HISTORY_MAX_SHORT_GAP_METERS = 3200;
const HISTORY_MAX_LONG_GAP_METERS = 25000;
const HISTORY_MAX_SPEED_MPS = 60;

const toTimestampMs = (value?: string | null): number | null => {
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidLatLngPair = (lat: unknown, lng: unknown): lat is number => {
  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

const toMetersBetween = (
  leftLat: number,
  leftLng: number,
  rightLat: number,
  rightLng: number
): number => {
  const earthRadius = 6371000;
  const dLat = ((rightLat - leftLat) * Math.PI) / 180;
  const dLng = ((rightLng - leftLng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((leftLat * Math.PI) / 180) *
      Math.cos((rightLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const sanitizeLocationHistory = (history: LocationLog[]) => {
  const normalized = (Array.isArray(history) ? history : [])
    .map((point) => ({
      lat: Number(point.latitude),
      lng: Number(point.longitude),
      timestampMs: toTimestampMs(point.timestamp),
    }))
    .filter((point) => isValidLatLngPair(point.lat, point.lng))
    .sort((left, right) => {
      if (left.timestampMs == null && right.timestampMs == null) return 0;
      if (left.timestampMs == null) return 1;
      if (right.timestampMs == null) return -1;
      return left.timestampMs - right.timestampMs;
    });

  if (normalized.length <= 1) return normalized;

  const sanitized = [normalized[0]];

  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    const previous = sanitized[sanitized.length - 1];

    const samePoint =
      Math.abs(current.lat - previous.lat) < HISTORY_COORD_EPSILON &&
      Math.abs(current.lng - previous.lng) < HISTORY_COORD_EPSILON;

    if (samePoint) {
      if (previous.timestampMs == null && current.timestampMs != null) {
        previous.timestampMs = current.timestampMs;
      }
      continue;
    }

    const distanceMeters = toMetersBetween(
      previous.lat,
      previous.lng,
      current.lat,
      current.lng
    );

    const deltaMs =
      previous.timestampMs != null && current.timestampMs != null
        ? Math.max(0, current.timestampMs - previous.timestampMs)
        : null;

    const maxAllowedDistance =
      deltaMs != null && deltaMs <= HISTORY_SHORT_GAP_MS
        ? HISTORY_MAX_SHORT_GAP_METERS
        : HISTORY_MAX_LONG_GAP_METERS;

    if (distanceMeters > maxAllowedDistance) {
      continue;
    }

    if (deltaMs != null && deltaMs > 0) {
      const speedMps = distanceMeters / (deltaMs / 1000);
      if (speedMps > HISTORY_MAX_SPEED_MPS) {
        continue;
      }
    }

    sanitized.push(current);
  }

  return sanitized;
};

const getDeliveryStopsForTracking = (
  delivery?: DeliveryRecord | null,
  includeTerminalStops = false
): Array<{
  stopId: string;
  deliveryId: string;
  shipmentTrackingId: string;
  sequence: number;
  lat: number;
  lng: number;
  address: string | null;
}> => {
  if (!delivery) return [];

  const sourceStops = toArray(delivery.delivery_stops)
    .filter((stop): stop is DeliveryStopRecord => Boolean(stop?.id))
    .sort((left, right) => Number(left.stop_sequence || 0) - Number(right.stop_sequence || 0));

  const filteredStops = sourceStops.filter((stop) => {
    if (includeTerminalStops) return true;
    const normalizedStatus = String(stop.status || "").toLowerCase();
    return !DELIVERY_STOP_TERMINAL_STATUSES.has(normalizedStatus);
  });

  const deliveryParcel = getDeliveryParcel(delivery);
  const fallbackLatitude = isFiniteCoordinate(deliveryParcel?.latitude) ? deliveryParcel.latitude : null;
  const fallbackLongitude = isFiniteCoordinate(deliveryParcel?.longitude) ? deliveryParcel.longitude : null;

  const mappedStops = filteredStops
    .map((stop, index) => {
      const latitude = isFiniteCoordinate(stop.destination_latitude)
        ? stop.destination_latitude
        : fallbackLatitude;
      const longitude = isFiniteCoordinate(stop.destination_longitude)
        ? stop.destination_longitude
        : fallbackLongitude;

      if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) {
        return null;
      }

      return {
        stopId: stop.id,
        deliveryId: delivery.id,
        shipmentTrackingId: (stop.shipment_tracking_id || "").trim() || stop.id,
        sequence:
          typeof stop.stop_sequence === "number" && Number.isFinite(stop.stop_sequence)
            ? stop.stop_sequence
            : index + 1,
        lat: latitude,
        lng: longitude,
        address: typeof stop.destination_address === "string" ? stop.destination_address : null,
      };
    })
    .filter((stop): stop is {
      stopId: string;
      deliveryId: string;
      shipmentTrackingId: string;
      sequence: number;
      lat: number;
      lng: number;
      address: string | null;
    } => stop != null);

  if (mappedStops.length > 0) {
    return mappedStops;
  }

  const parcel = getDeliveryParcel(delivery);
  if (!parcel) return [];

  if (!isFiniteCoordinate(parcel.latitude) || !isFiniteCoordinate(parcel.longitude)) {
    return [];
  }

  const normalizedStatus = String(delivery.status || parcel.status || "").toLowerCase();
  if (!includeTerminalStops && DELIVERY_STOP_TERMINAL_STATUSES.has(normalizedStatus)) {
    return [];
  }

  return [
    {
      stopId: delivery.id,
      deliveryId: delivery.id,
      shipmentTrackingId: getDeliveryShipmentId(delivery),
      sequence:
        typeof delivery.sequence === "number" && Number.isFinite(delivery.sequence)
          ? delivery.sequence
          : 1,
      lat: parcel.latitude,
      lng: parcel.longitude,
      address: parcel.address || null,
    },
  ];
};

const getExpandedDeliveryStopsForTracking = (
  delivery?: DeliveryRecord | null,
  includeTerminalStops = false
): Array<{
  stopId: string;
  deliveryId: string;
  shipmentTrackingId: string;
  sequence: number;
  lat: number;
  lng: number;
  address: string | null;
}> => {
  if (!delivery) return [];

  const mappedStops = getDeliveryStopsForTracking(delivery, includeTerminalStops);
  const mappedStopIds = new Set(
    mappedStops
      .map((stop) => stop.stopId)
      .filter((stopId) => typeof stopId === "string" && stopId.length > 0)
  );

  const parcel = getDeliveryParcel(delivery);
  const fallbackLat = isFiniteCoordinate(parcel?.latitude) ? parcel.latitude : null;
  const fallbackLng = isFiniteCoordinate(parcel?.longitude) ? parcel.longitude : null;
  const fallbackAddress = parcel?.address || null;

  const persistedStops = toArray(delivery.delivery_stops)
    .filter((stop): stop is DeliveryStopRecord => Boolean(stop?.id))
    .filter((stop) => {
      if (includeTerminalStops) return true;
      const normalizedStatus = String(stop.status || "").toLowerCase();
      return !DELIVERY_STOP_TERMINAL_STATUSES.has(normalizedStatus);
    })
    .sort((left, right) => Number(left.stop_sequence || 0) - Number(right.stop_sequence || 0));

  const expandedStops = [...mappedStops];

  if (isFiniteCoordinate(fallbackLat) && isFiniteCoordinate(fallbackLng)) {
    persistedStops.forEach((stop, index) => {
      if (mappedStopIds.has(stop.id)) return;

      const sequenceRaw = Number(stop.stop_sequence);
      const sequence =
        Number.isFinite(sequenceRaw) && sequenceRaw > 0
          ? Math.floor(sequenceRaw)
          : index + 1;

      expandedStops.push({
        stopId: stop.id,
        deliveryId: delivery.id,
        shipmentTrackingId: (stop.shipment_tracking_id || "").trim() || stop.id,
        sequence,
        lat: fallbackLat,
        lng: fallbackLng,
        address:
          typeof stop.destination_address === "string" && stop.destination_address.trim().length > 0
            ? stop.destination_address
            : fallbackAddress,
      });
    });
  }

  expandedStops.sort((left, right) => left.sequence - right.sequence);

  const declaredStopCountRaw = Number(delivery.delivery_stops_total);
  const declaredStopCount =
    Number.isFinite(declaredStopCountRaw) && declaredStopCountRaw > 0
      ? Math.floor(declaredStopCountRaw)
      : 0;

  if (
    declaredStopCount > expandedStops.length &&
    isFiniteCoordinate(fallbackLat) &&
    isFiniteCoordinate(fallbackLng)
  ) {
    const shipmentSeed = getDeliveryShipmentId(delivery);

    for (let index = expandedStops.length; index < declaredStopCount; index += 1) {
      expandedStops.push({
        stopId: `${delivery.id}-synthetic-${index + 1}`,
        deliveryId: delivery.id,
        shipmentTrackingId: `${shipmentSeed}-${index + 1}`,
        sequence: index + 1,
        lat: fallbackLat,
        lng: fallbackLng,
        address: fallbackAddress,
      });
    }
  }

  return expandedStops.sort((left, right) => left.sequence - right.sequence);
};

const formatCompactCurrency = (amount: number): string => {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safe);
};

const formatDate = (value?: string | null): string => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateUpper = (value?: string | null): string => {
  if (!value) return "NO DATE";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "NO DATE";
  return date
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
};

const toStopLabel = (index: number): string => {
  let n = index;
  let label = "";

  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return label;
};

const getDeliveryStopLabel = (delivery?: DeliveryRecord | null): string => {
  const sequence = Number(delivery?.sequence);
  if (!Number.isFinite(sequence) || sequence < 1) return "-";
  return toStopLabel(sequence - 1);
};

const getSeverityRank = (value?: string | null): number => {
  const severity = (value || "").toLowerCase();
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  if (severity === "info") return 1;
  return 0;
};



const getStatusBadgeClass = (status?: string | null): string => {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("completed") || normalized.includes("done")) {
    return "bg-[#C5F5E5] text-[#1D9F77]";
  }
  if (normalized.includes("draft")) {
    return "bg-[#FCE1E5] text-[#CE5870]";
  }
  if (normalized.includes("pending")) {
    return "bg-[#FCEAB8] text-[#A87802]";
  }
  if (normalized.includes("active")) {
    return "bg-[#DCE9FF] text-[#3A66D6]";
  }
  return "bg-[#ECEEF5] text-[#606680]";
};

const getAlertBadgeClass = (severity: Severity): string => {
  if (severity === "critical") return "bg-[#F9656D] text-white";
  if (severity === "warning") return "bg-[#F6B800] text-white";
  if (severity === "info") return "bg-[#4B76F3] text-white";
  return "bg-[#64D9AF] text-white";
};

const isActiveRiderStatus = (status?: string | null): boolean => {
  const normalized = (status || "").toLowerCase();
  return normalized === "active" || normalized === "available" || normalized === "on_delivery";
};

const getRiderStatusBadgeClass = (status?: string | null): string => {
  const normalized = (status || "").toLowerCase();
  if (normalized === "active") return "bg-[#DCE9FF] text-[#3A66D6]";
  if (normalized === "available") return "bg-[#C5F5E5] text-[#1D9F77]";
  if (normalized === "on_delivery") return "bg-[#FCEAB8] text-[#A87802]";
  return "bg-[#ECEEF5] text-[#606680]";
};

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#4B4E63] text-sm">
          Loading dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appliedQueryTrackingRef = useRef(false);

  const trackedDeliveryFromQuery = (searchParams.get("trackDeliveryId") || "").trim();
  const trackedRouteFromQuery = (searchParams.get("trackRouteId") || "").trim();
  const trackedShipmentFromQuery = (searchParams.get("trackShipmentId") || "").trim();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [riders, setRiders] = useState<RiderRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [, setParcels] = useState<ParcelListRecord[]>([]);
  const [deliveriesByRoute, setDeliveriesByRoute] = useState<Record<string, DeliveryRecord[]>>({});
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
  const [orgCodeCopied, setOrgCodeCopied] = useState(false);
  const [activeRiderIndex, setActiveRiderIndex] = useState(0);

  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activeMapTab, setActiveMapTab] = useState<"status" | "location">("status");

  const [trackingQuery, setTrackingQuery] = useState("");
  const [trackingMessage, setTrackingMessage] = useState<string | null>(null);
  const [trackedDeliveryId, setTrackedDeliveryId] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [destinationRouteLoading, setDestinationRouteLoading] = useState(false);
  const [trackingMapResetKey, setTrackingMapResetKey] = useState(0);
  const [trackingRestorePending, setTrackingRestorePending] = useState<PersistedTracking | null>(null);
  const [trackingRestored, setTrackingRestored] = useState(false);

  const [liveRiders, setLiveRiders] = useState<MapRider[]>([]);
  const [liveHistoryRoutes, setLiveHistoryRoutes] = useState<MapRoute[]>([]);
  const [destinationRoutes, setDestinationRoutes] = useState<MapRoute[]>([]);
  const [routeRunHours, setRouteRunHours] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          if (mounted) router.replace("/login");
          return;
        }

        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", data.session.user.id);

        if (error || !profiles || profiles.length === 0) {
          if (mounted) router.replace("/onboarding/organization");
          return;
        }

        if (mounted) setCheckingAuth(false);
      } catch {
        if (mounted) router.replace("/login");
      }
    };

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;

    let cancelled = false;

    const loadDashboardData = async () => {
      setLoadingData(true);
      setDataError(null);

      try {
        const [
          organizationResult,
          routesRaw,
          ridersRaw,
          analyticsRaw,
          violationsRaw,
          notificationsRaw,
          parcelsRaw,
        ] = await Promise.all([
          getUserOrganization(),
          getRoutes(undefined),
          getRiders(undefined),
          getAnalytics(undefined),
          getViolations(undefined),
          getNotifications(undefined),
          getParcels(undefined),
        ]);

        if (cancelled) return;

        const routeList = (Array.isArray(routesRaw) ? routesRaw : []) as RouteRecord[];
        const riderList = (Array.isArray(ridersRaw) ? ridersRaw : []) as RiderRecord[];
        const analyticsList = (Array.isArray(analyticsRaw) ? analyticsRaw : []) as AnalyticsRecord[];
        const violationList = (Array.isArray(violationsRaw) ? violationsRaw : []) as ViolationRecord[];
        const notificationList = (Array.isArray(notificationsRaw) ? notificationsRaw : []) as NotificationRecord[];
        const parcelList = (Array.isArray(parcelsRaw) ? parcelsRaw : []) as ParcelListRecord[];

        if (organizationResult?.success && organizationResult.organization) {
          const org = organizationResult.organization as OrganizationRecord;
          setOrganization(org);
        } else {
          setOrganization(null);
        }

        setRoutes(routeList);
        setRiders(riderList);
        setAnalytics(analyticsList);
        setViolations(violationList);
        setNotifications(notificationList);
        setParcels(parcelList);

        const shownRouteIds = routeList.slice(0, 4).map((route) => route.id);
        const deliveryEntries = await Promise.all(
          shownRouteIds.map(async (routeId) => {
            const deliveriesRaw = await getDeliveriesByRoute(routeId);
            const deliveries = (Array.isArray(deliveriesRaw) ? deliveriesRaw : []) as DeliveryRecord[];
            return [routeId, deliveries] as const;
          })
        );

        if (cancelled) return;

        const nextDeliveriesByRoute: Record<string, DeliveryRecord[]> = {};
        deliveryEntries.forEach(([routeId, deliveries]) => {
          nextDeliveriesByRoute[routeId] = deliveries;
        });

        setDeliveriesByRoute(nextDeliveriesByRoute);

        setExpandedRouteId((prev) => {
          if (prev && shownRouteIds.includes(prev)) return prev;
          return shownRouteIds[1] || shownRouteIds[0] || null;
        });

        setSelectedRouteId((prev) => {
          if (prev && shownRouteIds.includes(prev)) return prev;
          return shownRouteIds[0] || null;
        });
      } catch (error) {
        console.error("[Dashboard] Failed to load data:", error);
        setDataError(error instanceof Error ? error.message : "Failed to load dashboard data.");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, [checkingAuth]);

  useEffect(() => {
    if (checkingAuth || trackingRestored) return;

    if (trackedDeliveryFromQuery || trackedShipmentFromQuery) {
      setTrackingRestored(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(LIVE_TRACKING_STORAGE_KEY);

      if (!raw) {
        setTrackingRestored(true);
        return;
      }

      const parsed = JSON.parse(raw) as PersistedTracking;
      if (!parsed || !parsed.deliveryId) {
        window.localStorage.removeItem(LIVE_TRACKING_STORAGE_KEY);
        setTrackingRestored(true);
        return;
      }

      setTrackingQuery(parsed.query || "");
      setTrackingRestorePending({
        deliveryId: parsed.deliveryId,
        routeId: parsed.routeId,
        query: parsed.query || "",
      });
    } catch (error) {
      console.error("[Dashboard] Failed to restore tracking session:", error);
      window.localStorage.removeItem(LIVE_TRACKING_STORAGE_KEY);
    } finally {
      setTrackingRestored(true);
    }
  }, [checkingAuth, trackedDeliveryFromQuery, trackedShipmentFromQuery, trackingRestored]);

  useEffect(() => {
    if (checkingAuth) return;
    if (appliedQueryTrackingRef.current) return;
    if (!trackedDeliveryFromQuery && !trackedShipmentFromQuery) return;

    const query = trackedShipmentFromQuery || trackedDeliveryFromQuery;

    setTrackingQuery(query);
    setTrackingMessage("Loading tracked assignment from Driver Pool...");
    setTrackingRestorePending({
      deliveryId: trackedDeliveryFromQuery || null,
      routeId: trackedRouteFromQuery || null,
      query,
    });

    appliedQueryTrackingRef.current = true;
  }, [
    checkingAuth,
    trackedDeliveryFromQuery,
    trackedRouteFromQuery,
    trackedShipmentFromQuery,
  ]);

  const shownRoutes = useMemo(() => {
    const baseRoutes = routes.slice(0, 4);

    if (!selectedRouteId) return baseRoutes;

    const selectedOutsideDefault = routes.find((route) => route.id === selectedRouteId);
    if (!selectedOutsideDefault) return baseRoutes;

    const isAlreadyIncluded = baseRoutes.some((route) => route.id === selectedOutsideDefault.id);
    if (isAlreadyIncluded) return baseRoutes;

    return [selectedOutsideDefault, ...baseRoutes.slice(0, 3)];
  }, [routes, selectedRouteId]);

  const ridersById = useMemo(() => {
    const map = new Map<string, RiderRecord>();
    riders.forEach((rider) => {
      map.set(rider.id, rider);
    });
    return map;
  }, [riders]);

  const analyticsByRider = useMemo(() => {
    const map = new Map<string, AnalyticsRecord>();
    analytics.forEach((entry) => {
      map.set(entry.rider_id, entry);
    });
    return map;
  }, [analytics]);

  const selectedRoute = useMemo(
    () => shownRoutes.find((route) => route.id === selectedRouteId) || shownRoutes[0] || null,
    [shownRoutes, selectedRouteId]
  );

  const allDeliveries = useMemo(
    () =>
      Object.values(deliveriesByRoute)
        .flat()
        .filter((delivery): delivery is DeliveryRecord => Boolean(delivery)),
    [deliveriesByRoute]
  );

  const trackedDelivery = useMemo(
    () => allDeliveries.find((delivery) => delivery.id === trackedDeliveryId) || null,
    [allDeliveries, trackedDeliveryId]
  );

  const ensureRouteDeliveriesLoaded = useCallback(
    async (routeId: string): Promise<DeliveryRecord[]> => {
      if (Object.prototype.hasOwnProperty.call(deliveriesByRoute, routeId)) {
        return deliveriesByRoute[routeId] || [];
      }

      const deliveriesRaw = await getDeliveriesByRoute(routeId);
      const deliveries = (Array.isArray(deliveriesRaw) ? deliveriesRaw : []) as DeliveryRecord[];

      setDeliveriesByRoute((prev) => ({
        ...prev,
        [routeId]: deliveries,
      }));

      return deliveries;
    },
    [deliveriesByRoute]
  );

  useEffect(() => {
    if (!trackingRestorePending) return;

    let cancelled = false;

    const restoreTrackingSession = async () => {
      const { deliveryId, routeId, query } = trackingRestorePending;

      try {
        if (routeId) {
          await ensureRouteDeliveriesLoaded(routeId);

          if (cancelled) return;

          setSelectedRouteId(routeId);
          setExpandedRouteId(routeId);
        }

        if (deliveryId) {
          setTrackedDeliveryId(deliveryId);
          setTrackingMessage(
            query && query.trim().length > 0
              ? `Tracking ${query.trim()} (restored)`
              : "Restored previous live tracking session."
          );
        }
      } catch (error) {
        console.error("[Dashboard] Failed to restore tracked delivery:", error);
      } finally {
        if (!cancelled) {
          setTrackingRestorePending(null);
        }
      }
    };

    void restoreTrackingSession();

    return () => {
      cancelled = true;
    };
  }, [ensureRouteDeliveriesLoaded, trackingRestorePending]);

  const liveTrackingRiderId = useMemo(() => {
    if (trackedDelivery?.rider_id) return trackedDelivery.rider_id;
    return null;
  }, [trackedDelivery?.rider_id]);

  const copyOrganizationCode = async () => {
    const code = organization?.code?.trim();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setOrgCodeCopied(true);
      window.setTimeout(() => {
        setOrgCodeCopied(false);
      }, 1800);
    } catch (error) {
      console.error("[Dashboard] Failed to copy organization code:", error);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadLiveTracking = async () => {
      if (!liveTrackingRiderId) {
        setLiveRiders([]);
        setLiveHistoryRoutes([]);
        setRouteRunHours(null);
        return;
      }

      try {
        const [latestRaw, historyRaw] = await Promise.all([
          getLatestRiderLocation(liveTrackingRiderId),
          getRiderLocationHistory(liveTrackingRiderId, 12),
        ]);

        if (cancelled) return;

        const latest = (latestRaw || null) as { latitude?: number; longitude?: number } | null;
        const history = (Array.isArray(historyRaw) ? historyRaw : []) as LocationLog[];
        const sanitizedHistory = sanitizeLocationHistory(history);

        const fallbackRider = ridersById.get(liveTrackingRiderId);
        const fallbackLatitude = fallbackRider?.current_latitude;
        const fallbackLongitude = fallbackRider?.current_longitude;

        const effectiveLatitude =
          typeof latest?.latitude === "number" && Number.isFinite(latest.latitude)
            ? latest.latitude
            : typeof fallbackLatitude === "number" && Number.isFinite(fallbackLatitude)
            ? fallbackLatitude
            : null;

        const effectiveLongitude =
          typeof latest?.longitude === "number" && Number.isFinite(latest.longitude)
            ? latest.longitude
            : typeof fallbackLongitude === "number" && Number.isFinite(fallbackLongitude)
            ? fallbackLongitude
            : null;

        const routeCoords: [number, number][] = sanitizedHistory.map((point) =>
          [point.lng, point.lat] as [number, number]
        );

        if (routeCoords.length > 1) {
          setLiveHistoryRoutes([
            {
              rider_id: liveTrackingRiderId,
              stops: routeCoords.map((_, index) => `point-${index}`),
              polylineCoords: routeCoords,
              color: "#64748B",
            },
          ]);
        } else {
          setLiveHistoryRoutes([]);
        }

        if (
          typeof effectiveLatitude === "number" &&
          Number.isFinite(effectiveLatitude) &&
          typeof effectiveLongitude === "number" &&
          Number.isFinite(effectiveLongitude)
        ) {
          setLiveRiders([
            {
              id: liveTrackingRiderId,
              lat: effectiveLatitude,
              lng: effectiveLongitude,
              name:
                getProfileName(ridersById.get(liveTrackingRiderId)?.profiles) ||
                (selectedRoute ? getRouteRiderName(selectedRoute, ridersById) : "Unknown"),
            },
          ]);
        } else {
          setLiveRiders([]);
        }

        if (sanitizedHistory.length >= 2) {
          const firstTime = sanitizedHistory[0].timestampMs ?? null;
          const lastTime = sanitizedHistory[sanitizedHistory.length - 1].timestampMs ?? null;

          if (firstTime !== null && lastTime !== null && Number.isFinite(firstTime) && Number.isFinite(lastTime) && lastTime >= firstTime) {
              setRouteRunHours((lastTime - firstTime) / (1000 * 60 * 60));
          } else {
              setRouteRunHours(null);
          }
        } else {
          setRouteRunHours(null);
        }
      } catch (error) {
        console.error("[Dashboard] Failed to load live tracking:", error);
        if (!cancelled) {
          setLiveRiders([]);
          setLiveHistoryRoutes([]);
          setRouteRunHours(null);
        }
      }
    };

    loadLiveTracking();

    return () => {
      cancelled = true;
    };
  }, [liveTrackingRiderId, ridersById, selectedRoute]);

  const activeOrganizationRiders = useMemo(
    () => riders.filter((rider) => isActiveRiderStatus(rider.status)),
    [riders]
  );

  const selectedRouteRiderIndex = useMemo(() => {
    if (!selectedRoute?.rider_id) return -1;
    return activeOrganizationRiders.findIndex((rider) => rider.id === selectedRoute.rider_id);
  }, [activeOrganizationRiders, selectedRoute?.rider_id]);

  useEffect(() => {
    if (selectedRouteRiderIndex < 0) return;
    setActiveRiderIndex((prev) => (prev === selectedRouteRiderIndex ? prev : selectedRouteRiderIndex));
  }, [selectedRouteRiderIndex]);

  const assignmentRider = useMemo(() => {
    if (activeOrganizationRiders.length > 0) {
      return activeOrganizationRiders[activeRiderIndex] || activeOrganizationRiders[0];
    }

    if (selectedRoute?.rider_id) {
      return ridersById.get(selectedRoute.rider_id) || null;
    }

    return null;
  }, [activeOrganizationRiders, activeRiderIndex, ridersById, selectedRoute?.rider_id]);

  const assignmentRoute = useMemo(() => {
    if (!assignmentRider) return selectedRoute;

    const riderRoutes = routes
      .filter((route) => route.rider_id === assignmentRider.id)
      .sort((left, right) => {
        const leftTs = new Date(left.created_at || "").getTime();
        const rightTs = new Date(right.created_at || "").getTime();
        return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0);
      });

    const activeRoute = riderRoutes.find((route) => (route.status || "").toLowerCase() === "active");
    return activeRoute || riderRoutes[0] || null;
  }, [assignmentRider, routes, selectedRoute]);

  useEffect(() => {
    if (!assignmentRoute?.id) return;
    if (Object.prototype.hasOwnProperty.call(deliveriesByRoute, assignmentRoute.id)) return;
    void ensureRouteDeliveriesLoaded(assignmentRoute.id);
  }, [assignmentRoute?.id, deliveriesByRoute, ensureRouteDeliveriesLoaded]);

  const assignmentRouteDeliveries = useMemo(() => {
    if (!assignmentRoute?.id) return [];

    return [...(deliveriesByRoute[assignmentRoute.id] || [])]
      .filter((delivery): delivery is DeliveryRecord => Boolean(delivery))
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  }, [assignmentRoute?.id, deliveriesByRoute]);

  const assignmentDeliveryCount = useMemo(() => assignmentRouteDeliveries.length, [assignmentRouteDeliveries]);

  const assignmentRiderAnalytics = useMemo(() => {
    if (!assignmentRider) return null;
    return analyticsByRider.get(assignmentRider.id) || null;
  }, [analyticsByRider, assignmentRider]);

  const assignmentRouteTotalWeight = useMemo(() => {
    return assignmentRouteDeliveries.reduce((sum, delivery) => sum + getDeliveryWeight(delivery), 0);
  }, [assignmentRouteDeliveries]);

  const assignmentDestination = useMemo(() => {
    const firstDeliveryWithAddress = assignmentRouteDeliveries.find(
      (delivery) => (getDeliveryParcel(delivery)?.address || "").trim().length > 0
    );
    const candidateDelivery = firstDeliveryWithAddress ?? assignmentRouteDeliveries[0] ?? null;
    const address = getDeliveryParcel(candidateDelivery)?.address?.trim();
    return address && address.length > 0 ? address : "--";
  }, [assignmentRouteDeliveries]);

  const assignmentRiderStars = useMemo(() => {
    const score = Number(assignmentRiderAnalytics?.on_time_percentage || 0);
    if (!Number.isFinite(score) || score <= 0) return "--";
    const filled = Math.max(1, Math.min(5, Math.round(score / 20)));
    return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
  }, [assignmentRiderAnalytics]);

  const assignmentRouteRunHours = useMemo(() => {
    if (!assignmentRider || liveTrackingRiderId !== assignmentRider.id) return null;
    return routeRunHours;
  }, [assignmentRider, liveTrackingRiderId, routeRunHours]);

  const syncDriverAssignmentRoute = useCallback(
    async (riderId: string) => {
      const riderRoutes = routes
        .filter((route) => route.rider_id === riderId)
        .sort((left, right) => {
          const leftTs = new Date(left.created_at || "").getTime();
          const rightTs = new Date(right.created_at || "").getTime();
          return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0);
        });

      const routeForRider =
        riderRoutes.find((route) => (route.status || "").toLowerCase() === "active") || riderRoutes[0];

      if (!routeForRider) return;

      setSelectedRouteId(routeForRider.id);
      setExpandedRouteId((prev) => (prev === routeForRider.id ? prev : routeForRider.id));
      await ensureRouteDeliveriesLoaded(routeForRider.id);
    },
    [ensureRouteDeliveriesLoaded, routes]
  );

  const goToPreviousDriver = useCallback(() => {
    if (activeOrganizationRiders.length === 0) return;

    const previousIndex =
      (activeRiderIndex - 1 + activeOrganizationRiders.length) % activeOrganizationRiders.length;

    setActiveRiderIndex(previousIndex);
    const previousRider = activeOrganizationRiders[previousIndex];
    if (previousRider) {
      void syncDriverAssignmentRoute(previousRider.id);
    }
  }, [activeOrganizationRiders, activeRiderIndex, syncDriverAssignmentRoute]);

  const goToNextDriver = useCallback(() => {
    if (activeOrganizationRiders.length === 0) return;

    const nextIndex = (activeRiderIndex + 1) % activeOrganizationRiders.length;
    setActiveRiderIndex(nextIndex);
    const nextRider = activeOrganizationRiders[nextIndex];
    if (nextRider) {
      void syncDriverAssignmentRoute(nextRider.id);
    }
  }, [activeOrganizationRiders, activeRiderIndex, syncDriverAssignmentRoute]);

  const dashboardMetrics = useMemo(() => {
    const totalRevenue = analytics.reduce((sum, row) => sum + Number(row.today_earnings || 0), 0);
    const totalOrders = analytics.reduce((sum, row) => sum + Number(row.today_deliveries_total || 0), 0);
    const geofenceAlerts =
      violations.length +
      notifications.filter((entry) => (entry.type || "").toLowerCase().includes("geofence")).length;

    const totalOnTime = analytics.reduce((sum, row) => sum + Number(row.on_time_percentage || 0), 0);
    const avgOnTime = analytics.length > 0 ? totalOnTime / analytics.length : 0;

    const activeRiders = riders.filter((rider) => isActiveRiderStatus(rider.status)).length;

    return {
      totalRevenue,
      totalOrders,
      geofenceAlerts,
      avgOnTime,
      activeRiders,
    };
  }, [analytics, notifications, riders, violations]);

  const geofenceRows = useMemo(() => {
    const topRoutes = shownRoutes.slice(0, 3);

    return topRoutes.map((route) => {
      const riderName = getRouteRiderName(route, ridersById);

      const routeNotifications = notifications.filter(
        (entry) =>
          entry.rider_id &&
          route.rider_id &&
          entry.rider_id === route.rider_id &&
          (entry.type || "").toLowerCase().includes("geofence")
      );

      const routeViolations = violations.filter((violation) => {
        const incomingName = (violation.rider_name || "").trim().toLowerCase();
        return incomingName.length > 0 && incomingName === riderName.trim().toLowerCase();
      });

      const total = routeNotifications.length + routeViolations.length;

      const maxSeverityRank = Math.max(
        ...[...routeNotifications, ...routeViolations].map((entry) => {
          const severity = "severity" in entry ? entry.severity : (entry as ViolationRecord).base_severity;
          return getSeverityRank(severity);
        }),
        0
      );

      const severity: Severity =
        maxSeverityRank === 3
          ? "critical"
          : maxSeverityRank === 2
          ? "warning"
          : maxSeverityRank === 1
          ? "info"
          : "none";

      return {
        routeId: route.id,
        routeLabel: getRouteLabel(route),
        total,
        severity,
      };
    });
  }, [notifications, ridersById, shownRoutes, violations]);

  const activeMapParcel = useMemo(() => {
    const activeDelivery = trackedDelivery || null;
    const activeStop = getDeliveryStopsForTracking(activeDelivery)[0] || null;

    if (activeStop) {
      return {
        id: activeStop.shipmentTrackingId,
        lat: activeStop.lat,
        lng: activeStop.lng,
        address: activeStop.address || undefined,
      } as MapParcel;
    }

    const parcel = activeDelivery ? getDeliveryParcel(activeDelivery) : null;

    if (
      !parcel ||
      typeof parcel.latitude !== "number" ||
      !Number.isFinite(parcel.latitude) ||
      typeof parcel.longitude !== "number" ||
      !Number.isFinite(parcel.longitude)
    ) {
      return null;
    }

    return {
      id: parcel.tracking_code || parcel.id,
      lat: parcel.latitude,
      lng: parcel.longitude,
      address: parcel.address || undefined,
    } as MapParcel;
  }, [trackedDelivery]);

  const activeMapParcels = useMemo(() => {
    if (!trackedDelivery) return [];

    const routeId = trackedDelivery.route_id;
    const routeDeliveries =
      routeId && Array.isArray(deliveriesByRoute[routeId]) ? deliveriesByRoute[routeId] : [];

    const sortedRouteDeliveries = [...routeDeliveries]
      .filter((delivery): delivery is DeliveryRecord => Boolean(delivery))
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));

    const trackedClusterId = getDeliveryClusterId(trackedDelivery) || "";
    const sourceDeliveries = trackedClusterId
      ? (() => {
          const clusterScoped = sortedRouteDeliveries.filter(
            (delivery) => (getDeliveryClusterId(delivery) || "") === trackedClusterId
          );
          return clusterScoped.length > 0 ? clusterScoped : [trackedDelivery];
        })()
      : (() => {
          if (sortedRouteDeliveries.length > 1) {
            const sameRiderRouteDeliveries = sortedRouteDeliveries.filter((delivery) => {
              if (!trackedDelivery.rider_id) return true;
              return delivery.rider_id === trackedDelivery.rider_id;
            });

            if (sameRiderRouteDeliveries.length > 1) {
              return sameRiderRouteDeliveries;
            }

            return sortedRouteDeliveries;
          }

          return [trackedDelivery];
        })();

    const sourceStops = sourceDeliveries
      .flatMap((delivery) => getExpandedDeliveryStopsForTracking(delivery, true))
      .sort((left, right) => left.sequence - right.sequence);

    const overlapCounts = new Map<string, number>();

    return sourceStops
      .map((stop, index) => {
        const stopLabel = toStopLabel(index);
        const stopPrefix = `Stop ${stopLabel}`;
        const coordinateKey = `${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}`;
        const overlapIndex = overlapCounts.get(coordinateKey) || 0;
        overlapCounts.set(coordinateKey, overlapIndex + 1);

        const angle = (overlapIndex % 8) * (Math.PI / 4);
        const ring = Math.floor(overlapIndex / 8) + 1;
        const offsetRadius = overlapIndex === 0 ? 0 : 0.00008 * ring;

        const adjustedLat = stop.lat + Math.sin(angle) * offsetRadius;
        const adjustedLng = stop.lng + Math.cos(angle) * offsetRadius;

        const shipmentId = stop.shipmentTrackingId;
        const baseAddress = stop.address?.trim();

        return {
          id: `${stopPrefix} ${shipmentId}`,
          lat: adjustedLat,
          lng: adjustedLng,
          address: baseAddress ? `${stopPrefix}: ${baseAddress}` : stopPrefix,
        } as MapParcel;
      })
      .filter((parcel): parcel is MapParcel => parcel != null);
  }, [deliveriesByRoute, trackedDelivery]);

  const trackedRouteDeliveries = useMemo(() => {
    if (!trackedDelivery) return [];

    const routeId = trackedDelivery.route_id;
    const routeDeliveries =
      routeId && Array.isArray(deliveriesByRoute[routeId]) ? deliveriesByRoute[routeId] : [];

    const sortedRouteDeliveries = [...routeDeliveries]
      .filter((delivery): delivery is DeliveryRecord => Boolean(delivery))
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));

    const trackedClusterId = getDeliveryClusterId(trackedDelivery) || "";
    if (trackedClusterId && sortedRouteDeliveries.length > 0) {
      const clusterScopedDeliveries = sortedRouteDeliveries.filter(
        (delivery) => (getDeliveryClusterId(delivery) || "") === trackedClusterId
      );

      if (clusterScopedDeliveries.length > 0) {
        return clusterScopedDeliveries;
      }
    }

    if (!trackedClusterId && sortedRouteDeliveries.length > 1) {
      const sameRiderRouteDeliveries = sortedRouteDeliveries.filter((delivery) => {
        if (!trackedDelivery.rider_id) return true;
        return delivery.rider_id === trackedDelivery.rider_id;
      });

      if (sameRiderRouteDeliveries.length > 1) {
        return sameRiderRouteDeliveries;
      }

      return sortedRouteDeliveries;
    }

    return [trackedDelivery];
  }, [deliveriesByRoute, trackedDelivery]);

  const trackedShipmentId = useMemo(() => getDeliveryShipmentId(trackedDelivery), [trackedDelivery]);

  const trackedDestination = useMemo(() => {
    const firstStopAddress = trackedRouteDeliveries
      .flatMap((delivery) => getExpandedDeliveryStopsForTracking(delivery, true))
      .sort((left, right) => left.sequence - right.sequence)[0]?.address;

    const address = (firstStopAddress || getDeliveryParcel(trackedDelivery)?.address || "").trim();
    return address && address.length > 0 ? address : "--";
  }, [trackedDelivery, trackedRouteDeliveries]);

  const trackedDeliveryStatus = useMemo(() => {
    const rawStatus =
      trackedDelivery?.status || getDeliveryParcel(trackedDelivery)?.status || selectedRoute?.status || null;

    if (!rawStatus) return "Unknown";
    return rawStatus.replaceAll("_", " ");
  }, [selectedRoute?.status, trackedDelivery]);

  const trackedRiderName = useMemo(() => {
    if (!trackedDelivery?.rider_id) return "--";

    const rider = ridersById.get(trackedDelivery.rider_id);
    if (rider) return getProfileName(rider.profiles);

    const joinedRider = toArray(trackedDelivery.riders)[0];
    return getProfileName(joinedRider?.profiles) || "--";
  }, [ridersById, trackedDelivery]);

  useEffect(() => {
    if (checkingAuth || !trackingRestored) return;

    try {
      if (!trackedDeliveryId) {
        window.localStorage.removeItem(LIVE_TRACKING_STORAGE_KEY);
        return;
      }

      const payload: PersistedTracking = {
        deliveryId: trackedDeliveryId,
        routeId: trackedDelivery?.route_id || selectedRouteId || null,
        query: trackingQuery.trim(),
      };

      window.localStorage.setItem(LIVE_TRACKING_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("[Dashboard] Failed to persist tracking session:", error);
    }
  }, [
    checkingAuth,
    trackedDelivery?.route_id,
    trackedDeliveryId,
    selectedRouteId,
    trackingQuery,
    trackingRestored,
  ]);

  const stopTracking = useCallback(() => {
    setTrackedDeliveryId(null);
    setTrackingMessage("Tracking stopped.");
    setTrackingQuery("");
    setTrackingLoading(false);
    setDestinationRouteLoading(false);
    setDestinationRoutes([]);
    setLiveRiders([]);
    setLiveHistoryRoutes([]);
    setRouteRunHours(null);
    setActiveMapTab("status");
    setTrackingMapResetKey((prev) => prev + 1);

    try {
      window.localStorage.removeItem(LIVE_TRACKING_STORAGE_KEY);
    } catch (error) {
      console.error("[Dashboard] Failed to clear tracking session:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const buildDestinationRoute = async () => {
      if (!trackedDelivery) {
        setDestinationRoutes([]);
        setDestinationRouteLoading(false);
        return;
      }

      setDestinationRouteLoading(true);

      try {
        const riderPoint = liveRiders[0] || null;
        const riderStartPoint = riderPoint ? ([riderPoint.lng, riderPoint.lat] as LngLat) : null;

        const routeStops = trackedRouteDeliveries
          .flatMap((delivery) => getExpandedDeliveryStopsForTracking(delivery, true))
          .sort((left, right) => left.sequence - right.sequence)
          .map((stop, index) => ({
            stopId: stop.stopId,
            deliveryId: stop.deliveryId,
            label: toStopLabel(index),
            point: [stop.lng, stop.lat] as LngLat,
          }));

        if (routeStops.length === 0) {
          setDestinationRoutes([]);
          return;
        }

        const remainingStops = routeStops;

        if (remainingStops.length === 0) {
          setDestinationRoutes([]);
          return;
        }

        const routingWaypoints: Array<{ point: LngLat; stopRef: string }> = [];

        if (riderStartPoint) {
          routingWaypoints.push({
            point: riderStartPoint,
            stopRef: "rider-current",
          });
        }

        remainingStops.forEach((stop) => {
          routingWaypoints.push({
            point: stop.point,
            stopRef: `stop-${stop.label}`,
          });
        });

        if (routingWaypoints.length < 2) {
          setDestinationRoutes([]);
          return;
        }

        const legRoutes: MapRoute[] = [];

        for (let index = 0; index < routingWaypoints.length - 1; index += 1) {
          const fromPoint = routingWaypoints[index].point;
          const toPoint = routingWaypoints[index + 1].point;

          const isSamePoint =
            Math.abs(fromPoint[0] - toPoint[0]) < 0.000001 &&
            Math.abs(fromPoint[1] - toPoint[1]) < 0.000001;

          if (isSamePoint) {
            continue;
          }

          const fromStopLabel = routingWaypoints[index].stopRef;
          const toStopLabel = routingWaypoints[index + 1].stopRef;
          const segmentColor = getRouteSegmentColor(index);

          try {
            const directions = await fetchDirections([fromPoint, toPoint], {
              profile: "motorcycle",
            });

            if (cancelled) return;

            const hasRoadGeometry =
              Array.isArray(directions?.geometry) && directions.geometry.length > 1;
            const shouldUseStraightFallback = directions?.error?.code === "UNROUTABLE_WAYPOINT";

            if (!hasRoadGeometry && !shouldUseStraightFallback) {
              continue;
            }

            const geometry = hasRoadGeometry
              ? (directions?.geometry as [number, number][])
              : [fromPoint, toPoint];

            legRoutes.push({
              rider_id: trackedDelivery.rider_id || riderPoint?.id || "tracked-route",
              stops: [fromStopLabel, toStopLabel],
              polylineCoords: geometry,
              color: segmentColor,
            });
          } catch (error) {
            console.error("[Dashboard] Failed to build snapped leg route:", error);

            if (cancelled) return;
          }
        }

        if (cancelled) return;
        setDestinationRoutes(legRoutes);
      } finally {
        if (!cancelled) {
          setDestinationRouteLoading(false);
        }
      }
    };

    buildDestinationRoute();

    return () => {
      cancelled = true;
    };
  }, [liveRiders, trackedDelivery, trackedRouteDeliveries]);

  const statusMapRoutes = useMemo(() => {
    if (!trackedDelivery) return liveHistoryRoutes;
    if (destinationRoutes.length > 0) return destinationRoutes;
    if (destinationRouteLoading) return [];
    return liveHistoryRoutes;
  }, [destinationRouteLoading, destinationRoutes, liveHistoryRoutes, trackedDelivery]);

  const mapRoutesForTab = useMemo(() => {
    if (activeMapTab === "location") {
      if (liveHistoryRoutes.length > 0) return liveHistoryRoutes;
      return statusMapRoutes;
    }

    return statusMapRoutes;
  }, [activeMapTab, liveHistoryRoutes, statusMapRoutes]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (activeMapParcel) return [activeMapParcel.lng, activeMapParcel.lat];

    if (liveRiders.length > 0) {
      return [liveRiders[0].lng, liveRiders[0].lat];
    }

    if (
      statusMapRoutes.length > 0 &&
      statusMapRoutes[0].polylineCoords &&
      statusMapRoutes[0].polylineCoords.length > 0
    ) {
      return statusMapRoutes[0].polylineCoords[0];
    }

    return DEFAULT_CENTER;
  }, [activeMapParcel, liveRiders, statusMapRoutes]);

  const openDriverPanel = () => {
    const params = new URLSearchParams();

    const riderId = trackedDelivery?.rider_id || selectedRoute?.rider_id || null;
    if (riderId) params.set("riderId", riderId);
    if (trackedDelivery?.id) params.set("deliveryId", trackedDelivery.id);
    if (trackedDelivery?.route_id) params.set("routeId", trackedDelivery.route_id);

    const shipmentId = trackedDelivery ? getDeliveryShipmentId(trackedDelivery) : "";
    if (shipmentId && shipmentId !== "--") {
      params.set("shipmentId", shipmentId);
    }

    const query = params.toString();
    router.push(query.length > 0 ? `/drivers?${query}` : "/drivers");
  };

  const runTrackingLookup = useCallback(
    async (rawQuery: string) => {
      const query = rawQuery.trim();

      if (!query) {
        setTrackingMessage("Enter a shipment ID to track.");
        setTrackedDeliveryId(null);
        setDestinationRouteLoading(false);
        setDestinationRoutes([]);
        return;
      }

      setTrackingLoading(true);

      try {
        const matchedRaw = (await findDeliveryByShipmentOrTrackingId(query)) as DeliveryRecord | null;

        if (!matchedRaw) {
          setTrackingMessage(`No active delivery found for "${query}".`);
          setTrackedDeliveryId(null);
          setDestinationRouteLoading(false);
          setDestinationRoutes([]);
          return;
        }

        if (!matchedRaw.route_id) {
          const shipmentId = getDeliveryShipmentId(matchedRaw);
          setTrackingMessage(`Shipment ${shipmentId} is not assigned to an active route yet.`);
          setTrackedDeliveryId(null);
          setDestinationRouteLoading(false);
          setDestinationRoutes([]);
          return;
        }

        const loadedRouteDeliveries = await ensureRouteDeliveriesLoaded(matchedRaw.route_id);
        const matchedDelivery =
          loadedRouteDeliveries.find((delivery) => delivery.id === matchedRaw.id) ||
          matchedRaw;

        if (!loadedRouteDeliveries.find((delivery) => delivery.id === matchedRaw.id)) {
          setDeliveriesByRoute((prev) => {
            const existing = prev[matchedRaw.route_id] || [];
            if (existing.some((delivery) => delivery.id === matchedRaw.id)) return prev;

            return {
              ...prev,
              [matchedRaw.route_id]: [...existing, matchedRaw].sort(
                (left, right) => Number(left.sequence || 0) - Number(right.sequence || 0)
              ),
            };
          });
        }

        setTrackedDeliveryId(matchedDelivery.id);
        setSelectedRouteId(matchedDelivery.route_id);
        setExpandedRouteId(matchedDelivery.route_id);
        setDestinationRoutes([]);

        const shipmentId = getDeliveryShipmentId(matchedDelivery);
        setTrackingQuery(shipmentId);
        const statusLabel =
          matchedDelivery.status || getDeliveryParcel(matchedDelivery)?.status || "active";

        setTrackingMessage(`Tracking ${shipmentId} (${statusLabel.replaceAll("_", " ")})`);
      } catch (error) {
        console.error("[Dashboard] Shipment lookup failed:", error);
        setTrackingMessage("Could not track this shipment right now. Please try again.");
        setTrackedDeliveryId(null);
        setDestinationRouteLoading(false);
        setDestinationRoutes([]);
      } finally {
        setTrackingLoading(false);
      }
    },
    [ensureRouteDeliveriesLoaded]
  );

  const onTrackOrder = async () => {
    await runTrackingLookup(trackingQuery);
  };

  useEffect(() => {
    if (!trackingRestorePending) return;
    const query = trackingRestorePending.query.trim();
    if (!query) return;

    void runTrackingLookup(query);
  }, [runTrackingLookup, trackingRestorePending]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#4B4E63] text-sm">
        Loading dashboard...
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-full min-h-0">
        {dataError ? (
          <div className="mb-3 rounded-xl border border-[#F4C8CF] bg-[#FDF2F4] p-3 text-sm text-[#8C2435]">
            {dataError}
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#E2E4EF] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7E8299]">Organization</p>
            <p className="text-sm font-semibold text-[#1B1E32]">{organization?.name || "Unknown Organization"}</p>
          </div>
          <button
            onClick={() => {
              void copyOrganizationCode();
            }}
            disabled={!organization?.code}
            className="inline-flex items-center gap-2 rounded-lg border border-[#D7DAE6] bg-[#F9FAFF] px-3 py-2 text-xs font-semibold text-[#2F3454] transition hover:bg-[#F0F3FF] disabled:cursor-not-allowed disabled:opacity-60"
            title={organization?.code ? "Click to copy organization code" : "Organization code unavailable"}
          >
            <span>Code: {organization?.code || "N/A"}</span>
            {orgCodeCopied ? <Check className="h-3.5 w-3.5 text-[#1D9F77]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[30.5%_30.5%_39%]">
          {/* LEFT COLUMN */}
          <div className="flex min-h-0 flex-col gap-3">
            <section className="flex min-h-0 flex-1 flex-col rounded-[14px] border border-[#E2E4EF] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-extrabold uppercase tracking-tight text-[#121527]">
                    Total Routes
                  </h2>
                  <p className="text-xs text-[#7E8299]">Routes in organization ({routes.length})</p>
                </div>
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-[#7E8299]" />
                  <span className="text-[10px] font-semibold text-[#6D7088]">
                    {formatDateUpper(shownRoutes[0]?.created_at)}
                  </span>
                </div>
              </div>

              <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                {shownRoutes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#D6DAE8] bg-[#FAFBFE] p-3 text-xs text-[#70758D]">
                    No routes are available for your organization.
                  </div>
                ) : null}

                {shownRoutes.map((route) => {
                  const routeLabel = getRouteLabel(route);
                  const routeStatus = (route.status || "unknown").trim();
                  const routeDeliveries = [...(deliveriesByRoute[route.id] || [])]
                    .filter((delivery): delivery is DeliveryRecord => Boolean(delivery))
                    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
                  const routeStops = routeDeliveries
                    .flatMap((delivery) => {
                      const parcel = getDeliveryParcel(delivery);
                      const fallbackTrackingCode = getDeliveryShipmentId(delivery);
                      const fallbackAddress = parcel?.address?.trim() || "No address on record";
                      const weight = getDeliveryWeight(delivery);
                      const expandedStops = getExpandedDeliveryStopsForTracking(delivery, true);
                      const declaredStopsRaw = Number(delivery.delivery_stops_total);
                      const declaredStops =
                        Number.isFinite(declaredStopsRaw) && declaredStopsRaw > 0
                          ? Math.floor(declaredStopsRaw)
                          : 0;
                      const stopCount = Math.max(declaredStops, expandedStops.length, 1);
                      const routeStopSequenceRaw = Number(delivery.sequence);
                      const routeStopNumber =
                        Number.isFinite(routeStopSequenceRaw) && routeStopSequenceRaw > 0
                          ? Math.floor(routeStopSequenceRaw)
                          : 1;

                      if (expandedStops.length === 0) {
                        return [
                          {
                            key: `${delivery.id}-fallback`,
                            trackingCode: fallbackTrackingCode,
                            address: fallbackAddress,
                            stopBadgeText: `Stop #${routeStopNumber}`,
                            weight,
                            routeStopNumber,
                            stopSequence: 1,
                          },
                        ];
                      }

                      return expandedStops.map((stop, index) => {
                        const stopSequenceRaw = Number(stop.sequence);
                        const stopSequence =
                          Number.isFinite(stopSequenceRaw) && stopSequenceRaw > 0
                            ? Math.floor(stopSequenceRaw)
                            : index + 1;
                        const clampedStopSequence = Math.min(
                          Math.max(1, stopSequence),
                          stopCount
                        );
                        const stopBadgeText =
                          stopCount > 1
                            ? `Stop #${routeStopNumber} | Stop ${clampedStopSequence} of ${stopCount}`
                            : `Stop #${routeStopNumber}`;

                        return {
                          key: `${delivery.id}:${stop.stopId}:${index}`,
                          trackingCode: (stop.shipmentTrackingId || "").trim() || fallbackTrackingCode,
                          address:
                            (typeof stop.address === "string" && stop.address.trim().length > 0
                              ? stop.address.trim()
                              : fallbackAddress),
                          stopBadgeText,
                          weight,
                          routeStopNumber,
                          stopSequence: clampedStopSequence,
                        };
                      });
                    })
                    .sort(
                      (left, right) =>
                        left.routeStopNumber - right.routeStopNumber ||
                        left.stopSequence - right.stopSequence
                    );
                  const isExpanded = expandedRouteId === route.id;

                  return (
                    <div key={route.id} className="rounded-[12px] border border-[#E4E7F2] bg-white px-3 py-3">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => {
                            setSelectedRouteId(route.id);
                            setExpandedRouteId((prev) => (prev === route.id ? null : route.id));
                            setTrackedDeliveryId(null);
                            setTrackingMessage(null);
                          }}
                          className="text-left text-[15px] font-semibold text-[#171A2E] hover:text-[#5B40DD]"
                        >
                          {routeLabel}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-[10px] font-semibold leading-none ${getStatusBadgeClass(routeStatus)}`}>
                            {routeStatus || "Unknown"}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-[#868BA3]" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-[#868BA3]" />
                          )}
                        </div>
                      </div>

                      {isExpanded ? (
                        <>
                          <div className="mt-3 space-y-3">
                            {routeStops.length === 0 ? (
                              <p className="text-xs text-[#70758D]">No delivery stops linked to this route.</p>
                            ) : null}

                            {routeStops.map((stop) => {
                              return (
                                <div key={stop.key} className="space-y-1 text-xs">
                                  <p className="flex items-center gap-1.5 font-semibold text-[#21243A]">
                                    <MapPin className="h-3.5 w-3.5 text-[#1D233E]" />
                                    {stop.trackingCode}
                                  </p>
                                  <p className="pl-5 text-[11px] text-[#72778F]">{stop.address}</p>
                                  <div className="pl-5 flex items-center gap-2 text-[10px]">
                                    <span className="rounded bg-[#ECEEF5] px-2 py-0.5 text-[#4E5268]">
                                      {stop.stopBadgeText}
                                    </span>
                                    <span className="rounded bg-[#ECEEF5] px-2 py-0.5 text-[#4E5268]">
                                      {stop.weight.toFixed(1)} kg
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => {
                              const params = new URLSearchParams();
                              if (route.rider_id) params.set("riderId", route.rider_id);
                              params.set("routeId", route.id);

                              const query = params.toString();
                              router.push(query.length > 0 ? `/drivers?${query}` : "/drivers");
                            }}
                            className="mt-4 w-full rounded-lg bg-[#694BF0] py-2 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-[#5D42DB]"
                          >
                            Find Driver
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[14px] border border-[#E2E4EF] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-extrabold uppercase tracking-tight text-[#121527]">
                  Driver Assignment
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPreviousDriver}
                    disabled={activeOrganizationRiders.length === 0}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#D7DAE6] text-[#69708C] transition hover:bg-[#F5F7FF] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Previous active rider"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[11px] font-semibold text-[#7F839A] min-w-[44px] text-center">
                    {activeOrganizationRiders.length > 0
                      ? `${activeRiderIndex + 1}/${activeOrganizationRiders.length}`
                      : "0/0"}
                  </span>
                  <button
                    onClick={goToNextDriver}
                    disabled={activeOrganizationRiders.length === 0}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#D7DAE6] text-[#69708C] transition hover:bg-[#F5F7FF] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Next active rider"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[11px] font-semibold text-[#7F839A]">({assignmentDeliveryCount})</span>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-[1.2fr_1fr_1fr] gap-3 text-[10px] text-[#8B8FA6]">
                <span>Name</span>
                <span>ID</span>
                <span>Item Quantity</span>
              </div>
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-3 text-xs font-semibold text-[#1B1E32]">
                <span>{assignmentRider ? getProfileName(assignmentRider.profiles) : "--"}</span>
                <span>{assignmentRider ? assignmentRider.id.slice(0, 10).toUpperCase() : "--"}</span>
                <span>{assignmentDeliveryCount} Items</span>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <p className="text-[10px] text-[#8B8FA6]">Rider Status</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${getRiderStatusBadgeClass(
                    assignmentRider?.status
                  )}`}
                >
                  {(assignmentRider?.status || "Unknown").replaceAll("_", " ")}
                </span>
              </div>

              {activeOrganizationRiders.length === 0 ? (
                <p className="mt-2 text-[11px] text-[#7F839A]">No active riders found in this organization.</p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-xs">
                <div>
                  <p className="text-[10px] text-[#8B8FA6]">Vehicle Capacity</p>
                  <p className="font-semibold text-[#1B1E32]">
                    {assignmentRider?.capacity != null ? `Weight: ${assignmentRider.capacity} kg` : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#8B8FA6]">Load Weight</p>
                  <p className="font-semibold text-[#1B1E32]">
                    {assignmentRouteTotalWeight > 0 ? `${assignmentRouteTotalWeight.toFixed(1)} kg` : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#8B8FA6]">Destination</p>
                  <p className="font-semibold text-[#1B1E32] truncate">{assignmentDestination}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#8B8FA6]">Total Hour</p>
                  <p className="font-semibold text-[#1B1E32]">
                    {assignmentRouteRunHours != null ? `${assignmentRouteRunHours.toFixed(1)} Hours` : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#8B8FA6]">Last Service</p>
                  <p className="font-semibold text-[#1B1E32]">
                    {formatDate(assignmentRider?.current_location_at || assignmentRider?.updated_at)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#8B8FA6]">Rating</p>
                  <p className="font-semibold text-[#1B1E32]">{assignmentRiderStars}</p>
                </div>
              </div>

              <button
                onClick={() => router.push("/plan-route")}
                className="mt-4 w-full rounded-lg bg-[#0E2330] py-2 text-[10px] font-semibold uppercase tracking-widest text-white transition hover:bg-[#0B1C27]"
              >
                Schedule Job
              </button>
            </section>
          </div>

          {/* MIDDLE COLUMN */}
          <div className="flex min-h-0 flex-col gap-3">
            <section className="rounded-[14px] border border-[#E2E4EF] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-extrabold uppercase tracking-tight text-[#121527]">
                    Geofence Alerts
                  </h2>
                  <p className="text-xs text-[#7E8299]">Total geofence alerts ({dashboardMetrics.geofenceAlerts})</p>
                </div>
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-[#7E8299]" />
                  <span className="text-[10px] font-semibold text-[#6D7088]">
                    {formatDateUpper(notifications[0]?.created_at || violations[0]?.created_at)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {geofenceRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#D6DAE8] bg-[#FAFBFE] p-3 text-xs text-[#70758D]">
                    No geofence alert events recorded.
                  </div>
                ) : null}

                {geofenceRows.map((row) => {
                  const badgeClass = getAlertBadgeClass(row.severity);
                  const alertText =
                    row.total > 0
                      ? `${row.total} Geofencing ${row.total === 1 ? "Alert" : "Alerts"}`
                      : "Geofencing Clear";

                  return (
                    <div
                      key={row.routeId}
                      className="flex items-center justify-between rounded-[12px] border border-[#E4E7F2] bg-[#FBFCFF] px-3 py-3"
                    >
                      <span className="text-[15px] font-semibold text-[#171A2E]">{row.routeLabel}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold ${badgeClass}`}>
                        {row.total > 0 ? <AlertTriangle className="h-3 w-3" /> : null}
                        {alertText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col rounded-[14px] border border-[#E2E4EF] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[20px] leading-none font-semibold text-[#1B1D31]">Performance Analytics</h3>
                <ExternalLink className="h-4 w-4 text-[#7E8299]" />
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
                <div className="rounded-[14px] bg-[#FCE4EA] p-4">
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#FA6F90] text-white">
                    <WalletCards className="h-5 w-5" />
                  </div>
                  <p className="text-[38px] leading-none font-bold text-[#1F2340]">
                    {formatCompactCurrency(dashboardMetrics.totalRevenue)}
                  </p>
                  <p className="mt-2 text-[14px] text-[#3B3F58]">Total Revenue</p>
                  <p className="mt-2 text-xs font-semibold text-[#4B76F3]">Today earnings</p>
                </div>

                <div className="rounded-[14px] bg-[#F8ECD8] p-4">
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#FF8E61] text-white">
                    <Box className="h-5 w-5" />
                  </div>
                  <p className="text-[38px] leading-none font-bold text-[#1F2340]">{dashboardMetrics.totalOrders}</p>
                  <p className="mt-2 text-[14px] text-[#3B3F58]">Total Order</p>
                  <p className="mt-2 text-xs font-semibold text-[#4B76F3]">Deliveries scheduled</p>
                </div>

                <div className="rounded-[14px] bg-[#DDF7E7] p-4">
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#32C46B] text-white">
                    <Navigation className="h-5 w-5" />
                  </div>
                  <p className="text-[38px] leading-none font-bold text-[#1F2340]">
                    {dashboardMetrics.geofenceAlerts}
                  </p>
                  <p className="mt-2 text-[14px] text-[#3B3F58]">Geofencing Alerts</p>
                  <p className="mt-2 text-xs font-semibold text-[#4B76F3]">Violations and notifications</p>
                </div>

                <div className="rounded-[14px] bg-[#EEE3FA] p-4">
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#A570F8] text-white">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <p className="text-[38px] leading-none font-bold text-[#1F2340]">
                    {`${Math.round(dashboardMetrics.avgOnTime)}%`}
                  </p>
                  <p className="mt-2 text-[14px] text-[#3B3F58]">On-Time Rate</p>
                  <p className="mt-2 text-xs font-semibold text-[#4B76F3]">
                    {dashboardMetrics.activeRiders} active riders
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button className="rounded-xl bg-[#6B4FF0] py-3 text-base font-medium text-white transition hover:bg-[#5B40DD]">
                  This Month
                </button>
                <button className="rounded-xl bg-[#F3F4F8] py-3 text-base font-medium text-[#23263D] transition hover:bg-[#EAECF3]">
                  Last Month
                </button>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN */}
          <section className="flex min-h-0 flex-col rounded-[14px] border border-[#E2E4EF] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
            <h2 className="text-[24px] leading-none font-semibold tracking-tight text-[#13172A]">Live Tracking</h2>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="text"
                value={trackingQuery}
                onChange={(event) => setTrackingQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void onTrackOrder();
                  }
                }}
                placeholder="Enter shipment/tracking ID or delivery UUID"
                className="h-12 flex-1 rounded-xl border border-[#E3E5EE] px-4 text-base text-[#2A2D40] outline-none transition placeholder:text-[#A0A4B8] focus:border-[#7A5DFB] focus:ring-2 focus:ring-[#7A5DFB]/20"
              />
              <button
                onClick={() => {
                  void onTrackOrder();
                }}
                disabled={trackingLoading}
                className="h-12 rounded-xl bg-[#704FF0] px-5 text-sm font-medium text-white transition hover:bg-[#6141E1]"
              >
                {trackingLoading ? "Tracking..." : "Track Order"}
              </button>
              <button
                onClick={stopTracking}
                disabled={!trackedDeliveryId && !trackingMessage}
                className="h-12 rounded-xl border border-[#E6C2CD] bg-[#FFF5F7] px-4 text-sm font-medium text-[#A73752] transition hover:bg-[#FFEDEF] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Stop Tracking
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-[#E3E6F1] bg-[#F9FAFF] px-3 py-2 text-[11px] text-[#626883]">
              <p className="font-semibold text-[#313654]">How to use Live Tracking</p>
              <p className="mt-1">
                Enter the shipment/tracking ID shown in deliveries, or paste a delivery UUID.
              </p>
              <p>
                The map shows rider position, destination pin, and route path. Use Open Driver Details for full rider info.
              </p>
            </div>

            {trackingMessage ? (
              <p className="mt-2 text-xs font-medium text-[#4D516A]">{ trackingMessage }</p>
            ) : null}

            {trackedDelivery ? (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[#E3E6F1] bg-white px-3 py-3 text-[11px] text-[#4D516A]">
                <div>
                  <p className="text-[#868BA3]">Shipment</p>
                  <p className="font-semibold text-[#1B1E32] break-all">{trackedShipmentId}</p>
                </div>
                <div>
                  <p className="text-[#868BA3]">Status</p>
                  <p className="font-semibold text-[#1B1E32]">{trackedDeliveryStatus}</p>
                </div>
                <div>
                  <p className="text-[#868BA3]">Rider</p>
                  <p className="font-semibold text-[#1B1E32]">{trackedRiderName}</p>
                </div>
                <div>
                  <p className="text-[#868BA3]">Destination</p>
                  <p className="font-semibold text-[#1B1E32] truncate">{trackedDestination}</p>
                </div>

                <button
                  onClick={openDriverPanel}
                  className="col-span-2 mt-1 rounded-lg bg-[#0E2330] py-2 text-[11px] font-semibold uppercase tracking-wider text-white transition hover:bg-[#0B1C27]"
                >
                  Open Driver Details
                </button>
              </div>
            ) : null}

            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-[14px] border border-[#D7DAE6]">
              <MapboxMap
                key={`live-tracking-map-${trackingMapResetKey}`}
                center={mapCenter}
                zoom={11.2}
                routes={mapRoutesForTab}
                riders={liveRiders}
                parcels={activeMapTab === "status" ? activeMapParcels : []}
                showNavigationControl={false}
                height="100%"
                parcelMarkerVariant="pin"
              />

              {trackedDelivery && activeMapTab === "status" && destinationRouteLoading ? (
                <div className="pointer-events-none absolute left-1/2 top-4 z-[460] -translate-x-1/2 rounded-full border border-[#D7DAE6] bg-white/95 px-4 py-1.5 text-[11px] font-semibold text-[#4D516A] shadow">
                  Rendering stop routes...
                </div>
              ) : null}

              <div className="absolute left-4 top-4 inline-flex rounded-2xl bg-white/95 p-1 shadow">
                <button
                  onClick={() => setActiveMapTab("status")}
                  className={`rounded-xl px-8 py-2.5 text-sm font-medium ${
                    activeMapTab === "status" ? "bg-[#6E4EF0] text-white" : "text-[#2A2D40]"
                  }`}
                >
                  Status
                </button>
                <button
                  onClick={() => setActiveMapTab("location")}
                  className={`rounded-xl px-8 py-2.5 text-sm font-medium ${
                    activeMapTab === "location" ? "bg-[#6E4EF0] text-white" : "text-[#2A2D40]"
                  }`}
                >
                  Location
                </button>
              </div>

              <button
                onClick={openDriverPanel}
                className="absolute bottom-4 right-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#6E4EF0] shadow"
                title="Open Driver Panel"
              >
                <Bike className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-center text-xs font-medium text-[#4F5267]">
              {trackingLoading
                ? "Checking shipment and route..."
                : loadingData
                ? "Loading live route data..."
                : trackedDelivery
                ? destinationRouteLoading
                  ? "Rendering stop routes for tracked delivery..."
                  : liveRiders.length > 0
                  ? "Live route and destination are synced to the tracked shipment."
                  : "Shipment found, but rider location is not available yet."
                : "Enter a shipment ID to load rider, destination, and route."}
            </p>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
