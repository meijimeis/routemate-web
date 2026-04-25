import { Rider, ParcelGroup } from "@/app/types/route";
import { haversineDistance } from "./distance";

export function autoAssignRider(
  riders: Rider[],
  parcelGroup: ParcelGroup
): Rider | null {
  let bestRider: Rider | null = null;
  let bestDistance = Infinity;

  for (const rider of riders) {
    // ❌ Capacity constraint
    if (rider.capacityKg < parcelGroup.totalWeightKg) continue;

    // Skip riders without valid coordinates
    if (rider.lat === null || rider.lng === null) continue;

    // Distance from rider to FIRST parcel (SPT seed)
    const firstParcel = parcelGroup.parcels[0];

    const distance = haversineDistance(
      rider.lat,
      rider.lng,
      firstParcel.lat,
      firstParcel.lng
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      bestRider = rider;
    }
  }

  return bestRider;
}
