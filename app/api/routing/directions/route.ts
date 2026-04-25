import { NextRequest, NextResponse } from "next/server";

type LngLat = [number, number];

type ParsedStep = {
  instruction: string;
  distance: number | null;
  duration: number | null;
  wayPoints: [number, number] | null;
};

type ParsedSegment = {
  distance: number | null;
  duration: number | null;
  steps: ParsedStep[];
};

type RouteRequestBody = {
  coordinates?: unknown;
  profile?: unknown;
};

type ParsedOrsError = {
  code: number | null;
  message: string | null;
  unroutableCoordinateIndex: number | null;
  unroutableCoordinate: LngLat | null;
};

type ParsedOsrmError = {
  code: string | null;
  message: string | null;
  unroutableCoordinateIndex: number | null;
};

type ProviderFailurePayload = {
  error: string;
  orsErrorCode: number | null;
  orsMessage: string | null;
  unroutableWaypoint:
    | {
        coordinateIndex: number;
        coordinate: LngLat;
        searchRadiusMeters: number | null;
      }
    | null;
  details: string;
};

type ProviderSuccessPayload = {
  geometry: LngLat[];
  duration: number | null;
  distance: number | null;
  waypointIndexes: number[];
  segments: ParsedSegment[];
  isRoadSnapped: boolean;
  provider: "osrm" | "ors-fallback";
  profile: "motorcycle";
};

const MOTORCYCLE_PROFILE = "motorcycle" as const;
const ORS_FALLBACK_PROFILE = "driving-car";
const SNAP_RADII_METERS = [350, 800, 1500, 2500];
const OSRM_BASE_URL = (
  process.env.OSRM_BASE_URL ||
  process.env.NEXT_PUBLIC_OSRM_BASE_URL ||
  "https://router.project-osrm.org"
).replace(/\/+$/, "");

function isValidCoordinate(coord: unknown): coord is LngLat {
  if (!Array.isArray(coord) || coord.length !== 2) return false;

  const [lng, lat] = coord;

  return (
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180 &&
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90
  );
}

function parseFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isWaypointIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseUnroutableCoordinateFromMessage(message: string | null) {
  if (!message) {
    return {
      unroutableCoordinateIndex: null,
      unroutableCoordinate: null,
    };
  }

  const match = message.match(
    /coordinate\s+(\d+)\s*:\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i
  );

  if (!match) {
    return {
      unroutableCoordinateIndex: null,
      unroutableCoordinate: null,
    };
  }

  const coordinateIndex = Number.parseInt(match[1], 10);
  const lng = Number.parseFloat(match[2]);
  const lat = Number.parseFloat(match[3]);

  return {
    unroutableCoordinateIndex:
      Number.isInteger(coordinateIndex) && coordinateIndex >= 0
        ? coordinateIndex
        : null,
    unroutableCoordinate:
      Number.isFinite(lng) && Number.isFinite(lat)
        ? ([lng, lat] as LngLat)
        : null,
  };
}

function parseOrsError(raw: string): ParsedOrsError {
  let parsed: unknown = null;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const code =
    typeof parsed === "object" &&
    parsed !== null &&
    "error" in parsed &&
    typeof (parsed as { error?: unknown }).error === "object" &&
    (parsed as { error?: unknown }).error !== null &&
    "code" in ((parsed as { error: { code?: unknown } }).error || {}) &&
    typeof (parsed as { error: { code?: unknown } }).error.code === "number"
      ? Math.trunc((parsed as { error: { code: number } }).error.code)
      : null;

  const message =
    typeof parsed === "object" &&
    parsed !== null &&
    "error" in parsed &&
    typeof (parsed as { error?: unknown }).error === "object" &&
    (parsed as { error?: unknown }).error !== null &&
    "message" in ((parsed as { error: { message?: unknown } }).error || {}) &&
    typeof (parsed as { error: { message?: unknown } }).error.message === "string"
      ? (parsed as { error: { message: string } }).error.message
      : raw;

  const { unroutableCoordinateIndex, unroutableCoordinate } =
    parseUnroutableCoordinateFromMessage(message);

  return {
    code,
    message,
    unroutableCoordinateIndex,
    unroutableCoordinate,
  };
}

