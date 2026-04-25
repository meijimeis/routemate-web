/**
 * Supabase Data Queries for Dashboard, Parcels, Routes, Finance, Analytics, Drivers, Notifications
 * Fetch real data from Supabase tables filtered by organization
 */

import { supabase } from './supabaseClient';

/**
 * ===== GENERAL UTILITIES =====
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DELIVERY_BASE_SELECT = `
  id,
  route_id,
  parcel_id,
  parcel_cluster_id,
  parcel_list_id,
  shipment_tracking_id,
  delivery_type,
  delivery_stops_total,
  delivery_stops_completed,
  completed_at,
  rider_id,
  sequence,
  status,
  created_at,
  updated_at
`;

const DELIVERY_BASE_SELECT_LEGACY = `
  id,
  route_id,
  parcel_id,
  parcel_list_id,
  shipment_tracking_id,
  completed_at,
  rider_id,
  sequence,
  status,
  created_at,
  updated_at
`;

const DELIVERY_STOPS_SELECT = `
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
`;

const DELIVERY_WITH_PARCEL_SELECT = `
  ${DELIVERY_BASE_SELECT},
  parcel_lists_by_parcel_id:parcel_lists!deliveries_parcel_id_fkey (
    id,
    tracking_code,
    address,
    latitude,
    longitude,
    weight_kg,
    status
  ),
  parcel_lists_by_parcel_list_id:parcel_lists!deliveries_parcel_list_id_fkey (
    id,
    tracking_code,
    address,
    latitude,
    longitude,
    weight_kg,
    status
  ),
  parcel_lists_by_parcel_cluster_id:parcel_lists!deliveries_parcel_cluster_id_fkey (
    id,
    tracking_code,
    cluster_name,
    address,
    latitude,
    longitude,
    weight_kg,
    parcel_count,
    status
  )
`;

const DELIVERY_LOOKUP_SELECT = `
  ${DELIVERY_WITH_PARCEL_SELECT},
  routes (
    id,
    rider_id,
    cluster_name,
    status,
    created_at
  ),
  riders (
    id,
    organization_id,
    current_latitude,
    current_longitude,
    current_location_at,
    profiles:profile_id (
      full_name
    )
  )
`;

const firstRow = (value) => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

const normalizeDeliveryRow = (row) => {
  if (!row || typeof row !== 'object') return row;

  const {
    parcel_lists_by_parcel_id,
    parcel_lists_by_parcel_list_id,
    parcel_lists_by_parcel_cluster_id,
    parcel_lists,
    parcel_clusters,
    riders,
    routes,
    ...rest
  } = row;

  const directParcel = firstRow(parcel_lists);
  const directParcelCluster = firstRow(parcel_clusters);

  const parcel =
    firstRow(parcel_lists_by_parcel_id) ||
    firstRow(parcel_lists_by_parcel_list_id) ||
    firstRow(parcel_lists_by_parcel_cluster_id) ||
    directParcel ||
    directParcelCluster ||
    null;

  const parcelCluster = firstRow(parcel_lists_by_parcel_cluster_id) || directParcelCluster;

  const rider = firstRow(riders);
  const route = firstRow(routes);
  const riderProfile = firstRow(rider?.profiles);

  return {
    ...rest,
    parcel_lists: parcel,
    riders: rider
      ? {
          ...rider,
          profiles: riderProfile || null,
        }
      : null,
    parcel_clusters: parcelCluster || null,
    routes: route || null,
  };
};

const isMissingDeliveryParcelRelationshipError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (code === 'PGRST200' || code === 'PGRST201') {
    return true;
  }

  return (
    message.includes("could not find a relationship between 'deliveries' and 'parcel_lists'") ||
    (message.includes('relationship') &&
      message.includes('deliveries') &&
      message.includes('parcel_lists') &&
      message.includes('schema cache'))
  );
};

const isMissingDeliveryClusterColumnError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (code === '42703') {
    return true;
  }

  return message.includes('parcel_cluster_id') && message.includes('column');
};

const isMissingDeliveryStopsRelationError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') {
    return true;
  }

  return (
    message.includes('delivery_stops') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
};

const enrichDeliveriesWithParcelListRows = async (rows = [], label = 'Deliveries') => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (normalizedRows.length === 0) return [];

  const parcelListIds = Array.from(
    new Set(
      normalizedRows
        .flatMap((row) => [row?.parcel_id, row?.parcel_cluster_id, row?.parcel_list_id])
        .filter((id) => typeof id === 'string' && id.length > 0)
    )
  );

  if (parcelListIds.length === 0) {
    return normalizedRows;
  }

  const { data, error } = await supabase
    .from('parcel_lists')
    .select('id, tracking_code, cluster_name, address, latitude, longitude, weight_kg, parcel_count, status')
    .in('id', parcelListIds);

  if (error) {
    console.warn(`[Supabase] ${label} parcel-list enrichment warning:`, error.message);
    return normalizedRows;
  }

  const parcelById = new Map(
    (Array.isArray(data) ? data : [])
      .filter((parcel) => typeof parcel?.id === 'string' && parcel.id.length > 0)
      .map((parcel) => [parcel.id, parcel])
  );

  return normalizedRows.map((row) => {
    const parcel =
      parcelById.get(row?.parcel_id) ||
      parcelById.get(row?.parcel_list_id) ||
      parcelById.get(row?.parcel_cluster_id) ||
      firstRow(row?.parcel_lists) ||
      null;

    const parcelCluster =
      parcelById.get(row?.parcel_cluster_id) || firstRow(row?.parcel_clusters) || null;

    return {
      ...row,
      parcel_lists: parcel,
      parcel_clusters: parcelCluster,
    };
  });
};

const queryDeliveriesWithParcelFallback = async (
  queryFactory,
  label,
  selectClause = DELIVERY_WITH_PARCEL_SELECT
) => {
  const primaryResponse = await queryFactory(selectClause);
  if (!primaryResponse?.error) {
    return {
      rows: (primaryResponse.data || []).map(normalizeDeliveryRow).filter(Boolean),
      error: null,
    };
  }

  if (isMissingDeliveryClusterColumnError(primaryResponse.error)) {
    const legacyResponse = await queryFactory(DELIVERY_BASE_SELECT_LEGACY);

    if (legacyResponse?.error) {
      return {
        rows: [],
        error: legacyResponse.error,
      };
    }

    const normalizedLegacyRows = (legacyResponse.data || []).map(normalizeDeliveryRow).filter(Boolean);
    const enrichedLegacyRows = await enrichDeliveriesWithParcelListRows(normalizedLegacyRows, label);

    return {
      rows: enrichedLegacyRows,
      error: null,
    };
  }

  if (!isMissingDeliveryParcelRelationshipError(primaryResponse.error)) {
    return {
      rows: [],
      error: primaryResponse.error,
    };
  }

  const fallbackResponse = await queryFactory(DELIVERY_BASE_SELECT);
  if (fallbackResponse?.error && isMissingDeliveryClusterColumnError(fallbackResponse.error)) {
    const legacyResponse = await queryFactory(DELIVERY_BASE_SELECT_LEGACY);

    if (legacyResponse?.error) {
      return {
        rows: [],
        error: legacyResponse.error,
      };
    }

    const normalizedLegacyRows = (legacyResponse.data || []).map(normalizeDeliveryRow).filter(Boolean);
    const enrichedLegacyRows = await enrichDeliveriesWithParcelListRows(normalizedLegacyRows, label);

    return {
      rows: enrichedLegacyRows,
      error: null,
    };
  }

  if (fallbackResponse?.error) {
    return {
      rows: [],
      error: fallbackResponse.error,
    };
  }

  const normalizedFallbackRows = (fallbackResponse.data || []).map(normalizeDeliveryRow).filter(Boolean);
  const enrichedRows = await enrichDeliveriesWithParcelListRows(normalizedFallbackRows, label);

  return {
    rows: enrichedRows,
    error: null,
  };
};

const attachDeliveryStops = async (rows = [], label = 'Deliveries') => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (normalizedRows.length === 0) return [];

  const deliveryIds = Array.from(
    new Set(
      normalizedRows
        .map((row) => row?.id)
        .filter((id) => typeof id === 'string' && id.length > 0)
    )
  );

  if (deliveryIds.length === 0) {
    return normalizedRows;
  }

  const { data, error } = await supabase
    .from('delivery_stops')
    .select(DELIVERY_STOPS_SELECT)
    .in('delivery_id', deliveryIds)
    .order('stop_sequence', { ascending: true });

  if (error) {
    if (!isMissingDeliveryStopsRelationError(error)) {
      console.warn(`[Supabase] ${label} stop attachment warning:`, error.message);
    }

    return normalizedRows.map((row) => ({
      ...row,
      delivery_stops: Array.isArray(row?.delivery_stops) ? row.delivery_stops : [],
    }));
  }

  const stopsByDeliveryId = new Map();

  (Array.isArray(data) ? data : []).forEach((stop) => {
    const deliveryId = typeof stop?.delivery_id === 'string' ? stop.delivery_id : null;
    if (!deliveryId) return;

    if (!stopsByDeliveryId.has(deliveryId)) {
      stopsByDeliveryId.set(deliveryId, []);
    }

    stopsByDeliveryId.get(deliveryId).push(stop);
  });

  return normalizedRows.map((row) => ({
    ...row,
    delivery_stops: stopsByDeliveryId.get(row.id) || [],
  }));
};

const hydrateDeliveriesWithClusterMemberData = async (rows = [], label = 'Deliveries') => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (normalizedRows.length === 0) return [];

  const memberParcelIds = Array.from(
    new Set(
      normalizedRows
        .map((row) => String(row?.shipment_tracking_id || '').trim())
        .filter((id) => UUID_REGEX.test(id))
    )
  );

  if (memberParcelIds.length === 0) {
    return normalizedRows;
  }

  const { data: memberParcels, error } = await supabase
    .from('parcels')
    .select('id, lat, lng, status')
    .in('id', memberParcelIds);

  if (error) {
    console.error(`[Supabase] ${label} cluster member hydration error:`, error.message);
    return normalizedRows;
  }

  const memberParcelById = new Map(
    (Array.isArray(memberParcels) ? memberParcels : [])
      .filter((parcel) => typeof parcel?.id === 'string' && parcel.id.length > 0)
      .map((parcel) => [parcel.id, parcel])
  );

  return normalizedRows.map((row) => {
    const memberParcelId = String(row?.shipment_tracking_id || '').trim();
    if (!UUID_REGEX.test(memberParcelId)) return row;

    const memberParcel = memberParcelById.get(memberParcelId);
    if (!memberParcel) return row;

    const baseParcel = row?.parcel_lists && typeof row.parcel_lists === 'object'
      ? row.parcel_lists
      : null;

    const latitude =
      typeof memberParcel?.lat === 'number' && Number.isFinite(memberParcel.lat)
        ? memberParcel.lat
        : baseParcel?.latitude ?? null;
    const longitude =
      typeof memberParcel?.lng === 'number' && Number.isFinite(memberParcel.lng)
        ? memberParcel.lng
        : baseParcel?.longitude ?? null;

    return {
      ...row,
      parcel_lists: {
        ...(baseParcel || {}),
        id: baseParcel?.id || memberParcelId,
        tracking_code: memberParcelId,
        address:
          typeof baseParcel?.address === 'string' && baseParcel.address.trim().length > 0
            ? baseParcel.address
            : `Cluster member ${memberParcelId.slice(0, 8)}`,
        latitude,
        longitude,
        status: memberParcel?.status || baseParcel?.status || row?.status || null,
      },
    };
  });
};

const FINANCE_COST_CATEGORY_META = {
  FUEL: { label: 'Fuel', colorClass: 'bg-[#8B5CF6]' },
  MAINTENANCE: { label: 'Maintenance', colorClass: 'bg-[#22C55E]' },
  INSURANCE: { label: 'Insurance', colorClass: 'bg-[#60A5FA]' },
  OTHER: { label: 'Other', colorClass: 'bg-[#F472B6]' },
};

const FINANCE_PAYOUT_TYPE_TO_LABEL = {
  BASE_PAY: 'Base Pay',
  INCENTIVE: 'Incentives',
  OVERTIME: 'Overtime',
};

const FINANCE_BILLING_STATUS_LABEL = {
  PAID: 'Paid',
  PENDING: 'Pending',
  OVERDUE: 'Overdue',
};

const ANALYTICS_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ANALYTICS_HOUR_BUCKET_LABELS = ['8AM', '12PM', '4PM', '8PM', '12AM'];
const DASHBOARD_TIME_RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

const COMPLETED_DELIVERY_STATUSES = new Set(['completed', 'delivered']);
const ACTIVE_DELIVERY_STATUSES = new Set(['pending', 'accepted', 'en_route', 'arrived']);
const FAILED_DELIVERY_STATUSES = new Set(['failed', 'cancelled', 'returned']);

const toTitleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');

const normalizeRegionLabel = (address) => {
  const raw = String(address || '').trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (upper.includes('METRO MANILA') || upper.includes('MANILA') || upper.includes('NCR')) {
    return 'Metro Manila';
  }
  if (upper.includes('CEBU')) return 'Cebu';
  if (upper.includes('DAVAO')) return 'Davao';
  if (upper.includes('LAGUNA')) return 'Laguna';
  if (upper.includes('BATANGAS')) return 'Batangas';

  const chunks = raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const candidate = chunks[chunks.length - 2] || chunks[chunks.length - 1] || chunks[0] || null;
  if (!candidate) return null;

  return toTitleCase(candidate);
};

const toWeekStartMs = (baseMs, weekOffset = 0) => {
  const date = new Date(baseMs);
  const day = date.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - mondayOffset + weekOffset * 7);
  return date.getTime();
};

const getHeatmapHourBucketIndex = (hour) => {
  if (hour >= 6 && hour < 10) return 0;
  if (hour >= 10 && hour < 14) return 1;
  if (hour >= 14 && hour < 18) return 2;
  if (hour >= 18 && hour < 22) return 3;
  return 4;
};

const getSeverityLevelForCount = (count, mediumThreshold, highThreshold) => {
  if (count >= highThreshold) return 'critical';
  if (count >= mediumThreshold) return 'warning';
  return 'info';
};

const toFiniteNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toDateMs = (value) => {
  const ms = new Date(value || '').getTime();
  return Number.isFinite(ms) ? ms : null;
};

const toIsoDateKey = (value) => {
  const ms = toDateMs(value);
  if (ms == null) return null;
  return new Date(ms).toISOString().slice(0, 10);
};

const toMonthKey = (value) => {
  const ms = toDateMs(value);
  if (ms == null) return null;
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const normalizeCostCategory = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'FUEL') return 'FUEL';
  if (normalized === 'MAINTENANCE') return 'MAINTENANCE';
  if (normalized === 'INSURANCE') return 'INSURANCE';
  return 'OTHER';
};

const normalizePayoutType = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'BASE_PAY') return 'BASE_PAY';
  if (normalized === 'INCENTIVE') return 'INCENTIVE';
  if (normalized === 'OVERTIME') return 'OVERTIME';
  return 'OTHER';
};

const normalizeBillingStatus = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PAID') return 'PAID';
  if (normalized === 'OVERDUE') return 'OVERDUE';
  return 'PENDING';
};

const toPercentDiff = (current, baseline) => {
  const safeCurrent = toFiniteNumber(current);
  const safeBaseline = toFiniteNumber(baseline);
  if (safeBaseline <= 0) {
    return safeCurrent > 0 ? 100 : 0;
  }
  return ((safeCurrent - safeBaseline) / safeBaseline) * 100;
};

const normalizeDashboardTimeRange = (value, fallback = '30d') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(DASHBOARD_TIME_RANGE_DAYS, normalized)) {
    return normalized;
  }

  return fallback;
};

const getDashboardRangeStartMs = (timeRange, nowMs = Date.now()) => {
  const normalized = normalizeDashboardTimeRange(timeRange);
  const dayCount = DASHBOARD_TIME_RANGE_DAYS[normalized];

  if (dayCount == null) return null;
  return nowMs - dayCount * 24 * 60 * 60 * 1000;
};

const normalizeDashboardRegionFilter = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'all';
  if (normalized.toLowerCase() === 'all' || normalized.toLowerCase() === 'all regions') {
    return 'all';
  }

  return normalizeRegionLabel(normalized) || normalized;
};

const matchesDashboardRegionFilter = (candidateRegionLabel, regionFilter) => {
  const normalizedFilter = normalizeDashboardRegionFilter(regionFilter);
  if (normalizedFilter === 'all') return true;

  const normalizedCandidate = normalizeRegionLabel(candidateRegionLabel);
  if (!normalizedCandidate) return false;

  return normalizedCandidate.toLowerCase() === normalizedFilter.toLowerCase();
};

const isWithinDashboardRange = (value, rangeStartMs) => {
  if (rangeStartMs == null) return true;

  const eventMs = toDateMs(value);
  if (eventMs == null) return false;

  return eventMs >= rangeStartMs;
};

const collectAvailableRegions = (...collections) => {
  const regionSet = new Set();

  collections.forEach((collection) => {
    if (!Array.isArray(collection)) return;

    collection.forEach((row) => {
      const region = normalizeRegionLabel(row?.region || row?.address || row?.location || row?.zone_name || row?.reference_label);
      if (region) {
        regionSet.add(region);
      }
    });
  });

  return Array.from(regionSet).sort((left, right) => left.localeCompare(right));
};

const isMissingRelationError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') {
    return true;
  }

  return (
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    (message.includes('schema cache') && message.includes('table'))
  );
};

const isMissingColumnError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42703' || (message.includes('column') && message.includes('does not exist'));
};

const fetchOptionalRows = async (queryPromise, label) => {
  try {
    const { data, error } = await queryPromise;
    if (error) {
      if (!isMissingRelationError(error)) {
        console.error(`[Supabase] ${label} fetch error:`, error.message);
      }
      return [];
    }

    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[Supabase] Unexpected ${label} fetch error:`, err);
    return [];
  }
};

const fetchOptionalRowsWithFallback = async (
  primaryQueryPromise,
  fallbackQueryFactory,
  label
) => {
  try {
    const { data, error } = await primaryQueryPromise;

    if (!error) {
      return Array.isArray(data) ? data : [];
    }

    if (isMissingColumnError(error) && typeof fallbackQueryFactory === 'function') {
      const { data: fallbackData, error: fallbackError } = await fallbackQueryFactory();

      if (fallbackError) {
        if (!isMissingRelationError(fallbackError)) {
          console.error(`[Supabase] ${label} fallback fetch error:`, fallbackError.message);
        }
        return [];
      }

      return Array.isArray(fallbackData)
        ? fallbackData.map((row) => ({ ...row, region: null }))
        : [];
    }

    if (!isMissingRelationError(error)) {
      console.error(`[Supabase] ${label} fetch error:`, error.message);
    }

    return [];
  } catch (err) {
    console.error(`[Supabase] Unexpected ${label} fetch error:`, err);
    return [];
  }
};

// Get current user's organization ID
export const getCurrentOrganizationId = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data: supervisor } = await supabase
      .from('supervisors')
      .select('organization_id')
      .eq('profile_id', session.user.id)
      .maybeSingle();

    if (supervisor) return supervisor.organization_id;

    // If not a supervisor, check if they're a rider
    const { data: rider } = await supabase
      .from('riders')
      .select('organization_id')
      .eq('profile_id', session.user.id)
      .maybeSingle();

    return rider?.organization_id || null;
  } catch (err) {
    console.error('[Supabase] Failed to get organization ID:', err);
    return null;
  }
};

/**
 * ===== PARCELS =====
 */

