import type { Shift, ShuttleLoad, TransferBatch } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import {
  EXPRESS_CAPACITY,
  EXPRESS_MIN_LOAD,
  SHUTTLE_CAPACITY,
  TRIP_COST_EXPRESS,
  TRIP_COST_SCHEDULED,
  WAIT_LIMIT,
  readyAt,
} from "./config";
import {
  batchOpen,
  idleShuttle,
  needsShuttle,
  standOf,
} from "../lib/selectors";
import { newTripDraft } from "./engine";
import { createPlacement } from "./placements";

function batchOf(s: Shift, batchId: string): TransferBatch | undefined {
  return s.transferBatches.find((b) => b.id === batchId);
}

function openCount(b: TransferBatch): number {
  return b.count - b.onboardCount - b.missedCount;
}

/** 已被在途摆渡班次快照锁定、尚未抵达结算的座位（不能再被重复派车） */
function lockedSeats(s: Shift, batchId: string): number {
  return s.shuttleTrips
    .filter((t) => t.status === "travel")
    .reduce(
      (n, t) =>
        n +
        t.loads
          .filter((l) => l.batchId === batchId)
          .reduce((m, l) => m + l.count, 0),
      0,
    );
}

/** 真正还可被新班次运走的人数 */
function dispatchable(s: Shift, b: TransferBatch): number {
  return openCount(b) - lockedSeats(s, b.id);
}

/** 为一批旅客申请有限等待：等待不超过 WAIT_LIMIT，且不晚于登机截止 */
export function requestWait(state: Shift, batchId: string): Shift {
  const s = copyShift(state);
  const b = batchOf(s, batchId);
  if (!b) return state;
  if (!batchOpen(b) || b.stage !== "waiting") {
    s.conflicts++;
    s.score -= 10;
    record(s, `${b.id} 已进入运输或已闭环，无法再申请等待`, "warning");
    return s;
  }
  const inbound = s.flights.find((f) => f.id === b.inboundFlightId);
  if (!inbound || inbound.parkedAt === undefined) {
    s.conflicts++;
    s.score -= 10;
    record(s, `${b.id} 前序航班尚未靠桥，等待指令暂不生效`, "warning");
    return s;
  }
  const until = Math.min(s.time + WAIT_LIMIT, b.boardCloseAt);
  if (until <= s.time) {
    s.conflicts++;
    s.score -= 10;
    record(s, `${b.id} 已接近登机截止，等待窗口关闭`, "warning");
    return s;
  }
  b.waitUntil = until;
  record(s, `${b.id} 申请有限等待至 ${Math.round(until)}s，到期未运输将按误机处置`);
  return s;
}

/**
 * 撤回等待 / 放弃等待。
 * 关键约束：已经上车（在途班次快照）和已经登机的人不受影响，
 * 只处置仍在等待的剩余旅客，人数不会消失也不会被计算两次。
 */
export function cancelWait(state: Shift, batchId: string): Shift {
  const s = copyShift(state);
  const b = batchOf(s, batchId);
  if (!b || !batchOpen(b)) {
    s.conflicts++;
    s.score -= 10;
    record(s, "该批次已闭环，无需撤回等待", "warning");
    return s;
  }
  if (b.stage === "shuttling" && dispatchable(s, b) === 0) {
    s.conflicts++;
    s.score -= 10;
    record(s, `${b.id} 剩余旅客已全部登车，等待决定无法撤回`, "warning");
    return s;
  }
  b.waitUntil = undefined;
  // 只处置既未登机、也未被在途班次锁定的人
  const remaining =
    b.stage === "waiting"
      ? openCount(b)
      : Math.max(0, openCount(b) - lockedSeats(s, b.id));
  if (remaining > 0) {
    // 放弃等待：未运输的人立即转为误机并生成安置
    const placement = createPlacement(s, b, remaining);
    b.placementRefs.push(placement.code);
    b.missedCount += remaining;
    if (openCount(b) === 0) {
      b.stage = b.onboardCount > 0 ? "boarded" : "missed";
    }
    record(
      s,
      `${b.id} 放弃等待，${remaining} 人误机，安置单 ${placement.code}；已登车/已登机者不受影响`,
      "warning",
    );
  } else {
    record(s, `${b.id} 等待已撤回，已登车/已登机旅客照常运输`, "info");
  }
  return s;
}

