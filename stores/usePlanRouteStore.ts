import { create } from "zustand";

/* ================= TYPES ================= */

export type Rider = {
  id: string;
  name: string;
  capacity_kg: number;
  lat: number | null;
  lng: number | null;
  location_updated_at?: string | null;
};

export type Parcel = {
  id: string;
  address: string;
  weight_kg: number;
  lat: number;
  lng: number;
};

/* ================= STORE ================= */

type PlanRouteState = {
  selectedClusterName: string | null;
  selectedRider: Rider | null;
  assignedParcels: Parcel[];

  setSelectedClusterName: (name: string | null) => void;
  setSelectedRider: (rider: Rider | null) => void;
  setAssignedParcels: (parcels: Parcel[]) => void;
  clearAssignment: () => void;
};

export const usePlanRouteStore = create<PlanRouteState>((set) => ({
  selectedClusterName: null,
  selectedRider: null,
  assignedParcels: [],

  setSelectedClusterName: (name) =>
    set({ selectedClusterName: name, assignedParcels: [] }),

  setSelectedRider: (rider) =>
    set((state) => {
      const currentRiderId = state.selectedRider?.id || null;
      const nextRiderId = rider?.id || null;

      if (currentRiderId === nextRiderId) {
        return { selectedRider: rider };
      }

      return { selectedRider: rider, assignedParcels: [] };
    }),

  setAssignedParcels: (parcels) =>
    set({ assignedParcels: parcels }),

  clearAssignment: () =>
    set({ selectedRider: null, assignedParcels: [], selectedClusterName: null }),
}));