function parseOsrmError(raw: string): ParsedOsrmError {
  let parsed: unknown = null;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const code =
    typeof parsed === "object" &&
    parsed !== null &&
    "code" in parsed &&
    typeof (parsed as { code?: unknown }).code === "string"
      ? (parsed as { code: string }).code
      : null;

  const message =
    typeof parsed === "object" &&
    parsed !== null &&
    "message" in parsed &&
    typeof (parsed as { message?: unknown }).message === "string"
      ? (parsed as { message: string }).message
      : raw;

  const indexMatch = message?.match(/(?:coordinate|waypoint)\s+(\d+)/i);
  const unroutableCoordinateIndex =
    indexMatch && Number.isInteger(Number.parseInt(indexMatch[1], 10))
      ? Number.parseInt(indexMatch[1], 10)
      : null;

  return {
    code,
    message,
    unroutableCoordinateIndex,
  };
}

function toCoordinatePath(coordinates: LngLat[]) {
  return coordinates.map(([lng, lat]) => `${lng},${lat}`).join(";");
}

function startCase(value: string) {
  if (!value) return "Continue";
  return value
    .split("_")
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildOsrmInstruction(step: unknown): string {
  if (typeof step !== "object" || step === null) return "Continue";

  const stepData = step as {
    name?: unknown;
    maneuver?: {
      type?: unknown;
      modifier?: unknown;
    };
  };

  const type = typeof stepData.maneuver?.type === "string" ? stepData.maneuver.type : "continue";
  const modifier =
    typeof stepData.maneuver?.modifier === "string"
      ? startCase(stepData.maneuver.modifier)
      : "";
  const roadName = typeof stepData.name === "string" ? stepData.name.trim() : "";

  if (type === "depart") {
    return roadName ? `Depart onto ${roadName}` : "Depart";
  }

  if (type === "arrive") {
    return "Arrive at destination";
  }

  const direction = modifier.length > 0 ? `${startCase(type)} ${modifier}` : startCase(type);
  return roadName ? `${direction} onto ${roadName}` : direction;
}

function buildFailurePayload(
  message: string,
  details: string,
  code: number | null,
  coordinateIndex: number | null,
  coordinate: LngLat | null,
  searchRadiusMeters: number | null
): ProviderFailurePayload {
  return {
    error: "OpenRouteService request failed.",
    orsErrorCode: code,
    orsMessage: message,
    unroutableWaypoint:
      coordinate && coordinateIndex !== null
        ? {
            coordinateIndex,
            coordinate,
            searchRadiusMeters,
          }
        : null,
    details,
  };
}

async function tryOsrmDirections(coordinates: LngLat[]) {
  const url = `${OSRM_BASE_URL}/route/v1/driving/${toCoordinatePath(
    coordinates
  )}?overview=full&geometries=geojson&steps=true&alternatives=false&annotations=false&continue_straight=true`;

  try {
    const response = await fetch(url, { method: "GET" });
    const raw = await response.text();

    if (!response.ok) {
      const parsedError = parseOsrmError(raw);
      const index = parsedError.unroutableCoordinateIndex;
      const coordinate =
        index !== null && index >= 0 && index < coordinates.length
          ? coordinates[index]
          : null;
      const errorCode =
        parsedError.code === "NoRoute" || parsedError.code === "NoSegment" ? 2010 : null;

      return {
        ok: false as const,
        status: response.status,
        payload: buildFailurePayload(
          parsedError.message || "OSRM request failed.",
          raw,
          errorCode,
          index,
          coordinate,
          null
        ),
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return {
        ok: false as const,
        status: 502,
        payload: buildFailurePayload(
          "Invalid JSON response from OSRM.",
          raw,
          null,
          null,
          null,
          null
        ),
      };
    }

    const root = payload as {
      code?: unknown;
      message?: unknown;
      routes?: unknown;
    };

    if (root.code !== "Ok" || !Array.isArray(root.routes) || root.routes.length === 0) {
      const parsedError = parseOsrmError(raw);
      const index = parsedError.unroutableCoordinateIndex;
      const coordinate =
        index !== null && index >= 0 && index < coordinates.length
          ? coordinates[index]
          : null;
      const errorCode =
        parsedError.code === "NoRoute" || parsedError.code === "NoSegment" ? 2010 : null;

      return {
        ok: false as const,
        status: 400,
        payload: buildFailurePayload(
          parsedError.message || "OSRM could not produce a route.",
          raw,
          errorCode,
          index,
          coordinate,
          null
        ),
      };
    }

    const route = (root.routes as Array<{
      geometry?: { coordinates?: unknown[] };
      duration?: unknown;
      distance?: unknown;
      legs?: unknown;
    }>)[0];

    const geometry = Array.isArray(route?.geometry?.coordinates)
      ? route.geometry.coordinates.filter(isValidCoordinate)
      : [];

    const segments = Array.isArray(route?.legs)
      ? route.legs
          .map((segment): ParsedSegment | null => {
            if (typeof segment !== "object" || segment === null) return null;

            const stepsRaw =
              "steps" in segment && Array.isArray((segment as { steps?: unknown }).steps)
                ? ((segment as { steps: unknown[] }).steps || [])
                : [];

            const steps = stepsRaw
              .map((step): ParsedStep | null => {
                if (typeof step !== "object" || step === null) return null;

                return {
                  instruction: buildOsrmInstruction(step),
                  distance: parseFiniteNumber((step as { distance?: unknown }).distance),
                  duration: parseFiniteNumber((step as { duration?: unknown }).duration),
                  wayPoints: null,
                };
              })
              .filter((step): step is ParsedStep => step !== null);

            return {
              distance: parseFiniteNumber((segment as { distance?: unknown }).distance),
              duration: parseFiniteNumber((segment as { duration?: unknown }).duration),
              steps,
            };
          })
          .filter((segment): segment is ParsedSegment => segment !== null)
      : [];

    const successPayload: ProviderSuccessPayload = {
      geometry,
      duration: parseFiniteNumber(route?.duration),
      distance: parseFiniteNumber(route?.distance),
      waypointIndexes: coordinates.map((_, index) => index),
      segments,
      isRoadSnapped: geometry.length > 1,
      provider: "osrm",
      profile: MOTORCYCLE_PROFILE,
    };

    return {
      ok: true as const,
      payload: successPayload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OSRM request failed.";

    return {
      ok: false as const,
      status: 502,
      payload: buildFailurePayload(message, String(error), null, null, null, null),
    };
  }
}

async function tryOrsDirections(coordinates: LngLat[], apiKey: string) {
  let orsResponse: Response | null = null;
  let raw = "";
  let usedSnapRadiusMeters = SNAP_RADII_METERS[0];

  for (const snapRadiusMeters of SNAP_RADII_METERS) {
    usedSnapRadiusMeters = snapRadiusMeters;

    orsResponse = await fetch(
      `https://api.openrouteservice.org/v2/directions/${ORS_FALLBACK_PROFILE}/geojson`,
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates,
          radiuses: coordinates.map(() => snapRadiusMeters),
          instructions: true,
          instructions_format: "text",
          geometry_simplify: false,
          elevation: false,
          preference: "recommended",
        }),
      }
    );

    raw = await orsResponse.text();

    if (orsResponse.ok) {
      break;
    }

    const parsedRetryError = parseOrsError(raw);
    const isUnroutableWaypointError = parsedRetryError.code === 2010;
    const isLastRadius = snapRadiusMeters === SNAP_RADII_METERS[SNAP_RADII_METERS.length - 1];

    if (!isUnroutableWaypointError || isLastRadius) {
      break;
    }
  }

  if (!orsResponse) {
    return {
      ok: false as const,
      status: 500,
      payload: buildFailurePayload(
        "OpenRouteService request was not initialized.",
        raw,
        null,
        null,
        null,
        null
      ),
    };
  }

  if (!orsResponse.ok) {
    const parsedOrsError = parseOrsError(raw);

    return {
      ok: false as const,
      status: orsResponse.status,
      payload: buildFailurePayload(
        parsedOrsError.message || "OpenRouteService request failed.",
        raw,
        parsedOrsError.code,
        parsedOrsError.unroutableCoordinateIndex,
        parsedOrsError.unroutableCoordinate,
        usedSnapRadiusMeters
      ),
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return {
      ok: false as const,
      status: 502,
      payload: buildFailurePayload(
        "Invalid JSON response from OpenRouteService.",
        raw,
        null,
        null,
        null,
        null
      ),
    };
  }

  const feature =
    typeof payload === "object" &&
    payload !== null &&
    "features" in payload &&
    Array.isArray((payload as { features?: unknown[] }).features)
      ? (payload as {
          features: Array<{
            geometry?: { coordinates?: unknown[] };
            properties?: {
              summary?: { duration?: unknown; distance?: unknown };
              way_points?: unknown;
              segments?: unknown;
            };
          }>;
        }).features[0]
      : null;

  const properties = feature?.properties;

  const geometry = Array.isArray(feature?.geometry?.coordinates)
    ? feature.geometry.coordinates.filter(isValidCoordinate)
    : [];

  const duration = parseFiniteNumber(properties?.summary?.duration);
  const distance = parseFiniteNumber(properties?.summary?.distance);

  const waypointIndexes = Array.isArray(properties?.way_points)
    ? properties.way_points.filter(isWaypointIndex).map((value) => Math.trunc(value))
    : [];

  const segments = Array.isArray(properties?.segments)
    ? properties.segments
        .map((segment): ParsedSegment | null => {
          if (typeof segment !== "object" || segment === null) return null;

          const rawSteps =
            "steps" in segment && Array.isArray((segment as { steps?: unknown }).steps)
              ? ((segment as { steps: unknown[] }).steps || [])
              : [];

          const steps = rawSteps
            .map((step): ParsedStep | null => {
              if (typeof step !== "object" || step === null) return null;

              const instruction =
                "instruction" in step && typeof (step as { instruction?: unknown }).instruction === "string"
                  ? (step as { instruction: string }).instruction
                  : "";

              const rawWayPoints =
                "way_points" in step && Array.isArray((step as { way_points?: unknown }).way_points)
                  ? (step as { way_points: unknown[] }).way_points
                  : null;

              const wayPoints =
                rawWayPoints &&
                rawWayPoints.length === 2 &&
                isWaypointIndex(rawWayPoints[0]) &&
                isWaypointIndex(rawWayPoints[1])
                  ? ([
                      Math.trunc(rawWayPoints[0]),
                      Math.trunc(rawWayPoints[1]),
                    ] as [number, number])
                  : null;

              return {
                instruction,
                distance: parseFiniteNumber((step as { distance?: unknown }).distance),
                duration: parseFiniteNumber((step as { duration?: unknown }).duration),
                wayPoints,
              };
            })
            .filter((step): step is ParsedStep => step !== null);

          return {
            distance: parseFiniteNumber((segment as { distance?: unknown }).distance),
            duration: parseFiniteNumber((segment as { duration?: unknown }).duration),
            steps,
          };
        })
        .filter((segment): segment is ParsedSegment => segment !== null)
    : [];

  const successPayload: ProviderSuccessPayload = {
    geometry,
    duration,
    distance,
    waypointIndexes,
    segments,
    isRoadSnapped: geometry.length > 1,
    provider: "ors-fallback",
    profile: MOTORCYCLE_PROFILE,
  };

  return {
    ok: true as const,
    payload: successPayload,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RouteRequestBody;
    const rawCoordinates = Array.isArray(body.coordinates) ? body.coordinates : [];
    const coordinates = rawCoordinates.filter(isValidCoordinate);

    if (coordinates.length < 2) {
      return NextResponse.json(
        { error: "At least two valid coordinates are required." },
        { status: 400 }
      );
    }

    const incomingProfile =
      typeof body.profile === "string" ? body.profile.trim().toLowerCase() : "";

    if (incomingProfile.length > 0 && incomingProfile !== MOTORCYCLE_PROFILE) {
      console.warn(
        `[Routing] Ignoring requested profile \"${incomingProfile}\". Motorcycle-only routing is enforced.`
      );
    }

    const osrmResult = await tryOsrmDirections(coordinates);

    if (osrmResult.ok) {
      return NextResponse.json(osrmResult.payload);
    }

    console.warn(
      `[Routing] OSRM primary failed (status ${osrmResult.status}). Trying ORS fallback.`
    );

    const apiKey =
      process.env.OPENROUTESERVICE_API_KEY ||
      process.env.ORS_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTESERVICE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(osrmResult.payload, { status: osrmResult.status });
    }

    const orsResult = await tryOrsDirections(coordinates, apiKey);

    if (orsResult.ok) {
      return NextResponse.json({
        ...orsResult.payload,
        fallbackFrom: "osrm",
      });
    }

    return NextResponse.json(
      {
        ...orsResult.payload,
        primaryProviderError: osrmResult.payload.orsMessage || osrmResult.payload.error,
      },
      { status: orsResult.status }
    );
  } catch (error) {
    console.error("[Routing] Directions API unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected server error while fetching directions." },
      { status: 500 }
    );
  }
}