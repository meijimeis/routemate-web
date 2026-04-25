/**
 * Shared Types aligned with DB_SCHEMA.sql
 *
 * These interfaces represent row-level shapes used by Supabase queries.
 * Timestamp columns are represented as ISO strings.
 */

// ==================== JSON ====================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

// ==================== ENUM-LIKE STATUS TYPES ====================

export type ProfileStatus = "available" | "on_delivery" | "offline";

export type RiderStatus = "available" | "on_delivery" | "offline";

export type ParcelStatus =
  | "unassigned"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "failed"
  | "returned";

export type ParcelListStatus =
  | "unassigned"
  | "acquired"
  | "pending"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled";

export type RouteStatus =
  | "draft"
  | "assigned"
  | "active"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

export type DeliveryStatus =
  | "pending"
  | "accepted"
  | "en_route"
  | "arrived"
  | "completed"
  | "cancelled"
  | "failed";

export type Severity = "info" | "warning" | "critical";

export type GeofenceZoneType =
  | "RESTRICTED"
  | "DELIVERY"
  | "DEPOT"
  | "NO_PARKING"
  | "SERVICE_AREA";

export type GeofenceEventType = "enter" | "exit" | "dwell";

export type ViolationType =
  | "ZONE_EXIT_UNAUTHORIZED"
  | "ZONE_OVERSTAY"
  | "ZONE_MISSED_ENTRY"
  | "PARCEL_DELAY_RISK"
  | "TRAFFIC_DELAY_IMPACT"
  | "TRAFFIC_RE_ROUTE_REQUIRED";

export type TrafficLevel = "LOW" | "MODERATE" | "HEAVY" | "SEVERE";

export type DirectionProfile = "motorcycle";

export type RouteSnapshotSource = "osrm" | "ors-fallback" | "cache" | "manual";

// ==================== CORE TABLES ====================

export interface Organization {
  id: string;
  name: string;
  code: string;
  created_at?: string;
  domain?: string | null;
  type?: string | null;
  logo_url?: string | null;
}

export interface Profile {
  id: string;
  email_address?: string | null;
  full_name?: string | null;
  phone_number?: string | null;
  alias?: string | null;
  device_id?: string | null;
  status?: ProfileStatus;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Rider {
  id: string;
  profile_id: string;
  organization_id: string;
  vehicle_type?: "motorcycle" | null;
  capacity?: number | null;
  status?: RiderStatus;
  current_latitude?: number | null;
  current_longitude?: number | null;
  current_location_accuracy?: number | null;
  current_location_at?: string | null;
  created_at?: string;
  updated_at?: string;
  profiles?: Profile | Profile[] | null;
}

export interface Supervisor {
  id: string;
  profile_id: string;
  organization_id: string;
  department?: string | null;
  created_at?: string;
  updated_at?: string;
  profiles?: Profile | Profile[] | null;
}

// ==================== PARCELS / ROUTES / DELIVERIES ====================

export interface Parcel {
  id: string;
  organization_id?: string | null;
  rider_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  status?: ParcelStatus;
  created_at?: string;
}

export interface ParcelList {
  id: string;
  organization_id?: string | null;
  tracking_code: string;
  recipient_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  weight_kg?: number | null;
  priority?: string | null;
  payment_type?: string | null;
  status?: ParcelListStatus;
  region?: string | null;
  created_at?: string;
  cluster_name?: string | null;
  supervisor_id?: string | null;
  consolidated_at?: string | null;
  parcel_count?: number;
  acquired_at?: string | null;
}

export interface ParcelListItem {
  id: string;
  parcel_list_id: string;
  parcel_id: string;
  sequence?: number | null;
  added_at?: string;
}

export interface Route {
  id: string;
  rider_id?: string | null;
  organization_id?: string | null;
  cluster_name?: string | null;
  created_at?: string;
  updated_at?: string;
  status?: RouteStatus;
  planned_distance_m?: number | null;
  planned_duration_s?: number | null;
  latest_snapshot_id?: string | null;
  riders?: Rider | Rider[] | null;
}

export interface Delivery {
  id: string;
  route_id: string;
  parcel_id?: string | null;
  parcel_cluster_id?: string | null;
  delivery_type?: "parcel" | "cluster" | null;
  delivery_stops_total?: number | null;
  delivery_stops_completed?: number | null;
  completed_at?: string | null;
  rider_id?: string | null;
  sequence?: number | null;
  status?: DeliveryStatus;
  created_at?: string;
  updated_at?: string;
  parcel_list_id?: string | null;
  shipment_tracking_id?: string | null;
  parcel_lists?: ParcelList | ParcelList[] | null;
  parcel_clusters?: ParcelList | ParcelList[] | null;
  routes?: Route | Route[] | null;
  riders?: Rider | Rider[] | null;
}

export interface RiderAnalytics {
  id?: string;
  rider_id: string;
  today_earnings?: number | null;
  today_distance?: number | null;
  today_deliveries_completed?: number | null;
  today_deliveries_total?: number | null;
  this_week_earnings?: number | null;
  this_week_deliveries?: number | null;
  on_time_percentage?: number | null;
  created_at?: string;
  updated_at?: string;
}

// Kept as an app-level aggregate type for charting and summaries.
export interface Analytics {
  rider_id: string;
  date: string;
  total_earnings: number;
  total_distance: number;
  total_deliveries: number;
  completed_deliveries: number;
  on_time_rate: number;
  average_rating?: number;
  total_time_spent?: number;
}

// ==================== GEOFENCING / LOCATION ====================

export interface Geofence {
  id: string;
  organization_id: string;
  name: string;
  geometry: Json;
  severity?: Severity | null;
  is_active?: boolean;
  created_at?: string;
  zone_type?: GeofenceZoneType;
  allow_exit?: boolean;
  max_dwell_minutes?: number | null;
  required_entry?: boolean;
  rules?: Json;
  updated_at?: string;
}

export interface GeofenceEvent {
  id?: string;
  rider_id?: string | null;
  parcel_id?: string | null;
  geofence_id?: string | null;
  zone_name?: string | null;
  event_type?: GeofenceEventType | null;
  created_at?: string;
}

export interface RiderGeofenceState {
  rider_id: string;
  geofence_id: string;
  is_inside: boolean;
  last_changed?: string;
}

export interface LocationLog {
  id?: string;
  rider_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp?: string;
  created_at?: string;
}

// ==================== NOTIFICATIONS / VIOLATIONS ====================

export type NotificationType =
  | "delivery"
  | "geofence"
  | "payment"
  | "route"
  | "system"
  | string;

export interface Notification {
  id: string;
  organization_id: string;
  rider_id?: string | null;
  type: NotificationType;
  severity: Severity;
  message: string;
  location?: string | null;
  metadata?: Json;
  acknowledged?: boolean;
  created_at?: string;
  geofence_id?: string | null;
}

export interface Violation {
  id: string;
  organization_id: string;
  rider_name: string;
  zone_name: string;
  lat: number;
  lng: number;
  violation_type: ViolationType;
  base_severity: Severity;
  traffic_level: TrafficLevel;
  created_at?: string;
  geofence_id?: string | null;
}

// App-level messaging type (not currently represented in DB_SCHEMA.sql)
export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  organization_id: string;
  content: string;
  read: boolean;
  created_at?: string;
  updated_at?: string;
}

