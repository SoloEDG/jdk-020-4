export type ServiceKind = "baggage" | "fuel" | "clean";
export type FlightStatus =
  | "scheduled"
  | "incoming"
  | "parked"
  | "departing"
  | "departed";
export interface Point {
  x: number;
  y: number;
}
export interface Flight {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  arrival: number;
  deadline: number;
  passengers: number;
  status: FlightStatus;
  standId?: string;
  departureAt?: number;
  /** 实际靠桥/靠机位时刻，转机流水线从这里开始，而不是预计到达 */
  parkedAt?: number;
  /** 登机截止时刻，延误保障不会让截止时间自动顺延 */
  boardCloseAt: number;
  color: string;
}
export interface Stand extends Point {
  id: string;
  size: "narrow" | "wide";
  terminal: string;
}
export interface Service {
  id: string;
  flightId: string;
  kind: ServiceKind;
  status: "pending" | "travel" | "working" | "done";
  progress: number;
  duration: number;
  vehicleId?: string;
}
export interface Vehicle {
  id: string;
  kind: ServiceKind;
  status: "idle" | "travel" | "working" | "returning";
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  serviceId?: string;
}

/** 转机批次的生命周期：等待处置 → 运输/步行 → 已登机 或 误机（终态） */
export type BatchStage =
  | "waiting"
  | "shuttling"
  | "walk"
  | "boarded"
  | "missed";

export interface TransferBatch {
  id: string;
  inboundFlightId: string;
  outboundFlightId: string;
  /** 批次总人数，永远不变 */
  count: number;
  stage: BatchStage;
  /** 已成功登机人数（含已上车后确认抵达的人，只增不减） */
  onboardCount: number;
  /** 已确认误机人数（只增不减） */
  missedCount: number;
  /** 摆渡班次引用；登车快照保存在 ShuttleTrip.loads 中 */
  shuttleTripIds: string[];
  /** 旅客到达登机口的时刻（步行抵达或摆渡抵达），早到需等到登机开放 */
  gateArriveAt?: number;
  /** 登机截止时刻快照，取自续飞航班 */
  boardCloseAt: number;
  /** 玩家申请的有限等待到期时刻；到期仍未闭环则按误机处置 */
  waitUntil?: number;
  /** 误机安置单编号，逐批可核对 */
  placementRefs: string[];
}

export type ShuttleMode = "scheduled" | "express";

export interface ShuttleLoad {
  batchId: string;
  /** 登车时刻锁定的人数快照，之后任何等待决策都不能改动这部分人 */
  count: number;
}

export interface ShuttleTrip {
  id: string;
  shuttleId: string;
  mode: ShuttleMode;
  inboundFlightId: string;
  outboundFlightId: string;
  status: "travel" | "done";
  origin: Point;
  target: Point;
  position: Point;
  progress: number;
  tripDuration: number;
  dispatchedAt: number;
  arrivedAt?: number;
  /** 登车快照：人在车上即被锁定，不会消失也不会被重复计算 */
  loads: ShuttleLoad[];
}

export interface ShuttleVehicle {
  id: string;
  status: "idle" | "travel";
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  tripId?: string;
}

export type PlacementKind = "rebook" | "hotel" | "voucher";

export interface Placement {
  id: string;
  /** 可追踪编号，如 RT-0007 */
  code: string;
  batchId: string;
  inboundFlightId: string;
  outboundFlightId: string;
  kind: PlacementKind;
  count: number;
  note: string;
  createdAt: number;
}

export interface Event {
  id: number;
  time: number;
  text: string;
  tone: "info" | "success" | "warning";
}
export interface Shift {
  version: 2;
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  score: number;
  conflicts: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  transferBatches: TransferBatch[];
  shuttles: ShuttleVehicle[];
  shuttleTrips: ShuttleTrip[];
  placements: Placement[];
  events: Event[];
  selectedFlightId: string;
  selectedStandId?: string;
  selectedVehicleId?: string;
  nextEventId: number;
  nextBatchId: number;
  nextTripId: number;
  nextShuttleId: number;
  nextPlacementId: number;
}
export type CommandResult = (state: Shift) => Shift;
