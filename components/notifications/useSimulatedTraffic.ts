import { useEffect, useState } from "react";
import { TrafficLevel } from "./types";

const LEVELS: TrafficLevel[] = [
  "LOW",
  "MODERATE",
  "HEAVY",
  "SEVERE",
];

export function useSimulatedTraffic() {
  const [trafficLevel, setTrafficLevel] =
    useState<TrafficLevel>("MODERATE");

  useEffect(() => {
    const interval = setInterval(() => {
      const random =
        LEVELS[Math.floor(Math.random() * LEVELS.length)];
      setTrafficLevel(random);
    }, 5000); // every 5s

    return () => clearInterval(interval);
  }, []);

  return trafficLevel;
}
