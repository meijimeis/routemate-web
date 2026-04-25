import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/create-profile-signup
 * Creates a user profile during signup
 * Uses service role to bypass RLS policies
 * Called right after email/password signup completes
 */

export async function POST(request: NextRequest) {
  try {
    const { userId, role } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400 }
      );
    }

    if (!role || !["supervisor", "rider", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid or missing role" },
        { status: 400 }
      );
    }

    console.log("[API] Creating profile for user:", userId, "role:", role);

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Retry logic: wait for auth.users to be committed (with 10 retries)
    // Delays: 0ms, 1s, 2s, 3s, 4s, 5s, 6s, 7s, 8s, 9s = up to 45 seconds total
    let profileError = null;
    let profile = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      // Wait before retry (0ms on first attempt, then 1000ms, 2000ms, 3000ms, etc.)
      if (attempt > 0) {
        const delayMs = attempt * 1000;
        console.log(`[API] Retry attempt ${attempt}/10 after ${delayMs}ms delay`);
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs)
        );
      }

      // Insert profile
      const result = await supabase
        .from("profiles")
        .insert({
          id: userId,
        })
        .select()
        .single();

      if (!result.error) {
        profile = result.data;
        console.log("[API] Profile created successfully:", profile.id);
        break;
      }

      profileError = result.error;

      // If it's a foreign key constraint, retry
      if (result.error?.code === "23503") {
        console.warn(
          `[API] Foreign key constraint on attempt ${attempt + 1}:`,
          result.error.message
        );
        if (attempt === 9) {
          // Last attempt failed
          console.error("[API] Failed after 10 attempts - user still not found in auth.users");
          return NextResponse.json(
            {
              error:
                "User registration still processing. Please wait and try again from login.",
              code: "AUTH_USER_NOT_FOUND_TIMEOUT",
              details: result.error.message,
            },
            { status: 503 }
          );
        }
        continue;
      }

      // Handle duplicate profile error
      if (result.error?.code === "23505") {
        console.log("[API] Profile already exists");
        return NextResponse.json(
          { message: "Profile already created" },
          { status: 201 }
        );
      }

      // Other errors - don't retry
      console.error("[API] Profile insert error:", result.error.code, result.error.message);
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 400 }
      );
    }

    if (!profile) {
      console.error("[API] Failed to create profile after retries");
      return NextResponse.json(
        { error: "Failed to create profile", details: profileError?.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { profile, message: "Profile created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
