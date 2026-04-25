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
};

type InventoryType = "individual" | "clusters";

function parseInventoryType(value: string | null): InventoryType | null {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "individual") return "individual";
  if (normalized === "clusters") return "clusters";

  return null;
}

async function getSupervisorAuthContext(
  request: NextRequest
): Promise<{ context?: AuthContext; error?: NextResponse }> {
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
      error: NextResponse.json(
        { error: "Only supervisors can access acquisition inventory" },
        { status: 403 }
      ),
    };
  }

  return {
    context: {
      userId: user.id,
      organizationId: supervisor.organization_id,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getSupervisorAuthContext(request);
    if (auth.error) return auth.error;

    const inventoryType = parseInventoryType(request.nextUrl.searchParams.get("type"));
    if (!inventoryType) {
      return NextResponse.json(
        { error: "Invalid inventory type. Use type=individual or type=clusters." },
        { status: 400 }
      );
    }

    let query = supabase
      .from("parcel_lists")
      .select("*")
      .is("organization_id", null)
      .order("created_at", { ascending: false });

    if (inventoryType === "individual") {
      query = query.is("cluster_name", null);
    } else {
      query = query.not("cluster_name", "is", null);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        rows: data || [],
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
