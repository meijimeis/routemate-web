-- =============================================================================
-- ROUTEMATE DUMMY DATA SEED (PHILIPPINES LAND-ONLY)
-- =============================================================================
-- Scope:
-- - Seeds a large volume of dummy data for most tables.
-- - Intentionally DOES NOT INSERT into:
--   public.profiles, public.riders, public.supervisors
--   because those are linked to auth.users.
--
-- Safety for coordinates:
-- - All generated parcel/parcel_list/geofence/violation coordinates are anchored
--   to known Philippine city centers and only jittered slightly (~130m to ~180m).
-- - A post-seed bounding-box validation is included.
--
-- Re-runnable:
-- - Uses deterministic IDs and ON CONFLICT DO NOTHING / UPSERT patterns.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION pg_temp.seed_uuid(p_text text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5(p_text), 1, 8) || '-' ||
    substr(md5(p_text), 9, 4) || '-' ||
    substr(md5(p_text), 13, 4) || '-' ||
    substr(md5(p_text), 17, 4) || '-' ||
    substr(md5(p_text), 21, 12)
  )::uuid;
$$;

CREATE TEMP TABLE ph_land_hubs (
  hub_id integer PRIMARY KEY,
  city text NOT NULL,
  region text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL
) ON COMMIT DROP;

INSERT INTO ph_land_hubs (hub_id, city, region, lat, lng) VALUES
  (1,  'Baguio City',            'Benguet',                 16.4023, 120.5960),
  (2,  'La Trinidad',            'Benguet',                 16.4550, 120.5897),
  (3,  'Cabanatuan City',        'Nueva Ecija',             15.4860, 120.9660),
  (4,  'Gapan City',             'Nueva Ecija',             15.3072, 120.9462),
  (5,  'San Jose City',          'Nueva Ecija',             15.7900, 120.9914),
  (6,  'Tarlac City',            'Tarlac',                  15.4812, 120.5979),
  (7,  'Mabalacat City',         'Pampanga',                15.2230, 120.5711),
  (8,  'Angeles City',           'Pampanga',                15.1450, 120.5887),
  (9,  'Urdaneta City',          'Pangasinan',              15.9761, 120.5715),
  (10, 'Bayombong',              'Nueva Vizcaya',           16.4817, 121.1499),
  (11, 'Solano',                 'Nueva Vizcaya',           16.5193, 121.1814),
  (12, 'Santiago City',          'Isabela',                 16.6889, 121.5486),
  (13, 'Ilagan City',            'Isabela',                 17.1485, 121.8892),
  (14, 'Naga City',              'Camarines Sur',           13.6218, 123.1948),
  (15, 'Iriga City',             'Camarines Sur',           13.4324, 123.4149),
  (16, 'Lipa City',              'Batangas',                13.9411, 121.1631),
  (17, 'Tanauan City',           'Batangas',                14.0832, 121.1497),
  (18, 'Santa Rosa City',        'Laguna',                  14.3119, 121.1110),
  (19, 'Calamba City',           'Laguna',                  14.2117, 121.1653),
  (20, 'Antipolo City',          'Rizal',                   14.6255, 121.1245),
  (21, 'Marikina City',          'Metro Manila',            14.6507, 121.1029),
  (22, 'Quezon City',            'Metro Manila',            14.6760, 121.0437),
  (23, 'San Jose del Monte',     'Bulacan',                 14.8139, 121.0453),
  (24, 'Passi City',             'Iloilo',                  11.1086, 122.6410),
  (25, 'Canlaon City',           'Negros Oriental',         10.3869, 123.2227),
  (26, 'Valencia',               'Negros Oriental',          9.2812, 123.2458),
  (27, 'Malaybalay City',        'Bukidnon',                 8.1575, 125.1279),
  (28, 'Valencia City',          'Bukidnon',                 7.9069, 125.0928),
  (29, 'Maramag',                'Bukidnon',                 7.7630, 125.0050),
  (30, 'Kidapawan City',         'Cotabato',                 7.0083, 125.0893),
  (31, 'Koronadal City',         'South Cotabato',           6.5036, 124.8469),
  (32, 'Midsayap',               'Cotabato',                 7.1908, 124.5307),
  (33, 'Digos City',             'Davao del Sur',            6.7492, 125.3572),
  (34, 'Polomolok',              'South Cotabato',           6.2203, 125.0659),
  (35, 'Buluan',                 'Maguindanao del Sur',      6.7221, 124.8014);

-- -----------------------------------------------------------------------------
-- Organizations (12)
-- -----------------------------------------------------------------------------
INSERT INTO public.organizations (
  id,
  name,
  code,
  created_at,
  domain,
  type,
  logo_url
)
SELECT
  pg_temp.seed_uuid('seed-org-' || gs),
  'Routemate Demo Org ' || gs,
  'DMPH' || lpad(gs::text, 3, '0'),
  now() - ((gs * 2)::text || ' days')::interval,
  'demo' || lpad(gs::text, 3, '0') || '.routemate.ph',
  (ARRAY['Logistics', 'Retail', 'E-commerce'])[1 + ((gs - 1) % 3)],
  'https://picsum.photos/seed/rmorg' || gs || '/200/200'
