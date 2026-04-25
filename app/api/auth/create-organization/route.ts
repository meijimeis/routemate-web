import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Generate a random invite code (e.g., "ABC123XYZ")
function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const { name, type, domain, logo_url } = await req.json();

    console.log("[API] Creating organization:", name);

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

    // Generate invite code
    const inviteCode = generateInviteCode();
    console.log("[API] Generated invite code:", inviteCode);

    // 1️⃣ Create organization
    console.log("[API] Inserting organization:", name);
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name,
        code: inviteCode,
        type: type || null,
        domain: domain || null,
        logo_url: logo_url || null,
      })
      .select()
      .single();

    if (orgError) {
      console.error("[API] Organization insert error:", orgError);
      return NextResponse.json(
        { error: orgError.message, code: orgError.code },
        { status: 400 }
      );
    }

    console.log("[API] ✓ Organization created:", org.id);

    return NextResponse.json(
      {
        organization: org,
        message: "Organization created successfully",
      },
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
