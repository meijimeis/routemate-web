export type LngLat = [number, number];

export type DirectionsProfile = "motorcycle";

export type DirectionsStep = {
  instruction: string;
  distance: number | null;
  duration: number | null;
  wayPoints: [number, number] | null;
};

export type DirectionsSegment = {
  distance: number | null;
  duration: number | null;
  steps: DirectionsStep[];
};

export type DirectionsErrorCode = "UNROUTABLE_WAYPOINT" | "REQUEST_FAILED";

export type DirectionsError = {
  code: DirectionsErrorCode;
  message: string;
  orsCode: number | null;
  waypointIndex: number | null;
  waypoint: LngLat | null;
  searchRadiusMeters: number | null;
};

export type DirectionsResult = {
  geometry: LngLat[];
  duration: number | null;
  distance: number | null;
  waypointIndexes: number[];
  segments: DirectionsSegment[];
  isRoadSnapped: boolean;
  error: DirectionsError | null;
};

type FetchDirectionsOptions = {
  profile?: DirectionsProfile;
};

function isValidCoordinate(coord: unknown): coord is LngLat {
  if (!Array.isArray(coord) || coord.length !== 2) return false;

  const [lng, lat] = coord;

  return (
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    typeof lat === "number" &&
    Number.isFinite(lat)
  );
}

function isWaypointIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDirectionsError(raw: string): DirectionsError | null {
  let parsed: unknown = null;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const root = parsed as {
    error?: unknown;
    orsErrorCode?: unknown;
    orsMessage?: unknown;
    unroutableWaypoint?: unknown;
  };

  const orsCode =
    typeof root.orsErrorCode === "number" && Number.isFinite(root.orsErrorCode)
      ? Math.trunc(root.orsErrorCode)
      : null;

  const orsMessage =
    typeof root.orsMessage === "string"
      ? root.orsMessage
      : typeof root.error === "string"
        ? root.error
        : "Routing request failed.";

  const waypointRoot =
    typeof root.unroutableWaypoint === "object" && root.unroutableWaypoint !== null
      ? (root.unroutableWaypoint as {
          coordinateIndex?: unknown;
          coordinate?: unknown;
          searchRadiusMeters?: unknown;
        })
      : null;

  const waypointIndex =
    waypointRoot &&
    typeof waypointRoot.coordinateIndex === "number" &&
    Number.isInteger(waypointRoot.coordinateIndex) &&
    waypointRoot.coordinateIndex >= 0
      ? waypointRoot.coordinateIndex
      : null;

  const waypoint =
    waypointRoot &&
    Array.isArray(waypointRoot.coordinate) &&
    isValidCoordinate(waypointRoot.coordinate)
      ? waypointRoot.coordinate
      : null;

  const searchRadiusMeters =
    waypointRoot &&
    typeof waypointRoot.searchRadiusMeters === "number" &&
    Number.isFinite(waypointRoot.searchRadiusMeters)
      ? waypointRoot.searchRadiusMeters
      : null;

  const isUnroutableWaypoint = orsCode === 2010 || (waypoint !== null && waypointIndex !== null);

  if (isUnroutableWaypoint) {
    const waypointLabel =
      waypointIndex !== null ? `waypoint ${waypointIndex}` : "one waypoint";

    return {
      code: "UNROUTABLE_WAYPOINT",
      message: `${waypointLabel} is too far from a drivable road. Move that pin closer to land/road and retry.`,
      orsCode,
      waypointIndex,
      waypoint,
      searchRadiusMeters,
    };
  }

  return {
    code: "REQUEST_FAILED",
    message: orsMessage,
    orsCode,
    waypointIndex,
    waypoint,
    searchRadiusMeters,
  };
}

function emptyResultWithError(error: DirectionsError): DirectionsResult {
  return {
    geometry: [],
    duration: null,
    distance: null,
    waypointIndexes: [],
    segments: [],
    isRoadSnapped: false,
    error,
  };
}

