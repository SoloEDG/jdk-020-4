import type { Shift } from "../../../shared/types";
const kinds = ["fuel", "baggage", "clean"];
const flightStates = [
  "scheduled",
  "incoming",
  "parked",
  "departing",
  "departed",
];
const serviceStates = ["pending", "travel", "working", "done"];
const vehicleStates = ["idle", "travel", "working", "returning"];
const batchStages = ["waiting", "shuttling", "walk", "boarded", "missed"];
const shuttleModes = ["scheduled", "express"];
const placementKinds = ["rebook", "hotel", "voucher"];
type Row = Record<string, unknown>;
function row(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function point(value: unknown): boolean {
  return row(value) && finite(value.x) && finite(value.y);
}
function unique(values: Row[]): boolean {
  return (
    values.every((x) => text(x.id)) &&
    new Set(values.map((x) => x.id)).size === values.length
  );
}
function collection(value: unknown): value is Row[] {
  return Array.isArray(value) && value.every(row) && unique(value);
}
export function validShift(value: unknown): value is Shift {
  if (
    !row(value) ||
    value.version !== 2 ||
    !finite(value.time) ||
    value.time < 0 ||
    !finite(value.score) ||
    !finite(value.conflicts) ||
    value.conflicts < 0 ||
    typeof value.paused !== "boolean" ||
    ![1, 2, 4].includes(value.speed as number) ||
    !finite(value.nextEventId) ||
    !finite(value.nextBatchId) ||
    !finite(value.nextTripId) ||
    !finite(value.nextShuttleId) ||
    !finite(value.nextPlacementId)
  )
    return false;
  if (
    !collection(value.flights) ||
    !collection(value.stands) ||
    !collection(value.vehicles) ||
    !collection(value.services) ||
    !collection(value.transferBatches) ||
    !collection(value.shuttles) ||
    !collection(value.shuttleTrips) ||
    !Array.isArray(value.placements) ||
    !Array.isArray(value.events) ||
    value.events.length > 30 ||
    value.placements.length > 60
  )
    return false;
  const flights = value.flights as Row[],
    stands = value.stands as Row[],
    vehicles = value.vehicles as Row[],
    services = value.services as Row[],
    batches = value.transferBatches as Row[],
    shuttles = value.shuttles as Row[],
    trips = value.shuttleTrips as Row[],
    placements = value.placements as Row[];
  const flightIds = new Set(flights.map((x) => x.id)),
    standIds = new Set(stands.map((x) => x.id)),
    vehicleIds = new Set(vehicles.map((x) => x.id)),
    serviceIds = new Set(services.map((x) => x.id)),
    batchIds = new Set(batches.map((x) => x.id)),
    shuttleIds = new Set(shuttles.map((x) => x.id)),
    tripIds = new Set(trips.map((x) => x.id));

  // ---- 航班 ----
  if (
    !flights.every(
      (f) =>
        text(f.airline) &&
        text(f.from) &&
        text(f.destination) &&
        text(f.aircraft) &&
        ["narrow", "wide"].includes(f.size as string) &&
        flightStates.includes(f.status as string) &&
        finite(f.arrival) &&
        finite(f.deadline) &&
        finite(f.boardCloseAt) &&
        f.boardCloseAt < f.deadline &&
        finite(f.passengers) &&
        f.passengers > 0 &&
        text(f.color) &&
        (f.departureAt === undefined || finite(f.departureAt)) &&
        (f.parkedAt === undefined || finite(f.parkedAt)) &&
        (f.standId === undefined || standIds.has(f.standId)),
    )
  )
    return false;
  if (
    !stands.every(
      (s) =>
        point(s) &&
        ["narrow", "wide"].includes(s.size as string) &&
        text(s.terminal),
    )
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        kinds.includes(v.kind as string) &&
        vehicleStates.includes(v.status as string) &&
        point(v.position) &&
        point(v.origin) &&
        point(v.target) &&
        finite(v.progress) &&
        v.progress >= 0 &&
        v.progress <= 100 &&
        finite(v.tripDuration) &&
        v.tripDuration > 0 &&
        (v.serviceId === undefined || serviceIds.has(v.serviceId)),
    )
  )
    return false;
  if (
    !services.every(
      (s) =>
        flightIds.has(s.flightId) &&
        kinds.includes(s.kind as string) &&
        serviceStates.includes(s.status as string) &&
        finite(s.progress) &&
        s.progress >= 0 &&
        s.progress <= 100 &&
        finite(s.duration) &&
        s.duration > 0 &&
        (s.vehicleId === undefined || vehicleIds.has(s.vehicleId)),
    )
  )
    return false;
  if (
    !flights.every((f) =>
      kinds.every(
        (k) =>
          services.filter((t) => t.flightId === f.id && t.kind === k)
            .length === 1,
      ),
    )
  )
    return false;
  const occupied = flights
    .filter((f) => f.status !== "departed" && f.standId !== undefined)
    .map((f) => f.standId);
  if (new Set(occupied).size !== occupied.length) return false;
  if (
    !flights.every(
      (f) =>
        !["parked", "departing", "departed"].includes(f.status as string) ||
        (standIds.has(f.standId) &&
          finite(f.parkedAt) &&
          (f.size === "narrow" ||
            stands.find((s) => s.id === f.standId)?.size === "wide")),
    )
  )
    return false;
  if (
    !services.every((s) => {
      if (s.status === "pending")
        return s.progress === 0 && s.vehicleId === undefined;
      const v = vehicles.find((x) => x.id === s.vehicleId);
      if (!v || v.kind !== s.kind) return false;
      if (s.status === "done") return s.progress === 100;
      return (
        v.serviceId === s.id &&
        v.status === s.status &&
        flights.find((f) => f.id === s.flightId)?.status === "parked"
      );
    })
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        !["travel", "working"].includes(v.status as string) ||
        services.some(
          (s) =>
            s.id === v.serviceId &&
            s.vehicleId === v.id &&
            s.status === v.status,
        ),
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        services.filter(
          (t) =>
            t.flightId === f.id &&
            ["travel", "working"].includes(t.status as string),
        ).length <= 2,
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        !["departing", "departed"].includes(f.status as string) ||
        services
          .filter((t) => t.flightId === f.id)
          .every((t) => t.status === "done"),
    )
  )
    return false;

  // ---- 转机批次 ----
  if (
    !batches.every(
      (b) =>
        flightIds.has(b.inboundFlightId) &&
        flightIds.has(b.outboundFlightId) &&
        b.inboundFlightId !== b.outboundFlightId &&
        finite(b.count) &&
        b.count > 0 &&
        batchStages.includes(b.stage as string) &&
        finite(b.onboardCount) &&
        finite(b.missedCount) &&
        b.onboardCount >= 0 &&
        b.missedCount >= 0 &&
        b.onboardCount + b.missedCount <= b.count &&
        finite(b.boardCloseAt) &&
        (b.waitUntil === undefined || finite(b.waitUntil)) &&
        (b.gateArriveAt === undefined || finite(b.gateArriveAt)) &&
        Array.isArray(b.shuttleTripIds) &&
        b.shuttleTripIds.every((id) => tripIds.has(id)) &&
        Array.isArray(b.placementRefs) &&
        b.placementRefs.every((x) => typeof x === "string"),
    )
  )
    return false;
  // 终态必须人数守恒闭环
  if (
    !batches.every((b) => {
      const terminal = b.stage === "boarded" || b.stage === "missed";
      return (
        !terminal ||
        Number(b.onboardCount) + Number(b.missedCount) === Number(b.count)
      );
    })
  )
    return false;

  // ---- 摆渡车与班次 ----
  if (
    !shuttles.every(
      (v) =>
        ["idle", "travel"].includes(v.status as string) &&
        point(v.position) &&
        point(v.origin) &&
        point(v.target) &&
        finite(v.progress) &&
        v.progress >= 0 &&
        v.progress <= 100 &&
        finite(v.tripDuration) &&
        (v.tripId === undefined || tripIds.has(v.tripId)),
    )
  )
    return false;
  if (
    !trips.every(
      (t) =>
        shuttleIds.has(t.shuttleId) &&
        shuttleModes.includes(t.mode as string) &&
        flightIds.has(t.inboundFlightId) &&
        flightIds.has(t.outboundFlightId) &&
        ["travel", "done"].includes(t.status as string) &&
        point(t.origin) &&
        point(t.target) &&
        point(t.position) &&
        finite(t.progress) &&
        t.progress >= 0 &&
        t.progress <= 100 &&
        finite(t.tripDuration) &&
        t.tripDuration > 0 &&
        finite(t.dispatchedAt) &&
        (t.arrivedAt === undefined || finite(t.arrivedAt)) &&
        Array.isArray(t.loads) &&
        t.loads.length > 0 &&
        t.loads.every(
          (l) =>
            row(l) &&
            batchIds.has(l.batchId) &&
            finite(l.count) &&
            l.count > 0,
        ),
    )
  )
    return false;
  // 每辆摆渡车至多绑定一个在途班次，且双向引用一致
  if (
    !shuttles.every((v) => {
      if (v.status === "idle") return v.tripId === undefined;
      const t = trips.find((x) => x.id === v.tripId);
      return !!t && t.shuttleId === v.id && t.status === "travel";
    })
  )
    return false;
  if (
    !trips.every((t) => {
      const v = shuttles.find((x) => x.id === t.shuttleId);
      return (
        !!v &&
        (t.status === "done" || (v.status === "travel" && v.tripId === t.id))
      );
    })
  )
    return false;

  // 登车快照与批次引用一致：已上车的人被班次快照锁定
  for (const t of trips) {
    for (const load of t.loads as Row[]) {
      const b = batches.find((x) => x.id === load.batchId);
      if (!b || !Array.isArray(b.shuttleTripIds)) return false;
      if (t.status === "travel" && !b.shuttleTripIds.includes(t.id))
        return false;
    }
  }
  // 同一批次在途班次上的载客快照不能超过其未闭环人数
  for (const b of batches) {
    const inTransitSeats = trips
      .filter(
        (t) =>
          t.status === "travel" &&
          (t.loads as Row[]).some((l) => l.batchId === b.id),
      )
      .reduce(
        (n, t) =>
          n +
          (t.loads as Row[])
            .filter((l) => l.batchId === b.id)
            .reduce((m, l) => m + (l.count as number), 0),
        0,
      );
    if (
      inTransitSeats >
      Number(b.count) - Number(b.onboardCount) - Number(b.missedCount)
    )
      return false;
  }

  // ---- 安置台账 ----
  if (
    !placements.every(
      (p) =>
        text(p.code) &&
        batchIds.has(p.batchId) &&
        flightIds.has(p.inboundFlightId) &&
        flightIds.has(p.outboundFlightId) &&
        placementKinds.includes(p.kind as string) &&
        finite(p.count) &&
        p.count > 0 &&
        text(p.note) &&
        finite(p.createdAt),
    )
  )
    return false;
  const codes = placements.map((p) => p.code);
  if (new Set(codes).size !== codes.length) return false;
  // 安置人数必须与批次误机人数对得上（逐批可核对）
  for (const b of batches) {
    const placed = placements
      .filter((p) => p.batchId === b.id)
      .reduce((n, p) => n + (p.count as number), 0);
    if (placed !== b.missedCount) return false;
  }

  // ---- 事件与选择态 ----
  if (
    !value.events.every(
      (e) =>
        row(e) &&
        finite(e.id) &&
        finite(e.time) &&
        text(e.text) &&
        ["info", "success", "warning"].includes(e.tone as string),
    )
  )
    return false;
  const events = value.events as Row[];
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) => (e.id as number) >= (value.nextEventId as number))
  )
    return false;
  return (
    flightIds.has(value.selectedFlightId) &&
    (value.selectedStandId === undefined ||
      standIds.has(value.selectedStandId)) &&
    (value.selectedVehicleId === undefined ||
      vehicleIds.has(value.selectedVehicleId))
  );
}
