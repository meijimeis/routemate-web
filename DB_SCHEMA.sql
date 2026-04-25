-- =============================================================================
-- ROUTEMATE FULL DATABASE SETUP
-- =============================================================================
-- Source baseline: DB_SCHEMA.sql
-- Goal: executable, uniform schema with tables, indexes, functions, triggers,
-- and RLS policies in one place.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- CORE TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  domain text UNIQUE,
  type text,
  logo_url text,
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email_address text UNIQUE,
  full_name text,
  phone_number text,
  alias text,
  device_id text,
  status text DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'on_delivery'::text, 'offline'::text])),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.riders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  vehicle_type text DEFAULT 'motorcycle'::text CHECK (vehicle_type = 'motorcycle'::text),
  capacity integer,
  status text DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'on_delivery'::text, 'offline'::text])),
  current_latitude double precision CHECK (current_latitude IS NULL OR (current_latitude >= -90 AND current_latitude <= 90)),
  current_longitude double precision CHECK (current_longitude IS NULL OR (current_longitude >= -180 AND current_longitude <= 180)),
  current_location_accuracy double precision,
  current_location_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT riders_pkey PRIMARY KEY (id),
  CONSTRAINT riders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT riders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);

CREATE TABLE IF NOT EXISTS public.supervisors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  department text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT supervisors_pkey PRIMARY KEY (id),
  CONSTRAINT supervisors_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT supervisors_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);

-- =============================================================================
-- PARCELS, ROUTES, DELIVERIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.parcels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  rider_id uuid,
  lat double precision CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)),
  lng double precision CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180)),
  status text DEFAULT 'unassigned'::text CHECK (status = ANY (ARRAY['unassigned'::text, 'assigned'::text, 'in_transit'::text, 'delivered'::text, 'failed'::text, 'returned'::text])),
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT parcels_pkey PRIMARY KEY (id),
  CONSTRAINT parcels_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT parcels_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id)
);

CREATE TABLE IF NOT EXISTS public.parcel_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  tracking_code text NOT NULL,
  recipient_name text,
  address text,
  latitude double precision CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude double precision CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  weight_kg double precision,
  priority text,
  payment_type text,
  item_price numeric(14,2) DEFAULT 0 CHECK (item_price >= 0),
  delivery_fee numeric(14,2) DEFAULT 0 CHECK (delivery_fee >= 0),
  cash_on_delivery_amount numeric(14,2) CHECK (cash_on_delivery_amount IS NULL OR cash_on_delivery_amount >= 0),
  ordered_at timestamp without time zone DEFAULT now(),
  estimated_delivery_at timestamp without time zone,
  actual_delivery_at timestamp without time zone,
  status text DEFAULT 'unassigned'::text CHECK (status = ANY (ARRAY['unassigned'::text, 'acquired'::text, 'pending'::text, 'assigned'::text, 'in_transit'::text, 'delivered'::text, 'completed'::text, 'cancelled'::text])),
  region text,
  created_at timestamp without time zone DEFAULT now(),
  cluster_name text,
  supervisor_id uuid,
  consolidated_at timestamp without time zone,
  parcel_count integer DEFAULT 0 CHECK (parcel_count >= 0),
  acquired_at timestamp without time zone,
  CONSTRAINT parcel_lists_order_eta_check CHECK (estimated_delivery_at IS NULL OR (ordered_at IS NOT NULL AND ordered_at <= estimated_delivery_at)),
  CONSTRAINT parcel_lists_order_actual_delivery_check CHECK (actual_delivery_at IS NULL OR (ordered_at IS NOT NULL AND ordered_at <= actual_delivery_at)),
  CONSTRAINT parcel_lists_pkey PRIMARY KEY (id),
  CONSTRAINT parcel_lists_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT parcel_lists_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.parcel_list_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parcel_list_id uuid NOT NULL,
  parcel_id uuid NOT NULL,
  sequence integer CHECK (sequence IS NULL OR sequence > 0),
  added_at timestamp without time zone DEFAULT now(),
  CONSTRAINT parcel_list_items_pkey PRIMARY KEY (id),
  CONSTRAINT parcel_list_items_parcel_list_id_fkey FOREIGN KEY (parcel_list_id) REFERENCES public.parcel_lists(id) ON DELETE CASCADE,
  CONSTRAINT parcel_list_items_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.parcels(id),
  CONSTRAINT parcel_list_items_unique_pair UNIQUE (parcel_list_id, parcel_id)
);

CREATE TABLE IF NOT EXISTS public.routes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid,
  organization_id uuid,
  cluster_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['draft'::text, 'assigned'::text, 'active'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'failed'::text])),
  planned_distance_m double precision,
  planned_duration_s double precision,
  latest_snapshot_id uuid,
  CONSTRAINT routes_pkey PRIMARY KEY (id),
  CONSTRAINT routes_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id),
  CONSTRAINT routes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  parcel_id uuid,
  parcel_cluster_id uuid,
  delivery_type text NOT NULL DEFAULT 'parcel'::text CHECK (delivery_type = ANY (ARRAY['parcel'::text, 'cluster'::text])),
  delivery_stops_total integer NOT NULL DEFAULT 0 CHECK (delivery_stops_total >= 0),
  delivery_stops_completed integer NOT NULL DEFAULT 0 CHECK (delivery_stops_completed >= 0),
  completed_at timestamp with time zone,
  rider_id uuid,
  sequence integer CHECK (sequence IS NULL OR sequence > 0),
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'en_route'::text, 'arrived'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'failed'::text])),
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  parcel_list_id uuid,
  shipment_tracking_id text,
  CONSTRAINT deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT deliveries_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE,
  CONSTRAINT deliveries_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id),
  CONSTRAINT deliveries_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.parcel_lists(id),
  CONSTRAINT deliveries_parcel_cluster_id_fkey FOREIGN KEY (parcel_cluster_id) REFERENCES public.parcel_lists(id),
  CONSTRAINT deliveries_parcel_list_id_fkey FOREIGN KEY (parcel_list_id) REFERENCES public.parcel_lists(id),
  CONSTRAINT deliveries_parcel_reference_check CHECK (
    parcel_id IS NOT NULL
    OR parcel_cluster_id IS NOT NULL
    OR parcel_list_id IS NOT NULL
  ),
  CONSTRAINT deliveries_stops_completed_not_exceed_total CHECK (
    delivery_stops_completed <= delivery_stops_total
  )
);

CREATE TABLE IF NOT EXISTS public.delivery_stops (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL,
  stop_sequence integer NOT NULL CHECK (stop_sequence > 0),
  parcel_id uuid,
  parcel_list_id uuid,
  shipment_tracking_id text NOT NULL,
  destination_address text,
  destination_latitude double precision CHECK (destination_latitude IS NULL OR (destination_latitude >= -90 AND destination_latitude <= 90)),
  destination_longitude double precision CHECK (destination_longitude IS NULL OR (destination_longitude >= -180 AND destination_longitude <= 180)),
  weight_kg double precision,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'en_route'::text, 'arrived'::text, 'completed'::text, 'cancelled'::text, 'failed'::text])),
  delivered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT delivery_stops_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_stops_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE,
  CONSTRAINT delivery_stops_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.parcels(id),
  CONSTRAINT delivery_stops_parcel_list_id_fkey FOREIGN KEY (parcel_list_id) REFERENCES public.parcel_lists(id),
  CONSTRAINT delivery_stops_unique_sequence UNIQUE (delivery_id, stop_sequence)
);

