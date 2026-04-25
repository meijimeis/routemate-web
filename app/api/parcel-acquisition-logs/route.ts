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

type AuthContext = {
  userId: string;
  organizationId: string;
  supervisorName: string | null;
};

async function getSupervisorAuthContext(request: NextRequest): Promise<{ context?: AuthContext; error?: NextResponse }> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const token = authHeader.slice(7);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: supervisor, error: supervisorError } = await supabase
    .from("supervisors")
    .select("organization_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (supervisorError) {
    return {
      error: NextResponse.json({ error: supervisorError.message }, { status: 400 }),
    };
  }

  if (!supervisor?.organization_id) {
    return {
      error: NextResponse.json({ error: "Only supervisors can access acquisition logs" }, { status: 403 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    context: {
      userId: user.id,
      organizationId: supervisor.organization_id,
      supervisorName: profile?.full_name || null,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getSupervisorAuthContext(request);
    if (auth.error) return auth.error;

    const context = auth.context as AuthContext;
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") || "10")));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from("parcel_acquisition_logs")
      .select("*", { count: "exact" })
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        rows: data || [],
        totalCount: count || 0,
        page,
        pageSize,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getSupervisorAuthContext(request);
    if (auth.error) return auth.error;

    const context = auth.context as AuthContext;
    const payload = await request.json();

    const acquisitionType = String(payload.acquisitionType || "").toLowerCase();
    if (acquisitionType !== "individual" && acquisitionType !== "cluster") {
      return NextResponse.json({ error: "Invalid acquisitionType" }, { status: 400 });
    }

    const selectedItemCount = Number(payload.selectedItemCount || 0);
    const acquiredParcelCount = Number(payload.acquiredParcelCount || 0);
    const acquiredClusterCount = Number(payload.acquiredClusterCount || 0);

    const { data, error } = await supabase
      .from("parcel_acquisition_logs")
      .insert({
        organization_id: context.organizationId,
        supervisor_profile_id: context.userId,
        supervisor_name: context.supervisorName,
        acquisition_type: acquisitionType,
        selected_item_count: Number.isFinite(selectedItemCount) ? selectedItemCount : 0,
        acquired_parcel_count: Number.isFinite(acquiredParcelCount) ? acquiredParcelCount : 0,
        acquired_cluster_count: Number.isFinite(acquiredClusterCount) ? acquiredClusterCount : 0,
        details: payload.details || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, row: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