FROM generate_series(1, 12) AS gs
ON CONFLICT (code) DO NOTHING;

CREATE TEMP TABLE seed_orgs ON COMMIT DROP AS
SELECT
  row_number() OVER (ORDER BY code) AS org_idx,
  id,
  code,
  name
FROM public.organizations
WHERE code LIKE 'DMPH%';

-- -----------------------------------------------------------------------------
-- Parcels (1,800)
-- -----------------------------------------------------------------------------
WITH counts AS (
  SELECT
    (SELECT count(*)::int FROM seed_orgs) AS org_count,
    (SELECT count(*)::int FROM ph_land_hubs) AS hub_count
)
INSERT INTO public.parcels (
  id,
  organization_id,
  rider_id,
  lat,
  lng,
  status,
  created_at
)
SELECT
  pg_temp.seed_uuid('seed-parcel-' || g),
  o.id,
  NULL,
  h.lat + (((g % 7) - 3) * 0.0012),
  h.lng + (((g % 9) - 4) * 0.0012),
  (ARRAY['unassigned', 'assigned', 'in_transit', 'delivered', 'failed', 'returned'])[1 + (g % 6)],
  now() - ((g % 90)::text || ' days')::interval - ((g % 24)::text || ' hours')::interval
FROM generate_series(1, 1800) AS g
CROSS JOIN counts c
JOIN seed_orgs o
  ON o.org_idx = 1 + ((g - 1) % c.org_count)
JOIN ph_land_hubs h
  ON h.hub_id = 1 + ((g - 1) % c.hub_count)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Parcel Lists (1,600)
-- -----------------------------------------------------------------------------
WITH counts AS (
  SELECT
    (SELECT count(*)::int FROM seed_orgs) AS org_count,
    (SELECT count(*)::int FROM ph_land_hubs) AS hub_count
),
seed AS (
  SELECT
    g,
    o.id AS organization_id,
    h.city,
    h.region,
    h.lat,
    h.lng,
    (ARRAY['unassigned', 'acquired', 'pending', 'assigned', 'in_transit', 'delivered', 'completed', 'cancelled'])[1 + (g % 8)] AS status,
    (ARRAY['cod', 'prepaid', 'wallet'])[1 + (g % 3)] AS payment_type,
    round((180 + ((g % 85) * 17.5))::numeric, 2) AS item_price,
    round((35 + ((g % 14) * 4.25))::numeric, 2) AS delivery_fee,
    now() - ((g % 60)::text || ' days')::interval - ((g % 18)::text || ' hours')::interval AS ordered_at
  FROM generate_series(1, 1600) AS g
  CROSS JOIN counts c
  JOIN seed_orgs o
    ON o.org_idx = 1 + ((g - 1) % c.org_count)
  JOIN ph_land_hubs h
    ON h.hub_id = 1 + ((g - 1) % c.hub_count)
)
INSERT INTO public.parcel_lists (
  id,
  organization_id,
  tracking_code,
  recipient_name,
  address,
  latitude,
  longitude,
  weight_kg,
  priority,
  payment_type,
  item_price,
  delivery_fee,
  cash_on_delivery_amount,
  ordered_at,
  estimated_delivery_at,
  actual_delivery_at,
  status,
  region,
  created_at,
  cluster_name,
  supervisor_id,
  consolidated_at,
  parcel_count,
  acquired_at
)
SELECT
  pg_temp.seed_uuid('seed-plist-' || g),
  organization_id,
  'RM-PH-' || lpad(g::text, 6, '0'),
  'Recipient ' || lpad(g::text, 6, '0'),
  'Blk ' || ((g % 120) + 1) || ' Lot ' || ((g % 40) + 1) || ', ' || city || ', ' || region || ', Philippines',
  lat + (((g % 5) - 2) * 0.0009),
  lng + (((g % 5) - 2) * 0.0009),
  round((0.4 + ((g % 65) * 0.15))::numeric, 2)::double precision,
  (ARRAY['Low', 'Medium', 'High'])[1 + (g % 3)],
  payment_type,
  item_price,
  delivery_fee,
  CASE
    WHEN payment_type = 'cod'
      THEN round((item_price + delivery_fee)::numeric, 2)
    ELSE NULL
  END,
  ordered_at,
  ordered_at + ((1 + (g % 6))::text || ' days')::interval,
  CASE
    WHEN status IN ('delivered', 'completed')
      THEN ordered_at + ((1 + (g % 6))::text || ' days')::interval + ((g % 9)::text || ' hours')::interval
    ELSE NULL
  END,
  status,
  region,
  ordered_at + ((g % 4)::text || ' hours')::interval,
  CASE
    WHEN status IN ('pending', 'assigned', 'in_transit', 'delivered', 'completed')
      THEN 'CL-' || to_char(current_date, 'YYMMDD') || '-' || lpad(((g % 180) + 1)::text, 3, '0')
    ELSE NULL
  END,
  NULL,
  CASE
    WHEN status IN ('pending', 'assigned', 'in_transit', 'delivered', 'completed')
      THEN ordered_at + ((1 + (g % 4))::text || ' days')::interval
    ELSE NULL
  END,
  CASE
    WHEN status IN ('pending', 'assigned', 'in_transit', 'delivered', 'completed')
      THEN 1 + (g % 6)
    ELSE 0
  END,
  CASE
    WHEN status = 'acquired'
      THEN ordered_at + ((g % 3)::text || ' days')::interval
    ELSE NULL
  END
