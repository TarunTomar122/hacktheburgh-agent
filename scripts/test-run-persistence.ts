// Runs survive navigation: the run belongs to the server, not to the request that started it.
//   npx tsx --env-file=.env.local scripts/test-run-persistence.ts            (needs the dev server: BASE=http://localhost:3001)
// Part A (offline): the registry with a fake run: replay with times, open questions reappear, answers still work, cancel stops.
// Part B (real, short, headless via the app server): start a discovery run, drop the connection, check the run is still
// going, reattach (replay + live tail), then cancel explicitly and check it stops. Cost: a minute of one model, no sends.
import { readFileSync } from "node:fs";
import { answerQuestion } from "../lib/agent/planner";
import { activeRun, cancelRun, getRun, startRun, streamRun } from "../lib/agent/runRegistry";

const BASE = process.env.BASE ?? "http://localhost:3001";
let failed = 0;
const check = (ok: boolean, what: string, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Line = { type: string; _t?: number; [k: string]: unknown };

/** Read an NDJSON response until `stop(lines)` says enough, or it ends, or the time is up. Aborting = a client that went away. */
async function readLines(res: Response, ctrl: AbortController, stop: (l: Line[]) => boolean, ms: number): Promise<Line[]> {
  const out: Line[] = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const p of parts) if (p.trim()) out.push(JSON.parse(p));
      if (stop(out)) break;
    }
  } catch {
    /* aborted */
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
  return out;
}
const real = (ls: Line[]) => ls.filter((l) => l.type !== "ping" && l.type !== "attached" && l.type !== "live");

async function partA() {
  console.log("\n== Part A: registry, fake run ==");
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let answer: string | null | undefined;
  const run = await startRun("test", "unit:case", async (emit) => {
    emit({ type: "run", runId: "unit-run-1" });
    emit({ type: "plan", steps: [{ id: "s1", text: "Look", status: "doing" }] });
    emit({ type: "ask", ask: { id: "q1", agent: "Planner", crew: "elliot", question: "Are you sure?", why: "", kind: "yes_no" } });
    await new Promise<void>((resolve) => {
      // The same shape the planner uses: a waiter per open question, answered through answerQuestion.
      const w = (globalThis as unknown as { __plannerAnswers: Map<string, Map<string, (a: string | null) => void>> }).__plannerAnswers;
      w.set("unit-run-1", new Map([["q1", (a) => { answer = a; emit({ type: "answered", id: "q1", answer: a }); resolve(); }]]));
    });
    emit({ type: "say", say: { i: 0, t: 1, from: "elliot", kind: "done", text: "Done" } });
    await gate;
  });
  check(run.runId === "unit-run-1", "startRun resolves with the run id");
  const text = async (r: Response) => (await r.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as Line);
  // Attach while a question is open: the ask is replayed and nothing has answered it.
  const c1 = new AbortController();
  const first = await readLines(streamRun(run, true), c1, (l) => l.some((x) => x.type === "live"), 2000);
  check(first[0]?.type === "attached" && first[0].status === "running", "attach starts with {attached, status: running}");
  check(first.some((l) => l.type === "ask" && (l as { ask?: { id?: string } }).ask?.id === "q1") && !first.some((l) => l.type === "answered"), "an open question reappears on attach");
  check(real(first).every((l) => typeof l._t === "number"), "replayed events carry their time _t");
  check(answerQuestion("unit-run-1", "q1", "yes") && answer === "yes", "the question can still be answered after attach");
  await sleep(50);
  const second = await readLines(streamRun(run, true), new AbortController(), (l) => l.some((x) => x.type === "live"), 2000);
  check(second.some((l) => l.type === "answered") && second.some((l) => l.type === "say"), "a later attach replays the answer too (so the question is gone)");
  check(activeRun("unit:case")?.status === "running", "active run for the slot is running");
  check(cancelRun("unit-run-1") === true && getRun("unit-run-1")?.status === "cancelled", "cancel stops the run");
  const third = await text(streamRun(getRun("unit-run-1")!, true));
  check(third.at(-2)?.type === "error" && third.at(-1)?.type === "live" && third.at(-1)?.status === "cancelled", "a cancelled run replays up to its stop and ends");
  release();
  const replaced = await startRun("test", "unit:case", async (emit) => { emit({ type: "run", runId: "unit-run-2" }); await new Promise(() => {}); });
  const again = await startRun("test", "unit:case", async (emit) => { emit({ type: "run", runId: "unit-run-3" }); await new Promise(() => {}); });
  check(getRun(replaced.runId)?.status === "cancelled" && getRun(again.runId)?.status === "running", "a new run in the same slot cancels the one still going");
  cancelRun(again.runId);
}