// Fetch parcels for current organization
export const getParcels = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('parcel_lists')
      .select('*')
      .eq('organization_id', orgId)
      .neq('status', 'assigned')  // Filter out assigned parcels
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Parcels fetch error:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected parcels error:', err);
    return [];
  }
};

// Fetch all parcels for current organization (including assigned and delivered)
export const getAllParcels = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('parcel_lists')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Supabase] All parcels fetch error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected all parcels error:', err);
    return [];
  }
};

// Get parcels by status
export const getParcelsByStatus = async (status, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('parcel_lists')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', status)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Parcels by status fetch error:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected parcels error:', err);
    return [];
  }
};

// Get all unassigned parcels (not yet acquired by any organization)
export const getUnassignedParcels = async () => {
  try {
    const { data, error } = await supabase
      .from('parcel_lists')
      .select('*')
      .is('organization_id', null)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Unassigned parcels fetch error:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected unassigned parcels error:', err);
    return [];
  }
};

const getAcquisitionInventoryRowsViaApi = async (inventoryType = 'individual') => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return null;
    }

    const query = new URLSearchParams({ type: inventoryType });
    const response = await fetch(`/api/parcel-acquisition-inventory?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('[API] parcel-acquisition-inventory error:', result?.error || response.statusText);
      return null;
    }

    if (!Array.isArray(result?.rows)) {
      return [];
    }

    return result.rows;
  } catch (err) {
    console.error('[API] parcel-acquisition-inventory unexpected error:', err);
    return null;
  }
};

// Get unacquired individual parcels (cluster_name is null)
export const getUnacquiredIndividualParcels = async () => {
  try {
    const apiRows = await getAcquisitionInventoryRowsViaApi('individual');
    if (Array.isArray(apiRows)) {
      return apiRows;
    }

    const { data, error } = await supabase
      .from('parcel_lists')
      .select('*')
      .is('organization_id', null)
      .is('cluster_name', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Supabase] Unacquired individual parcels fetch error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected unacquired individual parcels error:', err);
    return [];
  }
};

// Get unacquired individual parcels with server-side pagination
export const getUnacquiredIndividualParcelsPage = async (page = 1, pageSize = 20) => {
  try {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.floor(pageSize))) : 20;
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    const { data, count, error } = await supabase
      .from('parcel_lists')
      .select('*', { count: 'exact' })
      .is('organization_id', null)
      .is('cluster_name', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[Supabase] Unacquired individual parcels page fetch error:', error.message);
      return { rows: [], totalCount: 0, page: safePage, pageSize: safePageSize };
    }

    return {
      rows: data || [],
      totalCount: count || 0,
      page: safePage,
      pageSize: safePageSize,
    };
  } catch (err) {
    console.error('[Supabase] Unexpected unacquired individual parcels page error:', err);
    return { rows: [], totalCount: 0, page: 1, pageSize: 20 };
  }
};

// Get unacquired cluster parcel rows (cluster_name is not null)
export const getUnacquiredClusterParcelRows = async () => {
  try {
    const apiRows = await getAcquisitionInventoryRowsViaApi('clusters');
    if (Array.isArray(apiRows)) {
      return apiRows;
    }

    const { data, error } = await supabase
      .from('parcel_lists')
      .select('*')
      .is('organization_id', null)
      .not('cluster_name', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Supabase] Unacquired cluster rows fetch error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected unacquired cluster rows error:', err);
    return [];
  }
};

// Get unacquired parcel cluster summaries with server-side pagination.
// Requires the public.parcel_clusters view from SQL_MERGE_PARCEL_CLUSTERS.sql.
const PARCEL_CLUSTER_STATUS_PRIORITY = [
  'pending',
  'assigned',
  'in_transit',
  'delivered',
  'completed',
  'cancelled',
  'acquired',
];

const getParcelClusterStatusFromRows = (statuses) => {
  const statusSet = statuses instanceof Set ? statuses : new Set();

  for (const status of PARCEL_CLUSTER_STATUS_PRIORITY) {
    if (statusSet.has(status)) return status;
  }

  return 'unassigned';
};

const isMissingParcelClustersRelationError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (code === 'PGRST205' || code === 'PGRST204') return true;

  return (
    message.includes("could not find the table 'public.parcel_clusters'") ||
    (message.includes('parcel_clusters') && message.includes('schema cache'))
  );
};

const getParcelClustersFromParcelListsFallback = async ({
  organizationId = null,
  statuses = [],
  page = null,
  pageSize = null,
} = {}) => {
  const asFiniteNumberOrNull = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  let query = supabase
    .from('parcel_lists')
    .select('id, organization_id, cluster_name, parcel_count, weight_kg, latitude, longitude, created_at, supervisor_id, status')
    .not('cluster_name', 'is', null)
    .order('created_at', { ascending: false });

  if (organizationId == null) {
    query = query.is('organization_id', null);
  } else {
    query = query.eq('organization_id', organizationId);
  }

  const { data: rawRows, error } = await query;
  if (error) {
    console.error('[Supabase] Parcel clusters fallback fetch error:', error.message);
    return {
      rows: [],
      totalCount: 0,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 10,
      source: 'error',
    };
  }

  const parcelListRows = Array.isArray(rawRows) ? rawRows : [];
  const parcelListIds = parcelListRows
    .map((row) => row?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  let explicitMembershipSet = new Set();

  if (parcelListIds.length > 0) {
    const { data: membershipRows, error: membershipError } = await supabase
      .from('parcel_list_items')
      .select('parcel_list_id')
      .in('parcel_list_id', parcelListIds);

    if (membershipError) {
      console.warn('[Supabase] Parcel cluster membership fallback warning:', membershipError.message);
    } else {
      explicitMembershipSet = new Set(
        (membershipRows || [])
          .map((row) => row?.parcel_list_id)
          .filter((parcelListId) => typeof parcelListId === 'string' && parcelListId.length > 0)
      );
    }
  }

  const grouped = new Map();

  parcelListRows.forEach((row) => {
    const clusterName = String(row?.cluster_name || '').trim();
    if (!clusterName) return;

    const parcelListId = typeof row?.id === 'string' ? row.id : null;
    const hasExplicitMembership = parcelListId ? explicitMembershipSet.has(parcelListId) : false;
    const rowParcelCount = Math.max(0, Math.floor(toFiniteNumber(row?.parcel_count)));
    const parcelCountIncrement = hasExplicitMembership && rowParcelCount > 0 ? rowParcelCount : 1;
    const rowWeightKg = toFiniteNumber(row?.weight_kg);
    const rowLatitude = asFiniteNumberOrNull(row?.latitude);
    const rowLongitude = asFiniteNumberOrNull(row?.longitude);
    const normalizedStatus = String(row?.status || '').trim().toLowerCase();
    const rowCreatedMs = toDateMs(row?.created_at);
    const rowSupervisorId = typeof row?.supervisor_id === 'string' ? row.supervisor_id : null;

    const existing = grouped.get(clusterName) || {
      parcel_cluster_id: parcelListId,
      organization_id: row?.organization_id || null,
      cluster_name: clusterName,
      parcel_count: 0,
      total_weight_kg: 0,
      latitude_sum: 0,
      longitude_sum: 0,
      coordinate_count: 0,
      created_at: row?.created_at || null,
      supervisor_id: rowSupervisorId,
      has_explicit_membership: false,
      statuses: new Set(),
    };

    existing.parcel_count += parcelCountIncrement;
    existing.total_weight_kg += rowWeightKg;

    if (rowLatitude != null && rowLongitude != null) {
      existing.latitude_sum += rowLatitude;
      existing.longitude_sum += rowLongitude;
      existing.coordinate_count += 1;
    }

    if (normalizedStatus) {
      existing.statuses.add(normalizedStatus);
    }

    if (hasExplicitMembership) {
      existing.has_explicit_membership = true;
    }

    const existingCreatedMs = toDateMs(existing.created_at);
    if (rowCreatedMs != null && (existingCreatedMs == null || rowCreatedMs > existingCreatedMs)) {
      existing.created_at = row.created_at;
    }

    if (parcelListId && (!existing.parcel_cluster_id || parcelListId < existing.parcel_cluster_id)) {
      existing.parcel_cluster_id = parcelListId;
    }

    if (rowSupervisorId && (!existing.supervisor_id || rowSupervisorId < existing.supervisor_id)) {
      existing.supervisor_id = rowSupervisorId;
    }

    grouped.set(clusterName, existing);
  });

  const normalizedRequestedStatuses = new Set(
    (Array.isArray(statuses) ? statuses : [])
      .map((status) => String(status || '').trim().toLowerCase())
      .filter(Boolean)
  );

  let rows = Array.from(grouped.values()).map((cluster) => ({
    parcel_cluster_id: cluster.parcel_cluster_id,
    organization_id: cluster.organization_id,
    cluster_name: cluster.cluster_name,
    parcel_count: cluster.parcel_count,
    total_weight_kg: cluster.total_weight_kg,
    latitude:
      cluster.coordinate_count > 0
        ? cluster.latitude_sum / cluster.coordinate_count
        : null,
    longitude:
      cluster.coordinate_count > 0
        ? cluster.longitude_sum / cluster.coordinate_count
        : null,
    created_at: cluster.created_at,
    supervisor_id: cluster.supervisor_id,
    has_explicit_membership: cluster.has_explicit_membership,
    status: getParcelClusterStatusFromRows(cluster.statuses),
  }));

  if (normalizedRequestedStatuses.size > 0) {
    rows = rows.filter((row) => normalizedRequestedStatuses.has(String(row?.status || '').toLowerCase()));
  }

  rows.sort((left, right) => (toDateMs(right?.created_at) || 0) - (toDateMs(left?.created_at) || 0));

  const totalCount = rows.length;
  if (Number.isFinite(page) && Number.isFinite(pageSize)) {
    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize;

    return {
      rows: rows.slice(from, to),
      totalCount,
      page: safePage,
      pageSize: safePageSize,
      source: 'parcel_lists_fallback',
    };
  }

  return {
    rows,
    totalCount,
    page: 1,
    pageSize: totalCount,
    source: 'parcel_lists_fallback',
  };
};

export const getUnacquiredParcelClustersPage = async (page = 1, pageSize = 10) => {
  try {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.floor(pageSize))) : 10;
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    const { data, count, error } = await supabase
      .from('parcel_clusters')
      .select('*', { count: 'exact' })
      .is('organization_id', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      if (isMissingParcelClustersRelationError(error)) {
        console.warn('[Supabase] parcel_clusters view missing; using parcel_lists fallback.');
        return await getParcelClustersFromParcelListsFallback({
          organizationId: null,
          statuses: [],
          page: safePage,
          pageSize: safePageSize,
        });
      }

      console.error('[Supabase] Unacquired parcel clusters page fetch error:', error.message);
      return {
        rows: [],
        totalCount: 0,
        page: safePage,
        pageSize: safePageSize,
        source: 'missing_parcel_clusters_view',
      };
    }

    return {
      rows: data || [],
      totalCount: count || 0,
      page: safePage,
      pageSize: safePageSize,
      source: 'parcel_clusters_view',
    };
  } catch (err) {
    console.error('[Supabase] Unexpected unacquired parcel clusters page error:', err);
    return {
      rows: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      source: 'error',
    };
  }
};

export const createParcelAcquisitionLog = async (payload) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch('/api/parcel-acquisition-logs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      return { success: false, error: result?.error || 'Failed to create acquisition log' };
    }

    return { success: true, data: result };
  } catch (err) {
    console.error('[API] createParcelAcquisitionLog error:', err);
    return { success: false, error: err?.message || 'Unexpected acquisition log error' };
  }
};

export const getParcelAcquisitionLogsPage = async (page = 1, pageSize = 10) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { rows: [], totalCount: 0, page: 1, pageSize };
    }

    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.floor(pageSize))) : 10;

    const query = new URLSearchParams({
      page: String(safePage),
      pageSize: String(safePageSize),
    });

    const response = await fetch(`/api/parcel-acquisition-logs?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = await response.json();
    if (!response.ok) {
      return { rows: [], totalCount: 0, page: safePage, pageSize: safePageSize, error: result?.error };
    }

    return {
      rows: Array.isArray(result?.rows) ? result.rows : [],
      totalCount: typeof result?.totalCount === 'number' ? result.totalCount : 0,
      page: safePage,
      pageSize: safePageSize,
    };
  } catch (err) {
    console.error('[API] getParcelAcquisitionLogsPage error:', err);
    return { rows: [], totalCount: 0, page: 1, pageSize, error: err?.message };
  }
};

export const importParcelCsvRows = async (rows = [], options = {}) => {
  try {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: 'No CSV rows to import' };
    }

    const assignToOrganization = options?.assignToOrganization !== false;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch('/api/parcel-acquisition-import', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows, assignToOrganization }),
    });

    const result = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: result?.error || 'Failed to import CSV rows',
        summary: result?.summary || null,
      };
    }

    return {
      success: true,
      summary: result?.summary || null,
    };
  } catch (err) {
    console.error('[API] importParcelCsvRows error:', err);
    return {
      success: false,
      error: err?.message || 'Unexpected CSV import error',
      summary: null,
    };
  }
};

