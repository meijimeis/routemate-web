export type Geofence = {
  id: string;
  name: string;
  coordinates: [number, number][];
};

export const GEOFENCES: Geofence[] = [
  {
    id: "makati",
    name: "Makati",
    coordinates: [
      [121.010, 14.540],
      [121.070, 14.540],
      [121.070, 14.590],
      [121.010, 14.590],
      [121.010, 14.540],
    ],
  },
  {
    id: "mandaluyong",
    name: "Mandaluyong",
    coordinates: [
      [121.020, 14.560],
      [121.080, 14.560],
      [121.080, 14.620],
      [121.020, 14.620],
      [121.020, 14.560],
    ],
  },
];