// ==================== ROUTE SNAPSHOTS / CACHE ====================

export interface DirectionsCache {
  cache_key: string;
  request_fingerprint: string;
  profile: DirectionProfile;
  waypoints: Json;
  waypoint_indexes: number[];
  geometry: Json;
  distance_m?: number | null;
  duration_s?: number | null;
  segments?: Json | null;
  is_road_snapped?: boolean;
  expires_at: string;
  hit_count?: number;
  created_at?: string;
  last_hit_at?: string | null;
}

export interface RouteSnapshot {
  id: string;
  route_id: string;
  organization_id: string;
  profile?: DirectionProfile;
  cache_key?: string | null;
  waypoints: Json;
  waypoint_indexes: number[];
  geometry: Json;
  distance_m?: number | null;
  duration_s?: number | null;
  segments?: Json | null;
  is_road_snapped?: boolean;
  source?: RouteSnapshotSource;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ==================== API RESPONSES ====================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ==================== AUTH ====================

export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  user: Profile;
  organization?: Organization;
  rider?: Rider;
  supervisor?: Supervisor;
  expires_at?: string;
}

export interface LoginRequest {
  email: string;
  password?: string;
  otp?: string;
}

export interface SignUpRequest {
  email: string;
  full_name: string;
  phone_number?: string;
  password: string;
}

// ==================== REAL-TIME EVENTS ====================

export type RealtimeEvent<T> = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  new: T;
  old?: T;
  schema: string;
  commit_timestamp: string;
};

export type RealtimeCallback<T> = (event: RealtimeEvent<T>) => void;

// ==================== CONSTANTS ====================

export const DELIVERY_STATUSES = [
  "pending",
  "accepted",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
  "failed",
] as const;

export const RIDER_STATUSES = ["available", "on_delivery", "offline"] as const;

export const PARCEL_STATUSES = [
  "unassigned",
  "assigned",
  "in_transit",
  "delivered",
  "failed",
  "returned",
] as const;

export const PARCEL_LIST_STATUSES = [
  "unassigned",
  "acquired",
  "pending",
  "assigned",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
] as const;

export const ROUTE_STATUSES = [
  "draft",
  "assigned",
  "active",
  "in_progress",
  "completed",
  "cancelled",
  "failed",
] as const;

export const GEOFENCE_ZONE_TYPES = [
  "RESTRICTED",
  "DELIVERY",
  "DEPOT",
  "NO_PARKING",
  "SERVICE_AREA",
] as const;

export const NOTIFICATION_SEVERITIES = ["info", "warning", "critical"] as const;

export const VIOLATION_TYPES = [
  "ZONE_EXIT_UNAUTHORIZED",
  "ZONE_OVERSTAY",
  "ZONE_MISSED_ENTRY",
  "PARCEL_DELAY_RISK",
  "TRAFFIC_DELAY_IMPACT",
  "TRAFFIC_RE_ROUTE_REQUIRED",
] as const;
