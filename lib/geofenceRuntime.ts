type GeofenceSourceRow = {
  id?: string | null;
  name?: string | null;
  region?: string | null;
  geometry?: unknown;
};

type RuntimeZone = {
  id: string;
  name: string;
  region: string | null;
  polygonLngLat: Array<[number, number]>;
  bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
};

export type GeofenceRuntime = {
  zones: RuntimeZone[];
  componentByZoneId: Map<string, number>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseLngLatPoint(point: unknown): [number, number] | null {
  if (!Array.isArray(point) || point.length < 2) return null;

  const first = readNumber(point[0]);
  const second = readNumber(point[1]);

  if (first == null || second == null) return null;

  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return [first, second];
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return [second, first];
  }

  return null;
}

function extractFirstRing(candidate: unknown): Array<[number, number]> {
  if (!Array.isArray(candidate)) return [];

  const directRing = candidate
    .map((point) => parseLngLatPoint(point))
    .filter((point): point is [number, number] => Boolean(point));

  if (directRing.length >= 3) {
    return directRing;
  }

  for (const nested of candidate) {
    const nestedRing = extractFirstRing(nested);
    if (nestedRing.length >= 3) {
      return nestedRing;
    }
  }

  return [];
}

function extractZoneCoordinates(geometry: unknown): Array<[number, number]> {
  const root = asRecord(geometry);
  const nestedGeometry = asRecord(root.geometry);

  const candidates = [root.coordinates, nestedGeometry.coordinates, geometry];

  for (const candidate of candidates) {
    const ring = extractFirstRing(candidate);
    if (ring.length >= 3) {
      return ring;
    }
  }

  return [];
}

function buildBBox(points: Array<[number, number]>) {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  points.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });

  return { minLng, minLat, maxLng, maxLat };
}

function bboxesOverlap(
  left: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  right: { minLng: number; minLat: number; maxLng: number; maxLat: number }
): boolean {
  return !(
    left.maxLng < right.minLng ||
    right.maxLng < left.minLng ||
    left.maxLat < right.minLat ||
    right.maxLat < left.minLat
  );
}

function isPointInPolygon(point: [number, number], polygon: Array<[number, number]>): boolean {
  let inside = false;
  const [x, y] = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);

  if (Math.abs(value) < 1e-10) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (
    bx <= Math.max(ax, cx) &&
    bx >= Math.min(ax, cx) &&
    by <= Math.max(ay, cy) &&
    by >= Math.min(ay, cy)
  );
}

function segmentsIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number]
): boolean {
  const [ax1, ay1] = a1;
  const [ax2, ay2] = a2;
  const [bx1, by1] = b1;
  const [bx2, by2] = b2;

  const o1 = orientation(ax1, ay1, ax2, ay2, bx1, by1);
  const o2 = orientation(ax1, ay1, ax2, ay2, bx2, by2);
  const o3 = orientation(bx1, by1, bx2, by2, ax1, ay1);
  const o4 = orientation(bx1, by1, bx2, by2, ax2, ay2);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(ax1, ay1, bx1, by1, ax2, ay2)) return true;
  if (o2 === 0 && onSegment(ax1, ay1, bx2, by2, ax2, ay2)) return true;
  if (o3 === 0 && onSegment(bx1, by1, ax1, ay1, bx2, by2)) return true;
  if (o4 === 0 && onSegment(bx1, by1, ax2, ay2, bx2, by2)) return true;

  return false;
}

function polygonsOverlap(left: RuntimeZone, right: RuntimeZone): boolean {
  if (!bboxesOverlap(left.bbox, right.bbox)) return false;

  const leftPoints = left.polygonLngLat;
  const rightPoints = right.polygonLngLat;

  for (let i = 0; i < leftPoints.length; i += 1) {
    const leftStart = leftPoints[i];
    const leftEnd = leftPoints[(i + 1) % leftPoints.length];

    for (let j = 0; j < rightPoints.length; j += 1) {
      const rightStart = rightPoints[j];
      const rightEnd = rightPoints[(j + 1) % rightPoints.length];

      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true;
      }
    }
  }

  if (isPointInPolygon(leftPoints[0], rightPoints)) return true;
  if (isPointInPolygon(rightPoints[0], leftPoints)) return true;

  return false;
}

