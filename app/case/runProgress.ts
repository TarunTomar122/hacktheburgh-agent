import type { CrewId, PlanStep, Say } from "../../lib/agent/plannerTypes";

/**
 * How far along is the run? A calm, honest percentage for the run screen's header.
 *
 * Nothing here is a promise. The crew does not know in advance how many pages it will read, so the number is an
 * estimate built only from things the run has already reported, and it is built to under-claim:
 *   - it never goes backwards (the plan can grow, a step can reopen; the number just waits),
 *   - it stays at or below 95% while the crew is working, and is 100% only once the run's result has arrived,
 *   - it does not creep while the crew is waiting for an answer from you.
 *
 * Pure and client-safe. `estimate` turns a snapshot of the run into a target between 0 and 0.95; `advance` is the
 * stateful step that makes it monotonic and eases it (so the number glides instead of jumping). A hook in
 * useRunProgress.ts drives `advance` from the run screen's clock.
 *
 * The weights and "typical" sizes below come from the recorded runs in demo/ and docs/night-runs/
 * (scripts/test-run-progress.ts replays them and prints the curve).
 */

/** The four shapes of work. The "anywhere" flows share the shape of their home-country twins. */
export type ProgressShape = "compensation" | "complaint" | "escalation" | "discovery";
export type ProgressFlow = ProgressShape | "complaint_anywhere" | "compensation_anywhere" | "escalation_anywhere";

/** The slice of PlannerRunState the estimator reads (so tests can feed it without React). */
export type ProgressInput = {
  shape: ProgressShape;
  status: "idle" | "running" | "done" | "error";
  plan: Pick<PlanStep, "status">[];
  says: Pick<Say, "kind" | "ok">[];
  crew: Partial<Record<CrewId, { state: "idle" | "working" | "waiting" | "done" }>>;
  findings: number;
  routeParts: number; // discovery: how many of the 8 route-map parts are recorded
  asksOpen: number;
  hasResult: boolean; // the run's result event has arrived
  demo: boolean; // recorded playback: the wall clock is compressed, so time comes from the recording's own timestamps
  recordedMs: number; // the run's own clock: the latest timestamp on a say or a trace step (ms since the run started)
  /** A key that changes when a new run starts, so a fresh run starts again from zero. */
  key: string;
};

export const ROUTE_PARTS = 8; // complaint, escalation, compensation, funding, lawyers, guideline, advice, records

type Tuning = {
  typicalSteps: number; // plan size to assume until the plan says more
  doingCredit: number; // how much a step "in progress" counts (0 where several are in progress at once)
  typicalJobs: number; // finished jobs (worker reports) in a typical run
  typicalMs: number; // how long a typical run takes working (not waiting on you)
  w: { plan: number; work: number; route: number; time: number }; // weights, sum to 1
};

/**
 * Tuned on the corpus (scripts/test-run-progress.ts). Complaint and escalation are short plans (3 to 6 steps, 3 to 5
 * reports). Compensation is a longer sequential plan (about 8 steps, 14 to 21 reports). Discovery's plan is noisy (all
 * steps "doing" at once, statuses that flip back), so it ignores the plan and leans on finished jobs (65 to 105 per
 * run, spread evenly through the run) and on the route map filling in.
 */
const TUNING: Record<ProgressShape, Tuning> = {
  complaint: { typicalSteps: 5, doingCredit: 0.5, typicalJobs: 5, typicalMs: 180_000, w: { plan: 0.5, work: 0.15, route: 0, time: 0.35 } },
  escalation: { typicalSteps: 5, doingCredit: 0.5, typicalJobs: 5, typicalMs: 120_000, w: { plan: 0.5, work: 0.15, route: 0, time: 0.35 } },
  compensation: { typicalSteps: 8, doingCredit: 0.5, typicalJobs: 20, typicalMs: 540_000, w: { plan: 0.4, work: 0.3, route: 0, time: 0.3 } },
  discovery: { typicalSteps: 8, doingCredit: 0, typicalJobs: 75, typicalMs: 600_000, w: { plan: 0, work: 0.5, route: 0.2, time: 0.3 } },
};

/**
 * Linear up to what is typical (to 90%), then flattening: a run that goes past the typical size keeps inching forward
 * but never reaches 1. Used for jobs and for time, so a long run does not slide to "almost done" on a clock alone.
 */
const soft = (x: number) => (x <= 1 ? 0.9 * Math.max(0, x) : 0.9 + 0.1 * (1 - Math.exp(-3 * (x - 1))));

/** The most the estimate claims while the run is still working. 100% is reserved for the result. */
export const WORKING_CAP = 0.95;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function shapeOf(flow: ProgressFlow): ProgressShape {
  return flow.endsWith("_anywhere") ? (flow.replace("_anywhere", "") as ProgressShape) : (flow as ProgressShape);
}

/** Which shape of run this is, from the crew the screen was given (the screen does not know the flow's name). */
export function shapeFromWorkers(workers: CrewId[]): ProgressShape {
  if (workers.length >= 4) return workers[0] === "nell" ? "compensation" : "discovery";
  return workers.length === 3 ? "complaint" : "escalation";
}