CREATE TABLE IF NOT EXISTS public.analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL UNIQUE,
  today_earnings numeric DEFAULT 0,
  today_distance double precision DEFAULT 0,
  today_deliveries_completed integer DEFAULT 0,
  today_deliveries_total integer DEFAULT 0,
  this_week_earnings numeric DEFAULT 0,
  this_week_deliveries integer DEFAULT 0,
  on_time_percentage numeric DEFAULT 100,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT analytics_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id)
);

-- =============================================================================
-- GEOFENCE, LOCATION, NOTIFICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.geofences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  geometry jsonb NOT NULL,
  severity text CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  zone_type text DEFAULT 'RESTRICTED'::text CHECK (zone_type = ANY (ARRAY['RESTRICTED'::text, 'DELIVERY'::text, 'DEPOT'::text, 'NO_PARKING'::text, 'SERVICE_AREA'::text])),
  allow_exit boolean DEFAULT false,
  max_dwell_minutes integer,
  required_entry boolean DEFAULT false,
  rules jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT geofences_pkey PRIMARY KEY (id),
  CONSTRAINT geofences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);

CREATE TABLE IF NOT EXISTS public.geofence_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid,
  parcel_id uuid,
  geofence_id uuid,
  zone_name text,
  event_type text CHECK (event_type = ANY (ARRAY['enter'::text, 'exit'::text, 'dwell'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT geofence_events_pkey PRIMARY KEY (id),
  CONSTRAINT geofence_events_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id),
  CONSTRAINT geofence_events_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.parcels(id),
  CONSTRAINT geofence_events_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES public.geofences(id)
);

CREATE TABLE IF NOT EXISTS public.rider_geofence_state (
  rider_id uuid NOT NULL,
  geofence_id uuid NOT NULL,
  is_inside boolean NOT NULL,
  last_changed timestamp with time zone DEFAULT now(),
  CONSTRAINT rider_geofence_state_pkey PRIMARY KEY (rider_id, geofence_id),
  CONSTRAINT rider_geofence_state_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id) ON DELETE CASCADE,
  CONSTRAINT rider_geofence_state_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES public.geofences(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.location_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL,
  latitude double precision NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude double precision NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  accuracy double precision,
  timestamp timestamp without time zone NOT NULL DEFAULT now(),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT location_logs_pkey PRIMARY KEY (id),
  CONSTRAINT location_logs_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  rider_id uuid,
  type text NOT NULL,
  severity text NOT NULL CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])),
  message text NOT NULL,
  location text,
  metadata jsonb DEFAULT '{}'::jsonb,
  acknowledged boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  geofence_id uuid,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT notifications_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id),
  CONSTRAINT notifications_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES public.geofences(id)
);

CREATE TABLE IF NOT EXISTS public.violations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  rider_name text NOT NULL,
  zone_name text NOT NULL,
  lat double precision NOT NULL CHECK (lat >= -90 AND lat <= 90),
  lng double precision NOT NULL CHECK (lng >= -180 AND lng <= 180),
  violation_type text NOT NULL CHECK (violation_type = ANY (ARRAY['ZONE_EXIT_UNAUTHORIZED'::text, 'ZONE_OVERSTAY'::text, 'ZONE_MISSED_ENTRY'::text, 'PARCEL_DELAY_RISK'::text, 'TRAFFIC_DELAY_IMPACT'::text, 'TRAFFIC_RE_ROUTE_REQUIRED'::text])),
  base_severity text NOT NULL CHECK (base_severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])),
  traffic_level text NOT NULL CHECK (traffic_level = ANY (ARRAY['LOW'::text, 'MODERATE'::text, 'HEAVY'::text, 'SEVERE'::text])),
  created_at timestamp with time zone DEFAULT now(),
  geofence_id uuid,
  CONSTRAINT violations_pkey PRIMARY KEY (id),
  CONSTRAINT violations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT violations_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES public.geofences(id)
);

-- =============================================================================
-- ROUTE PERSISTENCE / DIRECTION CACHE (TOKEN SAVER)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.directions_cache (
  cache_key text NOT NULL,
  request_fingerprint text NOT NULL UNIQUE,
  profile text NOT NULL CHECK (profile = ANY (ARRAY['driving-car'::text, 'driving-hgv'::text, 'cycling-regular'::text, 'foot-walking'::text])),
  waypoints jsonb NOT NULL,
  waypoint_indexes integer[] NOT NULL DEFAULT '{}',
  geometry jsonb NOT NULL,
  distance_m double precision,
  duration_s double precision,
  segments jsonb,
  is_road_snapped boolean NOT NULL DEFAULT true,
  expires_at timestamp with time zone NOT NULL,
  hit_count bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_hit_at timestamp with time zone,
  CONSTRAINT directions_cache_pkey PRIMARY KEY (cache_key)
);

