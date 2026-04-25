/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unified Database Service for Routemate Web & Mobile Apps
 * This service demonstrates the standard patterns for querying Supabase data.
 * Both apps should implement similar patterns with platform-specific adaptations (async/await consistency, error handling).
 *
 * Platform adaptations:
 * - Mobile: Uses src/services/database.ts with async/await
 * - Web: Uses lib/api.js with async/await or React Query
 *
 * This file serves as the source of truth for database operations.
 */

import { TABLES, DELIVERY_STATUSES, PAGINATION_CONFIG } from './shared-constants';

// Type definitions - using flexible type definitions for Supabase responses
type Profile = Record<string, unknown>;
type Organization = Record<string, unknown>;
type Rider = Record<string, unknown>;
type Delivery = Record<string, unknown>;
type RiderAnalytics = Record<string, unknown>;
type Notification = Record<string, unknown>;
type PaginatedResponse<T> = {
  data: T[];
  count: number;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

/**
 * =============================================================================
 * ORGANIZATIONS
 * =============================================================================
 */

/**
 * Get organization by ID
 */
export async function getOrganization(
  supabase: any,
  organizationId: string,
): Promise<Organization | null> {
  try {
    const { data, error } = await supabase
      .from(TABLES.ORGANIZATIONS)
      .select('*')
      .eq('id', organizationId)
      .single();

    if (error) throw error;
    return data as Organization;
  } catch (error) {
    console.error('[DB] Failed to fetch organization:', error);
    throw error;
  }
}

/**
 * Get current user's organization (from profile -> rider/supervisor)
 */
export async function getCurrentOrganizationId(supabase: any): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    // Check if user is a supervisor
    const { data: supervisor } = await supabase
      .from(TABLES.SUPERVISORS)
      .select('organization_id')
      .eq('profile_id', session.user.id)
      .maybeSingle();

    if (supervisor) return supervisor.organization_id;

    // Check if user is a rider
    const { data: rider } = await supabase
      .from(TABLES.RIDERS)
      .select('organization_id')
      .eq('profile_id', session.user.id)
      .maybeSingle();

    return rider?.organization_id || null;
  } catch (error) {
    console.error('[DB] Failed to get organization ID:', error);
    return null;
  }
}

/**
 * =============================================================================
 * PROFILES & USERS
 * =============================================================================
 */

/**
 * Get user profile by ID
 */
export async function getProfile(
  supabase: any,
  profileId: string,
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from(TABLES.PROFILES)
      .select('*')
      .eq('id', profileId)
      .single();

    if (error) throw error;
    return data as Profile;
  } catch (error) {
    console.error('[DB] Failed to fetch profile:', error);
    return null;
  }
}

/**
 * Get current authenticated user profile
 */
export async function getCurrentProfile(supabase: any): Promise<Profile | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    return getProfile(supabase, user.id);
  } catch (error) {
    console.error('[DB] Failed to fetch current profile:', error);
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateProfile(
  supabase: any,
  profileId: string,
  updates: Partial<Profile>,
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from(TABLES.PROFILES)
      .update(updates)
      .eq('id', profileId)
      .select()
      .single();

    if (error) throw error;
    return data as Profile;
  } catch (error) {
    console.error('[DB] Failed to update profile:', error);
    throw error;
  }
}

/**
 * =============================================================================
 * RIDERS
 * =============================================================================
 */

/**
 * Get rider by ID with profile data
 */
export async function getRider(supabase: any, riderId: string): Promise<Rider | null> {
  try {
    const { data, error } = await supabase
      .from(TABLES.RIDERS)
      .select(
        `
        *,
        profiles:profile_id (*)
      `,
      )
      .eq('id', riderId)
      .single();

    if (error) throw error;
    return data as Rider;
  } catch (error) {
    console.error('[DB] Failed to fetch rider:', error);
    return null;
  }
}

/**
 * Get current authenticated rider
 */
export async function getCurrentRider(supabase: any): Promise<Rider | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from(TABLES.RIDERS)
      .select(
        `
        *,
        profiles:profile_id (*)
      `,
      )
      .eq('profile_id', user.id)
      .single();

    if (error) throw error;
    return data as Rider;
  } catch (error) {
    console.error('[DB] Failed to fetch current rider:', error);
    return null;
  }
}

/**
 * Get riders by organization
 */
export async function getRidersByOrganization(
  supabase: any,
  organizationId: string,
  limit: number = PAGINATION_CONFIG.DEFAULT_LIMIT,
  offset: number = 0,
): Promise<PaginatedResponse<Rider>> {
  try {
    const { data, error, count } = await supabase
      .from(TABLES.RIDERS)
      .select(
        `
        *,
        profiles:profile_id (*)
      `,
        { count: 'exact' },
      )
      .eq('organization_id', organizationId)
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const total = count || 0;
    return {
      data: (data as Rider[]) || [],
      count: data?.length || 0,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      hasMore: offset + limit < total,
    };
  } catch (error) {
    console.error('[DB] Failed to fetch riders:', error);
    throw error;
  }
}

/**
 * Update rider status
 */
export async function updateRiderStatus(
  supabase: any,
  riderId: string,
  status: 'available' | 'on_delivery' | 'offline',
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(TABLES.RIDERS)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', riderId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[DB] Failed to update rider status:', error);
    return false;
  }
}

/**
 * =============================================================================
 * DELIVERIES
 * =============================================================================
 */

/**
 * Get deliveries for organization
 */