// Acquire parcels for organization
export const acquireParcels = async (parcelIds = [], organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');
    if (!parcelIds.length) throw new Error('No parcels selected');

    const { data, error } = await supabase
      .from('parcel_lists')
      .update({
        organization_id: orgId,
        status: 'acquired',
        acquired_at: new Date().toISOString(),
      })
      .in('id', parcelIds)
      .is('organization_id', null) // Safety: only update unassigned parcels
      .select();

    if (error) {
      console.error('[Supabase] Acquire parcels error:', error.message);
      return { success: false, error: error.message, acquired: 0 };
    }

    return { 
      success: true, 
      acquired: data?.length || 0,
      parcels: data || []
    };
  } catch (err) {
    console.error('[Supabase] Unexpected acquire error:', err);
    return { success: false, error: err.message, acquired: 0 };
  }
};

// Acquire cluster parcels for organization by cluster_name values
export const acquireParcelClusters = async (clusterNames = [], organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');
    if (!clusterNames.length) throw new Error('No parcel clusters selected');

    const { data, error } = await supabase
      .from('parcel_lists')
      .update({
        organization_id: orgId,
        status: 'acquired',
        acquired_at: new Date().toISOString(),
      })
      .in('cluster_name', clusterNames)
      .is('organization_id', null)
      .not('cluster_name', 'is', null)
      .select();

    if (error) {
      console.error('[Supabase] Acquire parcel clusters error:', error.message);
      return { success: false, error: error.message, acquired: 0 };
    }

    return {
      success: true,
      acquired: data?.length || 0,
      parcels: data || [],
    };
  } catch (err) {
    console.error('[Supabase] Unexpected acquire clusters error:', err);
    return { success: false, error: err.message, acquired: 0 };
  }
};