CREATE TABLE IF NOT EXISTS public.route_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  profile text NOT NULL DEFAULT 'driving-car'::text CHECK (profile = ANY (ARRAY['driving-car'::text, 'driving-hgv'::text, 'cycling-regular'::text, 'foot-walking'::text])),
  cache_key text,
  waypoints jsonb NOT NULL,
  waypoint_indexes integer[] NOT NULL DEFAULT '{}',
  geometry jsonb NOT NULL,
  distance_m double precision,
  duration_s double precision,
  segments jsonb,
  is_road_snapped boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'ors'::text CHECK (source = ANY (ARRAY['ors'::text, 'cache'::text, 'manual'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT route_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT route_snapshots_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE,
  CONSTRAINT route_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT route_snapshots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'routes_latest_snapshot_id_fkey'
  ) THEN
    ALTER TABLE public.routes
      ADD CONSTRAINT routes_latest_snapshot_id_fkey
      FOREIGN KEY (latest_snapshot_id) REFERENCES public.route_snapshots(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_parcel_lists_tracking_code_lower ON public.parcel_lists USING btree (lower(tracking_code));
CREATE INDEX IF NOT EXISTS idx_parcel_lists_org_status_created ON public.parcel_lists USING btree (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parcel_lists_cluster_name ON public.parcel_lists USING btree (cluster_name);
CREATE INDEX IF NOT EXISTS idx_parcel_lists_org_ordered_at ON public.parcel_lists USING btree (organization_id, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_parcel_lists_org_estimated_delivery_at ON public.parcel_lists USING btree (organization_id, estimated_delivery_at DESC);
CREATE INDEX IF NOT EXISTS idx_parcel_lists_payment_type_cod_amount ON public.parcel_lists USING btree (payment_type, cash_on_delivery_amount);

CREATE INDEX IF NOT EXISTS idx_parcels_org_status ON public.parcels USING btree (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_parcels_rider_id ON public.parcels USING btree (rider_id);

CREATE INDEX IF NOT EXISTS idx_parcel_list_items_list_sequence ON public.parcel_list_items USING btree (parcel_list_id, sequence);
CREATE INDEX IF NOT EXISTS idx_parcel_list_items_parcel_id ON public.parcel_list_items USING btree (parcel_id);

CREATE INDEX IF NOT EXISTS idx_routes_rider_created_at ON public.routes USING btree (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routes_org_created_at ON public.routes USING btree (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routes_status_created_at ON public.routes USING btree (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deliveries_shipment_tracking_id ON public.deliveries USING btree (shipment_tracking_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_route_id_sequence ON public.deliveries USING btree (route_id, sequence);
CREATE INDEX IF NOT EXISTS idx_deliveries_rider_id_sequence ON public.deliveries USING btree (rider_id, sequence);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_type ON public.deliveries USING btree (delivery_type);
CREATE INDEX IF NOT EXISTS idx_deliveries_parcel_list_id ON public.deliveries USING btree (parcel_list_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_parcel_cluster_id ON public.deliveries USING btree (parcel_cluster_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_parcel_id ON public.deliveries USING btree (parcel_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_route_sequence_unique ON public.deliveries USING btree (route_id, sequence) WHERE sequence IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_route_cluster_unique ON public.deliveries USING btree (route_id, parcel_cluster_id) WHERE parcel_cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_stops_delivery_sequence ON public.delivery_stops USING btree (delivery_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_delivery_status ON public.delivery_stops USING btree (delivery_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_shipment_tracking_id ON public.delivery_stops USING btree (shipment_tracking_id);

CREATE INDEX IF NOT EXISTS idx_riders_org_status ON public.riders USING btree (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_riders_profile_id ON public.riders USING btree (profile_id);

CREATE INDEX IF NOT EXISTS idx_supervisors_profile_id ON public.supervisors USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_supervisors_org_id ON public.supervisors USING btree (organization_id);

CREATE INDEX IF NOT EXISTS idx_location_logs_rider_timestamp ON public.location_logs USING btree (rider_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_events_rider_created_at ON public.geofence_events USING btree (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_events_geofence_id ON public.geofence_events USING btree (geofence_id);

CREATE INDEX IF NOT EXISTS idx_notifications_org_created_at ON public.notifications USING btree (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_rider_created_at ON public.notifications USING btree (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_violations_org_created_at ON public.violations USING btree (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_route_snapshots_route_created_at ON public.route_snapshots USING btree (route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_snapshots_org_created_at ON public.route_snapshots USING btree (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_snapshots_cache_key ON public.route_snapshots USING btree (cache_key);

CREATE INDEX IF NOT EXISTS idx_directions_cache_expires_at ON public.directions_cache USING btree (expires_at);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email_address)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE
  SET
    email_address = EXCLUDED.email_address,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.consolidate_unassigned_parcels(
  p_organization_id uuid,
  p_supervisor_id uuid,
  p_distance_meters double precision DEFAULT 250
)
RETURNS TABLE (
  parcel_list_id uuid,
  parcel_count integer,
  centroid_latitude double precision,
  centroid_longitude double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parcel_list_id uuid;
  v_cluster_count integer;
  v_avg_lat double precision;
  v_avg_lng double precision;
  v_parcel_ids uuid[];
BEGIN
  IF p_distance_meters IS NULL OR p_distance_meters <= 0 THEN
    p_distance_meters := 250;
  END IF;

  FOR v_parcel_list_id, v_cluster_count, v_avg_lat, v_avg_lng, v_parcel_ids IN
    WITH unassigned_parcels AS (
      SELECT id, lat, lng
      FROM public.parcels
      WHERE organization_id = p_organization_id
        AND status = 'unassigned'
        AND lat IS NOT NULL
        AND lng IS NOT NULL
    ),
    sorted_parcels AS (
      SELECT
        id,
        lat,
        lng,
        ROW_NUMBER() OVER (ORDER BY lat, lng) AS row_num
      FROM unassigned_parcels
    ),
    cluster_assignment AS (
      SELECT
        id,
        lat,
        lng,
        SUM(CASE WHEN distance_flag = 1 THEN 1 ELSE 0 END) OVER (ORDER BY row_num) AS cluster_id
      FROM (
        SELECT
          id,
          lat,
          lng,
          row_num,
          CASE
            WHEN LAG(lat, 1) OVER (ORDER BY row_num) IS NULL THEN 1
            WHEN ABS(lat - LAG(lat, 1) OVER (ORDER BY row_num)) > (p_distance_meters / 111111.0) THEN 1
            ELSE 0
          END AS distance_flag
        FROM sorted_parcels
      ) sub
    ),
    clusters_with_ids AS (
      SELECT
        cluster_id,
        COUNT(*)::integer AS count,
        AVG(lat) AS avg_lat,
        AVG(lng) AS avg_lng,
        ARRAY_AGG(id ORDER BY lat, lng) AS parcel_ids
      FROM cluster_assignment
      GROUP BY cluster_id
      HAVING COUNT(*) > 1
    )
    SELECT
      gen_random_uuid(),
      count,
      avg_lat,
      avg_lng,
      parcel_ids
    FROM clusters_with_ids
  LOOP
    INSERT INTO public.parcel_lists (
      id,
      organization_id,
      supervisor_id,
      consolidated_at,
      parcel_count,
      latitude,
      longitude,
      status,
      cluster_name,
      tracking_code,
      created_at
    )
    VALUES (
      v_parcel_list_id,
      p_organization_id,
      p_supervisor_id,
      NOW(),
      v_cluster_count,
      v_avg_lat,
      v_avg_lng,
      'pending',
      'Cluster-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING(v_parcel_list_id::text, 1, 8),
      'CONSOLIDATED-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(v_parcel_list_id::text, 1, 6),
      NOW()
    );

    INSERT INTO public.parcel_list_items (parcel_list_id, parcel_id, sequence)
    SELECT
      v_parcel_list_id,
      parcel_id,
      seq
    FROM UNNEST(v_parcel_ids) WITH ORDINALITY AS t(parcel_id, seq)
    ON CONFLICT DO NOTHING;

    RETURN QUERY SELECT v_parcel_list_id, v_cluster_count, v_avg_lat, v_avg_lng;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_route_organization_from_rider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rider_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL OR TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.rider_id IS DISTINCT FROM OLD.rider_id) THEN
    SELECT r.organization_id
    INTO NEW.organization_id
    FROM public.riders r
    WHERE r.id = NEW.rider_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_route_snapshot_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.route_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL OR TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.route_id IS DISTINCT FROM OLD.route_id) THEN
    SELECT COALESCE(rt.organization_id, rd.organization_id)
    INTO NEW.organization_id
    FROM public.routes rt
    LEFT JOIN public.riders rd ON rd.id = rt.rider_id
    WHERE rt.id = NEW.route_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_latest_route_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.routes
  SET
    latest_snapshot_id = NEW.id,
    planned_distance_m = NEW.distance_m,
    planned_duration_s = NEW.duration_s,
    updated_at = NOW()
  WHERE id = NEW.route_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_rider_current_location_from_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.latitude < -90 OR NEW.latitude > 90 THEN
    RETURN NEW;
  END IF;

  IF NEW.longitude < -180 OR NEW.longitude > 180 THEN
    RETURN NEW;
  END IF;

  UPDATE public.riders
  SET
    current_latitude = NEW.latitude,
    current_longitude = NEW.longitude,
    current_location_accuracy = NEW.accuracy,
    current_location_at = NEW.timestamp,
    updated_at = NOW()
  WHERE id = NEW.rider_id
    AND (
      current_location_at IS NULL
      OR NEW.timestamp >= current_location_at
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_delivery_shipment_tracking_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.shipment_tracking_id IS NOT NULL AND btrim(NEW.shipment_tracking_id) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT pl.tracking_code
  INTO NEW.shipment_tracking_id
  FROM public.parcel_lists pl
  WHERE pl.id = COALESCE(NEW.parcel_id, NEW.parcel_cluster_id, NEW.parcel_list_id)
  LIMIT 1;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_delivery_stop_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_delivery_from_stop_rollup(p_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_completed integer := 0;
  v_max_delivered_at timestamp with time zone := NULL;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE lower(COALESCE(ds.status, 'pending')) = 'completed')::integer,
    MAX(ds.delivered_at)
  INTO v_total, v_completed, v_max_delivered_at
  FROM public.delivery_stops ds
  WHERE ds.delivery_id = p_delivery_id;

  UPDATE public.deliveries d
  SET
    delivery_stops_total = v_total,
    delivery_stops_completed = v_completed,
    status = CASE
      WHEN v_total > 0 AND v_completed >= v_total THEN 'completed'
      WHEN v_completed > 0 THEN 'in_progress'
      WHEN v_total > 0 THEN 'pending'
      ELSE d.status
    END,
    completed_at = CASE
      WHEN v_total > 0 AND v_completed >= v_total THEN COALESCE(v_max_delivered_at, NOW())
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE d.id = p_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_delivery_stop_change_rollup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_delivery_from_stop_rollup(COALESCE(NEW.delivery_id, OLD.delivery_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_completed_delivery_stop_side_effects(
  p_delivery_id uuid,
  p_stop_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_delivery record;
  v_stop record;
  v_item_price numeric := 0;
  v_delivery_fee numeric := 0;
  v_revenue numeric := 0;
  v_payout numeric := 0;
  v_reference text;
  v_notes text;
  v_delivery_time timestamp with time zone := NOW();
  v_cluster_name text;
BEGIN
  SELECT
    d.id,
    d.rider_id,
    d.route_id,
    d.parcel_id,
    d.parcel_cluster_id,
    d.parcel_list_id,
    d.shipment_tracking_id,
    d.delivery_type,
    r.organization_id,
    rd.profile_id AS rider_profile_id
  INTO v_delivery
  FROM public.deliveries d
  LEFT JOIN public.routes r
    ON r.id = d.route_id
  LEFT JOIN public.riders rd
    ON rd.id = d.rider_id
  WHERE d.id = p_delivery_id
  LIMIT 1;

  IF v_delivery.id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_stop
  FROM public.delivery_stops ds
  WHERE ds.id = p_stop_id
    AND ds.delivery_id = p_delivery_id
  LIMIT 1;

  IF v_stop.id IS NULL THEN
    RETURN;
  END IF;

  v_delivery_time := COALESCE(v_stop.delivered_at, NOW());

  IF v_stop.parcel_id IS NOT NULL THEN
    UPDATE public.parcels p
    SET
      status = 'delivered',
      rider_id = COALESCE(v_delivery.rider_id, p.rider_id)
    WHERE p.id = v_stop.parcel_id;
  END IF;

  IF v_delivery.delivery_type = 'parcel' THEN
    UPDATE public.parcel_lists pl
    SET
      status = 'completed',
      actual_delivery_at = v_delivery_time
    WHERE pl.id = COALESCE(v_delivery.parcel_id, v_delivery.parcel_list_id)
      AND COALESCE(pl.status, 'pending') <> 'completed';
  END IF;

  IF v_delivery.parcel_cluster_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.delivery_stops ds
      WHERE ds.delivery_id = v_delivery.id
        AND lower(COALESCE(ds.status, 'pending')) NOT IN ('completed', 'cancelled', 'failed')
    ) THEN
      SELECT NULLIF(btrim(pl.cluster_name), '')
      INTO v_cluster_name
      FROM public.parcel_lists pl
      WHERE pl.id = v_delivery.parcel_cluster_id
      LIMIT 1;

      UPDATE public.parcel_lists pl
      SET
        status = 'completed',
        actual_delivery_at = v_delivery_time
      WHERE (
        pl.id = v_delivery.parcel_cluster_id
        OR (
          v_cluster_name IS NOT NULL
          AND lower(btrim(COALESCE(pl.cluster_name, ''))) = lower(v_cluster_name)
        )
      )
        AND (v_delivery.organization_id IS NULL OR pl.organization_id = v_delivery.organization_id)
        AND lower(COALESCE(pl.status, 'pending')) NOT IN ('completed', 'delivered', 'cancelled', 'failed');
    END IF;
  END IF;

  SELECT
    COALESCE(pl.item_price, 0),
    COALESCE(pl.delivery_fee, 0)
  INTO v_item_price, v_delivery_fee
  FROM public.parcel_lists pl
  WHERE pl.id = COALESCE(v_stop.parcel_list_id, v_delivery.parcel_id, v_delivery.parcel_list_id, v_delivery.parcel_cluster_id)
  LIMIT 1;

  v_revenue := COALESCE(v_item_price, 0) + COALESCE(v_delivery_fee, 0);
  v_payout := CASE WHEN v_revenue > 0 THEN ROUND(v_revenue * 0.35, 2) ELSE 0 END;

  IF v_delivery.rider_id IS NOT NULL THEN
    INSERT INTO public.analytics (
      rider_id,
      today_earnings,
      today_deliveries_completed,
      today_deliveries_total,
      this_week_earnings,
      this_week_deliveries,
      on_time_percentage,
      created_at,
      updated_at
    ) VALUES (
      v_delivery.rider_id,
      v_revenue,
      1,
      1,
      v_revenue,
      1,
      100,
      NOW(),
      NOW()
    )
    ON CONFLICT (rider_id)
    DO UPDATE SET
      today_earnings = COALESCE(analytics.today_earnings, 0) + EXCLUDED.today_earnings,
      today_deliveries_completed = COALESCE(analytics.today_deliveries_completed, 0) + 1,
      today_deliveries_total = GREATEST(
        COALESCE(analytics.today_deliveries_total, 0),
        COALESCE(analytics.today_deliveries_completed, 0) + 1
      ),
      this_week_earnings = COALESCE(analytics.this_week_earnings, 0) + EXCLUDED.this_week_earnings,
      this_week_deliveries = COALESCE(analytics.this_week_deliveries, 0) + 1,
      updated_at = NOW();
  END IF;

  IF v_delivery.organization_id IS NULL THEN
    RETURN;
  END IF;

  v_reference := COALESCE(NULLIF(btrim(v_stop.shipment_tracking_id), ''), NULLIF(btrim(v_delivery.shipment_tracking_id), ''), v_delivery.id::text);
  v_notes := CONCAT('Auto-generated from completed delivery stop ', v_stop.id::text);

  IF to_regclass('public.finance_billing_entries') IS NOT NULL AND v_revenue > 0 THEN
    BEGIN
      INSERT INTO public.finance_billing_entries (
        organization_id,
        reference_label,
        amount,
        status,
        billed_at,
        paid_at,
        notes,
        created_by
      ) VALUES (
        v_delivery.organization_id,
        v_reference,
        v_revenue,
        'PAID',
        v_delivery_time,
        v_delivery_time,
        v_notes,
        v_delivery.rider_profile_id
      );
    EXCEPTION
      WHEN undefined_column THEN
        INSERT INTO public.finance_billing_entries (
          organization_id,
          reference_label,
          amount,
          status,
          billed_at,
          paid_at,
          notes
        ) VALUES (
          v_delivery.organization_id,
          v_reference,
          v_revenue,
          'PAID',
          v_delivery_time,
          v_delivery_time,
          v_notes
        );
    END;
  END IF;

  IF to_regclass('public.finance_payout_entries') IS NOT NULL AND v_payout > 0 THEN
    BEGIN
      INSERT INTO public.finance_payout_entries (
        organization_id,
        rider_id,
        payout_type,
        amount,
        status,
        payout_date,
        reference,
        created_by
      ) VALUES (
        v_delivery.organization_id,
        v_delivery.rider_id,
        'BASE_PAY',
        v_payout,
        'PAID',
        v_delivery_time,
        v_reference,
        v_delivery.rider_profile_id
      );
    EXCEPTION
      WHEN undefined_column THEN
        INSERT INTO public.finance_payout_entries (
          organization_id,
          rider_id,
          payout_type,
          amount,
          status,
          payout_date,
          reference
        ) VALUES (
          v_delivery.organization_id,
          v_delivery.rider_id,
          'BASE_PAY',
          v_payout,
          'PAID',
          v_delivery_time,
          v_reference
        );
    END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_delivery_stop_completed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(COALESCE(NEW.status, 'pending')) = 'completed'
     AND lower(COALESCE(OLD.status, 'pending')) <> 'completed' THEN
    PERFORM public.apply_completed_delivery_stop_side_effects(NEW.delivery_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_stop_for_parcel_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target_parcel_list_id uuid;
  v_tracking_code text;
  v_address text;
  v_lat double precision;
  v_lng double precision;
  v_weight double precision;
BEGIN
  IF NEW.delivery_type = 'cluster' OR NEW.parcel_cluster_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.delivery_stops ds WHERE ds.delivery_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_target_parcel_list_id := COALESCE(NEW.parcel_id, NEW.parcel_list_id);

  IF v_target_parcel_list_id IS NOT NULL THEN
    SELECT
      pl.tracking_code,
      pl.address,
      pl.latitude,
      pl.longitude,
      pl.weight_kg
    INTO v_tracking_code, v_address, v_lat, v_lng, v_weight
    FROM public.parcel_lists pl
    WHERE pl.id = v_target_parcel_list_id
    LIMIT 1;
  END IF;

  INSERT INTO public.delivery_stops (
    delivery_id,
    stop_sequence,
    parcel_id,
    parcel_list_id,
    shipment_tracking_id,
    destination_address,
    destination_latitude,
    destination_longitude,
    weight_kg,
    status,
    delivered_at
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.sequence, 0), 1),
    NULL,
    v_target_parcel_list_id,
    COALESCE(NULLIF(btrim(NEW.shipment_tracking_id), ''), v_tracking_code, NEW.id::text),
    v_address,
    v_lat,
    v_lng,
    v_weight,
    CASE
      WHEN lower(COALESCE(NEW.status, 'pending')) = 'completed' THEN 'completed'
      ELSE 'pending'
    END,
    CASE
      WHEN lower(COALESCE(NEW.status, 'pending')) = 'completed' THEN COALESCE(NEW.completed_at, NEW.updated_at, NOW())
      ELSE NULL
    END
  )
  ON CONFLICT (delivery_id, stop_sequence) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_delivery_stop(
  p_delivery_id uuid,
  p_stop_id uuid DEFAULT NULL,
  p_shipment_tracking_id text DEFAULT NULL
)
RETURNS TABLE (
  delivery_id uuid,
  completed_stop_id uuid,
  shipment_tracking_id text,
  delivery_status text,
  remaining_stops integer,
  completed_stops integer,
  total_stops integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_stop public.delivery_stops%ROWTYPE;
BEGIN
  SELECT ds.*
  INTO v_target_stop
  FROM public.delivery_stops ds
  WHERE ds.delivery_id = p_delivery_id
    AND (p_stop_id IS NULL OR ds.id = p_stop_id)
    AND (
      p_shipment_tracking_id IS NULL
      OR lower(COALESCE(ds.shipment_tracking_id, '')) = lower(trim(p_shipment_tracking_id))
    )
    AND lower(COALESCE(ds.status, 'pending')) NOT IN ('completed', 'cancelled', 'failed')
  ORDER BY ds.stop_sequence ASC
  LIMIT 1;

  IF v_target_stop.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.delivery_stops ds
  SET
    status = 'completed',
    delivered_at = COALESCE(ds.delivered_at, NOW()),
    updated_at = NOW()
  WHERE ds.id = v_target_stop.id;

  RETURN QUERY
  SELECT
    d.id,
    v_target_stop.id,
    COALESCE(NULLIF(btrim(v_target_stop.shipment_tracking_id), ''), NULLIF(btrim(d.shipment_tracking_id), ''), d.id::text) AS shipment_tracking_id,
    d.status,
    GREATEST(COALESCE(d.delivery_stops_total, 0) - COALESCE(d.delivery_stops_completed, 0), 0) AS remaining_stops,
    COALESCE(d.delivery_stops_completed, 0) AS completed_stops,
    COALESCE(d.delivery_stops_total, 0) AS total_stops
  FROM public.deliveries d
  WHERE d.id = p_delivery_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_delivery_live_tracking(p_lookup text)
RETURNS TABLE (
  delivery_id uuid,
  route_id uuid,
  rider_id uuid,
  shipment_tracking_id text,
  delivery_status text,
  destination_address text,
  destination_latitude double precision,
  destination_longitude double precision,
  rider_latitude double precision,
  rider_longitude double precision,
  rider_location_at timestamp with time zone
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized_input AS (
    SELECT lower(trim(p_lookup)) AS q
  )
  SELECT
    d.id AS delivery_id,
    d.route_id,
    d.rider_id,
    COALESCE(next_stop.shipment_tracking_id, d.shipment_tracking_id, pl.tracking_code) AS shipment_tracking_id,
    d.status AS delivery_status,
    COALESCE(next_stop.destination_address, pl.address) AS destination_address,
    COALESCE(next_stop.destination_latitude, pl.latitude) AS destination_latitude,
    COALESCE(next_stop.destination_longitude, pl.longitude) AS destination_longitude,
    r.current_latitude AS rider_latitude,
    r.current_longitude AS rider_longitude,
    r.current_location_at AS rider_location_at
  FROM public.deliveries d
  LEFT JOIN LATERAL (
    SELECT
      ds.shipment_tracking_id,
      ds.destination_address,
      ds.destination_latitude,
      ds.destination_longitude
    FROM public.delivery_stops ds
    WHERE ds.delivery_id = d.id
      AND lower(COALESCE(ds.status, 'pending')) NOT IN ('completed', 'cancelled', 'failed')
    ORDER BY ds.stop_sequence ASC
    LIMIT 1
  ) AS next_stop ON true
  LEFT JOIN public.parcel_lists pl
    ON pl.id = COALESCE(d.parcel_id, d.parcel_cluster_id, d.parcel_list_id)
  LEFT JOIN public.riders r
    ON r.id = d.rider_id
  CROSS JOIN normalized_input ni
  WHERE ni.q IS NOT NULL
    AND ni.q <> ''
    AND (
      lower(COALESCE(next_stop.shipment_tracking_id, '')) = ni.q
      OR
      lower(COALESCE(d.shipment_tracking_id, '')) = ni.q
      OR lower(COALESCE(pl.tracking_code, '')) = ni.q
      OR lower(d.id::text) = ni.q
      OR lower(COALESCE(d.parcel_id::text, '')) = ni.q
      OR lower(COALESCE(d.parcel_cluster_id::text, '')) = ni.q
      OR lower(COALESCE(d.parcel_list_id::text, '')) = ni.q
    )
  ORDER BY d.created_at DESC
  LIMIT 1;
$$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_riders_set_updated_at ON public.riders;
CREATE TRIGGER trg_riders_set_updated_at
BEFORE UPDATE ON public.riders
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_supervisors_set_updated_at ON public.supervisors;
CREATE TRIGGER trg_supervisors_set_updated_at
BEFORE UPDATE ON public.supervisors
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_routes_set_updated_at ON public.routes;
CREATE TRIGGER trg_routes_set_updated_at
BEFORE UPDATE ON public.routes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_route_snapshots_set_updated_at ON public.route_snapshots;
CREATE TRIGGER trg_route_snapshots_set_updated_at
BEFORE UPDATE ON public.route_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_geofences_set_updated_at ON public.geofences;
CREATE TRIGGER trg_geofences_set_updated_at
BEFORE UPDATE ON public.geofences
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sync_route_organization ON public.routes;
CREATE TRIGGER trg_sync_route_organization
BEFORE INSERT OR UPDATE OF rider_id, organization_id
ON public.routes
FOR EACH ROW
EXECUTE FUNCTION public.sync_route_organization_from_rider();

DROP TRIGGER IF EXISTS trg_sync_route_snapshot_organization ON public.route_snapshots;
CREATE TRIGGER trg_sync_route_snapshot_organization
BEFORE INSERT OR UPDATE OF route_id, organization_id
ON public.route_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.sync_route_snapshot_organization();

DROP TRIGGER IF EXISTS trg_set_latest_route_snapshot ON public.route_snapshots;
CREATE TRIGGER trg_set_latest_route_snapshot
AFTER INSERT
ON public.route_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.set_latest_route_snapshot();

DROP TRIGGER IF EXISTS trg_sync_rider_current_location_on_log ON public.location_logs;
CREATE TRIGGER trg_sync_rider_current_location_on_log
AFTER INSERT OR UPDATE OF latitude, longitude, accuracy, timestamp
ON public.location_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_rider_current_location_from_log();

DROP TRIGGER IF EXISTS trg_sync_delivery_shipment_tracking_id ON public.deliveries;
CREATE TRIGGER trg_sync_delivery_shipment_tracking_id
BEFORE INSERT OR UPDATE OF parcel_id, parcel_cluster_id, parcel_list_id, shipment_tracking_id
ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.sync_delivery_shipment_tracking_id();

DROP TRIGGER IF EXISTS trg_default_stop_for_parcel_delivery ON public.deliveries;
CREATE TRIGGER trg_default_stop_for_parcel_delivery
AFTER INSERT ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.ensure_default_stop_for_parcel_delivery();

DROP TRIGGER IF EXISTS trg_delivery_stops_touch_updated_at ON public.delivery_stops;
CREATE TRIGGER trg_delivery_stops_touch_updated_at
BEFORE UPDATE ON public.delivery_stops
FOR EACH ROW
EXECUTE FUNCTION public.touch_delivery_stop_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_rollup_from_stops ON public.delivery_stops;
CREATE TRIGGER trg_delivery_rollup_from_stops
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_stops
FOR EACH ROW
EXECUTE FUNCTION public.after_delivery_stop_change_rollup();

DROP TRIGGER IF EXISTS trg_delivery_stop_completed ON public.delivery_stops;
CREATE TRIGGER trg_delivery_stop_completed
AFTER UPDATE OF status ON public.delivery_stops
FOR EACH ROW
EXECUTE FUNCTION public.after_delivery_stop_completed();

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
    EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';
  END IF;
END;
$$;

UPDATE public.deliveries d
SET shipment_tracking_id = pl.tracking_code
FROM public.parcel_lists pl
WHERE pl.id = COALESCE(d.parcel_id, d.parcel_cluster_id, d.parcel_list_id)
  AND (
    d.shipment_tracking_id IS NULL
    OR btrim(d.shipment_tracking_id) = ''
  );

UPDATE public.deliveries d
SET
  parcel_cluster_id = COALESCE(d.parcel_cluster_id, CASE WHEN d.parcel_id IS NULL THEN d.parcel_list_id ELSE NULL END),
  delivery_type = CASE
    WHEN COALESCE(d.parcel_cluster_id, CASE WHEN d.parcel_id IS NULL THEN d.parcel_list_id ELSE NULL END) IS NOT NULL
      THEN 'cluster'
    ELSE 'parcel'
  END,
  updated_at = NOW();

UPDATE public.deliveries d
SET
  delivery_stops_total = COALESCE(s.total_stops, 0),
  delivery_stops_completed = COALESCE(s.completed_stops, 0),
  status = CASE
    WHEN COALESCE(s.total_stops, 0) > 0 AND COALESCE(s.completed_stops, 0) >= COALESCE(s.total_stops, 0)
      THEN 'completed'
    WHEN COALESCE(s.completed_stops, 0) > 0
      THEN 'in_progress'
    ELSE d.status
  END,
  completed_at = CASE
    WHEN COALESCE(s.total_stops, 0) > 0 AND COALESCE(s.completed_stops, 0) >= COALESCE(s.total_stops, 0)
      THEN COALESCE(s.max_delivered_at, d.completed_at, NOW())
    ELSE NULL
  END,
  updated_at = NOW()
FROM (
  SELECT
    ds.delivery_id,
    COUNT(*)::integer AS total_stops,
    COUNT(*) FILTER (WHERE lower(COALESCE(ds.status, 'pending')) = 'completed')::integer AS completed_stops,
    MAX(ds.delivered_at) AS max_delivered_at
  FROM public.delivery_stops ds
  GROUP BY ds.delivery_id
) s
WHERE d.id = s.delivery_id;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcel_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcel_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_geofence_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directions_cache ENABLE ROW LEVEL SECURITY;

-- Organizations
DROP POLICY IF EXISTS organizations_select_all ON public.organizations;
CREATE POLICY organizations_select_all
ON public.organizations FOR SELECT
USING (true);

DROP POLICY IF EXISTS organizations_service_role_all ON public.organizations;
CREATE POLICY organizations_service_role_all
ON public.organizations FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
ON public.profiles FOR SELECT
USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_supervisor_select_org_riders ON public.profiles;
CREATE POLICY profiles_supervisor_select_org_riders
ON public.profiles FOR SELECT
USING (
  id IN (
    SELECT r.profile_id
    FROM public.riders r
    WHERE r.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS profiles_service_role_all ON public.profiles;
CREATE POLICY profiles_service_role_all
ON public.profiles FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Supervisors
DROP POLICY IF EXISTS supervisors_select_own ON public.supervisors;
CREATE POLICY supervisors_select_own
ON public.supervisors FOR SELECT
USING (profile_id = auth.uid());

DROP POLICY IF EXISTS supervisors_update_own ON public.supervisors;
CREATE POLICY supervisors_update_own
ON public.supervisors FOR UPDATE
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS supervisors_service_role_all ON public.supervisors;
CREATE POLICY supervisors_service_role_all
ON public.supervisors FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Riders
DROP POLICY IF EXISTS riders_select_own ON public.riders;
CREATE POLICY riders_select_own
ON public.riders FOR SELECT
USING (profile_id = auth.uid());

DROP POLICY IF EXISTS riders_select_supervisor_org ON public.riders;
CREATE POLICY riders_select_supervisor_org
ON public.riders FOR SELECT
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS riders_insert_own ON public.riders;
CREATE POLICY riders_insert_own
ON public.riders FOR INSERT
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS riders_update_own ON public.riders;
CREATE POLICY riders_update_own
ON public.riders FOR UPDATE
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS riders_update_supervisor_org ON public.riders;
CREATE POLICY riders_update_supervisor_org
ON public.riders FOR UPDATE
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS riders_service_role_all ON public.riders;
CREATE POLICY riders_service_role_all
ON public.riders FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Parcels
DROP POLICY IF EXISTS parcels_select_rider ON public.parcels;
CREATE POLICY parcels_select_rider
ON public.parcels FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS parcels_select_supervisor_org ON public.parcels;
CREATE POLICY parcels_select_supervisor_org
ON public.parcels FOR SELECT
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS parcels_service_role_all ON public.parcels;
CREATE POLICY parcels_service_role_all
ON public.parcels FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Parcel Lists
DROP POLICY IF EXISTS parcel_lists_select_rider_delivery ON public.parcel_lists;
CREATE POLICY parcel_lists_select_rider_delivery
ON public.parcel_lists FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.deliveries d
    WHERE (
      d.parcel_list_id = parcel_lists.id
      OR d.parcel_id = parcel_lists.id
      OR d.parcel_cluster_id = parcel_lists.id
    )
      AND d.rider_id IN (
        SELECT r.id
        FROM public.riders r
        WHERE r.profile_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS parcel_lists_select_supervisor_org ON public.parcel_lists;
CREATE POLICY parcel_lists_select_supervisor_org
ON public.parcel_lists FOR SELECT
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
  OR (
    organization_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS parcel_lists_insert_supervisor_org ON public.parcel_lists;
CREATE POLICY parcel_lists_insert_supervisor_org
ON public.parcel_lists FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
  AND (supervisor_id IS NULL OR supervisor_id = auth.uid())
);

DROP POLICY IF EXISTS parcel_lists_update_supervisor_org ON public.parcel_lists;
CREATE POLICY parcel_lists_update_supervisor_org
ON public.parcel_lists FOR UPDATE
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS parcel_lists_update_acquire_unassigned ON public.parcel_lists;
CREATE POLICY parcel_lists_update_acquire_unassigned
ON public.parcel_lists FOR UPDATE
USING (organization_id IS NULL)
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS parcel_lists_service_role_all ON public.parcel_lists;
CREATE POLICY parcel_lists_service_role_all
ON public.parcel_lists FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Parcel List Items
DROP POLICY IF EXISTS parcel_list_items_select_supervisor_org ON public.parcel_list_items;
CREATE POLICY parcel_list_items_select_supervisor_org
ON public.parcel_list_items FOR SELECT
USING (
  parcel_list_id IN (
    SELECT pl.id
    FROM public.parcel_lists pl
    WHERE pl.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS parcel_list_items_insert_supervisor_org ON public.parcel_list_items;
CREATE POLICY parcel_list_items_insert_supervisor_org
ON public.parcel_list_items FOR INSERT
WITH CHECK (
  parcel_list_id IN (
    SELECT pl.id
    FROM public.parcel_lists pl
    WHERE pl.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS parcel_list_items_service_role_all ON public.parcel_list_items;
CREATE POLICY parcel_list_items_service_role_all
ON public.parcel_list_items FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Routes
DROP POLICY IF EXISTS routes_select_rider ON public.routes;
CREATE POLICY routes_select_rider
ON public.routes FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS routes_select_supervisor_org ON public.routes;
CREATE POLICY routes_select_supervisor_org
ON public.routes FOR SELECT
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS routes_insert_rider ON public.routes;
CREATE POLICY routes_insert_rider
ON public.routes FOR INSERT
WITH CHECK (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS routes_insert_supervisor_org ON public.routes;
CREATE POLICY routes_insert_supervisor_org
ON public.routes FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS routes_update_rider ON public.routes;
CREATE POLICY routes_update_rider
ON public.routes FOR UPDATE
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
)
WITH CHECK (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS routes_update_supervisor_org ON public.routes;
CREATE POLICY routes_update_supervisor_org
ON public.routes FOR UPDATE
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS routes_service_role_all ON public.routes;
CREATE POLICY routes_service_role_all
ON public.routes FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Route Snapshots
DROP POLICY IF EXISTS route_snapshots_select_rider ON public.route_snapshots;
CREATE POLICY route_snapshots_select_rider
ON public.route_snapshots FOR SELECT
USING (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS route_snapshots_select_supervisor_org ON public.route_snapshots;
CREATE POLICY route_snapshots_select_supervisor_org
ON public.route_snapshots FOR SELECT
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS route_snapshots_insert_rider ON public.route_snapshots;
CREATE POLICY route_snapshots_insert_rider
ON public.route_snapshots FOR INSERT
WITH CHECK (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS route_snapshots_insert_supervisor_org ON public.route_snapshots;
CREATE POLICY route_snapshots_insert_supervisor_org
ON public.route_snapshots FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS route_snapshots_update_rider ON public.route_snapshots;
CREATE POLICY route_snapshots_update_rider
ON public.route_snapshots FOR UPDATE
USING (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
)
WITH CHECK (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS route_snapshots_update_supervisor_org ON public.route_snapshots;
CREATE POLICY route_snapshots_update_supervisor_org
ON public.route_snapshots FOR UPDATE
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS route_snapshots_service_role_all ON public.route_snapshots;
CREATE POLICY route_snapshots_service_role_all
ON public.route_snapshots FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Deliveries
DROP POLICY IF EXISTS deliveries_select_rider ON public.deliveries;
CREATE POLICY deliveries_select_rider
ON public.deliveries FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
  OR route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS deliveries_select_supervisor_org ON public.deliveries;
CREATE POLICY deliveries_select_supervisor_org
ON public.deliveries FOR SELECT
USING (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS deliveries_insert_rider ON public.deliveries;
CREATE POLICY deliveries_insert_rider
ON public.deliveries FOR INSERT
WITH CHECK (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS deliveries_insert_supervisor_org ON public.deliveries;
CREATE POLICY deliveries_insert_supervisor_org
ON public.deliveries FOR INSERT
WITH CHECK (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS deliveries_update_rider ON public.deliveries;
CREATE POLICY deliveries_update_rider
ON public.deliveries FOR UPDATE
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
)
WITH CHECK (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS deliveries_update_supervisor_org ON public.deliveries;
CREATE POLICY deliveries_update_supervisor_org
ON public.deliveries FOR UPDATE
USING (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
)
WITH CHECK (
  route_id IN (
    SELECT rt.id
    FROM public.routes rt
    WHERE rt.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS deliveries_service_role_all ON public.deliveries;
CREATE POLICY deliveries_service_role_all
ON public.deliveries FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Delivery Stops
DROP POLICY IF EXISTS delivery_stops_select_rider ON public.delivery_stops;
CREATE POLICY delivery_stops_select_rider
ON public.delivery_stops FOR SELECT
USING (
  delivery_id IN (
    SELECT d.id
    FROM public.deliveries d
    WHERE d.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS delivery_stops_select_supervisor_org ON public.delivery_stops;
CREATE POLICY delivery_stops_select_supervisor_org
ON public.delivery_stops FOR SELECT
USING (
  delivery_id IN (
    SELECT d.id
    FROM public.deliveries d
    JOIN public.routes rt ON rt.id = d.route_id
    WHERE rt.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS delivery_stops_insert_rider ON public.delivery_stops;
CREATE POLICY delivery_stops_insert_rider
ON public.delivery_stops FOR INSERT
WITH CHECK (
  delivery_id IN (
    SELECT d.id
    FROM public.deliveries d
    WHERE d.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS delivery_stops_insert_supervisor_org ON public.delivery_stops;
CREATE POLICY delivery_stops_insert_supervisor_org
ON public.delivery_stops FOR INSERT
WITH CHECK (
  delivery_id IN (
    SELECT d.id
    FROM public.deliveries d
    JOIN public.routes rt ON rt.id = d.route_id
    WHERE rt.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS delivery_stops_update_rider ON public.delivery_stops;
CREATE POLICY delivery_stops_update_rider
ON public.delivery_stops FOR UPDATE
USING (
  delivery_id IN (
    SELECT d.id
    FROM public.deliveries d
    WHERE d.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
)
WITH CHECK (
  delivery_id IN (
    SELECT d.id
    FROM public.deliveries d
    WHERE d.rider_id IN (
      SELECT r.id
      FROM public.riders r
      WHERE r.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS delivery_stops_update_supervisor_org ON public.delivery_stops;
CREATE POLICY delivery_stops_update_supervisor_org
ON public.delivery_stops FOR UPDATE
USING (
  delivery_id IN (
    SELECT d.id
    FROM public.deliveries d
    JOIN public.routes rt ON rt.id = d.route_id
    WHERE rt.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
)
WITH CHECK (
  delivery_id IN (
    SELECT d.id
    FROM public.deliveries d
    JOIN public.routes rt ON rt.id = d.route_id
    WHERE rt.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS delivery_stops_service_role_all ON public.delivery_stops;
CREATE POLICY delivery_stops_service_role_all
ON public.delivery_stops FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Analytics
DROP POLICY IF EXISTS analytics_select_rider ON public.analytics;
CREATE POLICY analytics_select_rider
ON public.analytics FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS analytics_select_supervisor_org ON public.analytics;
CREATE POLICY analytics_select_supervisor_org
ON public.analytics FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS analytics_service_role_all ON public.analytics;
CREATE POLICY analytics_service_role_all
ON public.analytics FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Geofences
DROP POLICY IF EXISTS geofences_select_org_users ON public.geofences;
CREATE POLICY geofences_select_org_users
ON public.geofences FOR SELECT
USING (
  organization_id IN (
    SELECT r.organization_id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
    UNION
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS geofences_insert_supervisor_org ON public.geofences;
CREATE POLICY geofences_insert_supervisor_org
ON public.geofences FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS geofences_update_supervisor_org ON public.geofences;
CREATE POLICY geofences_update_supervisor_org
ON public.geofences FOR UPDATE
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS geofences_service_role_all ON public.geofences;
CREATE POLICY geofences_service_role_all
ON public.geofences FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Geofence Events
DROP POLICY IF EXISTS geofence_events_select_rider ON public.geofence_events;
CREATE POLICY geofence_events_select_rider
ON public.geofence_events FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS geofence_events_select_supervisor_org ON public.geofence_events;
CREATE POLICY geofence_events_select_supervisor_org
ON public.geofence_events FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS geofence_events_insert_rider ON public.geofence_events;
CREATE POLICY geofence_events_insert_rider
ON public.geofence_events FOR INSERT
WITH CHECK (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS geofence_events_service_role_all ON public.geofence_events;
CREATE POLICY geofence_events_service_role_all
ON public.geofence_events FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Rider Geofence State
DROP POLICY IF EXISTS rider_geofence_state_select_rider ON public.rider_geofence_state;
CREATE POLICY rider_geofence_state_select_rider
ON public.rider_geofence_state FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS rider_geofence_state_select_supervisor_org ON public.rider_geofence_state;
CREATE POLICY rider_geofence_state_select_supervisor_org
ON public.rider_geofence_state FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS rider_geofence_state_service_role_all ON public.rider_geofence_state;
CREATE POLICY rider_geofence_state_service_role_all
ON public.rider_geofence_state FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Location Logs
DROP POLICY IF EXISTS location_logs_select_rider ON public.location_logs;
CREATE POLICY location_logs_select_rider
ON public.location_logs FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS location_logs_select_supervisor_org ON public.location_logs;
CREATE POLICY location_logs_select_supervisor_org
ON public.location_logs FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.organization_id IN (
      SELECT s.organization_id
      FROM public.supervisors s
      WHERE s.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS location_logs_insert_rider ON public.location_logs;
CREATE POLICY location_logs_insert_rider
ON public.location_logs FOR INSERT
WITH CHECK (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS location_logs_service_role_all ON public.location_logs;
CREATE POLICY location_logs_service_role_all
ON public.location_logs FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Notifications
DROP POLICY IF EXISTS notifications_select_rider ON public.notifications;
CREATE POLICY notifications_select_rider
ON public.notifications FOR SELECT
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS notifications_select_supervisor_org ON public.notifications;
CREATE POLICY notifications_select_supervisor_org
ON public.notifications FOR SELECT
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS notifications_update_rider ON public.notifications;
CREATE POLICY notifications_update_rider
ON public.notifications FOR UPDATE
USING (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
)
WITH CHECK (
  rider_id IN (
    SELECT r.id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS notifications_update_supervisor_org ON public.notifications;
CREATE POLICY notifications_update_supervisor_org
ON public.notifications FOR UPDATE
USING (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS notifications_service_role_all ON public.notifications;
CREATE POLICY notifications_service_role_all
ON public.notifications FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Violations
DROP POLICY IF EXISTS violations_select_org_users ON public.violations;
CREATE POLICY violations_select_org_users
ON public.violations FOR SELECT
USING (
  organization_id IN (
    SELECT r.organization_id
    FROM public.riders r
    WHERE r.profile_id = auth.uid()
    UNION
    SELECT s.organization_id
    FROM public.supervisors s
    WHERE s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS violations_service_role_all ON public.violations;
CREATE POLICY violations_service_role_all
ON public.violations FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Directions Cache
DROP POLICY IF EXISTS directions_cache_service_role_all ON public.directions_cache;
CREATE POLICY directions_cache_service_role_all
ON public.directions_cache FOR ALL TO service_role
USING (true)
WITH CHECK (true);

COMMIT;
