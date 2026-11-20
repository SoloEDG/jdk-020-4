import type { Shift } from "../../../shared/types";
import { initialFlights } from "../../flights";
import { initialStands } from "../../apron";
import { initialServices } from "../../services";
import { initialVehicles } from "../../fleet";
import { initialTransferBatches, initialShuttles } from "../../connections";
export function createShift(): Shift {
  const flights = initialFlights();
  const transferBatches = initialTransferBatches(flights);
  return {
    version: 2,
    time: 0,
    paused: false,
    speed: 1,
    score: 0,
    conflicts: 0,
    flights,
    stands: initialStands(),
    services: initialServices(flights),
    vehicles: initialVehicles(),
    transferBatches,
    shuttles: initialShuttles(),
    shuttleTrips: [],
    placements: [],
    events: [
      {
        id: 0,
        time: 0,
        text: `早班开始 · 3 架航班等待机位，${transferBatches.length} 批转机旅客待接续`,
        tone: "info",
      },
    ],
    selectedFlightId: "MU2451",
    nextEventId: 1,
    nextBatchId: transferBatches.length,
    nextTripId: 0,
    nextShuttleId: 2,
    nextPlacementId: 0,
  };
}
