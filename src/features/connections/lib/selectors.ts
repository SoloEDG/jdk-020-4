import type {
  Flight,
  Placement,
  Shift,
  ShuttleVehicle,
  Stand,
  TransferBatch,
} from "../../../shared/types";
import { SHUTTLE_FIXED, SHUTTLE_SPEED } from "../model/config";

export function standOf(state: Shift, flightId: string): Stand | undefined {
  const f = state.flights.find((x) => x.id === flightId);
  if (!f?.standId) return undefined;
  return state.stands.find((s) => s.id === f.standId);
}

/** 远机位需要摆渡运输；廊桥机位的接续旅客可步行至登机口 */
export function needsShuttle(
  state: Shift,
  inboundFlightId: string,
  outboundFlightId: string,
): boolean {
  const a = standOf(state, inboundFlightId);
  const b = standOf(state, outboundFlightId);
  if (!a || !b) return false;
  return a.terminal === "远机位" || b.terminal === "远机位";
}

export function tripSeconds(state: Shift, outboundFlightId: string): number {
  const target = standOf(state, outboundFlightId);
  if (!target) return SHUTTLE_FIXED;
  // 从摆渡车场发车后的单程耗时（含固定发车开销）
  return (
    SHUTTLE_FIXED +
    Math.hypot(target.x - 808, target.y - 560) / SHUTTLE_SPEED
  );
}

export function batchesForOutbound(
  state: Shift,
  outboundFlightId: string,
): TransferBatch[] {
  return state.transferBatches.filter(
    (b) => b.outboundFlightId === outboundFlightId,
  );
}

export function batchesForInbound(
  state: Shift,
  inboundFlightId: string,
): TransferBatch[] {
  return state.transferBatches.filter(
    (b) => b.inboundFlightId === inboundFlightId,
  );
}

export interface BatchBreakdown {
  /** 仍在等待处置（未上车、未步行） */
  waiting: number;
  /** 运输或步行途中 */
  inTransit: number;
  /** 已成功登机 */
  onboard: number;
  /** 已确认误机 */
  missed: number;
  total: number;
}

export function breakdownOf(
  state: Shift,
  outboundFlightId: string,
): BatchBreakdown {
  const rows = batchesForOutbound(state, outboundFlightId);
  return {
    waiting: rows
      .filter((b) => b.stage === "waiting")
      .reduce((n, b) => n + (b.count - b.onboardCount - b.missedCount), 0),
    inTransit: rows
      .filter((b) => b.stage === "shuttling" || b.stage === "walk")
      .reduce((n, b) => n + (b.count - b.onboardCount - b.missedCount), 0),
    onboard: rows.reduce((n, b) => n + b.onboardCount, 0),
    missed: rows.reduce((n, b) => n + b.missedCount, 0),
    total: rows.reduce((n, b) => n + b.count, 0),
  };
}

export function idleShuttle(state: Shift): ShuttleVehicle | undefined {
  return state.shuttles.find((v) => v.status === "idle");
}

/** 批次尚未闭环（仍可能有人赶上或需要处置） */
export function batchOpen(b: TransferBatch): boolean {
  return b.stage !== "boarded" && b.stage !== "missed";
}

/** 与某航班相关且未闭环的转机批次（作为前序或后续） */
export function openBatchesForFlight(
  state: Shift,
  flightId: string,
): TransferBatch[] {
  return state.transferBatches.filter(
    (b) =>
      batchOpen(b) &&
      (b.inboundFlightId === flightId || b.outboundFlightId === flightId),
  );
}

export function placementsForBatch(
  state: Shift,
  batchId: string,
): Placement[] {
  return state.placements.filter((p) => p.batchId === batchId);
}

/**
 * 延后推出会占用该机位，影响后续要接机的进港航班。
 * 返回预计在机位释放前到港、将被顺延的航班（按到达时间排序）。
 */
export function affectedIncomingFlights(
  state: Shift,
  releaseAt: number,
): Array<{ flight: Flight; extraWait: number }> {
  return state.flights
    .filter(
      (f) =>
        f.status === "scheduled" ||
        (f.status === "incoming" && f.standId === undefined),
    )
    .filter((f) => f.arrival < releaseAt)
    .sort((a, b) => a.arrival - b.arrival)
    .map((flight) => ({
      flight,
      extraWait: Math.max(0, Math.round(releaseAt - flight.arrival)),
    }));
}

export const placementLabels: Record<Placement["kind"], string> = {
  rebook: "改签后续航班",
  hotel: "安排酒店住宿",
  voucher: "退票凭证",
};
