import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapboxToken =
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  "";

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

type CsvRowInput = Record<string, unknown>;

type SkippedRow = {
  row: number;
  reason: string;
};

type PreparedInsertRow = {
  rowNumber: number;
  payload: Record<string, unknown>;
  hadContactDetails: boolean;
  clusterName: string | null;
};

const MAX_IMPORT_ROWS = 500;

const TRACKING_KEYS = [
  "tracking_code",
  "tracking",
  "tracking_number",
  "tracking_id",
  "shipment_tracking_id",
  "shipment_id",
  "reference",
];

const RECIPIENT_KEYS = [
  "customer_name",
  "customer",
  "recipient_name",
  "recipient",
  "name",
];

const ADDRESS_KEYS = [
  "address",
  "delivery_address",
  "dropoff_address",
  "destination_address",
  "full_address",
  "location",
];

const CONTACT_KEYS = [
  "contact_details",
  "contact",
  "contact_info",
  "phone",
  "phone_number",
  "mobile",
  "email",
  "recipient_contact",
];

const WEIGHT_KEYS = ["weight_kg", "weight", "parcel_weight", "parcel_weight_kg"];
const REGION_KEYS = ["region", "city", "district", "area", "zone"];
const PRIORITY_KEYS = ["priority", "priority_level"];
const PAYMENT_KEYS = ["payment_type", "payment", "payment_method"];
const LATITUDE_KEYS = ["latitude", "lat"];
const LONGITUDE_KEYS = ["longitude", "lng", "lon", "long"];
const CLUSTER_KEYS = ["cluster_name", "cluster", "parcel_cluster", "cluster_label", "group_name"];

const PHILIPPINES_BBOX = "116.9,4.5,126.8,21.5";
const PHILIPPINES_NOMINATIM_VIEWBOX = "116.9,21.5,126.8,4.5";
const PHILIPPINES_PROXIMITY = "121.0,14.6";

function normalizeHeaderKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asCleanRow(row: CsvRowInput) {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeaderKey(key);
    if (!normalizedKey) continue;

    if (typeof value === "string") {
      normalized[normalizedKey] = value.trim();
      continue;
    }

    if (typeof value === "number") {
      normalized[normalizedKey] = Number.isFinite(value) ? String(value) : "";
      continue;
    }

    normalized[normalizedKey] = value == null ? "" : String(value).trim();
  }

  return normalized;
}