// Acquire single parcel
export const acquireParcel = async (parcelId, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');

    const { data, error } = await supabase
      .from('parcel_lists')
      .update({
        organization_id: orgId,
        status: 'acquired',
        acquired_at: new Date().toISOString(),
      })
      .eq('id', parcelId)
      .is('organization_id', null)
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Acquire parcel error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, parcel: data };
  } catch (err) {
    console.error('[Supabase] Unexpected acquire error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * ===== RIDERS & DRIVERS =====
 */

// Fetch riders with profile details for current organization
export const getRiders = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('riders')
      .select(`
        id,
        profile_id,
        organization_id,
        vehicle_type,
        capacity,
        status,
        current_latitude,
        current_longitude,
        current_location_accuracy,
        current_location_at,
        created_at,
        updated_at,
        profiles:profile_id (
          id,
          email_address,
          full_name,
          phone_number,
          device_id,
          status,
          is_active
        )
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Riders fetch error:', error.message);
      return [];
    }

    return (data || []).map((rider) => ({
      ...rider,
      vehicle_type: 'motorcycle',
    }));
  } catch (err) {
    console.error('[Supabase] Unexpected riders error:', err);
    return [];
  }
};

// Get specific rider details
export const getRiderById = async (riderId) => {
  try {
    const { data, error } = await supabase
      .from('riders')
      .select(`
        id,
        profile_id,
        organization_id,
        vehicle_type,
        capacity,
        status,
        current_latitude,
        current_longitude,
        current_location_accuracy,
        current_location_at,
        created_at,
        updated_at,
        profiles:profile_id (
          id,
          email_address,
          full_name,
          phone_number,
          device_id,
          status
        )
      `)
      .eq('id', riderId)
      .single();
    
    if (error) {
      console.error('[Supabase] Rider fetch error:', error.message);
      return null;
    }

    return data
      ? {
          ...data,
          vehicle_type: 'motorcycle',
        }
      : null;
  } catch (err) {
    console.error('[Supabase] Unexpected rider fetch error:', err);
    return null;
  }
};

/**
 * ===== ROUTES =====
 */

// Fetch routes for current organization
export const getRoutes = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data: routes, error: routesError } = await supabase
      .from('routes')
      .select(`
        id,
        rider_id,
        cluster_name,
        status,
        created_at,
        riders (
          id,
          profile_id,
          organization_id,
          profiles:profile_id (
            full_name
          )
        )
      `)
      .eq('riders.organization_id', orgId);
    
    if (routesError) {
      console.error('[Supabase] Routes fetch error:', routesError.message);
      return [];
    }
    
    return routes || [];
  } catch (err) {
    console.error('[Supabase] Unexpected routes error:', err);
    return [];
  }
};

// Get routes by rider
export const getRoutesByRider = async (riderId) => {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Routes by rider fetch error:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected routes error:', err);
    return [];
  }
};

// Save a new route
export const postRoute = async (route) => {
  try {
    const { data, error } = await supabase
      .from('routes')
      .insert([route])
      .select();
    
    if (error) {
      console.error('[Supabase] Route save error:', error.message);
      throw new Error(`Failed to save route: ${error.message}`);
    }
    
    return data?.[0];
  } catch (err) {
    console.error('[Supabase] Unexpected route save error:', err);
    throw err;
  }
};

/**
 * ===== PARCELS (MANAGEMENT) =====
 */

// Update parcel status
export const updateParcelStatus = async (parcelId, status) => {
  try {
    const { data, error } = await supabase
      .from('parcel_lists')
      .update({ status })
      .eq('id', parcelId)
      .select();
    
    if (error) {
      console.error('[Supabase] Parcel update error:', error.message);
      throw new Error(`Failed to update parcel: ${error.message}`);
    }
    
    return data?.[0];
  } catch (err) {
    console.error('[Supabase] Unexpected parcel update error:', err);
    throw err;
  }
};

// Update parcel cluster
export const updateParcelCluster = async (parcelId, clusterName) => {
  try {
    const { data, error } = await supabase
      .from('parcel_lists')
      .update({ cluster_name: clusterName })
      .eq('id', parcelId)
      .select();
    
    if (error) {
      console.error('[Supabase] Parcel cluster update error:', error.message);
      throw new Error(`Failed to update parcel cluster: ${error.message}`);
    }
    
    return data?.[0];
  } catch (err) {
    console.error('[Supabase] Unexpected parcel cluster update error:', err);
    throw err;
  }
};

/**
 * ===== ANALYTICS =====
 */

// Fetch analytics for all riders in organization
export const getAnalytics = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('analytics')
      .select(`
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
        updated_at,
        riders (
          id,
          profile_id,
          organization_id,
          profiles:profile_id (
            full_name,
            email_address
          )
        )
      `)
      .eq('riders.organization_id', orgId);
    
    if (error) {
      console.error('[Supabase] Analytics fetch error:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected analytics error:', err);
    return [];
  }
};

// Build complete analytics dashboard payload for Analytics tab widgets.
export const getAnalyticsDashboardData = async (organizationId = null, filters = {}) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return null;

    const [routes, riders, analyticsRows, violations, notifications, parcelRows, deliveriesRows, costEntries, payoutEntries, billingEntries] =
      await Promise.all([
        getRoutes(orgId),
        getRiders(orgId),
        getAnalytics(orgId),
        getViolations(orgId),
        getNotifications(orgId),
        getAllParcels(orgId),
        fetchOptionalRows(
          supabase
            .from('deliveries')
            .select(`
              id,
              route_id,
              rider_id,
              sequence,
              status,
              created_at,
              updated_at,
              parcel_id,
              parcel_list_id,
              routes!inner (
                id,
                organization_id,
                cluster_name
              )
            `)
            .eq('routes.organization_id', orgId),
          'Analytics deliveries'
        ),
        fetchOptionalRowsWithFallback(
          supabase
            .from('finance_cost_entries')
            .select('id, organization_id, category, amount, region, incurred_at, created_at')
            .eq('organization_id', orgId)
            .order('incurred_at', { ascending: false }),
          () =>
            supabase
              .from('finance_cost_entries')
              .select('id, organization_id, category, amount, incurred_at, created_at')
              .eq('organization_id', orgId)
              .order('incurred_at', { ascending: false }),
          'Analytics finance cost entries'
        ),
        fetchOptionalRowsWithFallback(
          supabase
            .from('finance_payout_entries')
            .select('id, organization_id, rider_id, payout_type, amount, region, payout_date, created_at')
            .eq('organization_id', orgId)
            .order('payout_date', { ascending: false }),
          () =>
            supabase
              .from('finance_payout_entries')
              .select('id, organization_id, rider_id, payout_type, amount, payout_date, created_at')
              .eq('organization_id', orgId)
              .order('payout_date', { ascending: false }),
          'Analytics finance payout entries'
        ),
        fetchOptionalRowsWithFallback(
          supabase
            .from('finance_billing_entries')
            .select('id, organization_id, reference_label, amount, status, region, billed_at, created_at')
            .eq('organization_id', orgId)
            .order('billed_at', { ascending: false }),
          () =>
            supabase
              .from('finance_billing_entries')
              .select('id, organization_id, reference_label, amount, status, billed_at, created_at')
              .eq('organization_id', orgId)
              .order('billed_at', { ascending: false }),
          'Analytics finance billing entries'
        ),
      ]);

    const nowMs = Date.now();
    const normalizedTimeRange = normalizeDashboardTimeRange(filters?.timeRange, '30d');
    const normalizedRegionFilter = normalizeDashboardRegionFilter(filters?.region);
    const rangeStartMs = getDashboardRangeStartMs(normalizedTimeRange, nowMs);
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;

    const currentWeekStart = toWeekStartMs(nowMs, 0);
    const previousWeekStart = currentWeekStart - weekMs;
    const previousWeekEnd = currentWeekStart;
    const monthStartMs = (() => {
      const date = new Date(nowMs);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    })();

    const scopedAnalyticsRows = (analyticsRows || []).filter((row) =>
      isWithinDashboardRange(row?.updated_at || row?.created_at, rangeStartMs)
    );

    const parcelRowsAll = Array.isArray(parcelRows) ? parcelRows : [];
    const scopedParcelRows = parcelRowsAll.filter((parcel) => {
      const inRange = isWithinDashboardRange(parcel?.created_at || parcel?.updated_at, rangeStartMs);
      if (!inRange) return false;

      const regionLabel = normalizeRegionLabel(parcel?.region || parcel?.address);
      return matchesDashboardRegionFilter(regionLabel, normalizedRegionFilter);
    });

    const parcelById = new Map();
    parcelRowsAll.forEach((parcel) => {
      if (!parcel?.id) return;
      parcelById.set(parcel.id, parcel);
    });

    const scopedDeliveriesRows = (deliveriesRows || []).filter((delivery) => {
      const inRange = isWithinDashboardRange(delivery?.created_at || delivery?.updated_at, rangeStartMs);
      if (!inRange) return false;

      if (normalizedRegionFilter === 'all') return true;

      const parcel =
        parcelById.get(delivery?.parcel_list_id) ||
        parcelById.get(delivery?.parcel_id) ||
        null;

      const regionLabel = normalizeRegionLabel(parcel?.region || parcel?.address);
      return matchesDashboardRegionFilter(regionLabel, normalizedRegionFilter);
    });

    const scopedViolations = (violations || []).filter((violation) => {
      const inRange = isWithinDashboardRange(violation?.created_at, rangeStartMs);
      if (!inRange) return false;

      const regionLabel = normalizeRegionLabel(violation?.zone_name);
      return matchesDashboardRegionFilter(regionLabel, normalizedRegionFilter);
    });

    const scopedNotifications = (notifications || []).filter((notification) => {
      const inRange = isWithinDashboardRange(notification?.created_at, rangeStartMs);
      if (!inRange) return false;

      const regionLabel = normalizeRegionLabel(notification?.location || notification?.message);
      return matchesDashboardRegionFilter(regionLabel, normalizedRegionFilter);
    });

    const scopedCostEntries = (costEntries || []).filter((entry) => {
      const inRange = isWithinDashboardRange(entry?.incurred_at || entry?.created_at, rangeStartMs);
      if (!inRange) return false;

      return matchesDashboardRegionFilter(entry?.region, normalizedRegionFilter);
    });

    const scopedPayoutEntries = (payoutEntries || []).filter((entry) => {
      const inRange = isWithinDashboardRange(entry?.payout_date || entry?.created_at, rangeStartMs);
      if (!inRange) return false;

      return matchesDashboardRegionFilter(entry?.region, normalizedRegionFilter);
    });

    const scopedBillingEntries = (billingEntries || []).filter((entry) => {
      const inRange = isWithinDashboardRange(entry?.billed_at || entry?.created_at, rangeStartMs);
      if (!inRange) return false;

      return matchesDashboardRegionFilter(entry?.region, normalizedRegionFilter);
    });

    const totalRoutes = Array.isArray(routes) ? routes.length : 0;
    const analyticsRevenue = (scopedAnalyticsRows || []).reduce(
      (sum, row) => sum + toFiniteNumber(row?.today_earnings),
      0
    );
    const billingRevenue = (scopedBillingEntries || []).reduce(
      (sum, entry) => sum + toFiniteNumber(entry?.amount),
      0
    );
    const totalRevenue = analyticsRevenue > 0 ? analyticsRevenue : billingRevenue;
    const totalDeliveries = (scopedAnalyticsRows || []).reduce(
      (sum, row) => sum + toFiniteNumber(row?.today_deliveries_completed),
      0
    );

    const optimizedRateRaw =
      scopedAnalyticsRows && scopedAnalyticsRows.length > 0
        ? scopedAnalyticsRows.reduce((sum, row) => sum + toFiniteNumber(row?.on_time_percentage), 0) / scopedAnalyticsRows.length
        : 0;
    const scopedDeliveryTotal = (scopedDeliveriesRows || []).length;
    const scopedDeliveryCompleted = (scopedDeliveriesRows || []).filter((delivery) =>
      COMPLETED_DELIVERY_STATUSES.has(String(delivery?.status || '').toLowerCase())
    ).length;

    const optimizedRate = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          optimizedRateRaw > 0
            ? optimizedRateRaw
            : scopedDeliveryTotal > 0
            ? (scopedDeliveryCompleted / scopedDeliveryTotal) * 100
            : 0
        )
      )
    );

    const deliveryDurationsCurrentWeek = [];
    const deliveryDurationsPreviousWeek = [];
    let currentWeekDeliveries = 0;
    let previousWeekDeliveries = 0;
    let failedDeliveries = 0;
    let delayedDeliveries = 0;

    const routeStopsById = new Map();
    const riderLoadWeightById = new Map();

    (scopedDeliveriesRows || []).forEach((delivery) => {
      const createdMs = toDateMs(delivery?.created_at);
      const updatedMs = toDateMs(delivery?.updated_at);
      const normalizedStatus = String(delivery?.status || '').toLowerCase();

      if (delivery?.route_id) {
        routeStopsById.set(delivery.route_id, (routeStopsById.get(delivery.route_id) || 0) + 1);
      }

      if (createdMs != null) {
        if (createdMs >= currentWeekStart && createdMs < currentWeekStart + weekMs) {
          currentWeekDeliveries += 1;
        }

        if (createdMs >= previousWeekStart && createdMs < previousWeekEnd) {
          previousWeekDeliveries += 1;
        }
      }

      if (createdMs != null && createdMs >= nowMs - 30 * dayMs && FAILED_DELIVERY_STATUSES.has(normalizedStatus)) {
        failedDeliveries += 1;
      }

      if (ACTIVE_DELIVERY_STATUSES.has(normalizedStatus) && createdMs != null && createdMs <= nowMs - 2 * dayMs) {
        delayedDeliveries += 1;
      }

      if (COMPLETED_DELIVERY_STATUSES.has(normalizedStatus) && createdMs != null && updatedMs != null && updatedMs >= createdMs) {
        const minutes = (updatedMs - createdMs) / (1000 * 60);
        if (Number.isFinite(minutes) && minutes > 0) {
          if (createdMs >= currentWeekStart && createdMs < currentWeekStart + weekMs) {
            deliveryDurationsCurrentWeek.push(minutes);
          }

          if (createdMs >= previousWeekStart && createdMs < previousWeekEnd) {
            deliveryDurationsPreviousWeek.push(minutes);
          }
        }
      }

      if (ACTIVE_DELIVERY_STATUSES.has(normalizedStatus) && delivery?.rider_id) {
        const parcel = parcelById.get(delivery.parcel_list_id) || parcelById.get(delivery.parcel_id) || null;
        const weight = toFiniteNumber(parcel?.weight_kg);
        riderLoadWeightById.set(delivery.rider_id, (riderLoadWeightById.get(delivery.rider_id) || 0) + weight);
      }
    });

    const avgDeliveryMinutes =
      deliveryDurationsCurrentWeek.length > 0
        ? deliveryDurationsCurrentWeek.reduce((sum, value) => sum + value, 0) / deliveryDurationsCurrentWeek.length
        : 0;

    const previousAvgDeliveryMinutes =
      deliveryDurationsPreviousWeek.length > 0
        ? deliveryDurationsPreviousWeek.reduce((sum, value) => sum + value, 0) / deliveryDurationsPreviousWeek.length
        : 0;

    const routeCountForStops = Math.max(1, totalRoutes);
    const avgStops =
      routeStopsById.size > 0
        ? Array.from(routeStopsById.values()).reduce((sum, count) => sum + count, 0) / routeCountForStops
        : 0;

    let currentWeekCost = 0;
    let previousWeekCost = 0;
    const monthCostByCategory = {
      fuel: 0,
      maintenance: 0,
      labor: 0,
      operations: 0,
    };

    (scopedCostEntries || []).forEach((entry) => {
      const amount = toFiniteNumber(entry?.amount);
      if (amount <= 0) return;

      const createdMs = toDateMs(entry?.incurred_at || entry?.created_at);
      if (createdMs != null) {
        if (createdMs >= currentWeekStart && createdMs < currentWeekStart + weekMs) {
          currentWeekCost += amount;
        }
        if (createdMs >= previousWeekStart && createdMs < previousWeekEnd) {
          previousWeekCost += amount;
        }
      }

      if (createdMs != null && createdMs >= monthStartMs) {
        const category = normalizeCostCategory(entry?.category);
        if (category === 'FUEL') monthCostByCategory.fuel += amount;
        else if (category === 'MAINTENANCE') monthCostByCategory.maintenance += amount;
        else monthCostByCategory.operations += amount;
      }
    });

    (scopedPayoutEntries || []).forEach((entry) => {
      const amount = toFiniteNumber(entry?.amount);
      if (amount <= 0) return;

      const payoutMs = toDateMs(entry?.payout_date || entry?.created_at);
      if (payoutMs != null) {
        if (payoutMs >= currentWeekStart && payoutMs < currentWeekStart + weekMs) {
          currentWeekCost += amount;
        }
        if (payoutMs >= previousWeekStart && payoutMs < previousWeekEnd) {
          previousWeekCost += amount;
        }

        if (payoutMs >= monthStartMs) {
          monthCostByCategory.labor += amount;
        }
      }
    });

    const fallbackCurrentWeekCost = totalRevenue * 0.38;
    const effectiveCurrentWeekCost = currentWeekCost > 0 ? currentWeekCost : fallbackCurrentWeekCost;
    const fallbackPreviousWeekCost = effectiveCurrentWeekCost * 0.9;
    const effectivePreviousWeekCost = previousWeekCost > 0 ? previousWeekCost : fallbackPreviousWeekCost;

    const costPerRoute = totalRoutes > 0 ? effectiveCurrentWeekCost / totalRoutes : 0;
    const previousCostPerRoute = totalRoutes > 0 ? effectivePreviousWeekCost / totalRoutes : 0;

    const currentWeekRevenueFromAnalytics = (scopedAnalyticsRows || []).reduce(
      (sum, row) => sum + toFiniteNumber(row?.this_week_earnings),
      0
    );
    const currentWeekRevenueFromBilling = (scopedBillingEntries || []).reduce((sum, entry) => {
      const billedMs = toDateMs(entry?.billed_at || entry?.created_at);
      if (billedMs == null || billedMs < currentWeekStart || billedMs >= currentWeekStart + weekMs) {
        return sum;
      }

      return sum + toFiniteNumber(entry?.amount);
    }, 0);
    const currentWeekRevenue =
      currentWeekRevenueFromAnalytics > 0 ? currentWeekRevenueFromAnalytics : currentWeekRevenueFromBilling;
    const previousWeekRevenue = currentWeekRevenue > 0 ? currentWeekRevenue * 0.9 : 0;

    const formatChangeText = (value) => {
      const safeValue = Number.isFinite(value) ? value : 0;
      const rounded = Math.round(safeValue);
      if (rounded > 0) return `+${rounded}%`;
      if (rounded < 0) return `${rounded}%`;
      return '0%';
    };

    const performanceOverview = [
      {
        label: 'Total Deliveries',
        value: totalDeliveries.toString(),
        change: formatChangeText(toPercentDiff(currentWeekDeliveries, previousWeekDeliveries)),
        trend: 'up',
        icon: 'Total\nDeliveries',
      },
      {
        label: 'Optimized Rate',
        value: `${optimizedRate}%`,
        change: formatChangeText(toPercentDiff(optimizedRate, 85)),
        trend: 'up',
        icon: 'Optimized\nRate',
      },
      {
        label: 'Avg Delivery Time',
        value: `${Math.round(avgDeliveryMinutes)} min`,
        change: formatChangeText(toPercentDiff(avgDeliveryMinutes, previousAvgDeliveryMinutes || avgDeliveryMinutes || 1)),
        trend: 'down',
        icon: 'Avg Delivery\nTime',
      },
      {
        label: 'Revenue',
        value: `$${(totalRevenue / 1000).toFixed(1)}k`,
        change: formatChangeText(toPercentDiff(currentWeekRevenue, previousWeekRevenue || currentWeekRevenue || 1)),
        trend: 'up',
        icon: 'Revenue',
      },
      {
        label: 'Cost per Route',
        value: `$${costPerRoute.toFixed(2)}`,
        change: formatChangeText(toPercentDiff(costPerRoute, previousCostPerRoute || costPerRoute || 1)),
        trend: 'down',
        icon: 'Cost per\nRoute',
      },
      {
        label: 'Avg Stops',
        value: avgStops.toFixed(1),
        change: formatChangeText(toPercentDiff(avgStops, 6)),
        trend: 'up',
        icon: 'Avg Stops',
      },
    ];

    const efficiencyValues = [];
    for (let i = 4; i >= 0; i -= 1) {
      const weekStart = currentWeekStart - i * weekMs;
      const weekEnd = weekStart + weekMs;

      const weekRows = (scopedDeliveriesRows || []).filter((delivery) => {
        const createdMs = toDateMs(delivery?.created_at);
        return createdMs != null && createdMs >= weekStart && createdMs < weekEnd;
      });

      const totalWeek = weekRows.length;
      const completedWeek = weekRows.filter((delivery) =>
        COMPLETED_DELIVERY_STATUSES.has(String(delivery?.status || '').toLowerCase())
      ).length;

      const value =
        totalWeek > 0
          ? Math.round((completedWeek / totalWeek) * 100)
          : Math.round(Math.max(0, Math.min(100, optimizedRate)));

      efficiencyValues.push(value);
    }

    const routeEfficiency = {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'],
      values: efficiencyValues,
      currentRate: efficiencyValues[efficiencyValues.length - 1] || 0,
      average:
        efficiencyValues.length > 0
          ? Math.round(efficiencyValues.reduce((sum, value) => sum + value, 0) / efficiencyValues.length)
          : 0,
      highest: efficiencyValues.length > 0 ? Math.max(...efficiencyValues) : 0,
      changePercent: toPercentDiff(
        efficiencyValues[efficiencyValues.length - 1] || 0,
        efficiencyValues[0] || 0
      ),
    };

    const rawHeatmap = Array.from({ length: ANALYTICS_HOUR_BUCKET_LABELS.length }, () =>
      Array.from({ length: ANALYTICS_WEEKDAY_LABELS.length }, () => 0)
    );

    (scopedDeliveriesRows || []).forEach((delivery) => {
      const createdMs = toDateMs(delivery?.created_at);
      if (createdMs == null) return;

      const date = new Date(createdMs);
      const weekdayIndex = (date.getUTCDay() + 6) % 7;
      const hourBucketIndex = getHeatmapHourBucketIndex(date.getUTCHours());

      rawHeatmap[hourBucketIndex][weekdayIndex] += 1;
    });

    const maxHeatValue = Math.max(0, ...rawHeatmap.flat());
    const normalizedHeatmap = rawHeatmap.map((row) =>
      row.map((value) => (maxHeatValue > 0 ? Number((value / maxHeatValue).toFixed(2)) : 0))
    );

    let peakRowIndex = -1;
    let peakColIndex = -1;
    let peakValue = 0;

    rawHeatmap.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (value > peakValue) {
          peakValue = value;
          peakRowIndex = rowIndex;
          peakColIndex = colIndex;
        }
      });
    });

    const peakText =
      peakValue > 0 && peakRowIndex >= 0 && peakColIndex >= 0
        ? `${ANALYTICS_WEEKDAY_LABELS[peakColIndex]} ${ANALYTICS_HOUR_BUCKET_LABELS[peakRowIndex]}`
        : 'No peak data yet';

    const riderPerformanceFromAnalytics = (scopedAnalyticsRows || [])
      .map((entry) => {
        const rider = firstRow(entry?.riders);
        const profile = firstRow(rider?.profiles);
        const name =
          String(profile?.full_name || '').trim() ||
          `Rider ${String(entry?.rider_id || '').slice(0, 8).toUpperCase()}`;

        const efficiency = Math.max(0, Math.min(100, Math.round(toFiniteNumber(entry?.on_time_percentage))));

        return {
          id: entry?.rider_id,
          name,
          deliveries: Math.round(toFiniteNumber(entry?.this_week_deliveries)),
          revenue: toFiniteNumber(entry?.this_week_earnings),
          efficiency,
          rating: Number((Math.max(1, Math.min(5, efficiency / 20))).toFixed(1)),
        };
      })
      .sort((left, right) => {
        if (right.deliveries !== left.deliveries) return right.deliveries - left.deliveries;
        return right.efficiency - left.efficiency;
      })
      .slice(0, 5)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    const riderPerformanceFromDeliveries = (() => {
      const byRiderId = new Map();

      (scopedDeliveriesRows || []).forEach((delivery) => {
        const riderId = String(delivery?.rider_id || '').trim();
        if (!riderId) return;

        const status = String(delivery?.status || '').toLowerCase();
        if (!byRiderId.has(riderId)) {
          byRiderId.set(riderId, {
            id: riderId,
            deliveries: 0,
            completed: 0,
          });
        }

        const bucket = byRiderId.get(riderId);
        bucket.deliveries += 1;
        if (COMPLETED_DELIVERY_STATUSES.has(status)) {
          bucket.completed += 1;
        }
      });

      const totalCompleted = Array.from(byRiderId.values()).reduce(
        (sum, row) => sum + row.completed,
        0
      );

      const findRiderName = (riderId) => {
        const riderRow = (riders || []).find((item) => String(item?.id || '') === riderId);
        const profile = firstRow(firstRow(riderRow?.profiles));
        return String(profile?.full_name || '').trim() || `Rider ${riderId.slice(0, 8).toUpperCase()}`;
      };

      return Array.from(byRiderId.values())
        .map((row) => {
          const efficiency = row.deliveries > 0 ? Math.round((row.completed / row.deliveries) * 100) : 0;
          const revenueShare = totalCompleted > 0 ? row.completed / totalCompleted : 0;

          return {
            id: row.id,
            name: findRiderName(row.id),
            deliveries: row.completed,
            revenue: totalRevenue * revenueShare,
            efficiency,
            rating: Number((Math.max(1, Math.min(5, efficiency / 20))).toFixed(1)),
          };
        })
        .sort((left, right) => {
          if (right.deliveries !== left.deliveries) return right.deliveries - left.deliveries;
          return right.efficiency - left.efficiency;
        })
        .slice(0, 5)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));
    })();

    const riderPerformance =
      riderPerformanceFromAnalytics.length > 0
        ? riderPerformanceFromAnalytics
        : riderPerformanceFromDeliveries;

    const costRows = [
      { label: 'Fuel', value: monthCostByCategory.fuel, color: '#3B82F6' },
      { label: 'Maintenance', value: monthCostByCategory.maintenance, color: '#8B5CF6' },
      { label: 'Labor', value: monthCostByCategory.labor, color: '#EC4899' },
      { label: 'Operations', value: monthCostByCategory.operations, color: '#F59E0B' },
    ];

    const totalTrackedCost = costRows.reduce((sum, row) => sum + row.value, 0);
    const defaultTotalCost = totalRevenue * 0.38;
    const effectiveTotalCost = totalTrackedCost > 0 ? totalTrackedCost : defaultTotalCost;

    const analyticsCostBreakdown =
      totalTrackedCost > 0
        ? costRows.map((row) => ({
            ...row,
            percentage: effectiveTotalCost > 0 ? Math.round((row.value / effectiveTotalCost) * 100) : 0,
          }))
        : [
            { label: 'Fuel', value: effectiveTotalCost * 0.38, percentage: 38, color: '#3B82F6' },
            { label: 'Maintenance', value: effectiveTotalCost * 0.28, percentage: 28, color: '#8B5CF6' },
            { label: 'Labor', value: effectiveTotalCost * 0.19, percentage: 19, color: '#EC4899' },
            { label: 'Operations', value: effectiveTotalCost * 0.15, percentage: 15, color: '#F59E0B' },
          ];

    const regionStats = new Map();

    (scopedParcelRows || []).forEach((parcel) => {
      const region = normalizeRegionLabel(parcel?.region || parcel?.address) || 'Unknown';
      if (!regionStats.has(region)) {
        regionStats.set(region, {
          label: region,
          parcelCount: 0,
          currentWeekCount: 0,
          previousWeekCount: 0,
        });
      }

      const entry = regionStats.get(region);
      entry.parcelCount += 1;

      const parcelMs = toDateMs(parcel?.created_at || parcel?.updated_at);
      if (parcelMs != null) {
        if (parcelMs >= currentWeekStart && parcelMs < currentWeekStart + weekMs) {
          entry.currentWeekCount += 1;
        }

        if (parcelMs >= previousWeekStart && parcelMs < previousWeekEnd) {
          entry.previousWeekCount += 1;
        }
      }
    });

    const totalParcelCount = Math.max(
      1,
      Array.from(regionStats.values()).reduce((sum, entry) => sum + entry.parcelCount, 0)
    );

    const profitabilityByRegion = Array.from(regionStats.values())
      .map((entry) => {
        const share = entry.parcelCount / totalParcelCount;
        const revenue = totalRevenue * share;
        const costShare = effectiveTotalCost * share;
        const margin = revenue > 0 ? ((revenue - costShare) / revenue) * 100 : 0;
        const trend = toPercentDiff(entry.currentWeekCount, entry.previousWeekCount || 0);

        const roundedTrend = Math.round(trend);
        const trendLabel = roundedTrend > 0 ? `+${roundedTrend}%` : `${roundedTrend}%`;

        return {
          label: entry.label,
          value: Math.round(Math.max(0, Math.min(100, margin))),
          revenue,
          trend: trendLabel,
          trendDirection: roundedTrend >= 0 ? 'up' : 'down',
        };
      })
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5);

    const totalRegionalRevenue = profitabilityByRegion.reduce((sum, entry) => sum + entry.revenue, 0);

    let capacityIssues = 0;
    (riders || []).forEach((rider) => {
      const riderId = rider?.id;
      if (!riderId) return;

      const capacityKg = toFiniteNumber(rider?.capacity);
      if (capacityKg <= 0) return;

      const loadKg = toFiniteNumber(riderLoadWeightById.get(riderId));
      if (loadKg > capacityKg) {
        capacityIssues += 1;
      }
    });

    const riderNoShows = (riders || []).filter((rider) => {
      const status = String(rider?.status || '').toLowerCase();
      if (status === 'offline') return true;

      const locationMs = toDateMs(rider?.current_location_at || rider?.updated_at);
      if (locationMs == null) return false;

      const staleThresholdMs = nowMs - 8 * 60 * 60 * 1000;
      return status === 'on_delivery' && locationMs < staleThresholdMs;
    }).length;

    const violationCriticalCount = (scopedViolations || []).filter(
      (item) => String(item?.base_severity || '').toLowerCase() === 'critical'
    ).length;

    const notificationCriticalCount = (scopedNotifications || []).filter(
      (item) => String(item?.severity || '').toLowerCase() === 'critical'
    ).length;

    const riskAlerts = [
      {
        label: 'Delayed Routes',
        value: delayedDeliveries,
        context: 'this week',
        level: getSeverityLevelForCount(delayedDeliveries, 2, 5),
        icon: 'clock',
        action: 'Review Routes',
      },
      {
        label: 'Failed Deliveries',
        value: failedDeliveries,
        context: 'this month',
        level: getSeverityLevelForCount(failedDeliveries, 1, 3),
        icon: 'alert-triangle',
        action: 'Investigate',
      },
      {
        label: 'Capacity Issues',
        value: capacityIssues,
        context: 'live load',
        level: getSeverityLevelForCount(capacityIssues, 1, 3),
        icon: 'trending-down',
        action: 'Optimize',
      },
      {
        label: 'Rider No-Shows',
        value: riderNoShows,
        context: 'live status',
        level: getSeverityLevelForCount(riderNoShows + violationCriticalCount + notificationCriticalCount, 1, 3),
        icon: 'alert-circle',
        action: 'Follow Up',
      },
    ];

    return {
      performanceOverview,
      routeEfficiency,
      parcelDemand: {
        heatmap: normalizedHeatmap,
        days: ANALYTICS_WEEKDAY_LABELS,
        hours: ANALYTICS_HOUR_BUCKET_LABELS,
        peakText,
      },
      riderPerformance,
      costBreakdown: analyticsCostBreakdown,
      profitabilityByRegion,
      totalRegionalRevenue,
      riskAlerts,
      meta: {
        usesEstimatedCosts: totalTrackedCost <= 0,
        selectedTimeRange: normalizedTimeRange,
        selectedRegion: normalizedRegionFilter,
        availableRegions: collectAvailableRegions(
          parcelRowsAll,
          scopedNotifications,
          scopedViolations,
          scopedBillingEntries,
          scopedCostEntries,
          scopedPayoutEntries
        ),
      },
    };
  } catch (err) {
    console.error('[Supabase] Unexpected analytics dashboard error:', err);
    return null;
  }
};

// Build complete finance dashboard payload for Finance tab widgets.
export const getFinanceDashboardData = async (organizationId = null, filters = {}) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return null;

    const nowMs = Date.now();
    const normalizedTimeRange = normalizeDashboardTimeRange(filters?.timeRange, '30d');
    const normalizedRegionFilter = normalizeDashboardRegionFilter(filters?.region);
    const rangeStartMs = getDashboardRangeStartMs(normalizedTimeRange, nowMs);

    const [analyticsRows, routes, costEntries, payoutEntries, billingEntries] = await Promise.all([
      getAnalytics(orgId),
      getRoutes(orgId),
      fetchOptionalRowsWithFallback(
        supabase
          .from('finance_cost_entries')
          .select('id, organization_id, category, amount, fuel_liters, region, incurred_at, created_at')
          .eq('organization_id', orgId)
          .order('incurred_at', { ascending: false }),
        () =>
          supabase
            .from('finance_cost_entries')
            .select('id, organization_id, category, amount, fuel_liters, incurred_at, created_at')
            .eq('organization_id', orgId)
            .order('incurred_at', { ascending: false }),
        'Finance cost entries'
      ),
      fetchOptionalRowsWithFallback(
        supabase
          .from('finance_payout_entries')
          .select('id, organization_id, rider_id, payout_type, amount, status, region, payout_date, created_at')
          .eq('organization_id', orgId)
          .order('payout_date', { ascending: false }),
        () =>
          supabase
            .from('finance_payout_entries')
            .select('id, organization_id, rider_id, payout_type, amount, status, payout_date, created_at')
            .eq('organization_id', orgId)
            .order('payout_date', { ascending: false }),
        'Finance payout entries'
      ),
      fetchOptionalRowsWithFallback(
        supabase
          .from('finance_billing_entries')
          .select('id, organization_id, reference_label, amount, status, region, billed_at, due_at, paid_at, created_at')
          .eq('organization_id', orgId)
          .order('billed_at', { ascending: false }),
        () =>
          supabase
            .from('finance_billing_entries')
            .select('id, organization_id, reference_label, amount, status, billed_at, due_at, paid_at, created_at')
            .eq('organization_id', orgId)
            .order('billed_at', { ascending: false }),
        'Finance billing entries'
      ),
    ]);

    const scopedAnalyticsRows = (analyticsRows || []).filter((row) =>
      isWithinDashboardRange(row?.updated_at || row?.created_at, rangeStartMs)
    );

    const scopedCostEntries = (costEntries || []).filter((entry) => {
      const inRange = isWithinDashboardRange(entry?.incurred_at || entry?.created_at, rangeStartMs);
      if (!inRange) return false;

      return matchesDashboardRegionFilter(entry?.region, normalizedRegionFilter);
    });

    const scopedPayoutEntries = (payoutEntries || []).filter((entry) => {
      const inRange = isWithinDashboardRange(entry?.payout_date || entry?.created_at, rangeStartMs);
      if (!inRange) return false;

      return matchesDashboardRegionFilter(entry?.region, normalizedRegionFilter);
    });

    const scopedBillingEntries = (billingEntries || []).filter((entry) => {
      const inRange = isWithinDashboardRange(entry?.billed_at || entry?.created_at, rangeStartMs);
      if (!inRange) return false;

      return matchesDashboardRegionFilter(entry?.region, normalizedRegionFilter);
    });

    const totalRevenueFromAnalytics = (scopedAnalyticsRows || []).reduce(
      (sum, row) => sum + toFiniteNumber(row?.today_earnings),
      0
    );

    const totalRevenueFromBilling = (scopedBillingEntries || []).reduce(
      (sum, entry) => sum + toFiniteNumber(entry?.amount),
      0
    );

    const totalRevenue = totalRevenueFromAnalytics > 0 ? totalRevenueFromAnalytics : totalRevenueFromBilling;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartMs = monthStart.getTime();
    const periodStartMs = rangeStartMs != null ? rangeStartMs : monthStartMs;

    const costByCategory = {
      FUEL: 0,
      MAINTENANCE: 0,
      INSURANCE: 0,
      OTHER: 0,
    };

    const monthCostByCategory = {
      FUEL: 0,
      MAINTENANCE: 0,
      INSURANCE: 0,
      OTHER: 0,
    };

    const monthCostByMonthKey = {};
    let totalFuelLiters = 0;

    (scopedCostEntries || []).forEach((entry) => {
      const amount = toFiniteNumber(entry?.amount);
      if (amount <= 0) return;

      const category = normalizeCostCategory(entry?.category);
      costByCategory[category] += amount;

      const eventMs = toDateMs(entry?.incurred_at || entry?.created_at);
      const monthKey = toMonthKey(entry?.incurred_at || entry?.created_at);

      if (monthKey) {
        monthCostByMonthKey[monthKey] = (monthCostByMonthKey[monthKey] || 0) + amount;
      }

      if (eventMs != null && eventMs >= periodStartMs) {
        monthCostByCategory[category] += amount;
      }

      if (category === 'FUEL') {
        totalFuelLiters += toFiniteNumber(entry?.fuel_liters);
      }
    });

    const totalMeasuredCost = Object.values(monthCostByCategory).reduce((sum, value) => sum + value, 0);
    const estimatedCost = totalRevenue * 0.38;
    const totalCost = totalMeasuredCost > 0 ? totalMeasuredCost : estimatedCost;
    const usesEstimatedCosts = totalMeasuredCost <= 0;

    const netProfit = totalRevenue - totalCost;
    const routeCount = Array.isArray(routes) ? routes.length : 0;
    const avgCostPerRoute = routeCount > 0 ? totalCost / routeCount : 0;

    const weeklyBaselineRevenue = (scopedAnalyticsRows || []).reduce((sum, row) => {
      const thisWeek = toFiniteNumber(row?.this_week_earnings);
      return sum + (thisWeek > 0 ? thisWeek / 7 : 0);
    }, 0);

    const costRatio = totalRevenue > 0 ? totalCost / totalRevenue : 0.38;
    const baselineRevenue = weeklyBaselineRevenue;
    const baselineCost = baselineRevenue * costRatio;
    const baselineNetProfit = baselineRevenue - baselineCost;
    const baselineAvgCostPerRoute = routeCount > 0 ? baselineCost / routeCount : 0;

    const revenueTrendPercent = toPercentDiff(totalRevenue, baselineRevenue);
    const netProfitTrendPercent = toPercentDiff(netProfit, baselineNetProfit);
    const avgCostTrendPercent = toPercentDiff(avgCostPerRoute, baselineAvgCostPerRoute);

    const costBreakdownRows = Object.entries(FINANCE_COST_CATEGORY_META).map(([category, meta]) => {
      const amount = monthCostByCategory[category] || 0;
      const percent = totalCost > 0 ? (amount / totalCost) * 100 : 0;

      return {
        label: meta.label,
        amount,
        percent,
        colorClass: meta.colorClass,
      };
    });

    const monthBuckets = [];
    const now = new Date();
    for (let i = 2; i >= 0; i -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      monthBuckets.push({ key, label });
    }

    const monthRevenueByMonthKey = {};

    (scopedBillingEntries || []).forEach((entry) => {
      const amount = toFiniteNumber(entry?.amount);
      if (amount <= 0) return;
      const monthKey = toMonthKey(entry?.billed_at || entry?.created_at);
      if (!monthKey) return;

      monthRevenueByMonthKey[monthKey] = (monthRevenueByMonthKey[monthKey] || 0) + amount;
    });

    if (Object.keys(monthRevenueByMonthKey).length === 0 && totalRevenue > 0) {
      const currentMonthKey = monthBuckets[monthBuckets.length - 1]?.key;
      if (currentMonthKey) {
        monthRevenueByMonthKey[currentMonthKey] = totalRevenue;
      }
    }

    const routeProfitLabels = monthBuckets.map((bucket) => bucket.label);
    const routeProfitRevenue = monthBuckets.map((bucket) => toFiniteNumber(monthRevenueByMonthKey[bucket.key]));
    const routeProfitCosts = monthBuckets.map((bucket) => toFiniteNumber(monthCostByMonthKey[bucket.key]));

    const latestRevenue = routeProfitRevenue[routeProfitRevenue.length - 1] || 0;
    const latestCost = routeProfitCosts[routeProfitCosts.length - 1] || 0;
    const latestProfit = latestRevenue - latestCost;

    const payoutByType = {
      BASE_PAY: 0,
      INCENTIVE: 0,
      OVERTIME: 0,
      OTHER: 0,
    };

    (scopedPayoutEntries || []).forEach((entry) => {
      const amount = toFiniteNumber(entry?.amount);
      if (amount <= 0) return;

      const payoutMs = toDateMs(entry?.payout_date || entry?.created_at);
      if (payoutMs != null && payoutMs < periodStartMs) return;

      const payoutType = normalizePayoutType(entry?.payout_type);
      payoutByType[payoutType] = (payoutByType[payoutType] || 0) + amount;
    });

    const riderPayoutRows = ['BASE_PAY', 'INCENTIVE', 'OVERTIME'].map((type) => ({
      label: FINANCE_PAYOUT_TYPE_TO_LABEL[type],
      amount: payoutByType[type] || 0,
    }));

    const effectiveCostRatio = totalRevenue > 0 ? totalCost / totalRevenue : 0.38;
    const riderEarningsRows = (scopedAnalyticsRows || [])
      .map((row) => {
        const rider = firstRow(row?.riders);
        const profile = firstRow(rider?.profiles);
        const riderId = String(row?.rider_id || rider?.id || row?.id || 'unknown-rider');

        const revenue = toFiniteNumber(row?.today_earnings);
        const distanceKm = toFiniteNumber(row?.today_distance);
        const riderName =
          String(profile?.full_name || '').trim() ||
          `Rider ${riderId.slice(0, 8).toUpperCase()}`;

        return {
          id: riderId,
          riderName,
          distanceKm,
          cost: revenue * effectiveCostRatio,
          revenue,
        };
      })
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5);

    const totalDistanceKm = (scopedAnalyticsRows || []).reduce(
      (sum, row) => sum + toFiniteNumber(row?.today_distance),
      0
    );

    const kmPerLiter = totalFuelLiters > 0 ? totalDistanceKm / totalFuelLiters : null;

    const current7DayKeys = [];
    const previous7DayKeys = [];
    const dailyRevenueCurrent = {};
    const dailyRevenuePrevious = {};

    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);

      const dayKey = date.toISOString().slice(0, 10);
      current7DayKeys.push(dayKey);
      dailyRevenueCurrent[dayKey] = 0;
    }

    for (let i = 13; i >= 7; i -= 1) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);

      const dayKey = date.toISOString().slice(0, 10);
      previous7DayKeys.push(dayKey);
      dailyRevenuePrevious[dayKey] = 0;
    }

    (scopedBillingEntries || []).forEach((entry) => {
      const amount = toFiniteNumber(entry?.amount);
      if (amount <= 0) return;

      const dayKey = toIsoDateKey(entry?.billed_at || entry?.created_at);
      if (!dayKey) return;

      if (Object.prototype.hasOwnProperty.call(dailyRevenueCurrent, dayKey)) {
        dailyRevenueCurrent[dayKey] += amount;
      }

      if (Object.prototype.hasOwnProperty.call(dailyRevenuePrevious, dayKey)) {
        dailyRevenuePrevious[dayKey] += amount;
      }
    });

    if (Object.values(dailyRevenueCurrent).every((value) => value === 0) && totalRevenue > 0) {
      const todayKey = current7DayKeys[current7DayKeys.length - 1];
      if (todayKey) {
        dailyRevenueCurrent[todayKey] = totalRevenue;
      }
    }

    const trendBarsRaw = current7DayKeys.map((key) => {
      const date = new Date(`${key}T00:00:00.000Z`);
      const label = date.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
      return {
        key,
        label,
        amount: toFiniteNumber(dailyRevenueCurrent[key]),
      };
    });

    const maxTrendAmount = Math.max(1, ...trendBarsRaw.map((bar) => bar.amount));
    const trendBars = trendBarsRaw.map((bar) => ({
      label: bar.label,
      amount: bar.amount,
      percent: Math.round((bar.amount / maxTrendAmount) * 100),
    }));

    const currentWeekRevenue = trendBarsRaw.reduce((sum, row) => sum + row.amount, 0);
    const previousWeekRevenue = previous7DayKeys.reduce(
      (sum, key) => sum + toFiniteNumber(dailyRevenuePrevious[key]),
      0
    );
    const weeklyGrowthPercent = toPercentDiff(currentWeekRevenue, previousWeekRevenue);

    let bestDay = '-';
    const bestDayRow = trendBarsRaw.reduce((best, candidate) => {
      if (!best) return candidate;
      return candidate.amount > best.amount ? candidate : best;
    }, null);
    if (bestDayRow && bestDayRow.amount > 0) {
      bestDay = bestDayRow.label;
    }

    const sortedBillingEntries = [...(scopedBillingEntries || [])].sort((left, right) => {
      const leftMs = toDateMs(left?.billed_at || left?.created_at) || 0;
      const rightMs = toDateMs(right?.billed_at || right?.created_at) || 0;
      return rightMs - leftMs;
    });

    const billingRows = sortedBillingEntries.slice(0, 6).map((entry) => {
      const status = normalizeBillingStatus(entry?.status);
      const label = String(entry?.reference_label || '').trim();
      const id = String(entry?.id || label || Math.random());

      return {
        id,
        client: label || `Invoice ${id.slice(0, 8).toUpperCase()}`,
        amount: toFiniteNumber(entry?.amount),
        status: FINANCE_BILLING_STATUS_LABEL[status] || 'Pending',
      };
    });

    const totalReceivables = (scopedBillingEntries || []).reduce((sum, entry) => {
      const status = normalizeBillingStatus(entry?.status);
      if (status === 'PAID') return sum;
      return sum + toFiniteNumber(entry?.amount);
    }, 0);

    return {
      overview: {
        totalRevenue,
        netProfit,
        avgCostPerRoute,
        revenueTrendPercent,
        netProfitTrendPercent,
        avgCostTrendPercent,
      },
      costBreakdown: costBreakdownRows,
      routeProfit: {
        labels: routeProfitLabels,
        revenue: routeProfitRevenue,
        costs: routeProfitCosts,
        latestRevenue,
        latestCost,
        latestProfit,
      },
      riderPayouts: riderPayoutRows,
      riderEarnings: riderEarningsRows,
      fuelEfficiency: {
        kmPerLiter,
        totalDistanceKm,
        fuelLiters: totalFuelLiters,
      },
      trends: {
        bars: trendBars,
        weeklyGrowthPercent,
        bestDay,
      },
      billingStatus: {
        rows: billingRows,
        totalReceivables,
      },
      meta: {
        usesEstimatedCosts,
        selectedTimeRange: normalizedTimeRange,
        selectedRegion: normalizedRegionFilter,
        availableRegions: collectAvailableRegions(scopedBillingEntries, scopedCostEntries, scopedPayoutEntries),
      },
    };
  } catch (err) {
    console.error('[Supabase] Unexpected finance dashboard error:', err);
    return null;
  }
};

export const createFinanceCostEntry = async (payload = {}, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) {
      return { success: false, error: 'No organization found.' };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const category = normalizeCostCategory(payload?.category);
    const amount = toFiniteNumber(payload?.amount);
    const fuelLiters = payload?.fuel_liters == null ? null : toFiniteNumber(payload?.fuel_liters);
    const notes = typeof payload?.notes === 'string' ? payload.notes.trim() : null;
    const region = typeof payload?.region === 'string' && payload.region.trim() ? payload.region.trim() : null;
    const incurredAt = payload?.incurred_at || new Date().toISOString();

    if (amount <= 0) {
      return { success: false, error: 'Amount must be greater than 0.' };
    }

    const baseInsertPayload = {
      organization_id: orgId,
      category,
      amount,
      fuel_liters: fuelLiters,
      notes,
      region,
      incurred_at: incurredAt,
      created_by: session.user.id,
    };

    let response = await supabase
      .from('finance_cost_entries')
      .insert([baseInsertPayload])
      .select('*')
      .single();

    if (response.error && isMissingColumnError(response.error)) {
      const legacyInsertPayload = { ...baseInsertPayload };
      delete legacyInsertPayload.region;
      response = await supabase
        .from('finance_cost_entries')
        .insert([legacyInsertPayload])
        .select('*')
        .single();
    }

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    return { success: true, data: response.data };
  } catch (err) {
    console.error('[Supabase] Unexpected create finance cost entry error:', err);
    return { success: false, error: err?.message || 'Unexpected finance cost entry error.' };
  }
};

export const createFinancePayoutEntry = async (payload = {}, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) {
      return { success: false, error: 'No organization found.' };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const payoutType = normalizePayoutType(payload?.payout_type);
    const amount = toFiniteNumber(payload?.amount);
    const status = normalizeBillingStatus(payload?.status);
    const payoutDate = payload?.payout_date || new Date().toISOString();
    const reference = typeof payload?.reference === 'string' ? payload.reference.trim() : null;
    const riderId = typeof payload?.rider_id === 'string' && payload.rider_id.trim() ? payload.rider_id : null;
    const region = typeof payload?.region === 'string' && payload.region.trim() ? payload.region.trim() : null;

    if (amount <= 0) {
      return { success: false, error: 'Amount must be greater than 0.' };
    }

    const baseInsertPayload = {
      organization_id: orgId,
      rider_id: riderId,
      payout_type: payoutType,
      amount,
      status,
      payout_date: payoutDate,
      reference,
      region,
      created_by: session.user.id,
    };

    let response = await supabase
      .from('finance_payout_entries')
      .insert([baseInsertPayload])
      .select('*')
      .single();

    if (response.error && isMissingColumnError(response.error)) {
      const legacyInsertPayload = { ...baseInsertPayload };
      delete legacyInsertPayload.region;
      response = await supabase
        .from('finance_payout_entries')
        .insert([legacyInsertPayload])
        .select('*')
        .single();
    }

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    return { success: true, data: response.data };
  } catch (err) {
    console.error('[Supabase] Unexpected create finance payout entry error:', err);
    return { success: false, error: err?.message || 'Unexpected finance payout entry error.' };
  }
};

export const createFinanceBillingEntry = async (payload = {}, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) {
      return { success: false, error: 'No organization found.' };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const referenceLabel = typeof payload?.reference_label === 'string' ? payload.reference_label.trim() : '';
    const amount = toFiniteNumber(payload?.amount);
    const status = normalizeBillingStatus(payload?.status);
    const billedAt = payload?.billed_at || new Date().toISOString();
    const dueAt = payload?.due_at || null;
    const paidAt = payload?.paid_at || null;
    const notes = typeof payload?.notes === 'string' ? payload.notes.trim() : null;
    const region = typeof payload?.region === 'string' && payload.region.trim() ? payload.region.trim() : null;

    if (!referenceLabel) {
      return { success: false, error: 'Reference label is required.' };
    }

    if (amount <= 0) {
      return { success: false, error: 'Amount must be greater than 0.' };
    }

    const baseInsertPayload = {
      organization_id: orgId,
      reference_label: referenceLabel,
      amount,
      status,
      billed_at: billedAt,
      due_at: dueAt,
      paid_at: paidAt,
      notes,
      region,
      created_by: session.user.id,
    };

    let response = await supabase
      .from('finance_billing_entries')
      .insert([baseInsertPayload])
      .select('*')
      .single();

    if (response.error && isMissingColumnError(response.error)) {
      const legacyInsertPayload = { ...baseInsertPayload };
      delete legacyInsertPayload.region;
      response = await supabase
        .from('finance_billing_entries')
        .insert([legacyInsertPayload])
        .select('*')
        .single();
    }

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    return { success: true, data: response.data };
  } catch (err) {
    console.error('[Supabase] Unexpected create finance billing entry error:', err);
    return { success: false, error: err?.message || 'Unexpected finance billing entry error.' };
  }
};

// Get analytics for specific rider
export const getAnalyticsByRider = async (riderId) => {
  try {
    const { data, error } = await supabase
      .from('analytics')
      .select('*')
      .eq('rider_id', riderId)
      .maybeSingle();
    
    if (error) {
      console.error('[Supabase] Analytics by rider fetch error:', error.message);
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('[Supabase] Unexpected analytics error:', err);
    return null;
  }
};

/**
 * ===== DELIVERIES =====
 */

// Get deliveries for a route
export const getDeliveriesByRoute = async (routeId) => {
  try {
    const { rows, error } = await queryDeliveriesWithParcelFallback(
      (selectClause) =>
        supabase
          .from('deliveries')
          .select(selectClause)
          .eq('route_id', routeId)
          .order('sequence', { ascending: true }),
      'Deliveries by route'
    );

    if (error) {
      console.error('[Supabase] Deliveries fetch error:', error.message || error);
      return [];
    }

    const hydratedRows = await hydrateDeliveriesWithClusterMemberData(rows, 'Deliveries');
    return await attachDeliveryStops(hydratedRows, 'Deliveries');
  } catch (err) {
    console.error('[Supabase] Unexpected deliveries error:', err);
    return [];
  }
};

// Complete a delivery stop (cluster-aware). If stop_id/shipment_tracking_id is omitted,
// the backend completes the next pending stop by sequence.
export const completeDeliveryStop = async (
  deliveryId,
  { stopId = null, shipmentTrackingId = null } = {}
) => {
  try {
    if (!deliveryId) {
      return { success: false, error: 'deliveryId is required.' };
    }

    const payload = {
      p_delivery_id: deliveryId,
      p_stop_id: stopId || null,
      p_shipment_tracking_id: shipmentTrackingId || null,
    };

    const { data, error } = await supabase.rpc('complete_delivery_stop', payload);

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      return {
        success: true,
        data: row || null,
      };
    }

    const message = String(error?.message || '').toLowerCase();
    const isMissingRpc =
      message.includes('complete_delivery_stop') &&
      (message.includes('does not exist') || message.includes('schema cache'));

    if (!isMissingRpc) {
      return { success: false, error: error.message || 'Failed to complete delivery stop.' };
    }

    const { error: fallbackError } = await supabase
      .from('deliveries')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    if (fallbackError) {
      return { success: false, error: fallbackError.message || 'Failed to complete delivery.' };
    }

    return {
      success: true,
      data: {
        delivery_id: deliveryId,
        delivery_status: 'completed',
      },
      warning: 'complete_delivery_stop RPC unavailable; applied legacy delivery completion fallback.',
    };
  } catch (err) {
    console.error('[Supabase] completeDeliveryStop unexpected error:', err);
    return {
      success: false,
      error: err?.message || 'Unexpected completion error.',
    };
  }
};

// Get a single delivery by shipment/tracking code or delivery/parcel UUID
export const findDeliveryByShipmentOrTrackingId = async (shipmentId, organizationId = null) => {
  try {
    const query = typeof shipmentId === 'string' ? shipmentId.trim() : '';
    if (!query) return null;

    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return null;

    const normalizedQuery = query.toLowerCase();
    const isUuidQuery = UUID_REGEX.test(query);
    const candidateMap = new Map();

    const addCandidates = (rows = []) => {
      rows.forEach((row) => {
        if (!row?.id) return;
        candidateMap.set(row.id, row);
      });
    };

    const selectLookupRows = async (queryFactory, label) => {
      const { rows, error } = await queryDeliveriesWithParcelFallback(
        queryFactory,
        label,
        DELIVERY_LOOKUP_SELECT
      );

      if (error) {
        if (!isMissingDeliveryClusterColumnError(error)) {
          console.error(`[Supabase] ${label} failed:`, error.message || error);
        }
        return [];
      }

      return rows;
    };

    const runLookupWithClusterColumnFallback = async ({
      label,
      withClusterQueryFactory,
      legacyQueryFactory,
    }) => {
      let rows = await selectLookupRows(withClusterQueryFactory, label);

      if (rows.length > 0) {
        return rows;
      }

      if (typeof legacyQueryFactory !== 'function') {
        return rows;
      }

      const fallbackRows = await selectLookupRows(
        legacyQueryFactory,
        `${label} (legacy column fallback)`
      );

      return fallbackRows;
    };

    const fetchByParcelListIds = async (parcelListIds = []) => {
      if (!Array.isArray(parcelListIds) || parcelListIds.length === 0) return;

      const sanitizedIds = parcelListIds.filter((id) => typeof id === 'string' && id.length > 0);
      if (sanitizedIds.length === 0) return;

      const lookupRows = await runLookupWithClusterColumnFallback({
        label: 'Deliveries lookup by parcel list',
        withClusterQueryFactory: (selectClause) =>
          supabase
            .from('deliveries')
            .select(selectClause)
            .or(`parcel_id.in.(${sanitizedIds.join(',')}),parcel_cluster_id.in.(${sanitizedIds.join(',')}),parcel_list_id.in.(${sanitizedIds.join(',')})`)
            .order('created_at', { ascending: false })
            .limit(20),
        legacyQueryFactory: (selectClause) =>
          supabase
            .from('deliveries')
            .select(selectClause)
            .or(`parcel_id.in.(${sanitizedIds.join(',')}),parcel_list_id.in.(${sanitizedIds.join(',')})`)
            .order('created_at', { ascending: false })
            .limit(20),
      });

      addCandidates(lookupRows);
    };

    const { data: exactParcels, error: exactParcelsError } = await supabase
      .from('parcel_lists')
      .select('id, tracking_code')
      .eq('organization_id', orgId)
      .ilike('tracking_code', query)
      .limit(10);

    if (exactParcelsError) {
      console.error('[Supabase] Tracking code lookup failed:', exactParcelsError.message);
    } else {
      await fetchByParcelListIds((exactParcels || []).map((parcel) => parcel.id));
    }

    const exactClusterIds = new Set();

    const appendClusterIds = (rows = []) => {
      rows.forEach((row) => {
        const id = typeof row?.id === 'string' ? row.id : '';
        if (id.length > 0) {
          exactClusterIds.add(id);
        }
      });
    };

    const [clustersByTracking, clustersByName, clustersById] = await Promise.all([
      supabase
        .from('parcel_clusters')
        .select('id')
        .eq('organization_id', orgId)
        .ilike('tracking_code', query)
        .limit(10),
      supabase
        .from('parcel_clusters')
        .select('id')
        .eq('organization_id', orgId)
        .ilike('cluster_name', query)
        .limit(10),
      isUuidQuery
        ? supabase
            .from('parcel_clusters')
            .select('id')
            .eq('organization_id', orgId)
            .eq('id', query)
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const clusterLookups = [
      { label: 'tracking code', result: clustersByTracking },
      { label: 'cluster name', result: clustersByName },
      { label: 'cluster id', result: clustersById },
    ];

    clusterLookups.forEach(({ label, result }) => {
      if (result?.error) {
        if (!isMissingRelationError(result.error)) {
          console.warn(
            `[Supabase] Cluster lookup by ${label} failed:`,
            result.error.message || result.error
          );
        }
        return;
      }

      appendClusterIds(result?.data || []);
    });

    if (exactClusterIds.size > 0) {
      await fetchByParcelListIds(Array.from(exactClusterIds));
    }

    if (candidateMap.size === 0 && isUuidQuery) {
      const lookupRows = await runLookupWithClusterColumnFallback({
        label: 'UUID delivery lookup',
        withClusterQueryFactory: (selectClause) =>
          supabase
            .from('deliveries')
            .select(selectClause)
            .or(`id.eq.${query},parcel_id.eq.${query},parcel_cluster_id.eq.${query},parcel_list_id.eq.${query},shipment_tracking_id.eq.${query}`)
            .order('created_at', { ascending: false })
            .limit(20),
        legacyQueryFactory: (selectClause) =>
          supabase
            .from('deliveries')
            .select(selectClause)
            .or(`id.eq.${query},parcel_id.eq.${query},parcel_list_id.eq.${query},shipment_tracking_id.eq.${query}`)
            .order('created_at', { ascending: false })
            .limit(20),
      });

      addCandidates(lookupRows);
    }

    if (candidateMap.size === 0) {
      const lookupRows = await selectLookupRows(
        (selectClause) =>
          supabase
            .from('deliveries')
            .select(selectClause)
            .eq('shipment_tracking_id', query)
            .order('created_at', { ascending: false })
            .limit(20),
        'Shipment tracking lookup'
      );

      addCandidates(lookupRows);
    }

    if (candidateMap.size === 0) {
      const { data: stopRows, error: stopLookupError } = await supabase
        .from('delivery_stops')
        .select('delivery_id')
        .eq('shipment_tracking_id', query)
        .limit(20);

      if (stopLookupError) {
        if (!isMissingDeliveryStopsRelationError(stopLookupError)) {
          console.warn('[Supabase] Delivery stop shipment lookup warning:', stopLookupError.message);
        }
      } else {
        const deliveryIds = Array.from(
          new Set(
            (stopRows || [])
              .map((row) => row?.delivery_id)
              .filter((id) => typeof id === 'string' && id.length > 0)
          )
        );

        if (deliveryIds.length > 0) {
          const lookupRows = await selectLookupRows(
            (selectClause) =>
              supabase
                .from('deliveries')
                .select(selectClause)
                .in('id', deliveryIds)
                .order('created_at', { ascending: false })
                .limit(20),
            'Delivery lookup by stop shipment ID'
          );

          addCandidates(lookupRows);
        }
      }
    }

    if (candidateMap.size === 0) {
      const { data: fuzzyParcels, error: fuzzyParcelsError } = await supabase
        .from('parcel_lists')
        .select('id, tracking_code')
        .eq('organization_id', orgId)
        .ilike('tracking_code', `%${query}%`)
        .limit(10);

      if (fuzzyParcelsError) {
        console.error('[Supabase] Fuzzy tracking lookup failed:', fuzzyParcelsError.message);
      } else {
        await fetchByParcelListIds((fuzzyParcels || []).map((parcel) => parcel.id));
      }
    }

    if (candidateMap.size === 0) {
      const fuzzyClusterIds = new Set();

      const appendFuzzyClusterIds = (rows = []) => {
        rows.forEach((row) => {
          const id = typeof row?.id === 'string' ? row.id : '';
          if (id.length > 0) {
            fuzzyClusterIds.add(id);
          }
        });
      };

      const [fuzzyClustersByTracking, fuzzyClustersByName] = await Promise.all([
        supabase
          .from('parcel_clusters')
          .select('id')
          .eq('organization_id', orgId)
          .ilike('tracking_code', `%${query}%`)
          .limit(10),
        supabase
          .from('parcel_clusters')
          .select('id')
          .eq('organization_id', orgId)
          .ilike('cluster_name', `%${query}%`)
          .limit(10),
      ]);

      [
        { label: 'tracking code', result: fuzzyClustersByTracking },
        { label: 'cluster name', result: fuzzyClustersByName },
      ].forEach(({ label, result }) => {
        if (result?.error) {
          if (!isMissingRelationError(result.error)) {
            console.warn(
              `[Supabase] Fuzzy cluster lookup by ${label} failed:`,
              result.error.message || result.error
            );
          }
          return;
        }

        appendFuzzyClusterIds(result?.data || []);
      });

      if (fuzzyClusterIds.size > 0) {
        await fetchByParcelListIds(Array.from(fuzzyClusterIds));
      }
    }

    const normalizedCandidates = Array.from(candidateMap.values())
      .map(normalizeDeliveryRow)
      .filter(Boolean);

    const candidatesWithCoordinates = await hydrateDeliveriesWithClusterMemberData(
      normalizedCandidates,
      'Delivery lookup'
    );

    const candidates = await attachDeliveryStops(candidatesWithCoordinates, 'Delivery lookup');

    if (candidates.length === 0) return null;

    const scoreCandidate = (candidate) => {
      const parcel = candidate?.parcel_lists || null;
      const trackingCode = (parcel?.tracking_code || '').toLowerCase();
      const shipmentTrackingId = (candidate?.shipment_tracking_id || '').toLowerCase();
      const deliveryId = (candidate?.id || '').toLowerCase();
      const parcelId = (candidate?.parcel_id || '').toLowerCase();
      const parcelClusterId = (candidate?.parcel_cluster_id || '').toLowerCase();
      const parcelListId = (candidate?.parcel_list_id || '').toLowerCase();
      const clusterTrackingCode = (candidate?.parcel_clusters?.tracking_code || '').toLowerCase();
      const clusterName = (candidate?.parcel_clusters?.cluster_name || '').toLowerCase();

      let score = 0;

      if (trackingCode === normalizedQuery) score += 500;
      else if (trackingCode.startsWith(normalizedQuery)) score += 300;
      else if (trackingCode.includes(normalizedQuery)) score += 180;

      if (shipmentTrackingId === normalizedQuery) score += 520;
      else if (shipmentTrackingId.startsWith(normalizedQuery)) score += 320;
      else if (shipmentTrackingId.includes(normalizedQuery)) score += 190;

      if (clusterTrackingCode === normalizedQuery) score += 510;
      else if (clusterTrackingCode.startsWith(normalizedQuery)) score += 310;
      else if (clusterTrackingCode.includes(normalizedQuery)) score += 185;

      if (clusterName === normalizedQuery) score += 260;
      else if (clusterName.startsWith(normalizedQuery)) score += 180;
      else if (clusterName.includes(normalizedQuery)) score += 120;

      if (deliveryId === normalizedQuery) score += 450;
      if (parcelId === normalizedQuery) score += 420;
      if (parcelClusterId === normalizedQuery) score += 420;
      if (parcelListId === normalizedQuery) score += 420;

      if ((candidate?.status || '').toLowerCase() === 'active') score += 40;

      return score;
    };

    candidates.sort((left, right) => {
      const scoreDiff = scoreCandidate(right) - scoreCandidate(left);
      if (scoreDiff !== 0) return scoreDiff;

      const leftCreated = new Date(left?.created_at || '').getTime();
      const rightCreated = new Date(right?.created_at || '').getTime();
      return (Number.isFinite(rightCreated) ? rightCreated : 0) - (Number.isFinite(leftCreated) ? leftCreated : 0);
    });

    return candidates[0];
  } catch (err) {
    console.error('[Supabase] Unexpected shipment lookup error:', err);
    return null;
  }
};

/**
 * ===== NOTIFICATIONS =====
 */

// Fetch notifications for current organization
export const getNotifications = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select(`
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
        geofence_id,
        riders (
          id,
          profile_id,
          profiles:profile_id (
            full_name
          )
        )
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Notifications fetch error:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected notifications error:', err);
    return [];
  }
};

/**
 * ===== VIOLATIONS =====
 */

// Fetch violations for current organization
export const getViolations = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('violations')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Violations fetch error:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected violations error:', err);
    return [];
  }
};