export async function getDeliveries(
  supabase: any,
  organizationId: string,
  filters: {
    status?: string;
    riderId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<PaginatedResponse<Delivery>> {
  try {
    const {
      status,
      riderId,
      limit = PAGINATION_CONFIG.DEFAULT_LIMIT,
      offset = 0,
    } = filters;

    let query = supabase
      .from(TABLES.DELIVERIES)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Add filters dynamically
    if (status) {
      query = query.eq('status', status);
    }
    if (riderId) {
      query = query.eq('rider_id', riderId);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    const total = count || 0;
    return {
      data: (data as Delivery[]) || [],
      count: data?.length || 0,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      hasMore: offset + limit < total,
    };
  } catch (error) {
    console.error('[DB] Failed to fetch deliveries:', error);
    throw error;
  }
}

/**
 * Get delivery by ID
 */
export async function getDelivery(supabase: any, deliveryId: string): Promise<Delivery | null> {
  try {
    const { data, error } = await supabase
      .from(TABLES.DELIVERIES)
      .select('*')
      .eq('id', deliveryId)
      .single();

    if (error) throw error;
    return data as Delivery;
  } catch (error) {
    console.error('[DB] Failed to fetch delivery:', error);
    return null;
  }
}

/**
 * Create delivery
 */
export async function createDelivery(
  supabase: any,
  delivery: Omit<Delivery, 'id' | 'created_at' | 'updated_at'>,
): Promise<Delivery | null> {
  try {
    const { data, error } = await supabase
      .from(TABLES.DELIVERIES)
      .insert([delivery])
      .select()
      .single();

    if (error) throw error;
    return data as Delivery;
  } catch (error) {
    console.error('[DB] Failed to create delivery:', error);
    throw error;
  }
}

/**
 * Update delivery status
 */
export async function updateDeliveryStatus(
  supabase: any,
  deliveryId: string,
  status: string,
): Promise<boolean> {
  try {
    const normalizedStatus = String(status || '').toLowerCase();

    if (
      normalizedStatus === DELIVERY_STATUSES.COMPLETED ||
      normalizedStatus === 'completed'
    ) {
      const { error: rpcError } = await supabase.rpc('complete_delivery_stop', {
        p_delivery_id: deliveryId,
      });

      if (!rpcError) {
        return true;
      }

      const rpcMessage = String(rpcError?.message || '').toLowerCase();
      const isMissingRpc =
        rpcMessage.includes('complete_delivery_stop') &&
        (rpcMessage.includes('does not exist') || rpcMessage.includes('schema cache'));

      if (!isMissingRpc) {
        throw rpcError;
      }
    }

    const { error } = await supabase
      .from(TABLES.DELIVERIES)
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[DB] Failed to update delivery:', error);
    return false;
  }
}

/**
 * =============================================================================
 * ANALYTICS
 * =============================================================================
 */

/**
 * Get rider analytics for today
 */
export async function getRiderAnalytics(
  supabase: any,
  riderId: string,
): Promise<RiderAnalytics | null> {
  try {
    const { data, error } = await supabase
      .from(TABLES.ANALYTICS)
      .select('*')
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data as RiderAnalytics;
  } catch (error) {
    console.error('[DB] Failed to fetch analytics:', error);
    return null;
  }
}

/**
 * Update rider analytics
 */
export async function updateRiderAnalytics(
  supabase: any,
  riderId: string,
  updates: Partial<RiderAnalytics>,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(TABLES.ANALYTICS)
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[DB] Failed to update analytics:', error);
    return false;
  }
}

/**
 * =============================================================================
 * NOTIFICATIONS
 * =============================================================================
 */

/**
 * Get notifications for user
 */
export async function getNotifications(
  supabase: any,
  riderId: string,
  limit: number = 20,
): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from(TABLES.NOTIFICATIONS)
      .select('*')
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as Notification[]) || [];
  } catch (error) {
    console.error('[DB] Failed to fetch notifications:', error);
    return [];
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  supabase: any,
  notificationId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(TABLES.NOTIFICATIONS)
      .update({ acknowledged: true })
      .eq('id', notificationId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[DB] Failed to update notification:', error);
    return false;
  }
}

/**
 * =============================================================================
 * REAL-TIME SUBSCRIPTIONS
 * =============================================================================
 */

/**
 * Subscribe to delivery updates (for a specific rider)
 */
export function subscribeToDeliveries(
  supabase: Record<string, unknown>,
  riderId: string,
  callback: (event: Record<string, unknown>) => void,
) {
  const supabaseClient = supabase as any;
  return supabaseClient
    .from(`${TABLES.DELIVERIES}:rider_id=eq.${riderId}`)
    .on('*', (payload: any) => {
      callback(payload);
    })
    .subscribe();
}

/**
 * Subscribe to rider analytics updates
 */
export function subscribeToAnalytics(
  supabase: Record<string, unknown>,
  riderId: string,
  callback: (event: Record<string, unknown>) => void,
) {
  const supabaseClient = supabase as any;
  return supabaseClient
    .from(`${TABLES.ANALYTICS}:rider_id=eq.${riderId}`)
    .on('*', (payload: Record<string, unknown>) => {
      callback(payload);
    })
    .subscribe();
}

/**
 * Subscribe to notifications
 */
export function subscribeToNotifications(
  supabase: Record<string, unknown>,
  riderId: string,
  callback: (event: Record<string, unknown>) => void,
) {
  const supabaseClient = supabase as any;
  return supabaseClient
    .from(`${TABLES.NOTIFICATIONS}:rider_id=eq.${riderId}`)
    .on('*', (payload: any) => {
      callback(payload);
    })
    .subscribe();
}

/**
 * Unsubscribe from realtime channel
 */
export async function unsubscribeFromChannel(supabase: any, channel: any) {
  return await supabase.removeChannel(channel);
}