/** Plan completion in 0..1: finished steps over the larger of the plan's size and a typical plan, so a plan that grows does not feel like a setback. */
function planPart(i: ProgressInput, t: Tuning): number {
  const live = i.plan.filter((s) => s.status !== "dropped");
  if (!live.length) return 0;
  const credit = live.reduce((a, s) => a + (s.status === "done" ? 1 : s.status === "doing" ? t.doingCredit : 0), 0);
  // "finish" is the last step and is never really done before the result, so a full plan is held back a little.
  // The last step is only the write-up, so it counts for half a step: with everything before it done, the plan part is about 1.
  return clamp01(credit / (Math.max(live.length, t.typicalSteps) - 0.5));
}

/** Finished jobs: a worker reported back (plus a little for findings). */
function workPart(i: ProgressInput, t: Tuning): number {
  const reports = i.says.filter((s) => s.kind === "report").length;
  return soft((reports + Math.min(i.findings, 4) * 0.5) / t.typicalJobs);
}

/**
 * `clockMs` is how long the crew has been working (not waiting on you). `estimate` returns 0..0.95.
 */
export function estimate(i: ProgressInput, clockMs: number): number {
  if (i.status === "idle") return 0;
  const t = TUNING[i.shape];
  const blend = t.w.plan * planPart(i, t) + t.w.work * workPart(i, t) + t.w.route * clamp01(i.routeParts / ROUTE_PARTS) + t.w.time * soft(clockMs / t.typicalMs);
  // Discovery with every part of the route map recorded is wrapping up (verifying, then writing the result).
  const closing = i.shape === "discovery" && i.routeParts >= ROUTE_PARTS ? 0.85 : 0;
  // Started: a first sign of life (1%), before there is anything to measure.
  return Math.min(WORKING_CAP, Math.max(0.01, closing, blend));
}

/** The tracker keeps the number honest across renders: monotonic, eased, paused while you are being asked something. */
export type Progress = { key: string; pct: number; at: number; activeMs: number };
export const startProgress = (key = "", at = 0): Progress => ({ key, pct: 0, at, activeMs: 0 });

/** Easing: the shown number covers half the distance to its target in this many ms, and never moves faster than MAX_RATE points a second, so a step finishing glides in instead of jumping. */
const EASE_HALF_LIFE = 1500;
const MAX_RATE = 3.5; // live
const MAX_RATE_DEMO = 8; // playback runs at several times real speed

/**
 * One step: `now` is the wall clock in ms. Returns the new tracker (the same object if nothing changed).
 * `pct` is 0..100. It rises toward the estimate, is 100 only once the result has arrived, and holds on an error.
 */
export function advance(prev: Progress, i: ProgressInput, now: number): Progress {
  const base = prev.key === i.key ? prev : startProgress(i.key, now);
  const dt = Math.max(0, now - base.at);
  if (i.status === "done" && i.hasResult) return base.pct === 100 ? base : { ...base, pct: 100, at: now };
  if (i.status === "idle" || i.status === "error") return base.at === now ? base : { ...base, at: now };
  const waiting = i.asksOpen > 0 || Object.values(i.crew).some((c) => c?.state === "waiting");
  const activeMs = base.activeMs + (waiting ? 0 : dt);
  // Live: the longer of "time I watched it work" and the run's own clock (which survives a reloaded page). Playback: the run's own clock.
  const target = estimate(i, i.demo ? i.recordedMs : Math.max(activeMs, i.recordedMs)) * 100;
  // Ease toward the target (never past it, never back), then show whole percents.
  const eased = base.pct + Math.min((target - base.pct) * (1 - Math.pow(0.5, dt / EASE_HALF_LIFE)), ((i.demo ? MAX_RATE_DEMO : MAX_RATE) * dt) / 1000);
  const pct = target > base.pct ? Math.min(WORKING_CAP * 100, eased) : base.pct;
  return { key: base.key, pct, at: now, activeMs };
}

/** The whole number shown: floors, and is 100 only when the tracker is. */
export const shownPct = (p: Progress): number => (p.pct >= 100 ? 100 : Math.min(99, Math.floor(p.pct)));

/** Read what the estimator needs from a run state (structurally, so this file stays free of React). */
export function inputFrom(
  s: {
    status: ProgressInput["status"];
    startedAt?: number;
    runId?: string;
    plan: ProgressInput["plan"];
    says: (ProgressInput["says"][number] & { t: number })[];
    trace: { t: number }[];
    crew: ProgressInput["crew"];
    findings: unknown[];
    route?: { steps: unknown[] };
    asks: unknown[];
    result?: unknown;
    complaint?: unknown;
    discovery?: unknown;
    escalation?: unknown;
    demo: boolean;
  },
  shape: ProgressShape,
): ProgressInput {
  return {
    shape,
    status: s.status,
    plan: s.plan,
    says: s.says,
    crew: s.crew,
    findings: s.findings.length,
    routeParts: Math.min(ROUTE_PARTS, s.route?.steps.length ?? 0),
    asksOpen: s.asks.length,
    hasResult: !!(s.result || s.complaint || s.discovery || s.escalation),
    demo: s.demo,
    recordedMs: Math.max(s.says.at(-1)?.t ?? 0, s.trace.at(-1)?.t ?? 0),
    key: `${s.startedAt ?? ""}`,
  };
}
