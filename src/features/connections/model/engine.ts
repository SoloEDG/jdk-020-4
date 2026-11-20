import type {
  Flight,
  PlacementKind,
  Shift,
  ShuttleLoad,
  ShuttleTrip,
  ShuttleVehicle,
  TransferBatch,
} from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import {
  BOARD_BONUS_PER_PAX,
  WALK_TIME,
  boardCloseOf,
  boardOpenOf,
  readyAt,
  shuttleDepot,
} from "./config";
import { needsShuttle, standOf } from "../lib/selectors";
import { createPlacement } from "./placements";

function flightOf(state: Shift, id: string): Flight | undefined {
  return state.flights.find((f) => f.id === id);
}

function openCount(b: TransferBatch): number {
  return b.count - b.onboardCount - b.missedCount;
}

function closeBatch(
  s: Shift,
  b: TransferBatch,
  missedNow: number,
): void {
  if (missedNow > 0) {
    const placement = createPlacement(s, b, missedNow);
    b.placementRefs.push(placement.code);
    b.missedCount += missedNow;
    const kindText: Record<PlacementKind, string> = {
      rebook: "改签",
      hotel: "酒店",
      voucher: "退票",
    };
    record(
      s,
      `${b.id} · ${b.inboundFlightId}→${b.outboundFlightId} ${missedNow} 人误机，安置单 ${placement.code}（${kindText[placement.kind]}）`,
      "warning",
    );
  }
  b.stage = b.missedCount > 0 && b.onboardCount === 0 ? "missed" : "boarded";
  b.waitUntil = undefined;
}

/** 摆渡车在途推进；抵达后按登车快照逐批处理登机或误机 */
function advanceTrips(s: Shift, dt: number): void {
  for (const shuttle of s.shuttles) {
    if (shuttle.status !== "travel" || shuttle.tripId === undefined) continue;
    const trip = s.shuttleTrips.find((t) => t.id === shuttle.tripId);
    if (!trip || trip.status !== "travel") continue;
    trip.progress = Math.min(
      100,
      trip.progress + (dt / trip.tripDuration) * 100,
    );
    trip.position = {
      x: trip.origin.x + (trip.target.x - trip.origin.x) * (trip.progress / 100),
      y: trip.origin.y + (trip.target.y - trip.origin.y) * (trip.progress / 100),
    };
    shuttle.position = { ...trip.position };
    shuttle.progress = trip.progress;
    if (trip.progress < 100) continue;

    trip.status = "done";
    trip.arrivedAt = s.time;
    shuttle.status = "idle";
    shuttle.tripId = undefined;
    shuttle.origin = { ...trip.target };
    shuttle.target = { ...trip.target };

    const closeAt = boardCloseOf(flightOf(s, trip.outboundFlightId)!);
    let boarded = 0;
    let missed = 0;
    for (const load of trip.loads) {
      const b = s.transferBatches.find((x) => x.id === load.batchId);
      if (!b) continue;
      if (s.time <= closeAt) {
        b.onboardCount += load.count;
        b.gateArriveAt = s.time;
        boarded += load.count;
      } else {
        const p = createPlacement(s, b, load.count);
        b.placementRefs.push(p.code);
        b.missedCount += load.count;
        missed += load.count;
      }
      b.shuttleTripIds = b.shuttleTripIds.filter((id) => id !== trip.id);
      if (openCount(b) === 0) closeBatch(s, b, 0);
    }
    if (boarded > 0) {
      s.score += BOARD_BONUS_PER_PAX * boarded;
      record(
        s,
        `${trip.id} 摆渡抵达 ${trip.outboundFlightId}，${boarded} 人完成登机`,
        "success",
      );
    }
    if (missed > 0) {
      record(
        s,
        `${trip.id} 摆渡晚于登机截止，${missed} 人未能登机`,
        "warning",
      );
    }
  }
}

/**
 * 等待中的批次：下客 + 安检完成后，廊桥接续自动步行；
 * 远机位等待摆渡车派遣；等待到期或登机截止仍未运输则按误机闭环。
 */
