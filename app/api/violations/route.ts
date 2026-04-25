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

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();

    const { data: supervisor, error: supervisorError } = await supabase
      .from("supervisors")
      .select("organization_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (supervisorError) {
      return NextResponse.json({ error: supervisorError.message }, { status: 400 });
    }

    const { data: rider, error: riderError } = await supabase
      .from("riders")
      .select("organization_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (riderError) {
      return NextResponse.json({ error: riderError.message }, { status: 400 });
    }

    const organizationId = supervisor?.organization_id || rider?.organization_id;

    if (!organizationId) {
      return NextResponse.json({ error: "No organization assigned to user" }, { status: 400 });
    }

    const { error: insertError } = await supabase.from("violations").insert({
      id: payload.id,
      organization_id: organizationId,
      rider_name: payload.rider_name,
      zone_name: payload.zone_name,
      lat: payload.lat,
      lng: payload.lng,
      violation_type: payload.violation_type,
      base_severity: payload.base_severity,
      traffic_level: payload.traffic_level,
      created_at: payload.timestamp,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}