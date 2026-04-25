export type SimulatedRider = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  speed: number; // meters per tick
};

export const SIMULATED_RIDERS: SimulatedRider[] = [
  {
    id: "r1",
    name: "Driver B",
    lat: 14.5547,
    lng: 121.0244, // Makati
    speed: 0.00025,
  },
  {
    id: "r2",
    name: "Driver A",
    lat: 14.5794,
    lng: 121.0369, // Mandaluyong
    speed: 0.0002,
  },
];
