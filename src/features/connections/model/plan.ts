import type { Flight, TransferBatch } from "../../../shared/types";
import { boardCloseOf } from "./config";

interface PlanRow {
  inbound: string;
  outbound: string;
  count: number;
}

/** 早班转机计划：后续行程通过 inbound/outbound 航班号显式关联 */
const plan: PlanRow[] = [
  { inbound: "MU2451", outbound: "CA1833", count: 22 },
  { inbound: "MU2451", outbound: "HU7602", count: 10 },
  { inbound: "CZ3088", outbound: "CA1833", count: 16 },
  { inbound: "CZ3088", outbound: "MF8219", count: 9 },
  { inbound: "CA1833", outbound: "MF8219", count: 18 },
  { inbound: "HU7602", outbound: "3U8866", count: 14 },
];

export function initialTransferBatches(flights: Flight[]): TransferBatch[] {
  const close = new Map(flights.map((f) => [f.id, boardCloseOf(f)]));
  return plan.map((row, i) => ({
    id: `TB${String(i + 1).padStart(2, "0")}`,
    inboundFlightId: row.inbound,
    outboundFlightId: row.outbound,
    count: row.count,
    stage: "waiting",
    onboardCount: 0,
    missedCount: 0,
    shuttleTripIds: [],
    boardCloseAt: close.get(row.outbound) ?? 0,
    placementRefs: [],
  }));
}