interface DispatchCheck {
  s: Shift;
  batches: TransferBatch[];
  mode: "scheduled" | "express";
}

function prepareDispatch(
  state: Shift,
  outboundFlightId: string,
  mode: "scheduled" | "express",
): DispatchCheck | { error: string } {
  const s = copyShift(state);
  const outbound = s.flights.find((f) => f.id === outboundFlightId);
  if (!outbound) return { error: "续飞航班不存在" };
  if (!standOf(s, outboundFlightId)) return { error: "续飞航班尚未停靠机位" };
  const shuttle = idleShuttle(s);
  if (!shuttle) return { error: "摆渡车全部在途，请等待回场" };

  // waiting 与 shuttling（首批已发车、仍有余客待续趟）都允许继续派车；
  // 必须前序与续飞都已靠机位，运输路径才成立
  const candidates = s.transferBatches.filter(
    (b) =>
      b.outboundFlightId === outboundFlightId &&
      (b.stage === "waiting" || b.stage === "shuttling") &&
      dispatchable(s, b) > 0 &&
      standOf(s, b.inboundFlightId) !== undefined &&
      standOf(s, b.outboundFlightId) !== undefined &&
      needsShuttle(s, b.inboundFlightId, b.outboundFlightId),
  );
  if (candidates.length === 0) return { error: "当前没有等待摆渡的转机批次" };
  for (const b of candidates) {
    const inbound = s.flights.find((f) => f.id === b.inboundFlightId);
    if (!inbound || inbound.parkedAt === undefined)
      return { error: `${b.id} 前序航班尚未靠桥，旅客无法登车` };
    if (s.time < readyAt(b, inbound))
      return { error: `${b.id} 旅客仍在下客/转机安检中` };
  }
  const total = candidates.reduce((n, b) => n + dispatchable(s, b), 0);
  if (mode === "express" && total < EXPRESS_MIN_LOAD)
    return {
      error: `集中发车需凑满 ${EXPRESS_MIN_LOAD} 人（当前 ${total} 人）`,
    };
  if (total === 0) return { error: "批次已无待运输旅客" };
  return { s, batches: candidates, mode };
}

/**
 * 派遣摆渡班次。
 * scheduled = 小批多趟：按普通容量逐批装客，一批装不下会拆成多趟；
 * express = 集中发车：需凑满门槛，一趟大容量运走。
 */
export function dispatchShuttle(
  state: Shift,
  outboundFlightId: string,
  mode: "scheduled" | "express",
): Shift {
  const check = prepareDispatch(state, outboundFlightId, mode);
  if ("error" in check) {
    const s = copyShift(state);
    s.conflicts++;
    s.score -= 10;
    record(s, `摆渡派遣被拒：${check.error}`, "warning");
    return s;
  }
  const { s, batches, mode: m } = check;
  const capacity = m === "express" ? EXPRESS_CAPACITY : SHUTTLE_CAPACITY;

  let seats = capacity;
  const loads: ShuttleLoad[] = [];
  for (const b of batches) {
    const before = dispatchable(s, b);
    let remaining = before;
    while (remaining > 0 && seats > 0) {
      const take = Math.min(remaining, seats);
      loads.push({ batchId: b.id, count: take });
      remaining -= take;
      seats -= take;
    }
    if (before - remaining > 0) b.stage = "shuttling";
  }
  if (loads.length === 0) return state;

  const shuttle = idleShuttle(s)!;
  const trip = newTripDraft(s, shuttle, outboundFlightId, m, loads);
  s.shuttleTrips.unshift(trip);
  for (const load of loads) {
    const b = batchOf(s, load.batchId)!;
    if (!b.shuttleTripIds.includes(trip.id)) b.shuttleTripIds.push(trip.id);
    b.waitUntil = undefined; // 登车后等待决定不再适用
  }
  s.score -= m === "express" ? TRIP_COST_EXPRESS : TRIP_COST_SCHEDULED;
  const riders = loads.reduce((n, l) => n + l.count, 0);
  record(
    s,
    `${trip.id} ${m === "express" ? "集中快车" : "普通摆渡"}发车 → ${outboundFlightId}，载客 ${riders} 人`,
  );
  return s;
}
