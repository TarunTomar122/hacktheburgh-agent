import type { CaseFacts } from "../../lib/agent/facts";
import { FIXTURE_RESULT, FIXTURE_TILES } from "../../lib/agent/legalAidFixture";
import type { Funding, Step3Event, Step3Result } from "../../lib/agent/legalAidTypes";

/** `?fixture=1` in the page URL replays sample data instead of running the agents (for building the UI). */
export const fixtureMode = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fixture") === "1";

/**
 * Runs step 3 and reports every event. Resolves with the result; throws on an "error" event or a broken stream.
 * Never falls back to the fixture silently: sample data must not look like a real answer.
 */
export async function runStep3(body: { facts: CaseFacts; funding: Funding }, onEvent: (e: Step3Event) => void): Promise<Step3Result> {
  if (fixtureMode()) return replayFixture(onEvent);
  const dropped = () => new Error("The connection to the app's server dropped (it may have restarted). Nothing was sent anywhere. Try again.");
  const res = await fetch("/api/agent/step3", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {
    throw dropped();
  });
  if (res.status === 404) throw new Error("The step 3 agents are not connected yet. Add ?fixture=1 to the address to see sample data.");
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not start the agents");
  if (!res.body) throw new Error("The agents returned no progress stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let result: Step3Result | null = null;
  const receive = (line: string) => {
    if (!line.trim()) return;
    const e = JSON.parse(line) as Step3Event;
    if (e.type === "error") throw new Error(e.message);
    if (e.type === "result") result = e.result;
    onEvent(e);
  };
  try {
    while (true) {
      const { value, done } = await reader.read().catch(() => {
        throw dropped();
      });
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(receive);
      if (done) break;
    }
    receive(pending);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!result) throw new Error("The agents stopped before giving a result. You can try again.");
  return result;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plays the fixture back on timers, in the same event order the real route uses. */
async function replayFixture(onEvent: (e: Step3Event) => void): Promise<Step3Result> {
  onEvent({ type: "status", message: "Sample run (fixture): no sites are visited" });
  const total = FIXTURE_RESULT.stats;
  const stats = { agents: 0, sites: 0, pages: 0, actions: 0 };
  const tick = (k: number) => {
    stats.pages = Math.min(total.pages, stats.pages + 3 * k);
    stats.actions = Math.min(total.actions, stats.actions + 11 * k);
    stats.sites = Math.min(total.sites, stats.sites + k);
    onEvent({ type: "stats", stats: { ...stats } });
  };
  for (const t of FIXTURE_TILES) {
    stats.agents++;
    onEvent({ type: "agent", tile: { ...t, state: "starting", note: "Opening" } });
    tick(1);
    await wait(350);
  }
  for (const t of FIXTURE_TILES) {
    onEvent({ type: "agent", tile: { ...t, state: "working", note: t.state === "done" ? "Reading" : t.note } });
    tick(1);
    await wait(500);
  }
  for (const step of FIXTURE_RESULT.trace ?? []) {
    onEvent({ type: "trace", step });
    if (step.kind === "found" && step.firms?.length === 1) {
      const f = FIXTURE_RESULT.firms.find((x) => x.id === step.firms![0]);
      if (f) onEvent({ type: "firm", firm: f });
    }
    tick(1);
    await wait(180);
  }
  for (const t of FIXTURE_TILES) {
    onEvent({ type: "agent", tile: { ...t, state: t.state === "failed" ? "failed" : "done" } });
    await wait(250);
  }
  onEvent({ type: "stats", stats: total });
  onEvent({ type: "result", result: FIXTURE_RESULT });
  return FIXTURE_RESULT;
}
