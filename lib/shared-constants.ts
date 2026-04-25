/**
 * Shared Constants and Configuration for Routemate Apps
 * Mobile & Web apps use these constants for consistency
 */

// ==================== API & ENDPOINTS ====================

export const SUPABASE_CONFIG = {
  URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
} as const;

export const API_CONFIG = {
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

// ==================== DATABASE TABLES ====================

export const TABLES = {
  ORGANIZATIONS: 'organizations',
  PROFILES: 'profiles',
  RIDERS: 'riders',
  SUPERVISORS: 'supervisors',
  DELIVERIES: 'deliveries',
  DELIVERY_STOPS: 'delivery_stops',
  PARCELS: 'parcels',
  PARCEL_LISTS: 'parcel_lists',
  GEOFENCES: 'geofences',
  ANALYTICS: 'analytics',
  NOTIFICATIONS: 'notifications',
  MESSAGES: 'messages',
  RIDER_LOCATIONS: 'rider_locations',
  GEOFENCE_EVENTS: 'geofence_events',
} as const;

// ==================== STATUSES ====================

export const DELIVERY_STATUSES = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const RIDER_STATUSES = {
  AVAILABLE: 'available',
  ON_DELIVERY: 'on_delivery',
  OFFLINE: 'offline',
} as const;

export const PARCEL_STATUSES = {
  PENDING: 'pending',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
} as const;

export const GEOFENCE_TYPES = {
  RESTRICTED: 'restricted',
  CHECKPOINT: 'checkpoint',
  SERVICE_AREA: 'service_area',
} as const;

export const GEOFENCE_TRIGGERS = {
  ENTER: 'enter',
  EXIT: 'exit',
  DWELL: 'dwell',
} as const;

export const NOTIFICATION_TYPES = {
  DELIVERY: 'delivery',
  GEOFENCE: 'geofence',
  PAYMENT: 'payment',
  ROUTE: 'route',
  SYSTEM: 'system',
} as const;

export const NOTIFICATION_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const;

// ==================== ERROR CODES ====================

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_REQUEST: 'INVALID_REQUEST',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  DATABASE_ERROR: 'DATABASE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
} as const;

// ==================== VALIDATION ====================

export const VALIDATION = {
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_PATTERN: /^\+?[0-9]{7,15}$/,
  PASSWORD_MIN_LENGTH: 6,
  OTP_LENGTH: 6,
  MAX_DISTANCE_KM: 50,
  MIN_DISTANCE_KM: 0,
} as const;

// ==================== GEOFENCING ====================

export const GEOFENCE_CONFIG = {
  DEFAULT_RADIUS_METERS: 100,
  DWELL_TIME_SECONDS: 300, // 5 minutes
  MIN_ACCURACY_METERS: 20,
  LOCATION_UPDATE_INTERVAL_MS: 5000, // 5 seconds
  BATCH_LOCATION_UPDATE_INTERVAL_MS: 60000, // 60 seconds
} as const;

// ==================== ANALYTICS ====================

export const ANALYTICS_CONFIG = {
  UPDATE_INTERVAL_MS: 60000, // 1 minute
  BATCH_SIZE: 100,
} as const;

// ==================== REAL-TIME ====================

export const REALTIME_CONFIG = {
  RECONNECT_DELAY_MS: 1000,
  MAX_RECONNECT_ATTEMPTS: 10,
  HEARTBEAT_INTERVAL_MS: 30000,
} as const;

// ==================== SESSION ====================

export const SESSION_CONFIG = {
  AUTO_REFRESH_ENABLED: true,
  SESSION_TIMEOUT_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  TOKEN_REFRESH_THRESHOLD_MS: 5 * 60 * 1000, // 5 minutes before expiry
} as const;

// ==================== PAGINATION ====================

export const PAGINATION_CONFIG = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
  DEFAULT_PAGE: 1,
} as const;

// ==================== FEATURE FLAGS ====================

export const FEATURES = {
  REAL_TIME_TRACKING: true,
  GEOFENCING: true,
  OFFLINE_FIRST: true,
  PUSH_NOTIFICATIONS: true,
  ANALYTICS: true,
  MESSAGING: true,
  ROUTE_OPTIMIZATION: false, // Future
  AI_RECOMMENDATIONS: false, // Future
} as const;

// ==================== STORAGE KEYS ====================

export const STORAGE_KEYS = {
  // Mobile (SecureStore) and Web (localStorage)
  SESSION: 'routemate_session',
  SESSION_TIMESTAMP: 'routemate_session_timestamp',
  USER_PREFERENCES: 'routemate_preferences',
  OFFLINE_CACHE: 'routemate_offline_cache',
  LOCATION_HISTORY: 'routemate_location_history',
  DEVICE_ID: 'routemate_device_id',
} as const;

// ==================== NOTIFICATION MESSAGES ====================

export const NOTIFICATION_MESSAGES = {
  DELIVERY_ASSIGNED: 'New delivery assigned to you',
  DELIVERY_ACCEPTED: 'Delivery accepted',
  DELIVERY_COMPLETED: 'Delivery completed successfully',
  GEOFENCE_ENTERED: 'You entered a zone',
  GEOFENCE_EXITED: 'You exited a zone',
  GEOFENCE_VIOLATION: 'Geofence violation detected',
  PAYMENT_RECEIVED: 'Payment received',
  ROUTE_UPDATED: 'Your route has been updated',
} as const;

// ==================== HELP & SUPPORT ====================

export const SUPPORT = {
  HELP_CENTER_URL: 'https://routemate.example.com/help',
  CONTACT_EMAIL: 'support@routemate.example.com',
  WHATSAPP_NUMBER: '+1234567890',
} as const;
