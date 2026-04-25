import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const OUTPUT_FILE = resolve(
  process.cwd(),
  "DUMMY_DATA_GLOBAL_GEOCODED_ACQUIRABLE_100.sql"
);

const TARGET_TOTAL = 100;
const INDIVIDUAL_COUNT = 50;
const CLUSTERED_COUNT = TARGET_TOTAL - INDIVIDUAL_COUNT;
const CLUSTER_SIZE = 5;
const CLUSTER_COUNT = Math.ceil(CLUSTERED_COUNT / CLUSTER_SIZE);
const MIN_CANDIDATES = 180;

const PH_BOUNDS = {
  minLat: 4.5,
  maxLat: 21.5,
  minLng: 116.8,
  maxLng: 126.8,
};

const PH_VIEWBOX = `${PH_BOUNDS.minLng},${PH_BOUNDS.maxLat},${PH_BOUNDS.maxLng},${PH_BOUNDS.minLat}`;

const PRIORITY_VALUES = ["High", "Medium", "Low"];
const PAYMENT_VALUES = ["cod", "prepaid", "wallet"];

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

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

function sqlString(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function formatTracking(index) {
  return `RM-PH-GEO-2026-${String(index + 1).padStart(4, "0")}`;
}

function formatRecipient(index) {
  return `PH Geo Recipient ${String(index + 1).padStart(3, "0")}`;
}

function formatCluster(index) {
  return `PH-CLUSTER-${String(index).padStart(2, "0")}`;
}

function cleanAddress(displayName) {
  return String(displayName || "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoNoMs(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isInsidePhilippines(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= PH_BOUNDS.minLat &&
    lat <= PH_BOUNDS.maxLat &&
    lng >= PH_BOUNDS.minLng &&
    lng <= PH_BOUNDS.maxLng
  );
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

async function fetchPhLocalities() {
  const [citiesResponse, provincesResponse, regionsResponse] = await Promise.all([
    fetch("https://psgc.gitlab.io/api/cities-municipalities/", {
      headers: { "User-Agent": "Routemate-PH-Geocoded-SQL-Seed/1.0" },
      cache: "no-store",
    }),
    fetch("https://psgc.gitlab.io/api/provinces/", {
      headers: { "User-Agent": "Routemate-PH-Geocoded-SQL-Seed/1.0" },
      cache: "no-store",
    }),
    fetch("https://psgc.gitlab.io/api/regions/", {
      headers: { "User-Agent": "Routemate-PH-Geocoded-SQL-Seed/1.0" },
      cache: "no-store",
    }),
  ]);

  if (!citiesResponse.ok || !provincesResponse.ok || !regionsResponse.ok) {
    throw new Error(
      `Failed PSGC fetch: cities=${citiesResponse.status}, provinces=${provincesResponse.status}, regions=${regionsResponse.status}`
    );
  }

  const [cities, provinces, regions] = await Promise.all([
    citiesResponse.json(),
    provincesResponse.json(),
    regionsResponse.json(),
  ]);

  if (!Array.isArray(cities) || !Array.isArray(provinces) || !Array.isArray(regions)) {
    throw new Error("Unexpected PSGC payload shape.");
  }

  const provinceMap = new Map(
    provinces.map((province) => [String(province?.code || ""), String(province?.name || "").trim()])
  );

  const regionMap = new Map(
    regions.map((region) => [
      String(region?.code || ""),
      String(region?.regionName || region?.name || "").trim(),
    ])
  );

  return cities
    .map((city) => {
      const localityName = String(city?.name || "").trim();
      if (!localityName) return null;

      const provinceName = provinceMap.get(String(city?.provinceCode || "")) || "";
      const regionName = regionMap.get(String(city?.regionCode || "")) || "";

      const queryCandidates = uniqueStrings([
        `${localityName}, ${provinceName}, Philippines`,
        `${localityName}, ${regionName}, Philippines`,
        `${localityName}, Philippines`,
      ]);

      return {
        localityName,
        provinceName,
        regionName,
        islandGroup: String(city?.islandGroupCode || "").trim(),
        queryCandidates,
      };
    })
    .filter((entry) => entry != null)
    .sort((left, right) => {
      const leftKey = `${left.regionName}|${left.provinceName}|${left.localityName}`;
      const rightKey = `${right.regionName}|${right.provinceName}|${right.localityName}`;
      return leftKey.localeCompare(rightKey);
    });
}

async function geocode(query, attempt = 1) {
  const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=ph&bounded=1&viewbox=${encodeURIComponent(
    PH_VIEWBOX
  )}&q=${encodeURIComponent(
    query
  )}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": "Routemate-Geocoded-SQL-Seed/1.0",
        "Accept-Language": "en",
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      if (attempt >= 5) return null;
      await sleep(1500 * attempt);
      return geocode(query, attempt + 1);
    }

    if (!response.ok) {
      if (attempt >= 3) return null;
      await sleep(800 * attempt);
      return geocode(query, attempt + 1);
    }

    const body = await response.json();
    if (!Array.isArray(body) || body.length === 0) return null;

    const row = body[0];
    const lat = Number(row?.lat);
    const lng = Number(row?.lon);

    if (!isInsidePhilippines(lat, lng)) {
      return null;
    }

    return {
      lat,
      lng,
      displayName: cleanAddress(row?.display_name),
      addressData: row?.address || {},
    };
  } catch {
    if (attempt >= 3) return null;
    await sleep(800 * attempt);
    return geocode(query, attempt + 1);
  }
}