FROM seed
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Parcel List Items (1,680 rows => 420 lists x 4 items each)
-- -----------------------------------------------------------------------------
INSERT INTO public.parcel_list_items (
  id,
  parcel_list_id,
  parcel_id,
  sequence,
  added_at
)
SELECT
  pg_temp.seed_uuid('seed-item-' || list_no || '-' || seq_no),
  pg_temp.seed_uuid('seed-plist-' || list_no),
  pg_temp.seed_uuid('seed-parcel-' || (((list_no - 1) * 4 + seq_no - 1) % 1800 + 1)),
  seq_no,
  now() - ((list_no % 20)::text || ' days')::interval
FROM generate_series(1, 420) AS list_no
CROSS JOIN generate_series(1, 4) AS seq_no
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Routes (420)
-- -----------------------------------------------------------------------------
WITH counts AS (
  SELECT (SELECT count(*)::int FROM seed_orgs) AS org_count
)
INSERT INTO public.routes (
  id,
  rider_id,
  organization_id,
  cluster_name,
  created_at,
  updated_at,
  status,
  planned_distance_m,
  planned_duration_s
)
SELECT
  pg_temp.seed_uuid('seed-route-' || g),
  NULL,
  o.id,
  'Route-Cluster-' || lpad(((g % 180) + 1)::text, 3, '0'),
  now() - ((g % 70)::text || ' days')::interval,
  now() - ((g % 25)::text || ' days')::interval,
  (ARRAY['draft', 'assigned', 'active', 'in_progress', 'completed', 'cancelled', 'failed'])[1 + (g % 7)],
  3500 + ((g % 140) * 180),
  900 + ((g % 140) * 35)
FROM generate_series(1, 420) AS g
CROSS JOIN counts c
JOIN seed_orgs o
  ON o.org_idx = 1 + ((g - 1) % c.org_count)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Deliveries (2,600 => first 260 routes x 10 deliveries)
-- -----------------------------------------------------------------------------
WITH seeded_deliveries AS (
  SELECT
    pg_temp.seed_uuid('seed-delivery-' || route_no || '-' || seq_no) AS delivery_id,
    pg_temp.seed_uuid('seed-route-' || route_no) AS route_id,
    NULL::uuid AS rider_id,
    seq_no AS sequence,
    (ARRAY['pending', 'accepted', 'en_route', 'arrived', 'completed', 'cancelled', 'failed'])[1 + ((route_no + seq_no) % 7)] AS delivery_status,
    now() - ((route_no % 60)::text || ' days')::interval - ((seq_no % 12)::text || ' hours')::interval AS created_at,
    now() - ((route_no % 20)::text || ' days')::interval AS updated_at,
    pg_temp.seed_uuid('seed-plist-' || (((route_no - 1) * 10 + seq_no - 1) % 1600 + 1)) AS parcel_list_id
  FROM generate_series(1, 260) AS route_no
  CROSS JOIN generate_series(1, 10) AS seq_no
),
enriched_seeded_deliveries AS (
  SELECT
    sd.*,
    pl.tracking_code,
    pl.address,
    pl.latitude,
    pl.longitude,
    pl.weight_kg
  FROM seeded_deliveries sd
  LEFT JOIN public.parcel_lists pl
    ON pl.id = sd.parcel_list_id
)
INSERT INTO public.deliveries (
  id,
  route_id,
  parcel_id,
  parcel_cluster_id,
  rider_id,
  sequence,
  status,
  created_at,
  updated_at,
  parcel_list_id,
  shipment_tracking_id,
  delivery_type,
  delivery_stops_total,
  delivery_stops_completed,
  completed_at
)
SELECT
  esd.delivery_id,
  esd.route_id,
  esd.parcel_list_id,
  NULL,
  esd.rider_id,
  esd.sequence,
  esd.delivery_status,
  esd.created_at,
  esd.updated_at,
  esd.parcel_list_id,
  COALESCE(esd.tracking_code, esd.delivery_id::text),
  'parcel',
  1,
  CASE WHEN esd.delivery_status = 'completed' THEN 1 ELSE 0 END,
  CASE WHEN esd.delivery_status = 'completed' THEN esd.updated_at ELSE NULL END