function advanceWaiting(s: Shift): void {
  for (const b of s.transferBatches) {
    if (b.stage !== "waiting") continue;
    const inbound = flightOf(s, b.inboundFlightId);
    const outbound = flightOf(s, b.outboundFlightId);
    if (!inbound || !outbound) continue;
    const remaining = openCount(b);
    if (remaining <= 0) {
      closeBatch(s, b, 0);
      continue;
    }

    // 有限等待到期：放弃接续，未运输的人全部误机
    if (b.waitUntil !== undefined && s.time >= b.waitUntil) {
      closeBatch(s, b, remaining);
      continue;
    }
    // 登机截止：等待中的人已无运输可能
    if (s.time >= b.boardCloseAt) {
      closeBatch(s, b, remaining);
      continue;
    }
    if (inbound.status === "scheduled" || inbound.status === "incoming") {
      continue; // 前序尚未靠桥，下客安检无从开始
    }
    const ready = readyAt(b, inbound);
    if (s.time < ready) continue;

    if (!needsShuttle(s, b.inboundFlightId, b.outboundFlightId)) {
      // 廊桥接续：安检后步行至登机口
      b.stage = "walk";
      b.gateArriveAt = ready + WALK_TIME;
      record(s, `${b.id} 安检完成，${remaining} 人步行前往 ${b.outboundFlightId} 登机口`);
    }
  }
}

/** 步行中的批次：抵达登机口后按登机开放/截止结算 */
function advanceWalks(s: Shift): void {
  for (const b of s.transferBatches) {
    if (b.stage !== "walk" || b.gateArriveAt === undefined) continue;
    const remaining = openCount(b);
    const outbound = flightOf(s, b.outboundFlightId);
    if (!outbound) continue;
    const openAt = boardOpenOf(outbound);
    if (s.time < Math.max(b.gateArriveAt, openAt)) continue;
    if (s.time <= b.boardCloseAt) {
      b.onboardCount += remaining;
      s.score += BOARD_BONUS_PER_PAX * remaining;
      record(
        s,
        `${b.id} ${remaining} 人步行抵达并完成 ${b.outboundFlightId} 登机`,
        "success",
      );
      closeBatch(s, b, 0);
    } else {
      closeBatch(s, b, remaining);
    }
  }
}

/** 兜底扫描：任何未闭环批次在截止后必须形成确定去向 */
function advanceCloseSweep(s: Shift): void {
  for (const b of s.transferBatches) {
    if (b.stage === "boarded" || b.stage === "missed") continue;
    if (b.stage === "shuttling") continue; // 在途由班次抵达事件结算
    if (s.time < b.boardCloseAt) continue;
    closeBatch(s, b, openCount(b));
  }
}

/**
 * 转机旅客推进。dt 由时钟节拍透传，摆渡车按真实路程移动，
 * 赶上与否由"靠桥→下客→安检→运输/步行→登机截止"共同决定。
 */
export function advanceTransfers(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  advanceTrips(s, seconds);
  advanceWaiting(s);
  advanceWalks(s);
  advanceCloseSweep(s);
  return s;
}

/** 供命令层复用：取远机位的摆渡目标坐标 */
export function shuttleTargetPoint(
  state: Shift,
  outboundFlightId: string,
): { x: number; y: number } {
  const stand = standOf(state, outboundFlightId);
  return stand ? { x: stand.x + 34, y: stand.y + 30 } : { ...shuttleDepot };
}

export function newTripDraft(
  s: Shift,
  shuttle: ShuttleVehicle,
  outboundFlightId: string,
  mode: ShuttleTrip["mode"],
  loads: ShuttleLoad[],
): ShuttleTrip {
  const target = shuttleTargetPoint(s, outboundFlightId);
  const duration =
    4 + Math.hypot(target.x - shuttleDepot.x, target.y - shuttleDepot.y) / 50;
  const id = `ST${String(s.nextTripId + 1).padStart(2, "0")}`;
  s.nextTripId += 1;
  const trip: ShuttleTrip = {
    id,
    shuttleId: shuttle.id,
    mode,
    inboundFlightId: loads[0]
      ? s.transferBatches.find((b) => b.id === loads[0].batchId)!.inboundFlightId
      : "",
    outboundFlightId,
    status: "travel",
    origin: { ...shuttle.position },
    target,
    position: { ...shuttle.position },
    progress: 0,
    tripDuration: duration,
    dispatchedAt: s.time,
    loads,
  };
  shuttle.status = "travel";
  shuttle.tripId = id;
  shuttle.origin = { ...trip.origin };
  shuttle.target = target;
  shuttle.progress = 0;
  shuttle.tripDuration = duration;
  return trip;
}