/**
 * ===== LOCATION LOGS =====
 */

// Get latest location for a rider
export const getLatestRiderLocation = async (riderId) => {
  try {
    const { data, error } = await supabase
      .from('location_logs')
      .select('latitude, longitude, accuracy, timestamp')
      .eq('rider_id', riderId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error('[Supabase] Location fetch error:', error.message);
      return null;
    }

    if (data) return data;

    // Fallback to rider's latest stored coordinates when logs are unavailable.
    const { data: riderData, error: riderError } = await supabase
      .from('riders')
      .select('current_latitude, current_longitude, current_location_accuracy, current_location_at')
      .eq('id', riderId)
      .maybeSingle();

    if (riderError) {
      console.error('[Supabase] Rider fallback location fetch error:', riderError.message);
      return null;
    }

    if (
      riderData &&
      typeof riderData.current_latitude === 'number' &&
      Number.isFinite(riderData.current_latitude) &&
      typeof riderData.current_longitude === 'number' &&
      Number.isFinite(riderData.current_longitude)
    ) {
      return {
        latitude: riderData.current_latitude,
        longitude: riderData.current_longitude,
        accuracy: riderData.current_location_accuracy,
        timestamp: riderData.current_location_at,
      };
    }
    
    return null;
  } catch (err) {
    console.error('[Supabase] Unexpected location error:', err);
    return null;
  }
};

