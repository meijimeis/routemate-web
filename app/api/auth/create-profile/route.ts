import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/create-profile
 * Creates a user profile after OTP verification
 * New schema: Creates profiles + riders/supervisors records
 * Uses service role to bypass RLS policies
 * Protected by requiring valid Supabase auth token
 * 
 * Request body:
 * {
 *   role: "supervisor" | "rider",
 *   organization_id?: string,
 *   full_name?: string,
 *   phone_number?: string,
 *   vehicle_type?: "motorcycle" (for riders),
 *   capacity?: number (for riders),
 *   department?: string (for supervisors)
 * }
 */

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify the token and get user info using anon client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Create anon client to verify token
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Verify user is authenticated
    const { data: userData, error: userError } =
      await supabaseAnon.auth.getUser(token);

    if (userError || !userData.user) {
      console.error("[Auth] User verification failed:", userError);
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || "";
    
    // Extract request body
    const {
      role,
      organization_id,
      full_name,
      phone_number,
      vehicle_type,
      capacity,
      department,
    } = await request.json();

    const normalizedVehicleType =
      typeof vehicle_type === "string" ? vehicle_type.trim().toLowerCase() : "";

    if (!role) {
      return NextResponse.json(
        { error: "Role is required" },
        { status: 400 }
      );
    }

    if (!["supervisor", "rider"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'supervisor' or 'rider'" },
        { status: 400 }
      );
    }

    // Create service role client
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Transaction-like approach: Create profile first, then role-specific record
    console.log('[Auth] Starting profile creation:', { userId, role, organization_id });

    // Step 1: Create or update profile record
    const profileData = {
      id: userId,
      email_address: userEmail,
      full_name: full_name || null,
      phone_number: phone_number || null,
      status: "available",
      is_active: true,
    };

    const { data: profile, error: profileError } = await supabaseService
      .from("profiles")
      .insert(profileData)
      .select()
      .single();

    let profileFinal = profile;

    if (profileError) {
      console.error("[Auth] Profile insertion error:", profileError);

      // Check if profile already exists (duplicate key)
      if (profileError.code === "23505") {
        console.log('[Auth] Profile already exists - updating with new data:', userId);
        
        // Update the existing profile with the provided data
        const { data: updatedProfile, error: updateError } = await supabaseService
          .from("profiles")
          .update({
            full_name: full_name || null,
            phone_number: phone_number || null,
          })
          .eq("id", userId)
          .select()
          .single();

        if (updateError) {
          console.error("[Auth] Profile update error:", updateError);
          return NextResponse.json(
            {
              error: "Failed to update profile",
              details: updateError.message,
            },
            { status: 400 }
          );
        }

        console.log('[Auth] ✓ Profile updated:', updatedProfile.id);
        profileFinal = updatedProfile;
      } else {
        return NextResponse.json(
          {
            error: "Failed to create profile",
            details: profileError.message,
            code: profileError.code,
          },
          { status: 400 }
        );
      }
    } else {
      console.log('[Auth] ✓ Profile created:', profile.id);
    }

    // Step 2: Create role-specific record
    if (role === "supervisor") {
      if (!organization_id) {
        return NextResponse.json(
          { error: "organization_id is required for supervisors" },
          { status: 400 }
        );
      }

      console.log('[Auth] Creating supervisor record for:', userId);
      const { data: supervisor, error: supervisorError } = await supabaseService
        .from("supervisors")
        .insert({
          id: userId,
          profile_id: userId,
          organization_id: organization_id,
          department: department || null,
        })
        .select()
        .single();

      if (supervisorError) {
        console.error("[Auth] Supervisor record creation error:", supervisorError);
        // Attempt to delete the profile record to maintain consistency
        await supabaseService
          .from("profiles")
          .delete()
          .eq("id", userId);
        
        return NextResponse.json(
          {
            error: "Failed to create supervisor record",
            details: supervisorError.message,
          },
          { status: 400 }
        );
      }

      console.log('[Auth] ✓ Supervisor record created:', supervisor.id);

      return NextResponse.json(
        {
          success: true,
          profile: profileFinal,
          supervisor,
          message: "Supervisor account created successfully",
        },
        { status: 201 }
      );
    } else if (role === "rider") {
      if (!organization_id) {
        return NextResponse.json(
          { error: "organization_id is required for riders" },
          { status: 400 }
        );
      }

      if (normalizedVehicleType.length > 0 && normalizedVehicleType !== "motorcycle") {
        return NextResponse.json(
          { error: "Only motorcycle riders are supported." },
          { status: 400 }
        );
      }

      console.log('[Auth] Creating rider record for:', userId);
      const { data: rider, error: riderError } = await supabaseService
        .from("riders")
        .insert({
          profile_id: userId,
          organization_id: organization_id,
          vehicle_type: "motorcycle",
          capacity: capacity || null,
          status: "available",
        })
        .select()
        .single();

      if (riderError) {
        console.error("[Auth] Rider record creation error:", riderError);
        // Attempt to delete the profile record to maintain consistency
        await supabaseService
          .from("profiles")
          .delete()
          .eq("id", userId);
        
        return NextResponse.json(
          {
            error: "Failed to create rider record",
            details: riderError.message,
          },
          { status: 400 }
        );
      }

      console.log('[Auth] ✓ Rider record created:', rider.id);

      return NextResponse.json(
        {
          success: true,
          profile: profileFinal,
          rider,
          message: "Rider account created successfully",
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { error: "Invalid role" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Auth] API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("[Auth] Error details:", errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