function pickFirst(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function parseNullableNumber(value: string | null) {
  if (!value) return null;

  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

function createTrackingCode(index: number) {
  const stamp = Date.now().toString(36).toUpperCase();
  return `CSV-${stamp}-${String(index + 1).padStart(4, "0")}`;
}

function isMissingContactColumnError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("contact_details") && lower.includes("column");
}

function buildGeocodeCandidates(address: string, region: string | null) {
  const candidates: string[] = [];

  const pushCandidate = (value: string | null) => {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  pushCandidate(region ? `${address}, ${region}, Philippines` : `${address}, Philippines`);
  pushCandidate(`${address}, Philippines`);
  pushCandidate(address);

  return candidates.slice(0, 3);
}

async function geocodeWithMapbox(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!mapboxToken) return null;

  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?limit=1&country=PH&bbox=${encodeURIComponent(
    PHILIPPINES_BBOX
  )}&proximity=${encodeURIComponent(PHILIPPINES_PROXIMITY)}&access_token=${mapboxToken}`;

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      features?: Array<{ center?: [number, number] }>;
    };

    const center = body.features?.[0]?.center;
    if (!Array.isArray(center) || center.length < 2) return null;

    const lng = Number(center[0]);
    const lat = Number(center[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

async function geocodeWithNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&bounded=1&viewbox=${encodeURIComponent(
    PHILIPPINES_NOMINATIM_VIEWBOX
  )}&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        "User-Agent": "Routemate Parcel Import",
      },
    });

    if (!response.ok) return null;

    const body = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    if (!Array.isArray(body) || body.length === 0) return null;

    const lat = Number(body[0]?.lat);
    const lng = Number(body[0]?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

async function geocodeAddress(
  address: string,
  region: string | null
): Promise<{ lat: number; lng: number } | null> {
  const candidates = buildGeocodeCandidates(address, region);

  for (const candidate of candidates) {
    const fromMapbox = await geocodeWithMapbox(candidate);
    if (fromMapbox) return fromMapbox;
  }

  for (const candidate of candidates) {
    const fromNominatim = await geocodeWithNominatim(candidate);
    if (fromNominatim) return fromNominatim;
  }

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
        { error: "Only supervisors can import acquisition parcels" },
        { status: 403 }
      ),
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

export async function POST(request: NextRequest) {
  try {
    const auth = await getSupervisorAuthContext(request);
    if (auth.error) return auth.error;

    const context = auth.context as AuthContext;
    const body = (await request.json()) as {
      rows?: CsvRowInput[];
      assignToOrganization?: boolean;
    };
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const assignToOrganization = body?.assignToOrganization !== false;
    const acquiredAt = new Date().toISOString();

    if (rows.length === 0) {
      return NextResponse.json({ error: "No CSV rows provided" }, { status: 400 });
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `CSV row limit exceeded. Maximum ${MAX_IMPORT_ROWS} rows per upload.` },
        { status: 400 }
      );
    }

    const preparedRows: PreparedInsertRow[] = [];
    const skippedRows: SkippedRow[] = [];
    let geocodedCount = 0;
    let usedProvidedCoordinatesCount = 0;
    let clusteredRowsDetectedCount = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2;
      const cleanRow = asCleanRow(rows[i]);

      const address = pickFirst(cleanRow, ADDRESS_KEYS);
      if (!address) {
        skippedRows.push({ row: rowNumber, reason: "Missing address" });
        continue;
      }

      const recipientName = pickFirst(cleanRow, RECIPIENT_KEYS);
      const contactDetails = pickFirst(cleanRow, CONTACT_KEYS);
      const trackingCode = pickFirst(cleanRow, TRACKING_KEYS) || createTrackingCode(i);
      const weightKg = parseNullableNumber(pickFirst(cleanRow, WEIGHT_KEYS));
      const region = pickFirst(cleanRow, REGION_KEYS);
      const priority = pickFirst(cleanRow, PRIORITY_KEYS);
      const paymentType = pickFirst(cleanRow, PAYMENT_KEYS);
      const clusterName = pickFirst(cleanRow, CLUSTER_KEYS);

      if (clusterName) {
        clusteredRowsDetectedCount += 1;
      }

      const csvLatitude = parseNullableNumber(pickFirst(cleanRow, LATITUDE_KEYS));
      const csvLongitude = parseNullableNumber(pickFirst(cleanRow, LONGITUDE_KEYS));

      let latitude: number | null = null;
      let longitude: number | null = null;

      if (isValidLatitude(csvLatitude) && isValidLongitude(csvLongitude)) {
        latitude = csvLatitude;
        longitude = csvLongitude;
        usedProvidedCoordinatesCount += 1;
      } else {
        const geocoded = await geocodeAddress(address, region);
        if (!geocoded) {
          skippedRows.push({ row: rowNumber, reason: "Could not geocode address" });
          continue;
        }

        latitude = geocoded.lat;
        longitude = geocoded.lng;
        geocodedCount += 1;
      }

      const payload: Record<string, unknown> = {
        organization_id: assignToOrganization ? context.organizationId : null,
        supervisor_id: context.userId,
        tracking_code: trackingCode,
        recipient_name: recipientName,
        address,
        latitude,
        longitude,
        weight_kg: weightKg,
        priority,
        payment_type: paymentType,
        status: assignToOrganization ? "acquired" : "unassigned",
        region,
        acquired_at: assignToOrganization ? acquiredAt : null,
      };

      if (clusterName) {
        payload.cluster_name = clusterName;
      }

      if (contactDetails) {
        payload.contact_details = contactDetails;
      }

      preparedRows.push({
        rowNumber,
        payload,
        hadContactDetails: Boolean(contactDetails),
        clusterName,
      });
    }

    let insertedCount = 0;
    let droppedContactDetails = false;
    let insertedClusteredRowsCount = 0;
    const insertedClusterNames = new Set<string>();

    const markInsertedRow = (row: PreparedInsertRow) => {
      insertedCount += 1;
      if (row.clusterName) {
        insertedClusteredRowsCount += 1;
        insertedClusterNames.add(row.clusterName);
      }
    };

    for (const row of preparedRows) {
      const insertPayload: Record<string, unknown> = { ...row.payload };

      const { error } = await supabase.from("parcel_lists").insert(insertPayload).select("id").single();

      if (error && row.hadContactDetails && isMissingContactColumnError(error.message)) {
        droppedContactDetails = true;
        const retryPayload = { ...insertPayload };
        delete retryPayload.contact_details;

        const retryResult = await supabase
          .from("parcel_lists")
          .insert(retryPayload)
          .select("id")
          .single();

        if (retryResult.error) {
          skippedRows.push({ row: row.rowNumber, reason: retryResult.error.message });
          continue;
        }

        markInsertedRow(row);
        continue;
      }

      if (error) {
        skippedRows.push({ row: row.rowNumber, reason: error.message });
        continue;
      }

      markInsertedRow(row);
    }

    const summary = {
      totalRows: rows.length,
      insertedCount,
      insertedIndividualRowsCount: Math.max(0, insertedCount - insertedClusteredRowsCount),
      insertedClusteredRowsCount,
      importedClusterCount: insertedClusterNames.size,
      clusteredRowsDetectedCount,
      skippedCount: skippedRows.length,
      geocodedCount,
      usedProvidedCoordinatesCount,
      droppedContactDetails,
      assignedToOrganization: assignToOrganization,
      organizationId: assignToOrganization ? context.organizationId : null,
      skippedRows: skippedRows.slice(0, 25),
    };

    return NextResponse.json({ success: true, summary }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
