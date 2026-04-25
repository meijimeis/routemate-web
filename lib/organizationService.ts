/**
 * Organization Service
 * Handles organization creation, joining, and management
 */

import { supabase } from "@/lib/supabaseClient";

export interface Organization {
  id: string;
  name: string;
  code: string;
  created_at: string;
  domain?: string;
  type?: string;
  logo_url?: string;
}

/**
 * Create a new organization
 */
export const createOrganization = async (
  organizationName: string
): Promise<{ success: boolean; organization?: Organization; error?: string }> => {
  try {
    if (!organizationName.trim()) {
      return { success: false, error: "Organization name is required" };
    }

    // Call API endpoint to create organization
    const response = await fetch("/api/auth/create-organization", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: organizationName.trim(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[OrgService] Create organization error:", errorData);
      return {
        success: false,
        error: errorData.error || "Failed to create organization",
      };
    }

    const data = await response.json();
    return { success: true, organization: data.organization };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[OrgService] Create organization exception:", errorMsg);
    return { success: false, error: errorMsg };
  }
};

/**
 * Join an organization using invite code
 */
export const joinOrganization = async (
  inviteCode: string
): Promise<{ success: boolean; organization?: Organization; error?: string }> => {
  try {
    const code = inviteCode.trim().toUpperCase();

    if (!code) {
      return { success: false, error: "Invite code is required" };
    }

    // Get current session for authorization header
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return { success: false, error: "Not authenticated" };
    }

    // Call API endpoint to find organization
    const response = await fetch("/api/auth/join-organization", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        code: code,
      }),
    });

    if (!response.ok) {
      let errorData: Record<string, unknown> = {};
      try {
        errorData = await response.json();
      } catch {
        console.warn("[OrgService] Could not parse error response as JSON");
        errorData = { error: response.statusText || "Unknown error" };
      }
      console.error("[OrgService] Join organization error:", errorData);
      return {
        success: false,
        error: (typeof errorData.error === 'string' ? errorData.error : "Failed to join organization") || "Failed to join organization",
      };
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error("[OrgService] Could not parse success response as JSON:", parseErr);
      return {
        success: false,
        error: "Invalid server response",
      };
    }
    return { success: true, organization: data.organization };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[OrgService] Join organization exception:", errorMsg);
    return { success: false, error: errorMsg };
  }
};

/**
 * Get current user's organization
 */
export const getUserOrganization = async (): Promise<{
  success: boolean;
  organization?: Organization;
  error?: string;
}> => {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { data: supervisor, error: supervisorError } = await supabase
      .from("supervisors")
      .select("organization_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (supervisorError) {
      return { success: false, error: supervisorError.message };
    }

    const { data: rider, error: riderError } = await supabase
      .from("riders")
      .select("organization_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (riderError) {
      return { success: false, error: riderError.message };
    }

    const organizationId = supervisor?.organization_id || rider?.organization_id;

    if (!organizationId) {
      return { success: false, error: "No organization assigned" };
    }

    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single();

    if (orgError || !organization) {
      return { success: false, error: "Organization not found" };
    }

    return { success: true, organization };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[OrgService] Get user organization exception:", errorMsg);
    return { success: false, error: errorMsg };
  }
};

/**
 * Get riders in organization
 */
export const getOrganizationRiders = async (organizationId: string) => {
  try {
    // Query riders table with profile details
    const { data, error } = await supabase
      .from("riders")
      .select(`
        id,
        profile_id,
        organization_id,
        vehicle_type,
        capacity,
        status,
        created_at,
        updated_at,
        profiles:profile_id (
          id,
          email_address,
          full_name,
          phone_number,
          alias,
          device_id,
          is_active
        )
      `)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[OrgService] Get riders error:", error);
      return { success: false, error: error.message, riders: [] };
    }

    // Flatten the rider data - map profiles array (single item) to top level
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flattenedRiders = (data || []).map((rider: any) => ({
      // Handle PostgREST returning either an object or a single-item array for relation embeds
      ...(() => {
        const profile = Array.isArray(rider.profiles)
          ? rider.profiles[0]
          : rider.profiles;

        return {
          full_name: profile?.full_name || "",
          email: profile?.email_address || "",
          phone_number: profile?.phone_number || "",
          alias: profile?.alias || "",
          device_id: profile?.device_id || "",
          is_active: profile?.is_active ?? true,
        };
      })(),
      id: rider.id,
      profile_id: rider.profile_id,
      organization_id: rider.organization_id,
      vehicle_type: "motorcycle",
      capacity: rider.capacity,
      status: rider.status,
      created_at: rider.created_at,
      updated_at: rider.updated_at,
    }));

    return { success: true, riders: flattenedRiders };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[OrgService] Get riders exception:", errorMsg);
    return { success: false, error: errorMsg, riders: [] };
  }
};

/**
 * Update organization details
 */
export const updateOrganization = async (
  organizationId: string,
  updates: Partial<Organization>
) => {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", organizationId)
      .select()
      .single();

    if (error) {
      console.error("[OrgService] Update organization error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, organization: data };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[OrgService] Update organization exception:", errorMsg);
    return { success: false, error: errorMsg };
  }
};

/**
 * Get organization by invite code (public lookup during signup)
 */
export const getOrganizationByInviteCode = async (
  inviteCode: string
): Promise<Organization | null> => {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, code, created_at, domain, type, logo_url")
      .eq("code", inviteCode.trim().toUpperCase())
      .single();

    if (error) {
      console.error("[OrgService] Lookup by code error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[OrgService] Lookup by code exception:", err);
    return null;
  }
};
