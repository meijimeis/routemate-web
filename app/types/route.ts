export type Rider = {
  id: string;
  name: string;
  vehicle: string;
  capacityKg: number;
  status: "Available" | "Busy" | "Offline";
  lat: number | null;
  lng: number | null;
};

export interface Parcel {
  id: string;
  address: string;
  lat: number;
  lng: number;
  weightKg: number;
}

export interface ParcelGroup {
  id: string;
  parcels: Parcel[];
  totalWeightKg: number;
}

export interface Route {
  rider_id: string;
  stops: string[];
}
