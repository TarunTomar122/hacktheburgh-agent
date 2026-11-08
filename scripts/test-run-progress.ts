// Offline test of the run-progress estimator (app/case/runProgress.ts).
// Replays every recorded run (demo/*/events.ndjson, docs/night-runs/*/events.ndjson) through a small mirror of the
// planner reducer, in two clocks: "live" (the run's own timestamps) and "demo" (the playback clock of usePlannerRun:
// gaps shortened to gap/6, between 30 ms and 1.6 s). Prints the percentage at 10% steps of the run and checks:
//   monotonic, <= 95 until the result event, exactly 100 at the result, no jump above MAX_JUMP points between
//   one-second samples, and no 1-second stall longer than MAX_STALL of the run (the bar keeps showing life).
// Usage: npx tsx scripts/test-run-progress.ts [-v]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PlannerEvent, CrewId } from "../lib/agent/plannerTypes";
import { advance, inputFrom, shapeFromWorkers, shownPct, startProgress, type Progress, type ProgressShape } from "../app/case/runProgress";

const MAX_JUMP = 9; // points between samples one second apart (a burst of events can move it, a leap to 90 cannot)
const MAX_STALL = 0.35; // the longest flat stretch, as a fraction of the run
const verbose = process.argv.includes("-v");

type Rec = { t: number; e: PlannerEvent };
type State = Parameters<typeof inputFrom>[0] & { startedAt: number };

const CREWS = ["elliot", "nell", "robin", "iona", "kit"] as CrewId[];
const fresh = (): State => ({ status: "running", startedAt: 1, plan: [], says: [], trace: [], crew: Object.fromEntries(CREWS.map((c) => [c, { state: "idle" as const }])), findings: [], asks: [], demo: false });

/** The slice of usePlannerRun's reducer the estimator depends on. */
function apply(s: State, e: PlannerEvent): void {
  switch (e.type) {
    case "plan": s.plan = e.steps; break;
    case "say": s.says = [...s.says, e.say]; break;
    case "crew": s.crew = { ...s.crew, [e.id]: { state: e.state } }; break;
    case "ask": s.asks = [...s.asks, e.ask]; break;
    case "answered": s.asks = s.asks.filter((a) => (a as { id: string }).id !== e.id); break;
    case "finding": s.findings = [...s.findings, 1]; break;
    case "trace": s.trace = [...s.trace, e.step]; break;
    case "route": s.route = e.route; break;
    case "planner_result": s.status = "done"; s.result = e.result; break;
    case "discovery_result": s.status = "done"; s.discovery = e.result; s.route = e.result.route; break;
    case "complaint_result": s.status = "done"; s.complaint = e.result; break;
    case "escalation_result": s.status = "done"; s.escalation = e.result; break;
    default: break;
  }
}

function shapeOfRun(events: Rec[]): ProgressShape {
  const t = events.at(-1)!.e.type;
  return t === "discovery_result" ? "discovery" : t === "complaint_result" ? "complaint" : t === "escalation_result" ? "escalation" : "compensation";
}
// What the screen does: infer the shape from the crew it was given (the kits in app/case/*Run.tsx).
const KITS: Record<ProgressShape, CrewId[]> = { compensation: ["nell", "robin", "iona", "kit"], discovery: ["robin", "iona", "nell", "kit"], complaint: ["robin", "iona", "kit"], escalation: ["robin", "kit"] };

function load(file: string): Rec[] {
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Rec);
}

/** Virtual wall-clock time of each event: live = recorded t; demo = usePlannerRun's tick() pacing. */
function schedule(events: Rec[], demo: boolean): number[] {
  if (!demo) return events.map((r) => r.t);
  const at: number[] = [];
  let clock = 0;
  for (let i = 0; i < events.length; ) {
    const t0 = events[i].t;
    let j = i;
    while (j < events.length && events[j].t - t0 < 80) at[j++] = clock;
    if (j < events.length) clock += Math.min(1600, Math.max(30, (events[j].t - events[j - 1].t) / 6));
    i = j;
  }
  return at;
}

type Sample = { ms: number; pct: number };
function simulate(events: Rec[], demo: boolean) {
  const shape = shapeFromWorkers(KITS[shapeOfRun(events)]);
  const s = fresh();
  s.demo = demo;
  const at = schedule(events, demo);
  const end = at[at.length - 1];
  let p: Progress = startProgress(String(s.startedAt), 0);
  const samples: Sample[] = [];
  let resultAt = -1;
  let beforeResultMax = 0;
  let next = 0; // next one-second sample
  const step = (now: number) => {
    p = advance(p, inputFrom(s, shape), now);
  };
  let i = 0;
  while (i < events.length) {
    // Samples (the screen ticks every second) that fall before the next event.
    while (next < at[i]) { step(next); samples.push({ ms: next, pct: shownPct(p) }); next += 1000; }
    const batchAt = at[i];
    const isResult = (e: PlannerEvent) => ["planner_result", "discovery_result", "complaint_result", "escalation_result"].includes(e.type);
    while (i < events.length && at[i] === batchAt) {
      if (isResult(events[i].e)) resultAt = batchAt;
      apply(s, events[i].e);
      i++;
    }
    if (resultAt === batchAt) beforeResultMax = Math.max(0, ...samples.map((x) => x.pct));
    step(batchAt);
    samples.push({ ms: batchAt, pct: shownPct(p) });
  }
  return { samples, end, resultAt, beforeResultMax, final: shownPct(p) };
}

