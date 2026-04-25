import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const OUTPUT_FILE = resolve(
  process.cwd(),
  "DUMMY_DATA_METRO_MANILA_GEOCODED_ACQUIRABLE_100.sql"
);

const TARGET_TOTAL = 100;
const START_INDEX = 101;
const INDIVIDUAL_COUNT = 50;
const CLUSTERED_COUNT = TARGET_TOTAL - INDIVIDUAL_COUNT;
const CLUSTER_SIZE = 5;
const CLUSTER_COUNT = Math.ceil(CLUSTERED_COUNT / CLUSTER_SIZE);

const PRIORITY_VALUES = ["High", "Medium", "Low"];
const PAYMENT_VALUES = ["cod", "prepaid", "wallet"];

const METRO_BOUNDS = {
  minLat: 14.35,
  maxLat: 14.85,
  minLng: 120.90,
  maxLng: 121.16,
};

const METRO_CITIES = new Set(
  [
    "manila",
    "quezon city",
    "caloocan",
    "las pinas",
    "makati",
    "malabon",
    "mandaluyong",
    "marikina",
    "muntinlupa",
    "navotas",
    "paranaque",
    "pasay",
    "pasig",
    "san juan",
    "taguig",
    "valenzuela",
    "pateros",
  ].map((entry) => normalizeName(entry))
);

const METRO_CENTERS = [
  { city: "Manila", lat: 14.5995, lng: 120.9842 },
  { city: "Quezon City", lat: 14.676, lng: 121.0437 },
  { city: "Caloocan", lat: 14.65, lng: 120.97 },
  { city: "Las Pinas", lat: 14.4445, lng: 120.9939 },
  { city: "Makati", lat: 14.5547, lng: 121.0244 },
  { city: "Malabon", lat: 14.6681, lng: 120.9565 },
  { city: "Mandaluyong", lat: 14.5794, lng: 121.0359 },
  { city: "Marikina", lat: 14.6507, lng: 121.1029 },
  { city: "Muntinlupa", lat: 14.3832, lng: 121.0436 },
  { city: "Navotas", lat: 14.6715, lng: 120.949 },
  { city: "Paranaque", lat: 14.4793, lng: 121.0198 },
  { city: "Pasay", lat: 14.5378, lng: 121.0014 },
  { city: "Pasig", lat: 14.5764, lng: 121.0851 },
  { city: "San Juan", lat: 14.5996, lng: 121.0359 },
  { city: "Taguig", lat: 14.5176, lng: 121.05 },
  { city: "Valenzuela", lat: 14.7004, lng: 120.983 },
  { city: "Pateros", lat: 14.5446, lng: 121.0699 },
];

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toIsoNoMs(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sqlString(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinMetroBounds(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= METRO_BOUNDS.minLat &&
    lat <= METRO_BOUNDS.maxLat &&
    lng >= METRO_BOUNDS.minLng &&
    lng <= METRO_BOUNDS.maxLng
  );
}

function isMetroAddress(address) {
  const cityLikeFields = [
    address?.city,
    address?.town,
    address?.municipality,
    address?.city_district,
    address?.county,
    address?.suburb,
  ]
    .map((entry) => normalizeName(entry))
    .filter(Boolean);

  if (cityLikeFields.some((entry) => METRO_CITIES.has(entry))) {
    return true;
  }

  const state = normalizeName(address?.state);
  const region = normalizeName(address?.region);
  const stateDistrict = normalizeName(address?.state_district);
  const countryCode = normalizeName(address?.country_code);

  const hasMetroLabel =
    state.includes("metro manila") ||
    state.includes("national capital region") ||
    region.includes("metro manila") ||
    region.includes("national capital region") ||
    stateDistrict.includes("metro manila") ||
    stateDistrict.includes("national capital region");

  return hasMetroLabel && countryCode === "ph";
}

function destinationPoint(lat, lng, distanceKm, bearingDegrees) {
  const R = 6371;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const angularDistance = distanceKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

function buildCandidatePoints() {
  const points = [];
  const radiiKm = [0, 0.9, 1.6, 2.3, 3.1, 3.8, 4.5, 5.2];
  const baseBearings = [0, 45, 90, 135, 180, 225, 270, 315];

  METRO_CENTERS.forEach((center, centerIndex) => {
    radiiKm.forEach((radius, radiusIndex) => {
      const bearing = (baseBearings[radiusIndex] + centerIndex * 17) % 360;
      const point = destinationPoint(center.lat, center.lng, radius, bearing);

      if (isWithinMetroBounds(point.lat, point.lng)) {
        points.push({
          lat: Number(point.lat.toFixed(6)),
          lng: Number(point.lng.toFixed(6)),
          hintCity: center.city,
        });
      }
    });
  });

  return points;
}

async function reverseGeocode(lat, lng, attempt = 1) {
  const endpoint = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${encodeURIComponent(
    String(lat)
  )}&lon=${encodeURIComponent(String(lng))}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": "Routemate-MetroManila-Geocoded-SQL-Seed/1.0",
        "Accept-Language": "en",
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      if (attempt >= 5) return null;
      await sleep(1300 * attempt);
      return reverseGeocode(lat, lng, attempt + 1);
    }

    if (!response.ok) {
      if (attempt >= 3) return null;
      await sleep(650 * attempt);
      return reverseGeocode(lat, lng, attempt + 1);
    }

    const body = await response.json();
    const parsedLat = Number(body?.lat);
    const parsedLng = Number(body?.lon);

    if (!isWithinMetroBounds(parsedLat, parsedLng)) {
      return null;
    }

    const displayName = String(body?.display_name || "").trim();
    if (!displayName) {
      return null;
    }

    const address = body?.address || {};
    if (!isMetroAddress(address)) {
      return null;
    }

    return {
      lat: Number(parsedLat.toFixed(6)),
      lng: Number(parsedLng.toFixed(6)),
      displayName,
      address,
    };
  } catch {
    if (attempt >= 3) return null;
    await sleep(650 * attempt);
    return reverseGeocode(lat, lng, attempt + 1);
  }
}

