import type { Shift, TransferBatch } from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import {
  EXPRESS_CAPACITY,
  EXPRESS_MIN_LOAD,
  SHUTTLE_CAPACITY,
  WAIT_LIMIT,
  boardOpenOf,
  readyAt,
} from "../model/config";
import {
  affectedIncomingFlights,
  breakdownOf,
  idleShuttle,
  needsShuttle,
  placementsForBatch,
  placementLabels,
} from "../lib/selectors";

const stageLabels: Record<TransferBatch["stage"], string> = {
  waiting: "等待处置",
  shuttling: "摆渡在途",
  walk: "步行前往",
  boarded: "已登机",
  missed: "已误机",
};

function stageTone(stage: TransferBatch["stage"]): string {
  if (stage === "boarded") return "ok";
  if (stage === "missed") return "bad";
  if (stage === "shuttling" || stage === "walk") return "moving";
  return "hold";
}

export function TransferPanel({
  state,
  onWait,
  onCancelWait,
  onDispatch,
}: {
  state: Shift;
  onWait: (batchId: string) => void;
  onCancelWait: (batchId: string) => void;
  onDispatch: (mode: "scheduled" | "express") => void;
}) {
  const flightId = state.selectedFlightId;
  const batches = state.transferBatches.filter(
    (b) => b.outboundFlightId === flightId || b.inboundFlightId === flightId,
  );
  if (batches.length === 0) {
    return (
      <div className="transfer-panel">
        <div className="subheading">
          <h3>转机接续</h3>
          <span>CONNECTING PAX</span>
        </div>
        <p className="dependency-note">↳ 本航班没有转机旅客批次</p>
      </div>
    );
  }

  const outboundBatches = state.transferBatches.filter(
    (b) => b.outboundFlightId === flightId,
  );
  const breakdown = breakdownOf(state, flightId);
  const outbound = state.flights.find((f) => f.id === flightId)!;
  const shuttlePending = outboundBatches.filter(
    (b) =>
      b.stage === "waiting" &&
      needsShuttle(state, b.inboundFlightId, b.outboundFlightId),
  );
  const pendingCount = shuttlePending.reduce(
    (n, b) => n + (b.count - b.onboardCount - b.missedCount),
    0,
  );
  const shuttle = idleShuttle(state);
  const anyNotReady = shuttlePending.some((b) => {
    const inb = state.flights.find((f) => f.id === b.inboundFlightId);
    return !inb || inb.parkedAt === undefined || state.time < readyAt(b, inb);
  });
  // 延后推出对该机位后续接机的影响（以最长等待到期为释放估计）
  const waitBatches = batches.filter((b) => b.waitUntil !== undefined);
  const releaseAt = waitBatches.reduce(
    (m, b) => Math.max(m, b.waitUntil ?? m),
    state.time,
  );
  const affected =
    outbound.standId && releaseAt > state.time
      ? affectedIncomingFlights(state, releaseAt + 12)
      : [];

  return (
    <div className="transfer-panel">
      <div className="subheading">
        <h3>转机接续</h3>
        <span>CONNECTING PAX</span>
      </div>

      {breakdown.total > 0 && (
        <div className="transfer-summary">
          <span>
            待处置 <b>{breakdown.waiting}</b>
          </span>
          <span>
            在途 <b>{breakdown.inTransit}</b>
          </span>
          <span className="ok-text">
            已登机 <b>{breakdown.onboard}</b>
          </span>
          <span className="bad-text">
            误机 <b>{breakdown.missed}</b>
          </span>
          <span className="transfer-deadline">
            登机截止 {clockLabel(outbound.boardCloseAt)}
          </span>
        </div>
      )}

      <div className="batch-list">
        {batches.map((b) => {
          const inbound = state.flights.find(
            (f) => f.id === b.inboundFlightId,
          )!;
          const isOutbound = b.outboundFlightId === flightId;
          const shuttleNeeded = needsShuttle(
            state,
            b.inboundFlightId,
            b.outboundFlightId,
          );
          const ready =
            inbound.parkedAt !== undefined && state.time >= readyAt(b, inbound);
          const open = b.stage !== "boarded" && b.stage !== "missed";
          const placements = placementsForBatch(state, b.id);
          return (
            <div
              className={`batch-card ${stageTone(b.stage)}`}
              key={b.id}
              data-testid={`batch-${b.id}`}
            >
              <div className="batch-head">
                <strong>{b.id}</strong>
                <span className="batch-stage">{stageLabels[b.stage]}</span>
              </div>
              <div className="batch-route">
                {isOutbound ? (
                  <>
                    前序 <b>{b.inboundFlightId}</b> → 本机
                  </>
                ) : (
                  <>
                    本机 → 续飞 <b>{b.outboundFlightId}</b>
                  </>
                )}
                <em>
                  {b.count} 人 · {shuttleNeeded ? "摆渡运输" : "廊桥步行"}
                </em>
              </div>
              <div className="batch-counts">
                <span>
                  登机 <b>{b.onboardCount}</b>
                </span>
                <span>
                  误机 <b>{b.missedCount}</b>
                </span>
                <span>
                  未决 <b>{b.count - b.onboardCount - b.missedCount}</b>
                </span>
              </div>
              {open && (
                <div className="batch-timing">
                  {inbound.parkedAt === undefined ? (
                    <span className="bad-text">前序未靠桥，下客安检未开始</span>
                  ) : !ready ? (
                    <span>
                      下客/安检中 · 可运输时刻{" "}
                      {clockLabel(Math.ceil(readyAt(b, inbound)))}
                    </span>
                  ) : (
                    <span className="ok-text">
                      安检完成，可{shuttleNeeded ? "登摆渡车" : "步行登机"}
                    </span>
                  )}
                  {b.waitUntil !== undefined && (
                    <span className="wait-badge">
                      等待至 {clockLabel(b.waitUntil)}
                    </span>
                  )}
                </div>
              )}
              {open && b.stage === "waiting" && (
                <div className="batch-actions">
                  <button
                    className="mini"
                    data-testid={`wait-${b.id}`}
                    disabled={
                      b.waitUntil !== undefined ||
                      inbound.parkedAt === undefined ||
                      state.time >= b.boardCloseAt
                    }
                    title={`申请最长 ${WAIT_LIMIT} 秒有限等待，不晚于登机截止`}
                    onClick={() => onWait(b.id)}
                  >
                    申请等待 {WAIT_LIMIT}s
                  </button>
                  <button
                    className="mini danger"
                    data-testid={`cancel-wait-${b.id}`}
                    title="放弃等待：未运输旅客立即误机并生成安置单，已上车/已登机者不受影响"
                    onClick={() => onCancelWait(b.id)}
                  >
                    {b.waitUntil !== undefined ? "放弃等待" : "终止接续"}
                  </button>
                </div>
              )}
              {placements.length > 0 && (
                <div className="placement-list">
                  {placements.map((p) => (
                    <span className="placement-chip" key={p.id}>
                      {p.code} · {placementLabels[p.kind]} · {p.count}人
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {shuttlePending.length > 0 && (
        <div className="shuttle-dispatch">
          <div className="dispatch-head">
            <strong>摆渡发车（远机位接续）</strong>
            <span>
              待运 {pendingCount} 人 ·{" "}
              {shuttle ? `${shuttle.id} 待命` : "摆渡车全部在途"}
            </span>
          </div>
          <div className="dispatch-buttons">
            <button
              className="mini"
              data-testid="dispatch-scheduled"
              disabled={!shuttle || anyNotReady || pendingCount === 0}
              title={`小批多趟：每车 ${SHUTTLE_CAPACITY} 人，按批次逐趟发车，单趟成本低运力分散`}
              onClick={() => onDispatch("scheduled")}
            >
              普通班 · {SHUTTLE_CAPACITY}座/趟
            </button>
            <button
              className="mini accent"
              data-testid="dispatch-express"
              disabled={
                !shuttle ||
                anyNotReady ||
                pendingCount < EXPRESS_MIN_LOAD
              }
              title={`集中发车：需凑满 ${EXPRESS_MIN_LOAD} 人，${EXPRESS_CAPACITY} 座快车一趟运走，班次成本更低`}
            >
              集中快车 · 满{EXPRESS_MIN_LOAD}人发车
            </button>
          </div>
          <p className="dependency-note">
            ↳ 登机开放 {clockLabel(boardOpenOf(outbound))}，截止{" "}
            {clockLabel(outbound.boardCloseAt)}；晚于截止抵达的班次按误机安置
          </p>
        </div>
      )}

      {affected.length > 0 && (
        <div className="affected-box" data-testid="affected-flights">
          <strong>等待将延后机位 {outbound.standId} 释放，影响后续接机：</strong>
          {affected.map(({ flight, extraWait }) => (
            <span key={flight.id}>
              {flight.id}（到港 {clockLabel(flight.arrival)}）预计多等{" "}
              {extraWait}s
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