FROM enriched_seeded_deliveries esd
ON CONFLICT DO NOTHING;

WITH seeded_deliveries AS (
  SELECT
    pg_temp.seed_uuid('seed-delivery-' || route_no || '-' || seq_no) AS delivery_id,
    pg_temp.seed_uuid('seed-route-' || route_no) AS route_id,
    seq_no AS sequence,
    (ARRAY['pending', 'accepted', 'en_route', 'arrived', 'completed', 'cancelled', 'failed'])[1 + ((route_no + seq_no) % 7)] AS delivery_status,
    now() - ((route_no % 60)::text || ' days')::interval - ((seq_no % 12)::text || ' hours')::interval AS created_at,
    now() - ((route_no % 20)::text || ' days')::interval AS updated_at,
    pg_temp.seed_uuid('seed-plist-' || (((route_no - 1) * 10 + seq_no - 1) % 1600 + 1)) AS parcel_list_id
  FROM generate_series(1, 260) AS route_no
  CROSS JOIN generate_series(1, 10) AS seq_no
),
enriched_seeded_deliveries AS (
  SELECT
    sd.*,
    pl.tracking_code,
    pl.address,
    pl.latitude,
    pl.longitude,
    pl.weight_kg
  FROM seeded_deliveries sd
  LEFT JOIN public.parcel_lists pl
    ON pl.id = sd.parcel_list_id
)
INSERT INTO public.delivery_stops (
  id,
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
  delivered_at,
  created_at,
  updated_at
)
SELECT
  pg_temp.seed_uuid('seed-delivery-stop-' || esd.delivery_id::text || '-1'),
  esd.delivery_id,
  1,
  NULL,
  esd.parcel_list_id,
  COALESCE(esd.tracking_code, esd.delivery_id::text),
  esd.address,
  esd.latitude,
  esd.longitude,
  esd.weight_kg,
  CASE
    WHEN esd.delivery_status = 'completed' THEN 'completed'
    WHEN esd.delivery_status = 'cancelled' THEN 'cancelled'
    WHEN esd.delivery_status = 'failed' THEN 'failed'
    ELSE 'pending'
  END,
  CASE WHEN esd.delivery_status = 'completed' THEN esd.updated_at ELSE NULL END,
  esd.created_at,
  esd.updated_at
FROM enriched_seeded_deliveries esd
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Analytics (for existing riders only; no rider creation here)
-- -----------------------------------------------------------------------------
INSERT INTO public.analytics (
  id,
  rider_id,
  today_earnings,
  today_distance,
  today_deliveries_completed,
  today_deliveries_total,
  this_week_earnings,
  this_week_deliveries,
  on_time_percentage,
  created_at,
  updated_at
)
SELECT
  pg_temp.seed_uuid('seed-analytics-' || r.id::text),
  r.id,
  round((450 + ((row_number() OVER (ORDER BY r.id) % 25) * 35))::numeric, 2),
  round((18 + ((row_number() OVER (ORDER BY r.id) % 12) * 2.1))::numeric, 2),
  6 + (row_number() OVER (ORDER BY r.id) % 12),
  10 + (row_number() OVER (ORDER BY r.id) % 14),
  round((2800 + ((row_number() OVER (ORDER BY r.id) % 30) * 180))::numeric, 2),
  35 + (row_number() OVER (ORDER BY r.id) % 22),
  round((84 + ((row_number() OVER (ORDER BY r.id) % 14) * 0.9))::numeric, 2),
  now() - ((row_number() OVER (ORDER BY r.id) % 20)::text || ' days')::interval,
  now() - ((row_number() OVER (ORDER BY r.id) % 5)::text || ' days')::interval
FROM public.riders r
ON CONFLICT (rider_id) DO UPDATE
SET
  today_earnings = EXCLUDED.today_earnings,
  today_distance = EXCLUDED.today_distance,
  today_deliveries_completed = EXCLUDED.today_deliveries_completed,
  today_deliveries_total = EXCLUDED.today_deliveries_total,
  this_week_earnings = EXCLUDED.this_week_earnings,
  this_week_deliveries = EXCLUDED.this_week_deliveries,
  on_time_percentage = EXCLUDED.on_time_percentage,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Geofences (180)
