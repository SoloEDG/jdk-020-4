import type { Placement, Shift, TransferBatch } from "../../../shared/types";
import { MISSED_PENALTY_PER_PAX, placementCycleNote } from "./config";

/**
 * 为误机旅客生成可追踪的安置结果。
 * 同一次闭环生成一张安置单，编号 RT-xxxx 可在台账中逐批核对。
 */
export function createPlacement(
  state: Shift,
  batch: TransferBatch,
  count: number,
): Placement {
  const seq = state.nextPlacementId;
  const kind = (["rebook", "hotel", "voucher"] as const)[seq % 3];
  const placement: Placement = {
    id: `PL${seq}`,
    code: `RT-${String(seq + 1).padStart(4, "0")}`,
    batchId: batch.id,
    inboundFlightId: batch.inboundFlightId,
    outboundFlightId: batch.outboundFlightId,
    kind,
    count,
    note: placementCycleNote(kind),
    createdAt: state.time,
  };
  state.nextPlacementId += 1;
  state.placements.unshift(placement);
  state.placements = state.placements.slice(0, 60);
  state.score -= MISSED_PENALTY_PER_PAX * count;
  return placement;
}
