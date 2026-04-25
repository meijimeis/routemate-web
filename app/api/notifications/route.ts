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
  riderId: string | null;
  isSupervisor: boolean;
};

type NotificationPayload = {
  riderId?: string | null;
  type?: string | null;
  alertType?: string | null;
  severity?: string | null;
  message?: string | null;
  location?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  geofenceId?: string | null;
  routeId?: string | null;
  deliveryId?: string | null;
  eventKey?: string | null;
  timestamp?: string | null;
  metadata?: Record<string, unknown> | null;
  createViolation?: boolean;
  violationType?: string | null;
  driverName?: string | null;
};

const NOTIFICATION_SELECT = `
  id,
  organization_id,
  rider_id,
  type,
  severity,
  message,
  location,
  metadata,
  acknowledged,
  created_at,
  geofence_id,
  riders (
    id,
    profile_id,
    profiles:profile_id (
      full_name
    )
  )
`;

const ALERT_TO_VIOLATION: Record<string, string> = {
  ZONE_EXIT_UNAUTHORIZED: "ZONE_EXIT_UNAUTHORIZED",
  ZONE_OVERSTAY: "ZONE_OVERSTAY",
  LATE_ARRIVAL: "PARCEL_DELAY_RISK",
  OFF_ROUTE: "TRAFFIC_RE_ROUTE_REQUIRED",
  DELIVERY_DELAY: "PARCEL_DELAY_RISK",
};

const ALERT_TO_GEOFENCE_EVENT: Record<string, "enter" | "exit" | "dwell" | null> = {
  ZONE_EXIT_UNAUTHORIZED: "exit",
  ZONE_OVERSTAY: "dwell",
  ARRIVAL_CONFIRMED: "enter",
  EARLY_ARRIVAL: "enter",
  LATE_ARRIVAL: "enter",
  OFF_ROUTE: null,
  DELIVERY_DELAY: null,
  SUPERVISOR_MESSAGE: null,
  SYSTEM: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSeverity(value: string | null): "critical" | "warning" | "info" {
  const normalized = (value || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "warning") return "warning";
  return "info";
}

function normalizeType(value: string | null, alertType: string | null): string {
  const normalized = (value || "").trim().toLowerCase();

  if (["delivery", "geofence", "route", "system"].includes(normalized)) {
    return normalized;
  }

  if (
    alertType === "ZONE_EXIT_UNAUTHORIZED" ||
    alertType === "ZONE_OVERSTAY" ||
    alertType === "ARRIVAL_CONFIRMED" ||
    alertType === "EARLY_ARRIVAL" ||
    alertType === "LATE_ARRIVAL"
  ) {
    return "geofence";
  }

  if (alertType === "OFF_ROUTE" || alertType === "DELIVERY_DELAY") {
    return "route";
  }

  return "system";
}

function normalizeAlertType(value: string | null, fallbackType: string): string {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized.length > 0) return normalized;

  if (fallbackType === "geofence") return "ZONE_EXIT_UNAUTHORIZED";
  if (fallbackType === "route") return "OFF_ROUTE";
  return "SYSTEM";
}