-- -----------------------------------------------------------------------------
WITH hubs AS (
  SELECT *
  FROM (
    VALUES
      (1,  'Quezon City',      'Metro Manila',      14.6760::double precision, 121.0437::double precision, 0.055::numeric),
      (2,  'Makati City',      'Metro Manila',      14.5547::double precision, 121.0244::double precision, 0.050::numeric),
      (3,  'Manila City',      'Metro Manila',      14.5995::double precision, 120.9842::double precision, 0.050::numeric),
      (4,  'Pasig City',       'Metro Manila',      14.5764::double precision, 121.0851::double precision, 0.050::numeric),
      (5,  'Taguig City',      'Metro Manila',      14.5176::double precision, 121.0509::double precision, 0.050::numeric),
      (6,  'Cebu City',        'Cebu',              10.3157::double precision, 123.8854::double precision, 0.045::numeric),
      (7,  'Davao City',       'Davao del Sur',      7.1907::double precision, 125.4553::double precision, 0.050::numeric),
      (8,  'Iloilo City',      'Iloilo',            10.7202::double precision, 122.5621::double precision, 0.045::numeric),
      (9,  'Baguio City',      'Benguet',           16.4023::double precision, 120.5960::double precision, 0.040::numeric),
      (10, 'Cagayan de Oro',   'Misamis Oriental',   8.4542::double precision, 124.6319::double precision, 0.045::numeric),
      (11, 'Bacolod City',     'Negros Occidental', 10.6765::double precision, 122.9509::double precision, 0.045::numeric),
      (12, 'Naga City',        'Camarines Sur',     13.6218::double precision, 123.1948::double precision, 0.042::numeric)
  ) AS h(hub_id, city, region, lat, lng, base_half_span_deg)
),
counts AS (
  SELECT
    (SELECT count(*)::int FROM hubs) AS hub_count,
    (SELECT count(*)::int FROM seed_orgs) AS org_count
),
params AS (
  -- Metro Manila geofences receive extra span so they overlap each other.
  SELECT 0.028::numeric AS metro_overlap_boost_deg
),
seed_rows AS (
  SELECT
    g,
    md5('seed-geofence-' || g) AS seed_hash
  FROM generate_series(1, 180) AS g
),
geofence_seed AS (
  SELECT
    s.g,
    s.seed_hash,
    o.id AS organization_id,
    h.city,
    h.region,
    h.lat,
    h.lng,
    CASE
      WHEN h.region = 'Metro Manila' THEN h.base_half_span_deg + p.metro_overlap_boost_deg
      ELSE h.base_half_span_deg
    END AS half_span_deg
  FROM seed_rows s
  CROSS JOIN counts c
  CROSS JOIN params p
  JOIN seed_orgs o
    ON o.org_idx = 1 + ((s.g - 1) % c.org_count)
  JOIN hubs h
    ON h.hub_id = 1 + ((s.g - 1) % c.hub_count)
)
INSERT INTO public.geofences (
  id,
  organization_id,
  name,
  geometry,
  severity,
  is_active,
  created_at,
  zone_type,
  allow_exit,
  max_dwell_minutes,
  required_entry,
  rules,
  updated_at
)
SELECT
  (
    substr(gs.seed_hash, 1, 8) || '-' ||
    substr(gs.seed_hash, 9, 4) || '-' ||
    substr(gs.seed_hash, 13, 4) || '-' ||
    substr(gs.seed_hash, 17, 4) || '-' ||
    substr(gs.seed_hash, 21, 12)
  )::uuid,
  gs.organization_id,
  'GeoHub-' || lpad(gs.g::text, 3, '0') || ' ' || gs.city,
  jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(
      jsonb_build_array(
        jsonb_build_array(round((gs.lng - gs.half_span_deg)::numeric, 6), round((gs.lat - gs.half_span_deg)::numeric, 6)),
        jsonb_build_array(round((gs.lng + gs.half_span_deg)::numeric, 6), round((gs.lat - gs.half_span_deg)::numeric, 6)),
        jsonb_build_array(round((gs.lng + gs.half_span_deg)::numeric, 6), round((gs.lat + gs.half_span_deg)::numeric, 6)),
        jsonb_build_array(round((gs.lng - gs.half_span_deg)::numeric, 6), round((gs.lat + gs.half_span_deg)::numeric, 6)),
        jsonb_build_array(round((gs.lng - gs.half_span_deg)::numeric, 6), round((gs.lat - gs.half_span_deg)::numeric, 6))
      )
    )
  ),
  (ARRAY['info', 'warning', 'critical'])[1 + (gs.g % 3)],
  (gs.g % 9) <> 0,
  now() - ((gs.g % 80)::text || ' days')::interval,
  (ARRAY['RESTRICTED', 'DELIVERY', 'DEPOT', 'NO_PARKING', 'SERVICE_AREA'])[1 + (gs.g % 5)],
  (gs.g % 4) = 0,
  10 + (gs.g % 45),
  (gs.g % 3) = 0,
  jsonb_build_object(
    'hub', gs.city,
    'region', gs.region,
    'source', 'dummy_seed_ph_land',
    'priority', (ARRAY['low', 'medium', 'high'])[1 + (gs.g % 3)],
    'halfSpanDeg', gs.half_span_deg,
    'metroOverlapBoosted', (gs.region = 'Metro Manila')
  ),
  now() - ((gs.g % 10)::text || ' days')::interval
