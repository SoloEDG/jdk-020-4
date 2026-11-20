import type { Flight, Shift } from "../../../shared/types";
import { openBatchesForFlight } from "../../connections";
export function flightReady(state: Shift, id: string): boolean {
  return departureBlockReason(state, id) === undefined;
}

/** 离港许可：地勤三项全部完成，且与该机相关的转机批次已全部形成确定去向 */
export function departureBlockReason(state: Shift, id: string): string | undefined {
  const tasks = state.services.filter((t) => t.flightId === id);
  if (!(tasks.length === 3 && tasks.every((t) => t.status === "done")))
    return "地勤保障尚未全部完成";
  const open = openBatchesForFlight(state, id);
  if (open.length > 0) {
    const waiting = open.filter((b) => b.stage === "waiting").length;
    const moving = open.length - waiting;
    const parts: string[] = [];
    if (waiting > 0) parts.push(`${waiting} 批旅客仍在等待处置`);
    if (moving > 0) parts.push(`${moving} 批在途/步行未闭环`);
    return `转机旅客未闭环：${parts.join("，")}`;
  }
  return undefined;
}
export function turnaroundProgress(state: Shift, id: string): number {
  const tasks = state.services.filter((t) => t.flightId === id);
  return tasks.length
    ? Math.round(tasks.reduce((n, t) => n + t.progress, 0) / tasks.length)
    : 0;
}
export function delaySeconds(flight: Flight, time: number): number {
  return Math.max(
    0,
    Math.floor((flight.departureAt ?? time) - flight.deadline),
  );
}
export const statusLabels: Record<Flight["status"], string> = {
  scheduled: "计划到达",
  incoming: "等待机位",
  parked: "地勤保障",
  departing: "正在推出",
  departed: "已离港",
};
