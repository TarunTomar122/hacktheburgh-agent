import { dropHandoffs, dropPause, waiting } from "./planner";
import type { PlannerEvent } from "./plannerTypes";
import { cancelRunWork } from "./runControl";

/**
 * Live runs, on the server (runs survive navigation, reloads and dropped connections).
 * A run is started here, not tied to the request that started it: it keeps going when the client disconnects and only
 * stops through `cancelRun` (explicit cancel, or a restart of the same slot). Every event is kept in memory with its
 * time since the start, so a client can attach at any moment: it gets everything so far at once, then the live tail.
 * State sits on globalThis so Next.js hot reloads keep the runs (the work itself is plain promises and browsers).
 */

export type RunStatus = "running" | "done" | "error" | "cancelled";
export type Rec = { t: number; e: PlannerEvent };
type Listener = (rec: Rec | null) => void; // null = the run has ended

export type LiveRun = {
  runId: string;
  flow: string;
  slot: string; // "<case id>:<screen>": one active run per slot
  startedAt: number;
  endedAt?: number;
  status: RunStatus;
  events: Rec[];
  listeners: Set<Listener>;
};

const g = globalThis as typeof globalThis & { __liveRuns?: Map<string, LiveRun> };
const runs = (g.__liveRuns ??= new Map());
const KEEP_ENDED = 30;

const summary = (r: LiveRun) => ({ runId: r.runId, flow: r.flow, slot: r.slot, startedAt: r.startedAt, endedAt: r.endedAt ?? null, status: r.status, events: r.events.length });
export type RunSummary = ReturnType<typeof summary>;

function finish(r: LiveRun, status: RunStatus) {
  if (r.status !== "running") return;
  r.status = status;
  r.endedAt = Date.now();
  for (const l of [...r.listeners]) l(null);
  r.listeners.clear();
  const ended = [...runs.values()].filter((x) => x.status !== "running").sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  for (const old of ended.slice(0, Math.max(0, ended.length - KEEP_ENDED))) runs.delete(old.runId);
}

/**
 * Start `work` as a run in `slot`. Any run still going in the same slot is cancelled first. Resolves once the run's id is
 * known (its first event, which flows emit before any slow work). `work` gets the callback to emit events into.
 */
export function startRun(flow: string, slot: string, work: (onEvent: (e: PlannerEvent) => void) => Promise<unknown>): Promise<LiveRun> {
  for (const r of runs.values()) if (r.slot === slot && r.status === "running") cancelRun(r.runId);
  const t0 = Date.now();
  let run: LiveRun | null = null;
  let known: (r: LiveRun) => void = () => {};
  let failed: (e: unknown) => void = () => {};
  const ready = new Promise<LiveRun>((res, rej) => {
    known = res;
    failed = rej;
  });
  const onEvent = (e: PlannerEvent) => {
    if (!run) {
      if (e.type !== "run") return; // nothing is recorded before the run has an id
      run = { runId: e.runId, flow, slot, startedAt: t0, status: "running", events: [], listeners: new Set() };
      runs.set(run.runId, run);
      known(run);
    }
    if (run.status !== "running") return; // cancelled: whatever the stopping work still says is dropped
    const rec: Rec = { t: Date.now() - t0, e };
    run.events.push(rec);
    for (const l of [...run.listeners]) l(rec);
  };
  void work(onEvent).then(
    () => (run ? finish(run, "done") : failed(new Error("The run did not start"))),
    (err) => {
      if (!run) return failed(err);
      if (run.status === "running") onEvent({ type: "error", message: err instanceof Error ? err.message.split("\n")[0] : String(err) });
      finish(run, run.status === "running" ? "error" : run.status);
    },
  );
  return ready;
}

export const getRun = (runId: string) => runs.get(runId) ?? null;

/** The run to show for a slot: the one still going, else the newest one that ended. */
export function activeRun(slot: string): RunSummary | null {
  const mine = [...runs.values()].filter((r) => r.slot === slot);
  const live = mine.find((r) => r.status === "running");
  const pick = live ?? mine.sort((a, b) => b.startedAt - a.startedAt)[0];
  return pick ? summary(pick) : null;
}

/** Stop a run for good: its work ends at the next step, its browsers close, open questions are dropped. */
export function cancelRun(runId: string): boolean {
  const r = runs.get(runId);
  if (!r || r.status !== "running") return false;
  cancelRunWork(runId);
  for (const [, resolve] of waiting.get(runId) ?? []) resolve(null);
  dropPause(runId);
  dropHandoffs(runId);
  const stopped: Rec = { t: Date.now() - r.startedAt, e: { type: "error", message: "The run was stopped" } };
  r.events.push(stopped);
  for (const l of [...r.listeners]) l(stopped);
  finish(r, "cancelled");
  return true;
}

const enc = new TextEncoder();

/**
 * An NDJSON stream of a run: every event so far, then the live tail until it ends. A client that goes away only
 * detaches. With `tagged` (the attach endpoint) the lines carry their time `_t` (ms since the start) and are framed
 * by {type:"attached"} and {type:"live"}; without it the lines are exactly the events, as the POST always sent them.
 */
export function streamRun(run: LiveRun, tagged: boolean): Response {
  let off = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      let open = true;
      const write = (o: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          open = false;
        }
      };
      const line = (rec: Rec) => write(tagged ? { ...rec.e, _t: rec.t } : rec.e);
      const close = () => {
        if (!open) return;
        open = false;
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };
      if (tagged) write({ type: "attached", ...summary(run), now: Date.now() });
      const before = run.events.length;
      for (let i = 0; i < before; i++) line(run.events[i]);
      if (tagged) write({ type: "live", status: run.status });
      if (run.status !== "running") return close();
      const listener: Listener = (rec) => (rec ? line(rec) : close());
      run.listeners.add(listener);
      off = () => {
        run.listeners.delete(listener);
        open = false;
        clearInterval(ping);
      };
      // Keeps the connection alive while the crew waits for the user's answer.
      ping = setInterval(() => write({ type: "ping" }), 15000);
    },
    cancel() {
      off();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