FROM geofence_seed gs
ON CONFLICT (id) DO UPDATE
SET
  organization_id = EXCLUDED.organization_id,
  name = EXCLUDED.name,
  geometry = EXCLUDED.geometry,
  severity = EXCLUDED.severity,
  is_active = EXCLUDED.is_active,
  zone_type = EXCLUDED.zone_type,
  allow_exit = EXCLUDED.allow_exit,
  max_dwell_minutes = EXCLUDED.max_dwell_minutes,
  required_entry = EXCLUDED.required_entry,
  rules = EXCLUDED.rules,
  updated_at = EXCLUDED.updated_at;

-- -----------------------------------------------------------------------------
-- Geofence Events (2,400)
-- -----------------------------------------------------------------------------
INSERT INTO public.geofence_events (
  id,
  rider_id,
  parcel_id,
  geofence_id,
  zone_name,
  event_type,
  created_at
)
SELECT
  pg_temp.seed_uuid('seed-gf-event-' || g),
  NULL,
  pg_temp.seed_uuid('seed-parcel-' || (((g - 1) % 1800) + 1)),
  pg_temp.seed_uuid('seed-geofence-' || (((g - 1) % 180) + 1)),
  'GeoHub-' || lpad((((g - 1) % 180) + 1)::text, 3, '0'),
  (ARRAY['enter', 'exit', 'dwell'])[1 + (g % 3)],
  now() - ((g % 45)::text || ' days')::interval - ((g % 24)::text || ' hours')::interval
FROM generate_series(1, 2400) AS g
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Rider Geofence State (for existing riders only; no rider creation here)
-- -----------------------------------------------------------------------------
WITH rider_rows AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM public.riders
)
INSERT INTO public.rider_geofence_state (
  rider_id,
  geofence_id,
  is_inside,
  last_changed
)
SELECT
  r.id,
  pg_temp.seed_uuid('seed-geofence-' || (((r.rn + gf_no - 1) % 180) + 1)),
  ((r.rn + gf_no) % 2) = 0,
  now() - (((r.rn + gf_no) % 15)::text || ' days')::interval
FROM rider_rows r
CROSS JOIN generate_series(1, 3) AS gf_no
ON CONFLICT (rider_id, geofence_id) DO UPDATE
SET
  is_inside = EXCLUDED.is_inside,
  last_changed = EXCLUDED.last_changed;

-- -----------------------------------------------------------------------------
-- Location Logs (for existing riders only; no rider creation here)
-- -----------------------------------------------------------------------------
WITH rider_rows AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM public.riders
),
hub_count AS (
  SELECT count(*)::int AS c FROM ph_land_hubs
)
INSERT INTO public.location_logs (
  id,
  rider_id,
  latitude,
  longitude,
  accuracy,
  timestamp,
  created_at
)
SELECT
  pg_temp.seed_uuid('seed-loc-' || r.id::text || '-' || tick),
  r.id,
  h.lat + (((tick % 5) - 2) * 0.0007),
  h.lng + (((tick % 5) - 2) * 0.0007),
  4 + (tick % 12),
  (now() - ((tick * 10)::text || ' minutes')::interval)::timestamp without time zone,
  (now() - ((tick * 10)::text || ' minutes')::interval)::timestamp without time zone
FROM rider_rows r
CROSS JOIN hub_count hc
JOIN ph_land_hubs h
  ON h.hub_id = 1 + ((r.rn - 1) % hc.c)
CROSS JOIN generate_series(1, 24) AS tick
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Notifications (2,600)
-- -----------------------------------------------------------------------------
WITH counts AS (
  SELECT
    (SELECT count(*)::int FROM seed_orgs) AS org_count,
    (SELECT count(*)::int FROM ph_land_hubs) AS hub_count
)
INSERT INTO public.notifications (
  id,
  organization_id,
  rider_id,
  type,
  severity,
  message,
  location,
  metadata,
  acknowledged,
  created_at,
  geofence_id
)
SELECT
  pg_temp.seed_uuid('seed-notif-' || g),
  o.id,
  NULL,
  (ARRAY['delivery', 'geofence', 'route', 'system'])[1 + (g % 4)],
  (ARRAY['info', 'warning', 'critical'])[1 + (g % 3)],
  'Demo alert ' || g || ' for ' || o.name,
  h.city || ', ' || h.region || ', Philippines',
  jsonb_build_object(
    'source', 'dummy_seed_ph_land',
    'hub', h.city,
    'eta_minutes', (g % 45) + 5,
    'priority', (ARRAY['low', 'medium', 'high'])[1 + (g % 3)]
  ),
  (g % 6) = 0,
  now() - ((g % 35)::text || ' days')::interval - ((g % 24)::text || ' hours')::interval,
  CASE WHEN (g % 2) = 0 THEN pg_temp.seed_uuid('seed-geofence-' || (((g - 1) % 180) + 1)) ELSE NULL END