function normalizeCreatedAt(value: string | null): string {
  if (!value) return new Date().toISOString();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

async function getRiderName(riderId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("riders")
    .select("id, profiles:profile_id ( full_name )")
    .eq("id", riderId)
    .maybeSingle();

  if (error || !data) return null;

  const profiles = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
  const fullName = readString((profiles as { full_name?: string | null } | null)?.full_name);

  return fullName;
}

async function getAuthContext(
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

  const { data: rider, error: riderError } = await supabase
    .from("riders")
    .select("id, organization_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (riderError) {
    return {
      error: NextResponse.json({ error: riderError.message }, { status: 400 }),
    };
  }

  const organizationId = supervisor?.organization_id || rider?.organization_id;
  if (!organizationId) {
    return {
      error: NextResponse.json({ error: "No organization assigned to user" }, { status: 403 }),
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
      organizationId,
      supervisorName: readString(profile?.full_name) || null,
      riderId: readString(rider?.id) || null,
      isSupervisor: Boolean(supervisor?.organization_id),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (auth.error) return auth.error;

    const context = auth.context as AuthContext;
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || "100");
    const limit = Number.isFinite(limitParam) ? Math.min(250, Math.max(1, limitParam)) : 100;

    if (!context.isSupervisor && !context.riderId) {
      return NextResponse.json({ error: "No rider context for current user." }, { status: 403 });
    }

    let query = supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!context.isSupervisor && context.riderId) {
      query = query.eq("rider_id", context.riderId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, rows: data || [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (auth.error) return auth.error;

    const context = auth.context as AuthContext;
    const payload = (await request.json()) as NotificationPayload;

    if (!context.isSupervisor && !context.riderId) {
      return NextResponse.json({ error: "No rider context for current user." }, { status: 403 });
    }

    const metadata = asRecord(payload.metadata);
    const incomingMessage = readString(payload.message);

    if (!incomingMessage) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const notificationType = normalizeType(readString(payload.type), readString(payload.alertType));
    const alertType = normalizeAlertType(readString(payload.alertType), notificationType);
    const severity = normalizeSeverity(readString(payload.severity));

    const payloadRiderId =
      readString(payload.riderId) ||
      readString(metadata.riderId) ||
      readString(metadata.rider_id) ||
      null;
    if (!context.isSupervisor && payloadRiderId && payloadRiderId !== context.riderId) {
      return NextResponse.json(
        { error: "Rider is not allowed to create notifications for a different rider." },
        { status: 403 }
      );
    }

    const riderId = payloadRiderId || (context.isSupervisor ? null : context.riderId);

    const location =
      readString(payload.location) ||
      readString(metadata.zoneName) ||
      readString(metadata.destinationAddress) ||
      null;

    const lat = readNumber(payload.lat ?? metadata.lat ?? metadata.latitude);
    const lng = readNumber(payload.lng ?? metadata.lng ?? metadata.longitude);

    const geofenceId = readString(payload.geofenceId) || null;
    const routeId = readString(payload.routeId) || readString(metadata.routeId) || null;
    const deliveryId = readString(payload.deliveryId) || readString(metadata.deliveryId) || null;
    const eventKey = readString(payload.eventKey) || readString(metadata.eventKey) || null;
    const createdAt = normalizeCreatedAt(readString(payload.timestamp));

    const mergedMetadata: Record<string, unknown> = {
      ...metadata,
      alertType,
      routeId,
      deliveryId,
      eventKey,
      riderId,
      rider_id: riderId,
      driverName: readString(payload.driverName) || readString(metadata.driverName),
      lat,
      lng,
      messageDraft: readString(metadata.messageDraft) || incomingMessage,
      mobileAlert: true,
      riderAlertType: alertType,
      riderRealtimeChannel: "notifications",
      supervisorVisible: true,
    };

    const dedupeCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    let dedupeQuery = supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("organization_id", context.organizationId)
      .gte("created_at", dedupeCutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    if (riderId) {
      dedupeQuery = dedupeQuery.eq("rider_id", riderId);
    } else {
      dedupeQuery = dedupeQuery.is("rider_id", null);
    }

    if (eventKey) {
      dedupeQuery = dedupeQuery.contains("metadata", { eventKey });
    } else {
      dedupeQuery = dedupeQuery.eq("message", incomingMessage).eq("type", notificationType);
    }

    const { data: existingRows, error: dedupeError } = await dedupeQuery;

    if (dedupeError) {
      return NextResponse.json({ error: dedupeError.message }, { status: 400 });
    }

    const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
    if (existing) {
      return NextResponse.json({ success: true, deduped: true, row: existing }, { status: 200 });
    }

    const insertPayload = {
      organization_id: context.organizationId,
      rider_id: riderId,
      type: notificationType,
      severity,
      message: incomingMessage,
      location,
      metadata: mergedMetadata,
      acknowledged: false,
      created_at: createdAt,
      geofence_id: geofenceId,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from("notifications")
      .insert(insertPayload)
      .select(NOTIFICATION_SELECT)
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    let insertedViolation: Record<string, unknown> | null = null;

    const createViolation = Boolean(payload.createViolation);
    const violationType = readString(payload.violationType) || ALERT_TO_VIOLATION[alertType] || null;

    if (createViolation && violationType && lat != null && lng != null) {
      const riderName =
        readString(payload.driverName) ||
        readString(metadata.driverName) ||
        (riderId ? await getRiderName(riderId) : null) ||
        context.supervisorName ||
        "Unknown Driver";

      const trafficLevel =
        readString(metadata.trafficLevel)?.toUpperCase() ||
        "MODERATE";

      const { data: violationRow, error: violationError } = await supabase
        .from("violations")
        .insert({
          organization_id: context.organizationId,
          rider_name: riderName,
          zone_name: location || "Unknown Zone",
          lat,
          lng,
          violation_type: violationType,
          base_severity: severity,
          traffic_level: trafficLevel,
          created_at: createdAt,
          geofence_id: geofenceId,
        })
        .select("*")
        .single();

      if (!violationError && violationRow) {
        insertedViolation = violationRow;
      }
    }

    const geofenceEventType = ALERT_TO_GEOFENCE_EVENT[alertType] || null;
    if (geofenceEventType && geofenceId && riderId) {
      await supabase.from("geofence_events").insert({
        rider_id: riderId,
        parcel_id: null,
        geofence_id: geofenceId,
        zone_name: location || "Unknown Zone",
        event_type: geofenceEventType,
        created_at: createdAt,
      });
    }

    return NextResponse.json(
      {
        success: true,
        deduped: false,
        row: insertedRow,
        violation: insertedViolation,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