function selectFarSpaced(points, targetCount) {
  if (points.length <= targetCount) {
    return [...points];
  }

  let firstIndex = 0;
  let secondIndex = 1;
  let maxDistance = -1;

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const distance = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      if (distance > maxDistance) {
        maxDistance = distance;
        firstIndex = i;
        secondIndex = j;
      }
    }
  }

  const selectedIndexes = [firstIndex, secondIndex];
  const selectedSet = new Set(selectedIndexes);

  while (selectedIndexes.length < targetCount) {
    let bestIndex = -1;
    let bestMinDistance = -1;

    for (let i = 0; i < points.length; i += 1) {
      if (selectedSet.has(i)) continue;

      let minDistance = Number.POSITIVE_INFINITY;
      for (const selectedIndex of selectedIndexes) {
        const distance = haversineKm(
          points[i].lat,
          points[i].lng,
          points[selectedIndex].lat,
          points[selectedIndex].lng
        );
        if (distance < minDistance) {
          minDistance = distance;
        }
      }

      if (minDistance > bestMinDistance) {
        bestMinDistance = minDistance;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) break;

    selectedIndexes.push(bestIndex);
    selectedSet.add(bestIndex);
  }

  return selectedIndexes.map((index) => points[index]);
}

function randomMetroPoint(seed) {
  const center = METRO_CENTERS[seed % METRO_CENTERS.length];
  const radius = 0.5 + ((seed * 37) % 55) / 10;
  const bearing = (seed * 73) % 360;
  const candidate = destinationPoint(center.lat, center.lng, radius, bearing);

  return {
    lat: Number(candidate.lat.toFixed(6)),
    lng: Number(candidate.lng.toFixed(6)),
    hintCity: center.city,
  };
}

async function collectMetroGeocodedPoints() {
  const collected = [];
  const seenAddress = new Set();

  const candidatePoints = buildCandidatePoints();

  for (let i = 0; i < candidatePoints.length; i += 1) {
    const point = candidatePoints[i];
    const result = await reverseGeocode(point.lat, point.lng);

    if (result) {
      const key = normalizeName(result.displayName);
      if (!seenAddress.has(key)) {
        seenAddress.add(key);
        collected.push(result);
      }
    }

    if (collected.length >= TARGET_TOTAL + 16) {
      break;
    }

    await sleep(900);
  }

  let fallbackSeed = 0;
  while (collected.length < TARGET_TOTAL + 16 && fallbackSeed < 500) {
    const point = randomMetroPoint(fallbackSeed);
    fallbackSeed += 1;

    if (!isWithinMetroBounds(point.lat, point.lng)) {
      continue;
    }

    const result = await reverseGeocode(point.lat, point.lng);
    if (!result) {
      await sleep(850);
      continue;
    }

    const key = normalizeName(result.displayName);
    if (seenAddress.has(key)) {
      await sleep(850);
      continue;
    }

    seenAddress.add(key);
    collected.push(result);
    await sleep(850);
  }

  if (collected.length < TARGET_TOTAL) {
    throw new Error(
      `Could not collect enough Metro Manila geocoded points. Needed ${TARGET_TOTAL}, got ${collected.length}.`
    );
  }

  return selectFarSpaced(collected, TARGET_TOTAL);
}

