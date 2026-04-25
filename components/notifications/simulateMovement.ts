import { SimulatedRider } from "./simulateRider";

export function moveRider(rider: SimulatedRider): SimulatedRider {
  return {
    ...rider,
    // simple eastward movement
    lng: rider.lng + rider.speed,
  };
}