export function buildGeofenceRuntime(geofenceRows: GeofenceSourceRow[]): GeofenceRuntime {
  const zones = (Array.isArray(geofenceRows) ? geofenceRows : [])
    .map((row, index) => {
      const polygonLngLat = extractZoneCoordinates(row.geometry);
      if (polygonLngLat.length < 3) return null;

      const id = (row.id || "").trim() || `zone-${index + 1}`;
      const name = (row.name || "").trim() || `Zone ${index + 1}`;
      const region = typeof row.region === "string" ? row.region : null;

      return {
        id,
        name,
        region,
        polygonLngLat,
        bbox: buildBBox(polygonLngLat),
      } as RuntimeZone;
    })
    .filter((zone): zone is RuntimeZone => Boolean(zone));

  const adjacency = new Map<string, Set<string>>();
  zones.forEach((zone) => adjacency.set(zone.id, new Set()));

  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      if (!polygonsOverlap(zones[i], zones[j])) continue;

      adjacency.get(zones[i].id)?.add(zones[j].id);
      adjacency.get(zones[j].id)?.add(zones[i].id);
    }
  }

  const componentByZoneId = new Map<string, number>();
  let componentIndex = 0;

  zones.forEach((zone) => {
    if (componentByZoneId.has(zone.id)) return;

    componentIndex += 1;

    const stack = [zone.id];
    componentByZoneId.set(zone.id, componentIndex);

    while (stack.length > 0) {
      const current = stack.pop() as string;
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;

      neighbors.forEach((neighbor) => {
        if (componentByZoneId.has(neighbor)) return;

        componentByZoneId.set(neighbor, componentIndex);
        stack.push(neighbor);
      });
    }
  });

  return {
    zones,
    componentByZoneId,
  };
}

export function getComponentIdsForPoint(
  lat: number,
  lng: number,
  runtime: GeofenceRuntime
): number[] {
  const zoneIds = getZoneIdsForPoint(lat, lng, runtime);
  if (zoneIds.length === 0) return [];

  const componentIds = new Set<number>();

  zoneIds.forEach((zoneId) => {
    const componentId = runtime.componentByZoneId.get(zoneId);
    if (typeof componentId === "number") {
      componentIds.add(componentId);
    }
  });

  return Array.from(componentIds.values());
}

export function getZoneIdsForPoint(
  lat: number,
  lng: number,
  runtime: GeofenceRuntime
): string[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const zoneIds: string[] = [];

  runtime.zones.forEach((zone) => {
    if (
      lng < zone.bbox.minLng ||
      lng > zone.bbox.maxLng ||
      lat < zone.bbox.minLat ||
      lat > zone.bbox.maxLat
    ) {
      return;
    }

    if (!isPointInPolygon([lng, lat], zone.polygonLngLat)) return;

    zoneIds.push(zone.id);
  });

  return zoneIds;
}

export function isPointInsideGeofences(
  lat: number,
  lng: number,
  runtime: GeofenceRuntime
): boolean {
  return getComponentIdsForPoint(lat, lng, runtime).length > 0;
}

export function pointsShareMergedGeofenceComponent(
  points: Array<{ lat: number; lng: number }>,
  runtime: GeofenceRuntime
): boolean {
  if (!Array.isArray(points) || points.length === 0) return false;

  let sharedComponentIds: Set<number> | null = null;

  for (const point of points) {
    const pointComponentIds = getComponentIdsForPoint(point.lat, point.lng, runtime);
    if (pointComponentIds.length === 0) {
      return false;
    }

    if (sharedComponentIds == null) {
      sharedComponentIds = new Set(pointComponentIds);
      continue;
    }

    sharedComponentIds = new Set(
      Array.from(sharedComponentIds).filter((componentId) =>
        pointComponentIds.includes(componentId)
      )
    );

    if (sharedComponentIds.size === 0) {
      return false;
    }
  }

  return (sharedComponentIds?.size || 0) > 0;
}
