import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get the user ID from the Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);

    // Verify the token and get user ID
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("[get-org] Auth error:", userError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    console.log("[get-org] Fetching org for user:", userId);

    // Get supervisor record - use regular select instead of .single() to avoid errors on 0 rows
    const { data: supervisors, error: supervisorError } = await supabase
      .from("supervisors")
      .select("organization_id")
      .eq("profile_id", userId);

    if (supervisorError) {
      console.error("[get-org] Supervisor query error:", supervisorError);
      return NextResponse.json(
        { error: "Supervisor record not found", orgInfo: null },
        { status: 200 }
      );
    }

    if (!supervisors || supervisors.length === 0) {
      console.log("[get-org] No supervisor record found for user:", userId);
      return NextResponse.json(
        { error: "No supervisor record found", orgInfo: null },
        { status: 200 }
      );
    }

    const supervisor = supervisors[0];
    if (!supervisor?.organization_id) {
      console.log("[get-org] Supervisor has no organization assigned");
      return NextResponse.json(
        { error: "No organization assigned", orgInfo: null },
        { status: 200 }
      );
    }

    // Get organization
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, code")
      .eq("id", supervisor.organization_id)
      .single();

    if (orgError) {
      console.error("[get-org] Organization query error:", orgError);
      return NextResponse.json(
        { error: "Organization not found", orgInfo: null },
        { status: 200 }
      );
    }

    console.log("[get-org] ✓ Found org:", org.name);
    return NextResponse.json({ orgInfo: org }, { status: 200 });
  } catch (error) {
    console.error("[get-org] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", orgInfo: null },
      { status: 500 }
    );
  }
}
