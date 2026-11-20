import type { ShuttleVehicle } from "../../../shared/types";
import { shuttleDepot } from "./config";

export function initialShuttles(): ShuttleVehicle[] {
  return [0, 1].map((i) => {
    const p = { x: shuttleDepot.x + i * 30, y: shuttleDepot.y };
    return {
      id: `SB-0${i + 1}`,
      status: "idle",
      position: p,
      origin: p,
      target: p,
      progress: 0,
      tripDuration: 0,
    };
  });
}