// Get location history for a rider
export const getRiderLocationHistory = async (riderId, hours = 24) => {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('location_logs')
      .select('latitude, longitude, accuracy, timestamp')
      .eq('rider_id', riderId)
      .gte('timestamp', since)
      .order('timestamp', { ascending: true });
    
    if (error) {
      console.error('[Supabase] Location history fetch error:', error.message);
      return [];
    }

    if (Array.isArray(data) && data.length > 0) {
      return data;
    }

    const fallback = await getLatestRiderLocation(riderId);
    if (
      fallback &&
      typeof fallback.latitude === 'number' &&
      Number.isFinite(fallback.latitude) &&
      typeof fallback.longitude === 'number' &&
      Number.isFinite(fallback.longitude)
    ) {
      return [fallback];
    }
    
    return [];
  } catch (err) {
    console.error('[Supabase] Unexpected location history error:', err);
    return [];
  }
};

/**
 * ===== GEOFENCES =====
 */

// Fetch geofences for current organization
export const getGeofences = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('geofences')
      .select('*')
      .eq('organization_id', orgId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Geofences fetch error:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected geofences error:', err);
    return [];
  }
};

// Create geofence for current supervisor organization
export const createGeofence = async (input = {}, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) {
      return { success: false, error: 'No organization found for current user.' };
    }

    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) {
      return { success: false, error: 'Geofence name is required.' };
    }

    const geometry = input?.geometry;
    const hasGeometry = geometry && typeof geometry === 'object';
    if (!hasGeometry) {
      return { success: false, error: 'Valid geofence geometry is required.' };
    }

    const payload = {
      organization_id: orgId,
      name,
      geometry,
      severity: input?.severity || 'info',
      is_active: input?.is_active ?? true,
      zone_type: input?.zone_type || 'RESTRICTED',
      allow_exit: input?.allow_exit ?? false,
      max_dwell_minutes:
        typeof input?.max_dwell_minutes === 'number' && Number.isFinite(input.max_dwell_minutes)
          ? Math.max(0, Math.round(input.max_dwell_minutes))
          : null,
      required_entry: input?.required_entry ?? false,
      rules: input?.rules && typeof input.rules === 'object' ? input.rules : {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('geofences')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      const message = String(error.message || '').toLowerCase();

      if (message.includes('row-level security') || message.includes('permission denied')) {
        return {
          success: false,
          error: 'Only supervisors in this organization can create geofences.',
        };
      }

      return { success: false, error: error.message || 'Failed to create geofence.' };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[Supabase] Unexpected create geofence error:', err);
    return {
      success: false,
      error: err?.message || 'Unexpected geofence creation error.',
    };
  }
};

