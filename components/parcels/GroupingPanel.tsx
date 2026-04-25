"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Parcel = {
  id: string;
  latitude: number;
  longitude: number;
  weight_kg: number;
};

function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCentroid(group: Parcel[]) {
  const lat =
    group.reduce((sum, p) => sum + p.latitude, 0) / group.length;
  const lon =
    group.reduce((sum, p) => sum + p.longitude, 0) / group.length;

  return { lat, lon };
}

function totalWeight(group: Parcel[]) {
  return group.reduce((sum, p) => sum + p.weight_kg, 0);
}

function clusterSpread(group: Parcel[]) {
  if (group.length <= 1) return 0;
  const center = getCentroid(group);

  return (
    group.reduce(
      (sum, p) =>
        sum + distanceKm(center.lat, center.lon, p.latitude, p.longitude),
      0
    ) / group.length
  );
}

function avgDistanceToGroup(candidate: Parcel, group: Parcel[]) {
  if (group.length === 0) return 0;

  const total = group.reduce((sum, p) => {
    return (
      sum +
      distanceKm(
        candidate.latitude,
        candidate.longitude,
        p.latitude,
        p.longitude
      )
    );
  }, 0);

  return total / group.length;
}

function maxDistanceToGroup(candidate: Parcel, group: Parcel[]) {
  if (group.length === 0) return 0;

  let maxDist = 0;

  for (const p of group) {
    const d = distanceKm(
      candidate.latitude,
      candidate.longitude,
      p.latitude,
      p.longitude
    );
    if (d > maxDist) maxDist = d;
  }

  return maxDist;
}

function clusterDiameter(group: Parcel[]) {
  if (group.length <= 1) return 0;

  let maxDist = 0;

  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const d = distanceKm(
        group[i].latitude,
        group[i].longitude,
        group[j].latitude,
        group[j].longitude
      );

      if (d > maxDist) maxDist = d;
    }
  }

  return maxDist;
}

function avgNearestNeighborDistance(parcels: Parcel[]) {
  if (parcels.length <= 1) return 1;

  let total = 0;

  for (let i = 0; i < parcels.length; i++) {
    let nearest = Infinity;

    for (let j = 0; j < parcels.length; j++) {
      if (i === j) continue;

      const d = distanceKm(
        parcels[i].latitude,
        parcels[i].longitude,
        parcels[j].latitude,
        parcels[j].longitude
      );

      if (d < nearest) nearest = d;
    }

    total += nearest;
  }

  return total / parcels.length;
}