FROM generate_series(1, 2600) AS g
CROSS JOIN counts c
JOIN seed_orgs o
  ON o.org_idx = 1 + ((g - 1) % c.org_count)
JOIN ph_land_hubs h
  ON h.hub_id = 1 + ((g - 1) % c.hub_count)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Violations (2,200)
-- -----------------------------------------------------------------------------
WITH counts AS (
  SELECT
    (SELECT count(*)::int FROM seed_orgs) AS org_count,
    (SELECT count(*)::int FROM ph_land_hubs) AS hub_count
)
INSERT INTO public.violations (
  id,
  organization_id,
  rider_name,
  zone_name,
  lat,
  lng,
  violation_type,
  base_severity,
  traffic_level,
  created_at,
  geofence_id
)
SELECT
  pg_temp.seed_uuid('seed-viol-' || g),
  o.id,
  'Rider ' || lpad((((g - 1) % 500) + 1)::text, 3, '0'),
  'GeoHub-' || lpad((((g - 1) % 180) + 1)::text, 3, '0'),
  h.lat + (((g % 5) - 2) * 0.0011),
  h.lng + (((g % 5) - 2) * 0.0011),
  (ARRAY[
    'ZONE_EXIT_UNAUTHORIZED',
    'ZONE_OVERSTAY',
    'ZONE_MISSED_ENTRY',
    'PARCEL_DELAY_RISK',
    'TRAFFIC_DELAY_IMPACT',
    'TRAFFIC_RE_ROUTE_REQUIRED'
  ])[1 + (g % 6)],
  (ARRAY['info', 'warning', 'critical'])[1 + (g % 3)],
  (ARRAY['LOW', 'MODERATE', 'HEAVY', 'SEVERE'])[1 + (g % 4)],
  now() - ((g % 35)::text || ' days')::interval - ((g % 24)::text || ' hours')::interval,
  CASE WHEN (g % 3) = 0 THEN pg_temp.seed_uuid('seed-geofence-' || (((g - 1) % 180) + 1)) ELSE NULL END
FROM generate_series(1, 2200) AS g
CROSS JOIN counts c
JOIN seed_orgs o
  ON o.org_idx = 1 + ((g - 1) % c.org_count)
JOIN ph_land_hubs h
  ON h.hub_id = 1 + ((g - 1) % c.hub_count)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Directions Cache (320)
-- -----------------------------------------------------------------------------
WITH counts AS (
  SELECT (SELECT count(*)::int FROM ph_land_hubs) AS hub_count
)
INSERT INTO public.directions_cache (
  cache_key,
  request_fingerprint,
  profile,
  waypoints,
  waypoint_indexes,
  geometry,
  distance_m,
  duration_s,
  segments,
  is_road_snapped,
  expires_at,
  hit_count,
  created_at,
  last_hit_at
)
SELECT
  'seed-cache-' || lpad(g::text, 4, '0'),
  'seed-fingerprint-' || lpad(g::text, 4, '0'),
  (ARRAY['driving-car', 'driving-hgv', 'cycling-regular', 'foot-walking'])[1 + (g % 4)],
  jsonb_build_array(
    jsonb_build_array(h1.lng, h1.lat),
    jsonb_build_array(h2.lng, h2.lat)
  ),
  ARRAY[0, 1],
  jsonb_build_object(
    'type', 'LineString',
    'coordinates', jsonb_build_array(
      jsonb_build_array(h1.lng, h1.lat),
      jsonb_build_array(h2.lng, h2.lat)
    )
  ),
  2500 + ((g % 120) * 95),
  600 + ((g % 120) * 20),
  jsonb_build_array(
    jsonb_build_object('distance_m', 1200 + (g % 500), 'duration_s', 300 + (g % 200)),
    jsonb_build_object('distance_m', 1300 + (g % 500), 'duration_s', 320 + (g % 200))
  ),
  true,
  now() + ((20 + (g % 45))::text || ' days')::interval,
  (g % 75),
  now() - ((g % 18)::text || ' days')::interval,
  now() - ((g % 3)::text || ' days')::interval
FROM generate_series(1, 320) AS g
CROSS JOIN counts c
JOIN ph_land_hubs h1
  ON h1.hub_id = 1 + ((g - 1) % c.hub_count)
JOIN ph_land_hubs h2
  ON h2.hub_id = 1 + ((g + 7) % c.hub_count)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Route Snapshots (520 => first 260 routes x 2 snapshots)