/**
 * ===== DASHBOARD METRICS =====
 */

// Get dashboard summary
export const getDashboardSummary = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return null;

    const [riders, parcels, routes, analytics, notifications] = await Promise.all([
      getRiders(orgId),
      getParcels(orgId),
      getRoutes(orgId),
      getAnalytics(orgId),
      getNotifications(orgId),
    ]);

    return {
      totalRiders: riders.length,
      activeRiders: riders.filter(r => r.status === 'active' || r.status === 'available').length,
      totalParcels: parcels.length,
      pendingParcels: parcels.filter(p => p.status === 'unassigned' || p.status === 'pending').length,
      totalRoutes: routes.length,
      activeRoutes: routes.filter(r => r.status === 'active').length,
      totalEarnings: analytics.reduce((sum, a) => sum + (a.today_earnings || 0), 0),
      totalDeliveries: analytics.reduce((sum, a) => sum + (a.today_deliveries_completed || 0), 0),
      unacknowledgedNotifications: notifications.filter(n => !n.acknowledged).length,
    };
  } catch (err) {
    console.error('[Supabase] Dashboard summary error:', err);
    return null;
  }
};

/**
 * ===== DELIVERY ASSIGNMENT (SUPERVISOR) =====
 */

// Create a route for a rider
export const createRouteForRider = async (riderId, clusterName = null, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');

    // Verify rider belongs to this organization
    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('id, organization_id')
      .eq('id', riderId)
      .eq('organization_id', orgId)
      .single();

    if (riderError || !rider) {
      throw new Error('Rider not found or does not belong to your organization');
    }

    // Create route
    const { data, error } = await supabase
      .from('routes')
      .insert([{
        rider_id: riderId,
        cluster_name: clusterName || null,
        status: 'active',
      }])
      .select();

    if (error) {
      console.error('[Supabase] Route creation error:', error.message);
      throw new Error(`Failed to create route: ${error.message}`);
    }

    return data?.[0];
  } catch (err) {
    console.error('[Supabase] Unexpected route creation error:', err);
    throw err;
  }
};

// Create deliveries for a route from parcel IDs
export const createDeliveriesFromParcels = async (routeId, parcelIds = [], organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');

    if (!Array.isArray(parcelIds) || parcelIds.length === 0) {
      throw new Error('No parcels provided');
    }

    // Get route to verify it exists
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id, rider_id')
      .eq('id', routeId)
      .single();

    if (routeError || !route) {
      throw new Error('Route not found');
    }

    // Get parcels from parcel_lists to verify they belong to org and exist
    const { data: parcels, error: parcelError } = await supabase
      .from('parcel_lists')
      .select('id')
      .eq('organization_id', orgId)
      .in('id', parcelIds);

    if (parcelError) {
      console.error('[Supabase] Error querying parcel_lists:', parcelError);
      throw new Error(`Failed to fetch parcels: ${parcelError.message}`);
    }

    if (!parcels || parcels.length === 0) {
      throw new Error('Some parcels not found or do not belong to your organization');
    }

    // Create delivery records
    const deliveriesPayload = parcels.map((p, idx) => ({
      route_id: routeId,
      parcel_id: p.id,  // References parcel_lists.id
      rider_id: route.rider_id,
      sequence: idx + 1,
      status: 'pending',
    }));

    console.log('[Supabase] Creating deliveries:', {
      routeId,
      riderId: route.rider_id,
      parcelCount: parcels.length,
      parcelIds: parcels.map(p => p.id),
    });

    const { data, error } = await supabase
      .from('deliveries')
      .insert(deliveriesPayload)
      .select();

    if (error) {
      console.error('[Supabase] Delivery creation error:', error);
      // Provide helpful error messages
      if (error.message && error.message.includes('row-level security')) {
        throw new Error('You do not have permission to create deliveries. Please ensure you are logged in as a supervisor for this organization.');
      }
      if (error.message && error.message.includes('foreign key')) {
        throw new Error(`Failed to create deliveries: Invalid parcel or route reference. ${error.message}`);
      }
      throw new Error(`Failed to create deliveries: ${error.message}`);
    }

    const assignedParcelIds = (parcels || [])
      .map((parcel) => parcel?.id)
      .filter((id) => typeof id === 'string' && id.length > 0);

    if (assignedParcelIds.length > 0) {
      const { error: statusUpdateError } = await supabase
        .from('parcel_lists')
        .update({ status: 'assigned' })
        .eq('organization_id', orgId)
        .in('id', assignedParcelIds);

      if (statusUpdateError) {
        console.warn('[Supabase] Delivery assignment status update warning:', statusUpdateError.message);
      }
    }

    console.log('[Supabase] Successfully created deliveries:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected delivery creation error:', err);
    throw err;
  }
};

// Assign parcels directly to a rider (creates route + deliveries in one call)
export const assignParcelsToRider = async (riderId, parcelIds = [], clusterName = null, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');

    // Create route first
    const route = await createRouteForRider(riderId, clusterName, orgId);
    if (!route || !route.id) throw new Error('Failed to create route');

    // Create deliveries
    const deliveries = await createDeliveriesFromParcels(route.id, parcelIds, orgId);

    return {
      route,
      deliveries,
      totalDeliveries: deliveries.length,
    };
  } catch (err) {
    console.error('[Supabase] Assignment error:', err);
    throw err;
  }
};

// Get unassigned/pending parcels for organization assignment (org-specific pool)
export const getOrgUnassignedParcels = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('parcel_lists')
      .select('id, tracking_code, address, weight_kg, latitude, longitude, priority, region')
      .eq('organization_id', orgId)
      .in('status', ['unassigned', 'pending', 'acquired'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Supabase] Unassigned parcels fetch error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected unassigned parcels error:', err);
    return [];
  }
};

// Legacy mock API wrappers (kept for compatibility)
export const getAssignSuggestion = () => Promise.resolve({ routes: [] });
export const postAutoAssign = () => Promise.resolve({ routes: [] });

/**
 * ===== RIDER MANAGEMENT =====
 */

// Update rider capacity
export const updateRiderCapacity = async (riderId, capacity) => {
  try {
    const { data, error } = await supabase
      .from('riders')
      .update({ capacity })
      .eq('id', riderId)
      .select();
    
    if (error) {
      console.error('[Supabase] Rider capacity update error:', error.message);
      throw new Error(`Failed to update capacity: ${error.message}`);
    }
    
    return data?.[0];
  } catch (err) {
    console.error('[Supabase] Unexpected rider capacity update error:', err);
    throw err;
  }
};

/**
 * ===== SIMPLE PARCEL ASSIGNMENT =====
 */

// Assign a single parcel to a rider (simple version for current sprint)
export const assignParcelToRider = async (parcelId, riderId, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');

    // Update parcel_lists to mark as assigned
    const { data: parcelUpdate, error: parcelError } = await supabase
      .from('parcel_lists')
      .update({ status: 'assigned' })
      .eq('id', parcelId)
      .eq('organization_id', orgId)
      .select();

    if (parcelError) {
      throw new Error(`Failed to update parcel: ${parcelError.message}`);
    }

    if (!parcelUpdate || parcelUpdate.length === 0) {
      throw new Error('Parcel not found in your organization');
    }

    return parcelUpdate[0];
  } catch (err) {
    console.error('[Supabase] Parcel assignment error:', err);
    throw err;
  }
};

// Unassign a parcel from a rider
export const unassignParcel = async (parcelId, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');

    const { data, error } = await supabase
      .from('parcel_lists')
      .update({ status: 'unassigned' })
      .eq('id', parcelId)
      .eq('organization_id', orgId)
      .select();

    if (error) {
      throw new Error(`Failed to unassign parcel: ${error.message}`);
    }

    return data?.[0];
  } catch (err) {
    console.error('[Supabase] Parcel unassignment error:', err);
    throw err;
  }
};

/**
 * ===== PARCEL CLUSTERS =====
 */

// Get unassigned raw parcels (not parcel_lists, actual parcels)
export const getUnassignedRawParcels = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    // Get unassigned parcel_lists which have address data
    const { data, error } = await supabase
      .from('parcel_lists')
      .select('id, address, latitude, longitude, region, status, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'unassigned')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Supabase] Unassigned parcels fetch error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Unexpected unassigned parcels error:', err);
    return [];
  }
};

// Create parcel clusters by proximity.
// Canonical RPC: create_parcel_clusters
export const createParcelClustersByProximity = async (distanceMeters = 2000, organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');

    // Get current user
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const supervisorId = session.user.id;

    // Call the stored procedure
    const { data, error } = await supabase
      .rpc('create_parcel_clusters', {
        p_organization_id: orgId,
        p_supervisor_id: supervisorId,
        p_distance_meters: distanceMeters,
      });

    if (error) {
      console.error('[Supabase] Parcel cluster RPC error:', error);
      throw new Error(`Failed to create parcel clusters: ${error.message}`);
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Parcel cluster creation error:', err);
    throw err;
  }
};