export default function ParcelGroupingPanel() {
  const [loading, setLoading] = useState(false);

  // nullable inputs
  const [maxWeight, setMaxWeight] = useState<number | "">(50);
  const [minWeight, setMinWeight] = useState<number | "">("");
  const [maxParcels, setMaxParcels] = useState<number | "">("");
  const [minParcels, setMinParcels] = useState<number | "">("");
  const [maxRadius, setMaxRadius] = useState<number | "">("");

  async function fetchUngrouped(): Promise<Parcel[]> {
    const { data, error } = await supabase
      .from("parcel_lists")
      .select("id, latitude, longitude, weight_kg")
      .eq("status", "unassigned");

    if (error) {
      console.error("FETCH UNGROUPED ERROR:", error);
      return [];
    }

    return data || [];
  }

  function generateGroups(parcels: Parcel[]): Parcel[][] {
    const remaining = [...parcels];
    const groups: Parcel[][] = [];

    if (remaining.length === 0) return groups;

    // Adaptive compactness baseline:
    // if maxRadius is blank, we still keep clusters geographically tight
    const baseNeighborDistance = avgNearestNeighborDistance(remaining);

    // Tunable internal limits when maxRadius is blank
    const adaptiveMaxCandidateToGroup =
      maxRadius !== "" ? maxRadius * 2 : Math.max(2.5, baseNeighborDistance * 3);

    const adaptiveMaxDiameter =
      maxRadius !== "" ? maxRadius * 2 : Math.max(4, baseNeighborDistance * 4);

    // Sort heavier first so capacity is packed earlier
    remaining.sort((a, b) => b.weight_kg - a.weight_kg);

    while (remaining.length > 0) {
      const seed = remaining.shift()!;
      const group: Parcel[] = [seed];

      let improved = true;

      while (improved) {
        improved = false;
        let bestIndex = -1;
        let bestScore = Infinity;

        const currentWeight = totalWeight(group);
        const centroid = getCentroid(group);
        const currentSpread = clusterSpread(group);
        const currentDiameter = clusterDiameter(group);

        for (let i = 0; i < remaining.length; i++) {
          const candidate = remaining[i];

          // Hard constraint: max weight
          if (
            maxWeight !== "" &&
            currentWeight + candidate.weight_kg > maxWeight
          ) {
            continue;
          }

          // Optional hard constraint: max parcels
          if (maxParcels !== "" && group.length + 1 > maxParcels) {
            continue;
          }

          const distToCentroid = distanceKm(
            centroid.lat,
            centroid.lon,
            candidate.latitude,
            candidate.longitude
          );

          const avgDist = avgDistanceToGroup(candidate, group);
          const farthestToGroup = maxDistanceToGroup(candidate, group);

          const trialGroup = [...group, candidate];
          const newSpread = clusterSpread(trialGroup);
          const newDiameter = clusterDiameter(trialGroup);

          // If user supplies radius, keep centroid rule as hard check
          if (maxRadius !== "" && distToCentroid > maxRadius) {
            continue;
          }

          // Internal compactness safeguard, even when radius is blank
          if (farthestToGroup > adaptiveMaxCandidateToGroup) {
            continue;
          }

          if (newDiameter > adaptiveMaxDiameter) {
            continue;
          }

          // Score: lower is better
          // More emphasis on compactness than before
          const spreadPenalty = Math.max(0, newSpread - currentSpread);
          const diameterPenalty = Math.max(0, newDiameter - currentDiameter);
          const capacityPenalty =
            maxWeight !== ""
              ? (currentWeight + candidate.weight_kg) / maxWeight
              : 0;

          const score =
            0.20 * distToCentroid +
            0.25 * avgDist +
            0.25 * farthestToGroup +
            0.20 * diameterPenalty +
            0.10 * capacityPenalty +
            0.10 * spreadPenalty;

          if (score < bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }

        if (bestIndex !== -1) {
          group.push(remaining[bestIndex]);
          remaining.splice(bestIndex, 1);
          improved = true;
        }
      }

      groups.push(group);
    }

    return postProcessGroups(groups, adaptiveMaxDiameter);
  }

  function postProcessGroups(
    groups: Parcel[][],
    adaptiveMaxDiameter: number
  ): Parcel[][] {
    const finalGroups = [...groups];

    for (let i = finalGroups.length - 1; i >= 0; i--) {
      const g = finalGroups[i];
      const gWeight = totalWeight(g);

      const belowMinWeight = minWeight !== "" && gWeight < minWeight;
      const belowMinParcels = minParcels !== "" && g.length < minParcels;

      if (!belowMinWeight && !belowMinParcels) continue;

      let bestTarget = -1;
      let bestScore = Infinity;
      const gCentroid = getCentroid(g);

      for (let j = 0; j < finalGroups.length; j++) {
        if (i === j) continue;

        const target = finalGroups[j];
        const targetWeight = totalWeight(target);

        if (maxWeight !== "" && targetWeight + gWeight > maxWeight) continue;
        if (maxParcels !== "" && target.length + g.length > maxParcels) continue;

        const tCentroid = getCentroid(target);
        const centroidDistance = distanceKm(
          gCentroid.lat,
          gCentroid.lon,
          tCentroid.lat,
          tCentroid.lon
        );

        const mergedGroup = [...target, ...g];
        const mergedDiameter = clusterDiameter(mergedGroup);
        const mergedSpread = clusterSpread(mergedGroup);

        // Protect against bad post-merge geography
        const allowedDiameter =
          maxRadius !== "" ? maxRadius * 2 : adaptiveMaxDiameter * 1.15;

        if (mergedDiameter > allowedDiameter) continue;

        const mergeScore = 0.55 * centroidDistance + 0.45 * mergedSpread;

        if (mergeScore < bestScore) {
          bestScore = mergeScore;
          bestTarget = j;
        }
      }

      if (bestTarget !== -1) {
        finalGroups[bestTarget] = [...finalGroups[bestTarget], ...g];
        finalGroups.splice(i, 1);
      }
    }

    return finalGroups;
  }

  async function saveGroups(groups: Parcel[][]) {
    const date = new Date();
    const ymd =
      date.getFullYear().toString().slice(2) +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0");

    for (let i = 0; i < groups.length; i++) {
      const clusterId = `C-${ymd}-${String(i + 1).padStart(3, "0")}`;
      const ids = groups[i].map((p) => p.id);

      const { error } = await supabase
        .from("parcel_lists")
        .update({
          status: "pending",
          cluster_name: clusterId,
        })
        .in("id", ids);

      if (error) {
        console.error("SAVE GROUP ERROR:", error);
      } else {
        console.log("SAVED CLUSTER:", clusterId, ids);
      }
    }
  }

  async function handleAutoGroup() {
    setLoading(true);

    try {
      const parcels = await fetchUngrouped();

      if (parcels.length === 0) {
        console.warn("No unassigned parcels found");
        return;
      }

      const groups = generateGroups(parcels);
      console.log("GENERATED GROUPS:", groups);

      if (groups.length === 0) {
        console.warn("No clusters generated");
        return;
      }

      await saveGroups(groups);
    } catch (err) {
      console.error("AUTO GROUP ERROR:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-md space-y-4">
      <h3 className="font-semibold text-gray-900">Parcel Grouping Settings</h3>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="text-black">
          Max Weight (kg)
          <input
            type="number"
            min={1}
            value={maxWeight}
            onChange={(e) =>
              setMaxWeight(e.target.value === "" ? "" : +e.target.value)
            }
            className="w-full border rounded-md px-2 py-1"
          />
        </label>

        <label className="text-black">
          Min Weight (kg)
          <input
            type="number"
            min={0}
            value={minWeight}
            onChange={(e) =>
              setMinWeight(e.target.value === "" ? "" : +e.target.value)
            }
            className="w-full border rounded-md px-2 py-1"
          />
        </label>

        <label className="text-black">
          Max Parcels
          <input
            type="number"
            min={1}
            value={maxParcels}
            onChange={(e) =>
              setMaxParcels(e.target.value === "" ? "" : +e.target.value)
            }
            className="w-full border rounded-md px-2 py-1"
            placeholder="Optional"
          />
        </label>

        <label className="text-black">
          Min Parcels
          <input
            type="number"
            min={0}
            value={minParcels}
            onChange={(e) =>
              setMinParcels(e.target.value === "" ? "" : +e.target.value)
            }
            className="w-full border rounded-md px-2 py-1"
          />
        </label>

        <label className="col-span-2 text-black">
          Max Distance Radius (km)
          <input
            type="number"
            min={0}
            step="0.5"
            value={maxRadius}
            onChange={(e) =>
              setMaxRadius(e.target.value === "" ? "" : +e.target.value)
            }
            className="w-full border rounded-md px-2 py-1"
            placeholder="Optional"
          />
        </label>
      </div>

      <button
        onClick={handleAutoGroup}
        disabled={loading}
        className="w-full bg-purple-600 text-white rounded-lg py-2 text-sm disabled:opacity-50"
      >
        {loading ? "Grouping..." : "Auto Group Parcels"}
      </button>
    </div>
  );
}