function buildRows(points) {
  const baseDate = new Date("2026-04-20T12:00:00.000Z");

  return points.map((point, index) => {
    const serial = START_INDEX + index;
    const orderedAt = new Date(
      baseDate.getTime() - (index % 30) * 86400000 - (index % 12) * 3600000
    );

    const paymentType = PAYMENT_VALUES[index % PAYMENT_VALUES.length];
    const itemPrice = Number((180 + (index % 17) * 24.75).toFixed(2));
    const deliveryFee = Number((35 + (index % 11) * 4.5).toFixed(2));

    let clusterName = null;
    if (index >= INDIVIDUAL_COUNT) {
      const clusterLocalIndex = index - INDIVIDUAL_COUNT;
      const clusterNumber = Math.floor(clusterLocalIndex / CLUSTER_SIZE) + 1;
      clusterName = `MM-CLUSTER-${String(clusterNumber).padStart(2, "0")}`;
    }

    return {
      idSeed: `geo-mm-acq-${serial}`,
      trackingCode: `RM-MM-GEO-2026-${String(serial).padStart(4, "0")}`,
      recipientName: `MM Geo Recipient ${String(serial).padStart(3, "0")}`,
      address: point.displayName,
      latitude: point.lat,
      longitude: point.lng,
      weightKg: Number((0.8 + (index % 14) * 0.39).toFixed(2)),
      priority: PRIORITY_VALUES[index % PRIORITY_VALUES.length],
      paymentType,
      itemPrice,
      deliveryFee,
      cashOnDeliveryAmount:
        paymentType === "cod" ? Number((itemPrice + deliveryFee).toFixed(2)) : null,
      orderedAt: toIsoNoMs(orderedAt),
      status: "unassigned",
      region: "Metro Manila",
      clusterName,
      parcelCount: clusterName ? 1 : 0,
      createdAt: toIsoNoMs(new Date(orderedAt.getTime() + 20 * 60000)),
    };
  });
}

function buildSql(rows) {
  const valuesSql = rows
    .map((row) => {
      return `(
  pg_temp.seed_uuid(${sqlString(row.idSeed)}),
  NULL,
  ${sqlString(row.trackingCode)},
  ${sqlString(row.recipientName)},
  ${sqlString(row.address)},
  ${row.latitude},
  ${row.longitude},
  ${row.weightKg},
  ${sqlString(row.priority)},
  ${sqlString(row.paymentType)},
  ${row.itemPrice},
  ${row.deliveryFee},
  ${row.cashOnDeliveryAmount == null ? "NULL" : row.cashOnDeliveryAmount},
  ${sqlString(row.orderedAt)},
  ${sqlString(row.status)},
  ${sqlString(row.region)},
  ${row.clusterName ? sqlString(row.clusterName) : "NULL"},
  ${row.parcelCount},
  NULL,
  ${sqlString(row.createdAt)}
)`;
    })
    .join(",\n");

  return `-- =============================================================================
-- ROUTEMATE METRO MANILA GEO-CODED ACQUIRABLE SEED (100 PARCEL_LISTS)
-- =============================================================================
-- Generated via Nominatim reverse geocoding using Metro Manila coordinates.
-- Safe import notes:
-- - Inserts ONLY into public.parcel_lists.
-- - organization_id is NULL for all rows (acquirable pool).
-- - No DELETE/TRUNCATE operations.
-- - Re-runnable via deterministic IDs and ON CONFLICT(id) DO NOTHING.
-- - This is an additional set (serial 101-200).
-- Breakdown:
-- - 50 individual parcels (cluster_name NULL)
-- - 50 clustered parcels (10 clusters x 5 rows)
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.seed_uuid(p_text text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5(p_text), 1, 8) || '-' ||
    substr(md5(p_text), 9, 4) || '-' ||
    substr(md5(p_text), 13, 4) || '-' ||
    substr(md5(p_text), 17, 4) || '-' ||
    substr(md5(p_text), 21, 12)
  )::uuid;
$$;

INSERT INTO public.parcel_lists (
  id,
  organization_id,
  tracking_code,
  recipient_name,
  address,
  latitude,
  longitude,
  weight_kg,
  priority,
  payment_type,
  item_price,
  delivery_fee,
  cash_on_delivery_amount,
  ordered_at,
  status,
  region,
  cluster_name,
  parcel_count,
  acquired_at,
  created_at
)
VALUES
${valuesSql}
ON CONFLICT (id) DO NOTHING;

COMMIT;
`;
}

async function main() {
  console.log("[sql-mm] Collecting Metro Manila geocoded points...");
  const points = await collectMetroGeocodedPoints();
  const rows = buildRows(points);

  const allInBounds = rows.every((row) => isWithinMetroBounds(row.latitude, row.longitude));
  if (!allInBounds) {
    throw new Error("Generated rows include coordinates outside Metro Manila bounds.");
  }

  const sql = buildSql(rows);
  await writeFile(OUTPUT_FILE, sql, "utf8");

  const minLat = Math.min(...rows.map((row) => row.latitude));
  const maxLat = Math.max(...rows.map((row) => row.latitude));
  const minLng = Math.min(...rows.map((row) => row.longitude));
  const maxLng = Math.max(...rows.map((row) => row.longitude));

  console.log(`[sql-mm] Wrote ${rows.length} rows to ${OUTPUT_FILE}`);
  console.log(
    `[sql-mm] Breakdown: ${INDIVIDUAL_COUNT} individual, ${CLUSTERED_COUNT} clustered across ${CLUSTER_COUNT} clusters.`
  );
  console.log(
    `[sql-mm] Latitude range: ${minLat.toFixed(6)} .. ${maxLat.toFixed(6)} | Longitude range: ${minLng.toFixed(6)} .. ${maxLng.toFixed(6)}`
  );
}

main().catch((error) => {
  console.error("[sql-mm] Failed:", error);
  process.exitCode = 1;
});