-- -----------------------------------------------------------------------------
WITH counts AS (
  SELECT
    (SELECT count(*)::int FROM seed_orgs) AS org_count,
    (SELECT count(*)::int FROM ph_land_hubs) AS hub_count
)
INSERT INTO public.route_snapshots (
  id,
  route_id,
  organization_id,
  profile,
  cache_key,
  waypoints,
  waypoint_indexes,
  geometry,
  distance_m,
  duration_s,
  segments,
  is_road_snapped,
  source,
  created_by,
  created_at,
  updated_at
)
SELECT
  pg_temp.seed_uuid('seed-snapshot-' || route_no || '-' || snap_no),
  pg_temp.seed_uuid('seed-route-' || route_no),
  o.id,
  (ARRAY['driving-car', 'driving-hgv', 'cycling-regular', 'foot-walking'])[1 + ((route_no + snap_no) % 4)],
  'seed-cache-' || lpad((((route_no * snap_no) % 320) + 1)::text, 4, '0'),
  jsonb_build_array(
    jsonb_build_array(h1.lng, h1.lat),
    jsonb_build_array(hm.lng, hm.lat),
    jsonb_build_array(h2.lng, h2.lat)
  ),
  ARRAY[0, 1, 2],
  jsonb_build_object(
    'type', 'LineString',
    'coordinates', jsonb_build_array(
      jsonb_build_array(h1.lng, h1.lat),
      jsonb_build_array(hm.lng, hm.lat),
      jsonb_build_array(h2.lng, h2.lat)
    )
  ),
  5000 + ((route_no % 180) * 110),
  1000 + ((route_no % 180) * 25),
  jsonb_build_array(
    jsonb_build_object('distance_m', 2000 + (route_no % 400), 'duration_s', 450 + (route_no % 220)),
    jsonb_build_object('distance_m', 3000 + (route_no % 400), 'duration_s', 550 + (route_no % 220))
  ),
  true,
  (ARRAY['ors', 'cache', 'manual'])[1 + ((route_no + snap_no) % 3)],
  NULL,
  now() - ((route_no % 20)::text || ' days')::interval - ((snap_no)::text || ' hours')::interval,
  now() - ((route_no % 10)::text || ' days')::interval
FROM generate_series(1, 260) AS route_no
CROSS JOIN generate_series(1, 2) AS snap_no
CROSS JOIN counts c
JOIN seed_orgs o
  ON o.org_idx = 1 + ((route_no - 1) % c.org_count)
JOIN ph_land_hubs h1
  ON h1.hub_id = 1 + ((route_no - 1) % c.hub_count)
JOIN ph_land_hubs hm
  ON hm.hub_id = 1 + ((route_no + 7) % c.hub_count)
JOIN ph_land_hubs h2
  ON h2.hub_id = 1 + ((route_no + 14) % c.hub_count)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Coordinate Safety Check (PH bounding box)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_parcels int;
  v_bad_parcel_lists int;
  v_bad_violations int;
BEGIN
  SELECT count(*)
  INTO v_bad_parcels
  FROM public.parcels p
  JOIN seed_orgs o ON o.id = p.organization_id
  WHERE NOT (p.lat BETWEEN 5.0 AND 21.0 AND p.lng BETWEEN 116.0 AND 127.5);

  SELECT count(*)
  INTO v_bad_parcel_lists
  FROM public.parcel_lists pl
  JOIN seed_orgs o ON o.id = pl.organization_id
  WHERE NOT (pl.latitude BETWEEN 5.0 AND 21.0 AND pl.longitude BETWEEN 116.0 AND 127.5);

  SELECT count(*)
  INTO v_bad_violations
  FROM public.violations v
  JOIN seed_orgs o ON o.id = v.organization_id
  WHERE NOT (v.lat BETWEEN 5.0 AND 21.0 AND v.lng BETWEEN 116.0 AND 127.5);

  IF v_bad_parcels > 0 OR v_bad_parcel_lists > 0 OR v_bad_violations > 0 THEN
    RAISE EXCEPTION
      'Coordinate check failed. parcels=%, parcel_lists=%, violations=%',
      v_bad_parcels, v_bad_parcel_lists, v_bad_violations;
  END IF;
END;
$$;

COMMIT;

-- Optional quick check after running:
-- SELECT
--   (SELECT count(*) FROM public.organizations WHERE code LIKE 'DMPH%') AS seeded_orgs,
--   (SELECT count(*) FROM public.parcels p JOIN public.organizations o ON o.id = p.organization_id WHERE o.code LIKE 'DMPH%') AS seeded_parcels,
--   (SELECT count(*) FROM public.parcel_lists pl JOIN public.organizations o ON o.id = pl.organization_id WHERE o.code LIKE 'DMPH%') AS seeded_parcel_lists,
--   (SELECT count(*) FROM public.geofences g JOIN public.organizations o ON o.id = g.organization_id WHERE o.code LIKE 'DMPH%') AS seeded_geofences,
--   (SELECT count(*) FROM public.notifications n JOIN public.organizations o ON o.id = n.organization_id WHERE o.code LIKE 'DMPH%') AS seeded_notifications;
