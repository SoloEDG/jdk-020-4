import type { Flight, PlacementKind, TransferBatch } from "../../../shared/types";

/** 摆渡车物理容量（小批多趟） */
export const SHUTTLE_CAPACITY = 12;
/** 集中发车（快车）容量，需凑满才允许发车 */
export const EXPRESS_CAPACITY = 18;
/** 快车发车所需的最低载客（满载门槛） */
export const EXPRESS_MIN_LOAD = 14;
/** 每批可申请的有限等待上限（秒） */
export const WAIT_LIMIT = 60;
/** 登机截止 = 计划离港前 25 秒 */
export const BOARD_CLOSE_LEAD = 25;
/** 登机开放 = 计划离港前 40 秒，旅客早到也需在登机口等待 */
export const BOARD_OPEN_LEAD = 40;
/** 下客耗时基准（秒） */
export const DEPLANE_BASE = 14;
/** 每名旅客额外下客耗时 */
export const DEPLANE_PER_PAX = 0.05;
/** 转机安检基础耗时（秒） */
export const SECURITY_BASE = 10;
/** 每名旅客额外安检耗时，人数越多安检越慢 */
export const SECURITY_PER_PAX = 0.08;
/** 步行（同楼廊桥接续）耗时（秒） */
export const WALK_TIME = 8;
/** 摆渡车发车固定开销（秒） */
export const SHUTTLE_FIXED = 4;
/** 摆渡车速度（像素/秒），与其他保障车一致 */
export const SHUTTLE_SPEED = 50;
/** 单趟普通摆渡班次的运行成本（分） */
export const TRIP_COST_SCHEDULED = 6;
/** 单趟快车班次的运行成本（分） */
export const TRIP_COST_EXPRESS = 3;
/** 每名成功转机旅客得分 */
export const BOARD_BONUS_PER_PAX = 3;
/** 每名误机旅客罚分（在生成安置时扣除） */
export const MISSED_PENALTY_PER_PAX = 2;
/** 摆渡车场位置 */
export const shuttleDepot = { x: 808, y: 560 };

export function boardCloseOf(flight: Flight): number {
  return flight.deadline - BOARD_CLOSE_LEAD;
}

export function boardOpenOf(flight: Flight): number {
  return flight.deadline - BOARD_OPEN_LEAD;
}

export function placementCycleNote(kind: PlacementKind): string {
  switch (kind) {
    case "rebook":
      return "优先改签当日后续航班，提供餐券";
    case "hotel":
      return "次日航班无座，安排协议酒店与接送";
    case "voucher":
      return "旅客选择退票，发放退票凭证与积分";
  }
}

/**
 * 转机旅客真正"可运输"的时刻：
 * 靠桥之后还要完成下客与转机安检，绝不能把前序航班的预计到达直接当作可登机。
 */
export function readyAt(batch: TransferBatch, flight: Flight): number {
  if (flight.parkedAt === undefined) return Number.POSITIVE_INFINITY;
  const deplane = DEPLANE_BASE + flight.passengers * DEPLANE_PER_PAX;
  const security = SECURITY_BASE + batch.count * SECURITY_PER_PAX;
  return flight.parkedAt + deplane + security;
}