async function partB() {
  console.log(`\n== Part B: real discovery run via ${BASE} ==`);
  const facts = JSON.parse(readFileSync("scripts/personas/scotland.json", "utf8"));
  const slot = `persist-test:${Date.now()}:discovery`;
  const startedAt = Date.now();
  const c1 = new AbortController();
  const res = await fetch(`${BASE}/api/agent/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts, flow: "discovery", slot }), signal: c1.signal });
  check(res.ok, "POST /api/agent/plan starts the run");
  const firstLines = await readLines(res, c1, (l) => real(l).length >= 12 || l.some((x) => x.type === "say"), 90_000);
  const run1 = real(firstLines).find((l) => l.type === "run");
  const runId = String(run1?.runId ?? "");
  check(!!runId, "first event is {type:run}", runId);
  const n1 = real(firstLines).length;
  console.log(`   client 1 saw ${n1} events, then disconnected (+${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);

  await sleep(12_000);
  const act = (await (await fetch(`${BASE}/api/agent/plan/active?slot=${encodeURIComponent(slot)}`)).json()) as { run: { status: string; events: number; runId: string } | null };
  check(act.run?.runId === runId && act.run?.status === "running", "after the client left, the run is still running", JSON.stringify(act.run));
  check((act.run?.events ?? 0) > n1, "and it kept producing events while nobody was connected", `${n1} -> ${act.run?.events}`);

  const c2 = new AbortController();
  const att = await fetch(`${BASE}/api/agent/plan/attach?runId=${encodeURIComponent(runId)}`, { signal: c2.signal });
  check(att.ok, "GET /api/agent/plan/attach finds the run");
  let liveAt = -1;
  const lines2 = await readLines(att, c2, (l) => {
    if (liveAt < 0) liveAt = l.findIndex((x) => x.type === "live");
    return liveAt >= 0 && real(l).length > liveAt - 1 + 1 + 0 && l.slice(liveAt + 1).some((x) => x.type !== "ping");
  }, 60_000);
  const idxLive = lines2.findIndex((x) => x.type === "live");
  const replayed = lines2.slice(1, idxLive);
  const tail = lines2.slice(idxLive + 1).filter((x) => x.type !== "ping");
  check(lines2[0]?.type === "attached" && lines2[0].runId === runId, "attach begins with {attached}");
  check(replayed.length >= n1 && replayed.length >= (act.run?.events ?? 0) - 2, "replay contains every event so far", `replayed ${replayed.length}, client 1 saw ${n1}`);
  const k = Math.min(5, n1);
  const types1 = real(firstLines).slice(0, k).map((l) => l.type).join(",");
  const types2 = replayed.slice(0, k).map((l) => l.type).join(",");
  check(types1 === types2, "replay starts with the same events in the same order", types1);
  check(replayed.every((l) => typeof l._t === "number") && replayed.every((l, i) => i === 0 || (l._t as number) >= (replayed[i - 1]._t as number) - 1), "replayed events keep their original times, in order");
  check(tail.length > 0, "then new live events arrive after the replay", `${tail.length} live events, first: ${tail[0]?.type}`);

  const cancel = await fetch(`${BASE}/api/agent/plan/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) });
  check(cancel.ok, "POST /api/agent/plan/cancel stops the run");
  await sleep(1500);
  const after1 = (await (await fetch(`${BASE}/api/agent/plan/active?slot=${encodeURIComponent(slot)}`)).json()) as { run: { status: string; events: number } };
  check(after1.run.status === "cancelled", "the run is cancelled", after1.run.status);
  await sleep(15_000);
  const after2 = (await (await fetch(`${BASE}/api/agent/plan/active?slot=${encodeURIComponent(slot)}`)).json()) as { run: { status: string; events: number } };
  check(after2.run.events === after1.run.events, "no events after the cancel (the crew really stopped)", `${after1.run.events} -> ${after2.run.events}`);
  const again = await fetch(`${BASE}/api/agent/plan/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) });
  check(again.status === 404, "cancelling again is a 404");
  const unknown = await fetch(`${BASE}/api/agent/plan/attach?runId=discovery-0000-nope`);
  check(unknown.status === 404, "attaching to an unknown run is a 404 (a restarted server)");
}

(async () => {
  await partA();
  if (process.env.SKIP_REAL !== "1") await partB();
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
})();
