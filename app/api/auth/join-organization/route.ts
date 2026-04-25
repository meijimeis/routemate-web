import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function POST(req: NextRequest) {
  try {
    console.log("[API] Join Organization - Received request");

    const { code } = await req.json();

    if (!code) {
      console.error("[API] Join Organization - No code provided");
      return NextResponse.json(
        { error: "Join code is required" },
        { status: 400 }
      );
    }

    // Get current user from session header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[API] Join Organization - No authorization header");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[API] Join Organization - Auth error:", authError);
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("[API] Join Organization - User:", user.id);

    // Find organization by invite code
    // Organizations table has a 'code' column that serves as the invite code
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, code")
      .eq("code", code)
      .single();

    if (orgError || !org) {
      console.error("[API] Join Organization - Organization not found:", orgError);
      return NextResponse.json(
        { error: "Invalid join code" },
        { status: 404 }
      );
    }

    console.log("[API] Join Organization - Found organization:", org.id);

    return NextResponse.json(
      {
        message: "Organization found successfully",
        organization: org,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[API] Join Organization - Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