async function geocodeLocality(locality) {
  for (const query of locality.queryCandidates) {
    const geocoded = await geocode(query);
    if (geocoded) {
      return {
        ...locality,
        ...geocoded,
      };
    }
  }

  return null;
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

async function buildRows() {
  const localities = await fetchPhLocalities();
  const candidates = [];

  for (let i = 0; i < localities.length; i += 1) {
    const locality = localities[i];
    const geocoded = await geocodeLocality(locality);

    if (geocoded) {
      candidates.push(geocoded);
    }

    if (candidates.length >= MIN_CANDIDATES && i >= MIN_CANDIDATES) {
      break;
    }

    await sleep(1000);
  }

  if (candidates.length < TARGET_TOTAL) {
    throw new Error(
      `Not enough geocoded candidates. Needed ${TARGET_TOTAL}, got ${candidates.length}.`
    );
  }

  const deduped = [];
  const seenCoordKeys = new Set();

  for (const point of candidates) {
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    if (seenCoordKeys.has(key)) continue;
    seenCoordKeys.add(key);
    deduped.push(point);
  }

  if (deduped.length < TARGET_TOTAL) {
    throw new Error(
      `Not enough unique geocoded points after dedupe. Needed ${TARGET_TOTAL}, got ${deduped.length}.`
    );
  }

  const selected = selectFarSpaced(deduped, TARGET_TOTAL);
  if (selected.length < TARGET_TOTAL) {
    throw new Error(
      `Distance selection returned ${selected.length}, expected ${TARGET_TOTAL}.`
    );
  }

  const baseDate = new Date("2026-04-20T12:00:00.000Z");

  return selected.map((point, index) => {
    const orderedAt = new Date(baseDate.getTime() - (index % 30) * 86400000 - (index % 12) * 3600000);

    const paymentType = PAYMENT_VALUES[index % PAYMENT_VALUES.length];
    const itemPrice = Number((180 + (index % 17) * 24.75).toFixed(2));
    const deliveryFee = Number((35 + (index % 11) * 4.5).toFixed(2));

    let clusterName = null;
    if (index >= INDIVIDUAL_COUNT) {
      const clusterLocalIndex = index - INDIVIDUAL_COUNT;
      const clusterNumber = Math.floor(clusterLocalIndex / CLUSTER_SIZE) + 1;
      clusterName = formatCluster(clusterNumber);
    }

    const region =
      String(
        point.regionName ||
          point.provinceName ||
          point?.addressData?.state ||
          point?.addressData?.region ||
          "Philippines"
      ).trim() || "Philippines";

    const resolvedAddress = cleanAddress(point.displayName) ||
      `${point.localityName}, ${point.provinceName || point.regionName || "Philippines"}, Philippines`;

    return {
      idSeed: `geo-ph-acq-${index + 1}`,
      trackingCode: formatTracking(index),
      recipientName: formatRecipient(index),
      address: resolvedAddress,
      latitude: Number(point.lat.toFixed(6)),
      longitude: Number(point.lng.toFixed(6)),
      weightKg: Number((0.8 + (index % 14) * 0.39).toFixed(2)),
      priority: PRIORITY_VALUES[index % PRIORITY_VALUES.length],
      paymentType,
      itemPrice,
      deliveryFee,
      cashOnDeliveryAmount: paymentType === "cod" ? Number((itemPrice + deliveryFee).toFixed(2)) : null,
      orderedAt: toIsoNoMs(orderedAt),
      status: "unassigned",
      region,
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
-- ROUTEMATE PH GEO-CODED ACQUIRABLE SEED (100 PARCEL_LISTS)
-- =============================================================================
-- Generated from PSGC localities + Nominatim geocoding constrained to Philippines.
-- Safe import notes:
-- - Inserts ONLY into public.parcel_lists.
-- - organization_id is NULL for all rows (acquirable pool).
-- - No DELETE/TRUNCATE operations.
-- - Re-runnable via deterministic IDs and ON CONFLICT(id) DO NOTHING.
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
  console.log("[sql-seed] Geocoding Philippines localities...");
  const rows = await buildRows();

  const hasOutOfBoundsRows = rows.some(
    (row) => !isInsidePhilippines(row.latitude, row.longitude)
  );

  if (hasOutOfBoundsRows) {
    throw new Error("Generated rows contain out-of-Philippines coordinates.");
  }

  const minLat = Math.min(...rows.map((row) => row.latitude));
  const maxLat = Math.max(...rows.map((row) => row.latitude));
  const minLng = Math.min(...rows.map((row) => row.longitude));
  const maxLng = Math.max(...rows.map((row) => row.longitude));

  const sql = buildSql(rows);
  await writeFile(OUTPUT_FILE, sql, "utf8");

  console.log(`[sql-seed] Wrote ${rows.length} rows to ${OUTPUT_FILE}`);
  console.log(
    `[sql-seed] Breakdown: ${INDIVIDUAL_COUNT} individual, ${CLUSTERED_COUNT} clustered across ${CLUSTER_COUNT} clusters.`
  );
  console.log(
    `[sql-seed] Latitude range: ${minLat.toFixed(6)} .. ${maxLat.toFixed(6)} | Longitude range: ${minLng.toFixed(6)} .. ${maxLng.toFixed(6)}`
  );
}

main().catch((error) => {
  console.error("[sql-seed] Failed:", error);
  process.exitCode = 1;
});