function check(name: string, mode: string, r: ReturnType<typeof simulate>): string[] {
  const bad: string[] = [];
  const { samples } = r;
  for (let k = 1; k < samples.length; k++) if (samples[k].pct < samples[k - 1].pct) bad.push(`goes backwards at ${samples[k].ms}ms (${samples[k - 1].pct} -> ${samples[k].pct})`);
  if (r.final !== 100) bad.push(`final is ${r.final}, not 100`);
  if (r.beforeResultMax > 95) bad.push(`reached ${r.beforeResultMax} before the result`);
  const pre = samples.filter((x) => x.ms < r.resultAt);
  if (pre.some((x) => x.pct >= 100)) bad.push("showed 100 before the result");
  // one-second jumps and stalls, before the result
  const grid: number[] = [];
  for (let ms = 0, k = 0; ms < r.resultAt; ms += 1000) {
    while (k + 1 < pre.length && pre[k + 1].ms <= ms) k++;
    grid.push(pre[k]?.pct ?? 0);
  }
  let maxJump = 0, stall = 0, maxStall = 0;
  for (let k = 1; k < grid.length; k++) {
    maxJump = Math.max(maxJump, grid[k] - grid[k - 1]);
    stall = grid[k] === grid[k - 1] ? stall + 1 : 0;
    maxStall = Math.max(maxStall, stall);
  }
  if (maxJump > MAX_JUMP) bad.push(`jumps ${maxJump} points in one second`);
  if (grid.length && maxStall / grid.length > MAX_STALL) bad.push(`flat for ${maxStall}s of ${grid.length}s (${Math.round((100 * maxStall) / grid.length)}%)`);
  void name; void mode;
  return bad;
}

function at(r: ReturnType<typeof simulate>, f: number): number {
  const ms = r.resultAt * f;
  let v = 0;
  for (const s of r.samples) if (s.ms <= ms) v = s.pct;
  return v;
}

const dirs: string[] = [];
for (const root of ["demo", "docs/night-runs"]) if (existsSync(root)) for (const d of readdirSync(root).sort()) if (existsSync(join(root, d, "events.ndjson"))) dirs.push(join(root, d));

let failures = 0;
console.log("run".padEnd(46) + "clock  " + [10, 20, 30, 40, 50, 60, 70, 80, 90].map((x) => `${x}%`.padStart(4)).join("") + "  end  | checks");
for (const dir of dirs) {
  const events = load(join(dir, "events.ndjson"));
  if (!events.length || !/_result$|^result$/.test(events.at(-1)!.e.type)) continue;
  for (const demo of [false, true]) {
    const r = simulate(events, demo);
    const bad = check(dir, demo ? "demo" : "live", r);
    const row = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => String(at(r, k / 10)).padStart(4)).join("");
    console.log(`${dir.padEnd(46)}${(demo ? "demo" : "live").padEnd(7)}${row}  ${String(r.final).padStart(3)}  | ${bad.length ? "FAIL " + bad.join("; ") : "ok"}`);
    if (bad.length) failures++;
    if (verbose) console.log("   " + r.samples.filter((_, k) => k % 10 === 0).map((x) => `${(x.ms / 1000).toFixed(0)}s:${x.pct}`).join(" "));
  }
}

// Pure unit checks.
{
  const base = { shape: "complaint" as const, status: "running" as const, plan: [], says: [], trace: [], crew: {}, findings: 0, routeParts: 0, asksOpen: 0, hasResult: false, demo: false, recordedMs: 0, key: "a" };
  let p = advance(startProgress("a", 0), base, 5000);
  const first = p.pct > 0 ? 1 : 0;
  // done without a result never shows 100
  p = advance(p, { ...base, status: "done", hasResult: false }, 6000);
  const noResult = shownPct(p) < 100;
  // a bigger plan arriving later never lowers it
  const plan = (n: number, d: number) => Array.from({ length: n }, (_, k) => ({ status: k < d ? ("done" as const) : ("todo" as const) }));
  p = advance(p, { ...base, plan: plan(4, 3) }, 9000);
  const high = shownPct(p);
  p = advance(p, { ...base, plan: plan(9, 3) }, 30000);
  const kept = shownPct(p) >= high;
  // waiting for the user pauses the clock
  const w1 = advance(startProgress("a", 0), { ...base, asksOpen: 1 }, 600_000);
  const w2 = advance(startProgress("a", 0), { ...base, asksOpen: 0 }, 600_000);
  const paused = w1.activeMs === 0 && w2.activeMs === 600_000;
  // a new run starts again from 0
  const reset = advance(p, { ...base, key: "b" }, 31000).pct < p.pct;
  // an error holds the number
  const held = advance(p, { ...base, status: "error" }, 32000).pct === p.pct;
  // never above 95 while working, however long it runs
  const long = advance(startProgress("a", 0), { ...base, plan: plan(5, 5), says: Array.from({ length: 50 }, () => ({ kind: "report" as const })) }, 10_000_000);
  const capped = shownPct(long) <= 95;
  const ok = first >= 1 && noResult && kept && paused && reset && held && capped;
  console.log(ok ? "PASS: unit checks (start, no 100 without result, never backwards, pause while asked, reset, error holds, cap 95)" : `FAIL unit: ${JSON.stringify({ first, noResult, kept, paused, reset, held, capped })}`);
  if (!ok) failures++;
}

console.log(failures ? `\n${failures} FAILED` : "\nALL OK");
if (failures) process.exit(1);