// Backward-compatible alias
export const consolidateParcelsByProximity = createParcelClustersByProximity;

// Get parcel clusters (single source of truth).
// This reads from the parcel_clusters view created by SQL migration.
export const getParcelClusters = async (organizationId = null, statuses = ['pending']) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return [];

    let query = supabase
      .from('parcel_clusters')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (Array.isArray(statuses) && statuses.length > 0) {
      query = query.in('status', statuses);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingParcelClustersRelationError(error)) {
        console.warn('[Supabase] parcel_clusters view missing; using parcel_lists fallback.');

        const fallback = await getParcelClustersFromParcelListsFallback({
          organizationId: orgId,
          statuses,
        });

        return fallback.rows;
      }

      console.error('[Supabase] Parcel clusters fetch error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Parcel clusters error:', err);
    return [];
  }
};

// Backward-compatible alias
export const getConsolidatedParcelLists = getParcelClusters;

// Check how many unassigned parcels are available for consolidation
export const getUnassignedParcelsCount = async (organizationId = null) => {
  try {
    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) return 0;

    // Count from BOTH parcels table and unassigned parcel_lists
    const [{ count: parcelCount, error: parcelError }, { count: parcelListCount, error: parcelListError }] = await Promise.all([
      supabase
        .from('parcels')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'unassigned'),
      supabase
        .from('parcel_lists')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'unassigned')
    ]);

    if (parcelError) {
      console.error('[Supabase] Parcels count error:', parcelError.message);
    }
    if (parcelListError) {
      console.error('[Supabase] Parcel lists count error:', parcelListError.message);
    }
    
    const totalCount = (parcelCount || 0) + (parcelListCount || 0);
    console.log('[API] getUnassignedParcelsCount: Found', totalCount, 'unassigned (parcels:', parcelCount, 'parcel_lists:', parcelListCount, ')');
    return totalCount;
  } catch (err) {
    console.error('[Supabase] Unassigned parcels error:', err);
    return 0;
  }
};

// Get a single parcel cluster with all explicit item links.
export const getParcelClusterDetails = async (parcelListId) => {
  try {
    const { data, error } = await supabase
      .from('parcel_lists')
      .select(`
        id,
        organization_id,
        supervisor_id,
        parcel_count,
        latitude,
        longitude,
        status,
        cluster_name,
        created_at,
        parcel_list_items (
          id,
          parcel_id,
          sequence,
          parcels:parcel_id (
            id,
            lat,
            lng,
            status
          )
        ),
        profiles:supervisor_id (
          full_name,
          email_address
        )
      `)
      .eq('id', parcelListId)
      .single();

    if (error) {
      console.error('[Supabase] Parcel cluster details fetch error:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[Supabase] Unexpected parcel cluster details error:', err);
    return null;
  }
};

// Backward-compatible alias
export const getConsolidatedParcelListDetails = getParcelClusterDetails;

// Assign a parcel cluster to a rider.
export const assignParcelClusterToRider = async (parcelListId, riderId, organizationId = null) => {
  try {
    const isFiniteCoordinate = (value) => typeof value === 'number' && Number.isFinite(value);
    const normalizeClusterName = (value) =>
      String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

    const ASSIGNABLE_CLUSTER_STATUSES = new Set(['pending', 'acquired', 'unassigned']);
    const TERMINAL_CLUSTER_STATUSES = new Set(['completed', 'delivered', 'cancelled', 'failed']);

    const haversineKm = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;

      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const orderStopsByNearestNeighbor = (startLat, startLng, stops) => {
      if (!isFiniteCoordinate(startLat) || !isFiniteCoordinate(startLng)) {
        return [...stops].sort((left, right) => left.fallbackSequence - right.fallbackSequence);
      }

      const stopsWithCoordinates = stops.filter(
        (stop) => isFiniteCoordinate(stop.latitude) && isFiniteCoordinate(stop.longitude)
      );
      const stopsWithoutCoordinates = stops
        .filter((stop) => !isFiniteCoordinate(stop.latitude) || !isFiniteCoordinate(stop.longitude))
        .sort((left, right) => left.fallbackSequence - right.fallbackSequence);

      if (stopsWithCoordinates.length === 0) {
        return [...stops].sort((left, right) => left.fallbackSequence - right.fallbackSequence);
      }

      const remaining = [...stopsWithCoordinates];
      const ordered = [];
      let currentLat = startLat;
      let currentLng = startLng;

      while (remaining.length > 0) {
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        remaining.forEach((stop, index) => {
          const distance = haversineKm(currentLat, currentLng, stop.latitude, stop.longitude);

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });

        const [nextStop] = remaining.splice(nearestIndex, 1);
        ordered.push(nextStop);
        currentLat = nextStop.latitude;
        currentLng = nextStop.longitude;
      }

      return [...ordered, ...stopsWithoutCoordinates];
    };

    const orgId = organizationId || await getCurrentOrganizationId();
    if (!orgId) throw new Error('No organization found');

    // Get the parcel cluster row
    const { data: parcelCluster, error: listError } = await supabase
      .from('parcel_lists')
      .select('id, cluster_name, tracking_code, address, weight_kg, parcel_count, status, created_at')
      .eq('id', parcelListId)
      .eq('organization_id', orgId)
      .single();

    if (listError || !parcelCluster) {
      throw new Error('Parcel cluster not found');
    }

    const normalizedClusterName = normalizeClusterName(parcelCluster.cluster_name);
    if (!normalizedClusterName) {
      throw new Error('Selected parcel row is not linked to a valid cluster name');
    }

    const { data: allClusterRowsRaw, error: allClusterRowsError } = await supabase
      .from('parcel_lists')
      .select('id, cluster_name, tracking_code, address, weight_kg, latitude, longitude, status, created_at')
      .eq('organization_id', orgId)
      .not('cluster_name', 'is', null);

    if (allClusterRowsError) {
      throw new Error(`Failed to resolve cluster members: ${allClusterRowsError.message}`);
    }

    const matchingClusterRows = (Array.isArray(allClusterRowsRaw) ? allClusterRowsRaw : [])
      .filter((row) => normalizeClusterName(row?.cluster_name) === normalizedClusterName)
      .filter((row) => typeof row?.id === 'string' && row.id.length > 0);

    if (matchingClusterRows.length === 0) {
      throw new Error('No parcel rows found for the selected cluster');
    }

    const activeClusterRows = matchingClusterRows.filter(
      (row) => !TERMINAL_CLUSTER_STATUSES.has(normalizeStatus(row?.status))
    );

    if (activeClusterRows.length === 0) {
      throw new Error('This parcel cluster is already completed and can no longer be assigned.');
    }

    const hasNonAssignableClusterRow = activeClusterRows.some((row) => {
      const status = normalizeStatus(row?.status);
      if (!status) return false;
      return !ASSIGNABLE_CLUSTER_STATUSES.has(status);
    });

    if (hasNonAssignableClusterRow) {
      throw new Error(
        'This parcel cluster is already assigned or completed and can no longer be assigned.'
      );
    }

    const clusterMemberIds = Array.from(
      new Set(
        activeClusterRows
          .map((row) => row.id)
          .filter((id) => typeof id === 'string' && id.length > 0)
      )
    );

    if (clusterMemberIds.length === 0) {
      throw new Error('No assignable parcel rows found for the selected cluster');
    }

    const conflictResponses = await Promise.all([
      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .in('parcel_cluster_id', clusterMemberIds),
      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .in('parcel_list_id', clusterMemberIds),
      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .in('parcel_id', clusterMemberIds),
    ]);

    const firstConflictError = conflictResponses.find((response) => response.error)?.error;
    const hasDeliveryConflict = conflictResponses.some((response) => Number(response.count || 0) > 0);

    if (firstConflictError) {
      console.warn('[Supabase] Cluster conflict check warning:', firstConflictError.message);
    } else if (hasDeliveryConflict) {
      throw new Error(
        'This parcel cluster already has a delivery assignment and cannot be assigned again.'
      );
    }

    const canonicalClusterRow = [...activeClusterRows].sort((left, right) => {
      const leftCreatedAt = toDateMs(left?.created_at) || 0;
      const rightCreatedAt = toDateMs(right?.created_at) || 0;

      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
      }

      return String(left?.id || '').localeCompare(String(right?.id || ''));
    })[0] || parcelCluster;

    const canonicalClusterId =
      (typeof canonicalClusterRow?.id === 'string' && canonicalClusterRow.id.length > 0)
        ? canonicalClusterRow.id
        : parcelListId;

    const canonicalClusterName = String(
      canonicalClusterRow?.cluster_name || parcelCluster.cluster_name || ''
    ).trim();

    // Verify rider belongs to this organization
    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('id, organization_id, current_latitude, current_longitude')
      .eq('id', riderId)
      .eq('organization_id', orgId)
      .single();

    if (riderError || !rider) {
      throw new Error('Rider not found or does not belong to your organization');
    }

    // Get all explicit cluster members from parcel_list_items
    const { data: items, error: itemsError } = await supabase
      .from('parcel_list_items')
      .select(`
        parcel_list_id,
        parcel_id,
        sequence,
        parcels:parcel_id (
          lat,
          lng
        )
      `)
      .in('parcel_list_id', clusterMemberIds)
      .order('sequence', { ascending: true });

    if (itemsError) {
      throw new Error(`Failed to fetch parcel list items: ${itemsError.message}`);
    }

    const rowsFromParcelLists = activeClusterRows.map((row, index) => ({
      parcelId: null,
      parcelListId: row.id,
      shipmentTrackingId: row.tracking_code || row.id,
      fallbackSequence: index + 1,
      latitude: isFiniteCoordinate(row.latitude) ? row.latitude : null,
      longitude: isFiniteCoordinate(row.longitude) ? row.longitude : null,
      address: row.address || null,
      weightKg: toFiniteNumber(row.weight_kg),
    }));

    const rowsFromExplicitItems = (items || []).map((item, index) => {
      const linkedParcel = Array.isArray(item.parcels) ? item.parcels[0] : item.parcels;
      const latitude = isFiniteCoordinate(linkedParcel?.lat) ? linkedParcel.lat : null;
      const longitude = isFiniteCoordinate(linkedParcel?.lng) ? linkedParcel.lng : null;

      return {
        parcelId: item.parcel_id,
        parcelListId: null,
        shipmentTrackingId: item.parcel_id,
        fallbackSequence:
          typeof item.sequence === 'number' && Number.isFinite(item.sequence)
            ? item.sequence
            : index + 1,
        latitude,
        longitude,
        address: null,
        weightKg: 0,
      };
    });

    const normalizedStops = rowsFromExplicitItems.length > 0 ? rowsFromExplicitItems : rowsFromParcelLists;

    if (normalizedStops.length === 0) {
      throw new Error('No parcel cluster stop rows found for this cluster');
    }

    let riderStartLat = isFiniteCoordinate(rider.current_latitude) ? rider.current_latitude : null;
    let riderStartLng = isFiniteCoordinate(rider.current_longitude) ? rider.current_longitude : null;

    if (riderStartLat == null || riderStartLng == null) {
      const latestLocation = await getLatestRiderLocation(riderId);
      const fallbackLat = latestLocation?.latitude;
      const fallbackLng = latestLocation?.longitude;

      if (isFiniteCoordinate(fallbackLat) && isFiniteCoordinate(fallbackLng)) {
        riderStartLat = fallbackLat;
        riderStartLng = fallbackLng;
      }
    }

    const orderedStops = orderStopsByNearestNeighbor(riderStartLat, riderStartLng, normalizedStops);
    const clusterShipmentId =
      String(canonicalClusterRow?.tracking_code || parcelCluster.tracking_code || '').trim() ||
      canonicalClusterName ||
      `CLUSTER-${canonicalClusterId.slice(0, 8)}`;

    // Create a route for the rider only after all validations pass.
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .insert([{
        rider_id: riderId,
        cluster_name: canonicalClusterName || `Cluster-${canonicalClusterId.substring(0, 8)}`,
        status: 'active',
      }])
      .select()
      .single();

    if (routeError || !route) {
      throw new Error(`Failed to create route: ${routeError?.message}`);
    }

    const deliveryInsertAttempts = [
      {
        route_id: route.id,
        parcel_cluster_id: canonicalClusterId,
        parcel_list_id: canonicalClusterId,
        rider_id: riderId,
        sequence: 1,
        shipment_tracking_id: clusterShipmentId,
        delivery_type: 'cluster',
        delivery_stops_total: orderedStops.length,
        delivery_stops_completed: 0,
        status: 'pending',
      },
      {
        route_id: route.id,
        parcel_cluster_id: canonicalClusterId,
        parcel_list_id: canonicalClusterId,
        rider_id: riderId,
        sequence: 1,
        shipment_tracking_id: clusterShipmentId,
        status: 'pending',
      },
    ];

    let createdDelivery = null;
    let deliveryInsertError = null;

    for (const payload of deliveryInsertAttempts) {
      const { data: insertedDelivery, error: insertError } = await supabase
        .from('deliveries')
        .insert([payload])
        .select()
        .maybeSingle();

      if (!insertError && insertedDelivery) {
        createdDelivery = insertedDelivery;
        deliveryInsertError = null;
        break;
      }

      deliveryInsertError = insertError;
    }

    if (!createdDelivery) {
      const insertMessage = String(deliveryInsertError?.message || 'Unknown error');
      const lowerInsertMessage = insertMessage.toLowerCase();

      if (lowerInsertMessage.includes('parcel_cluster_id') && lowerInsertMessage.includes('does not exist')) {
        await supabase
          .from('routes')
          .delete()
          .eq('id', route.id);

        throw new Error(
          'Cluster delivery schema is missing deliveries.parcel_cluster_id. Run SQL_DELIVERIES_CLUSTER_SUPPORT.sql and retry assignment.'
        );
      }

      await supabase
        .from('routes')
        .delete()
        .eq('id', route.id);

      throw new Error(`Failed to create cluster delivery: ${insertMessage}`);
    }

    const deliveryStopsPayload = orderedStops.map((stop, index) => ({
      delivery_id: createdDelivery.id,
      stop_sequence: index + 1,
      parcel_id: stop.parcelId || null,
      parcel_list_id: stop.parcelListId || null,
      shipment_tracking_id: String(stop.shipmentTrackingId || '').trim() || `STOP-${index + 1}`,
      destination_address: stop.address || null,
      destination_latitude: stop.latitude,
      destination_longitude: stop.longitude,
      weight_kg: toFiniteNumber(stop.weightKg),
      status: 'pending',
    }));

    const { data: createdStops, error: deliveryStopsError } = await supabase
      .from('delivery_stops')
      .insert(deliveryStopsPayload)
      .select();

    if (deliveryStopsError) {
      const isStopsTableMissing =
        isMissingRelationError(deliveryStopsError) ||
        String(deliveryStopsError?.message || '').toLowerCase().includes('delivery_stops');

      await supabase
        .from('deliveries')
        .delete()
        .eq('id', createdDelivery.id);

      await supabase
        .from('routes')
        .delete()
        .eq('id', route.id);

      if (isStopsTableMissing) {
        throw new Error(
          'Cluster delivery schema is missing delivery_stops. Run SQL_DELIVERIES_CLUSTER_SUPPORT.sql and retry assignment.'
        );
      }

      throw new Error(`Failed to create delivery stops: ${deliveryStopsError.message}`);
    }

    const updatePayload = { status: 'assigned' };
    if (canonicalClusterName) {
      updatePayload.cluster_name = canonicalClusterName;
    }

    const { error: updateError } = await supabase
      .from('parcel_lists')
      .update(updatePayload)
      .eq('organization_id', orgId)
      .in('id', clusterMemberIds);

    if (updateError) {
      console.warn('Warning: Could not update parcel cluster status:', updateError.message);
    }

    return {
      route,
      deliveries: [
        {
          ...createdDelivery,
          delivery_stops: createdStops || [],
        },
      ],
      totalDeliveries: 1,
    };
  } catch (err) {
    console.error('[Supabase] Assignment error for parcel cluster:', err);
    throw err;
  }
};

// Backward-compatible alias
export const assignConsolidatedListToRider = assignParcelClusterToRider;
