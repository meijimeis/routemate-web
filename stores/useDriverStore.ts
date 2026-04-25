import { create } from "zustand";


/* ================= TYPES ================= */

export type Driver = {
  id: string;
  name: string;
  vehicle_type: "motorcycle";
  capacity_kg: number;
  status: string;
  organization_id?: string;
};

/* ================= STORE ================= */

type DriverStore = {
  selectedDriver: Driver | null;
  setSelectedDriver: (driver: Driver) => void;
  clearSelectedDriver: () => void;
};

export const useDriverStore = create<DriverStore>((set) => ({
  selectedDriver: null,
  setSelectedDriver: (driver) => set({ selectedDriver: driver }),
  clearSelectedDriver: () => set({ selectedDriver: null }),
}));