export async function fetchDirections(
  coordinates: LngLat[],
  options: FetchDirectionsOptions = {}
): Promise<DirectionsResult | null> {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  try {
    const response = await fetch("/api/routing/directions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates,
        profile: options.profile || "motorcycle",
      }),
    });

    if (!response.ok) {
      const rawError = await response.text();
      const parsedError = parseDirectionsError(rawError);

      if (parsedError) {
        if (parsedError.code === "UNROUTABLE_WAYPOINT") {
          console.warn(`[Routing] ${parsedError.message}`);
        } else {
          console.error(`[Routing] ${parsedError.message}`);
        }

        return emptyResultWithError(parsedError);
      }

      console.error(`[Routing] Failed to fetch directions (status ${response.status}).`);
      return null;
    }

    const payload = (await response.json()) as {
      geometry?: unknown;
      duration?: unknown;
      distance?: unknown;
      waypointIndexes?: unknown;
      segments?: unknown;
      isRoadSnapped?: unknown;
    };

    const geometry = Array.isArray(payload.geometry)
      ? payload.geometry.filter(isValidCoordinate)
      : [];

    const duration = parseFiniteNumber(payload.duration);
    const distance = parseFiniteNumber(payload.distance);

    const waypointIndexes = Array.isArray(payload.waypointIndexes)
      ? payload.waypointIndexes.filter(isWaypointIndex).map((value) => Math.trunc(value))
      : [];

    const segments = Array.isArray(payload.segments)
      ? payload.segments
          .map((segment): DirectionsSegment | null => {
            if (typeof segment !== "object" || segment === null) return null;

            const rawSteps =
              "steps" in segment && Array.isArray((segment as { steps?: unknown }).steps)
                ? ((segment as { steps: unknown[] }).steps || [])
                : [];

            const steps = rawSteps
              .map((step): DirectionsStep | null => {
                if (typeof step !== "object" || step === null) return null;

                const instruction =
                  "instruction" in step && typeof (step as { instruction?: unknown }).instruction === "string"
                    ? (step as { instruction: string }).instruction
                    : "";

                const rawWayPoints =
                  "wayPoints" in step && Array.isArray((step as { wayPoints?: unknown }).wayPoints)
                    ? (step as { wayPoints: unknown[] }).wayPoints
                    : null;

                const wayPoints =
                  rawWayPoints &&
                  rawWayPoints.length === 2 &&
                  isWaypointIndex(rawWayPoints[0]) &&
                  isWaypointIndex(rawWayPoints[1])
                    ? [Math.trunc(rawWayPoints[0]), Math.trunc(rawWayPoints[1])] as [number, number]
                    : null;

                return {
                  instruction,
                  distance: parseFiniteNumber((step as { distance?: unknown }).distance),
                  duration: parseFiniteNumber((step as { duration?: unknown }).duration),
                  wayPoints,
                };
              })
              .filter((step): step is DirectionsStep => step !== null);

            return {
              distance: parseFiniteNumber((segment as { distance?: unknown }).distance),
              duration: parseFiniteNumber((segment as { duration?: unknown }).duration),
              steps,
            };
          })
          .filter((segment): segment is DirectionsSegment => segment !== null)
      : [];

    const isRoadSnapped =
      typeof payload.isRoadSnapped === "boolean"
        ? payload.isRoadSnapped
        : geometry.length > 1;

    return {
      geometry,
      duration,
      distance,
      waypointIndexes,
      segments,
      isRoadSnapped,
      error: null,
    };
  } catch (error) {
    console.error("[Routing] Unexpected directions fetch error:", error);
    return null;
  }
}

export function estimateTypicalDurationSeconds(
  distanceMeters: number | null | undefined,
  speedKmh = 45
): number {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return 60;
  }

  const speedMps = (speedKmh * 1000) / 3600;
  if (!Number.isFinite(speedMps) || speedMps <= 0) return 60;

  return Math.max(1, distanceMeters / speedMps);
}
