import { Parcel } from "@/app/types/route";

export function getParcelGroupCentroid(parcels: Parcel[]) {
  const lat =
    parcels.reduce((sum, p) => sum + p.lat, 0) / parcels.length;
  const lng =
    parcels.reduce((sum, p) => sum + p.lng, 0) / parcels.length;

  return { lat, lng };
}
