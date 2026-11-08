"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseFacts } from "../../lib/agent/facts";
import type { EnquiryOutcome } from "../../lib/agent/enquiryTypes";
import type { LedgerEntry } from "../../lib/agent/ledgerSummary";
import type { HandoffInfo } from "../../lib/agent/handoffCopy";
import type { Place, RouteMap } from "../../lib/agent/routeTypes";
import type { AgentTile, FirmFinding, Funding, Stats, TraceStep } from "../../lib/agent/legalAidTypes";
import { CREW, type AskSpec, type CrewId, type ComplaintResult, type DiscoveryResult, type EscalationInput, type EscalationResult, type EvidenceResult, type PlannerEvent, type PlannerResult, type PlanStep, type Say } from "../../lib/agent/plannerTypes";

/**
 * Client state for one planner run (D47, D48): streams /api/agent/plan, keeps the crew's conversation, plan, states,
 * open questions, findings, evidence and enquiries, and posts the user's answers back. UI-agnostic.
 */

type Rec = { t: number; e: PlannerEvent };

export type CrewState = { state: "idle" | "working" | "waiting" | "done"; note: string; since: number };
export type Finding = { i: number; text: string; source?: string; crew?: CrewId; t: number };

export type PlannerRunState = {
  status: "idle" | "running" | "done" | "error";
  runId?: string;
  error?: string;
  plan: PlanStep[];
  says: Say[];
  crew: Record<CrewId, CrewState>;
  asks: AskSpec[]; // open questions, oldest first
  answered: Record<string, string | null>;
  findings: Finding[];
  tiles: AgentTile[];
  stats: Stats | null;
  trace: TraceStep[];
  firms: FirmFinding[];
  evidence: EvidenceResult;
  enquiries: EnquiryOutcome[];
  result?: PlannerResult;
  funding?: Funding;
  complaint?: ComplaintResult; // the complaint crew's result (D65)
  escalation?: EscalationResult; // step 2 anywhere: the escalation crew's result
  startedAt?: number;
  endedAt?: number; // when the run finished (the server's clock for a run picked up again), for the duration
  reconnectedAt?: number; // set when this screen picked up a run that went on while it was away
  spotlight: { crew: CrewId; tab: string } | null; // whose browser to show big (D62)
  demo: boolean; // playing back a recorded run (D63)
  paused?: boolean; // the user paused the crew: what is under way finishes, nothing new starts
  skipped: (CrewId | "all")[]; // demo skips asked for
  models: LedgerEntry[]; // every model call so far (the ledger)
  place?: Place; // discovery: where the care happened
  route?: RouteMap; // discovery: the route map so far
  discovery?: DiscoveryResult;
  handoffs: (HandoffInfo & { outcome?: "continued" | "skipped" | "timeout" })[];
};

const idleCrew = (): Record<CrewId, CrewState> =>
  Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "idle", note: "", since: Date.now() }])) as Record<CrewId, CrewState>;

const initial = (): PlannerRunState => ({ status: "idle", plan: [], says: [], crew: idleCrew(), asks: [], answered: {}, findings: [], tiles: [], stats: null, trace: [], firms: [], evidence: {}, enquiries: [], spotlight: null, demo: false, skipped: [], models: [], handoffs: [] });

/**
 * Runs live on the server (lib/agent/runRegistry.ts) and keep going when this screen goes away. What survives here is a
 * pointer in localStorage, per case and screen: { runId, flow, startedAt, status } and, once finished, the final result
 * event. Coming back, the hook attaches to the run: every event so far arrives at once, then the live tail, so the screen
 * lands on the crew's current stage. Leaving only detaches; a new run (or an explicit cancel) is the only thing that stops one.
 */
export type RunScope = { scope: "case" | "complaint" | "discovery" | "escalation"; caseId: string };
type Stored = { runId: string; flow: string; startedAt: number; status: "running" | "done" | "error"; seen?: boolean; endedAt?: number; terminal?: PlannerEvent };
const storeKey = (sc: RunScope) => `elliot-run-v1:${sc.caseId}:${sc.scope}`;
const slotOf = (sc?: RunScope) => (sc ? `${sc.caseId}:${sc.scope}` : undefined);
function readStored(sc?: RunScope): Stored | null {
  if (!sc || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storeKey(sc));
    const v = raw ? (JSON.parse(raw) as Stored) : null;
    return v && typeof v.runId === "string" ? v : null;
  } catch {
    return null;
  }
}
function writeStored(sc: RunScope | undefined, patch: Partial<Stored> | null) {
  if (!sc || typeof window === "undefined") return;
  try {
    if (patch === null) return localStorage.removeItem(storeKey(sc));
    const cur = readStored(sc);
    // A different run replaces the old pointer; the same run only updates it.
    const base = cur && (!patch.runId || patch.runId === cur.runId) ? cur : null;
    if (!base && !(patch.runId && patch.flow && patch.startedAt)) return;
    localStorage.setItem(storeKey(sc), JSON.stringify({ ...base, ...patch }));
  } catch {
    /* storage full or blocked: the run still shows for this visit */
  }
}
const TERMINAL = new Set(["planner_result", "complaint_result", "escalation_result", "discovery_result"]);
const wait = (a: AbortSignal, ms: number) => new Promise<void>((r) => { const t = setTimeout(r, ms); a.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); });

export function usePlannerRun(scope?: RunScope) {
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  });
  const slot = slotOf(scope);
  const [s, setS] = useState<PlannerRunState>(() => {
    // A run that is still going on the server starts on its run screen, so the start screen never flashes.
    const st = readStored(scope);
    return st && st.status === "running" ? { ...initial(), status: "running", runId: st.runId, startedAt: st.startedAt } : initial();
  });
  const runIdRef = useRef<string | undefined>(undefined);
  const startedRef = useRef<number | undefined>(undefined);
  const flowRef = useRef<string>("compensation");
  const abort = useRef<AbortController | null>(null);
  // Demo playback (D63): a real recorded run, played faster. Gaps are shortened; skipping jumps ahead.
  const rec = useRef<{ events: Rec[]; i: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const stopReplay = () => {
    clearTimeout(rec.current?.timer);
    rec.current = null;
  };

  const apply = useCallback((e: PlannerEvent | { type: "ping" }, at?: number) => {
    // `at`: when the event really happened (a run picked up again replays old events at once, with their own times).
    const now = at ?? Date.now();
    setS((cur) => {
      switch (e.type) {
        case "ping":
          return cur;
        case "run":
          runIdRef.current = e.runId;
          return { ...cur, runId: e.runId };
        case "funding":
          return { ...cur, funding: e.funding };
        case "plan":
          return { ...cur, plan: e.steps };
        case "spotlight":
          return { ...cur, spotlight: { crew: e.crew, tab: e.tab } };
        case "paused":
          return { ...cur, paused: e.paused };
        case "say":
          return { ...cur, says: [...cur.says, e.say] };
        case "crew":
          return { ...cur, crew: { ...cur.crew, [e.id]: { state: e.state, note: e.note, since: now } } };
        case "ask":
          return { ...cur, asks: [...cur.asks, e.ask] };
        case "answered":
          return { ...cur, asks: cur.asks.filter((a) => a.id !== e.id), answered: { ...cur.answered, [e.id]: e.answer } };
        case "finding":
          return { ...cur, findings: [...cur.findings, { i: cur.findings.length, text: e.text, source: e.source, crew: e.crew, t: now }] };
        case "agent":
          return { ...cur, tiles: cur.tiles.some((t) => t.id === e.tile.id) ? cur.tiles.map((t) => (t.id === e.tile.id ? e.tile : t)) : [...cur.tiles, e.tile] };
        case "stats":
          return { ...cur, stats: e.stats };
        case "trace":
          return { ...cur, trace: [...cur.trace, e.step] };
        case "firm":
          return { ...cur, firms: cur.firms.some((f) => f.id === e.firm.id) ? cur.firms.map((f) => (f.id === e.firm.id ? e.firm : f)) : [...cur.firms, e.firm] };
        case "evidence":
          return { ...cur, evidence: e.evidence };
        case "enquiry":
          return { ...cur, enquiries: cur.enquiries.some((x) => x.firmId === e.enquiry.firmId) ? cur.enquiries.map((x) => (x.firmId === e.enquiry.firmId ? e.enquiry : x)) : [...cur.enquiries, e.enquiry] };
        case "planner_result":
          return { ...cur, status: "done", result: e.result, endedAt: now, firms: e.result.firms, crew: Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "done", note: cur.crew[id].note, since: now }])) as Record<CrewId, CrewState> };
        case "place":
          return { ...cur, place: e.place };
        case "route":
          return { ...cur, route: e.route };
        case "discovery_result":
          return { ...cur, status: "done", discovery: e.result, endedAt: now, route: e.result.route, says: cur.says.length ? cur.says : e.result.says, plan: cur.plan.length ? cur.plan : e.result.plan, trace: cur.trace.length ? cur.trace : e.result.trace, crew: Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "done", note: cur.crew[id].note, since: now }])) as Record<CrewId, CrewState> };
        case "model":
          return { ...cur, models: [...cur.models, e.entry] };
        case "complaint_result":
          return { ...cur, status: "done", complaint: e.result, endedAt: now, crew: Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "done", note: cur.crew[id].note, since: now }])) as Record<CrewId, CrewState> };
        case "escalation_result":
          return { ...cur, status: "done", escalation: e.result, endedAt: now, crew: Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "done", note: cur.crew[id].note, since: now }])) as Record<CrewId, CrewState> };
        case "handoff":
          return { ...cur, handoffs: [...cur.handoffs.filter((h) => h.id !== e.id), { id: e.id, crew: e.crew, tab: e.tab, url: e.url, kind: e.kind, why: e.why }] };
        case "handoff_done":
          return { ...cur, handoffs: cur.handoffs.map((h) => (h.id === e.id ? { ...h, outcome: e.outcome } : h)) };
        case "error":
          return { ...cur, status: "error", error: e.message };
        default:
          return cur;
      }
    });
  }, []);

  /** Stop a run on the server for good (its browsers close). Not used by leaving a screen, which only detaches. */
  const cancel = useCallback(async (runId?: string) => {
    if (!runId) return;
    await fetch("/api/agent/plan/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) }).catch(() => null);
  }, []);

  /** Read one NDJSON response into the state. Returns true when the run is over (nothing more will come). */
  const consume = useCallback(
    async (res: Response, ctrl: AbortController): Promise<boolean> => {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let over = false;
      const line = (text: string) => {
        const e = JSON.parse(text) as { type: string; _t?: number; [k: string]: unknown };
        const t = typeof e._t === "number" ? e._t : undefined;
        if (e.type === "attached") {
          // Everything so far follows: start from a clean screen, with the run's own start time.
          const a = e as unknown as { runId: string; flow: string; startedAt: number };
          runIdRef.current = a.runId;
          startedRef.current = a.startedAt;
          flowRef.current = a.flow;
          setS({ ...initial(), status: "running", runId: a.runId, startedAt: a.startedAt, reconnectedAt: Date.now() });
          writeStored(scopeRef.current, { runId: a.runId, flow: a.flow, startedAt: a.startedAt });
          return;
        }
        if (e.type === "live") {
          if (e.status !== "running") over = true;
          return;
        }
        if (e.type === "run") {
          const runId = e.runId as string;
          runIdRef.current = runId;
          writeStored(scopeRef.current, { runId, flow: flowRef.current, startedAt: startedRef.current ?? Date.now(), status: "running", seen: false, terminal: undefined, endedAt: undefined });
        }
        const at = t !== undefined && startedRef.current !== undefined ? startedRef.current + t : undefined;
        if (TERMINAL.has(e.type)) {
          over = true;
          writeStored(scopeRef.current, { status: "done", terminal: e as unknown as PlannerEvent, endedAt: at ?? Date.now() });
        } else if (e.type === "error") {
          over = true;
          writeStored(scopeRef.current, { status: "error" });
        }
        apply(e as unknown as PlannerEvent, at);
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (ctrl.signal.aborted || abort.current !== ctrl) return false;
          buf += dec.decode(value, { stream: !done });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const l of lines) if (l.trim()) line(l);
          if (done) break;
        }
        if (buf.trim()) line(buf);
        return over;
      } catch {
        return false; // the connection dropped: the caller reattaches
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
    [apply],
  );

  /** Show how a run ended when the stream is over and no result came (nothing else will arrive). */
  const settle = useCallback(() => {
    setS((cur) => (cur.status === "running" ? { ...cur, status: cur.result || cur.complaint || cur.discovery || cur.escalation ? "done" : "error", error: cur.result || cur.complaint || cur.discovery || cur.escalation ? undefined : "The run ended without a result" } : cur));
  }, []);

  /**
   * Attach to a run on the server (replay everything so far, then the live tail), and keep trying through brief
   * disconnects. A run the server no longer knows (it restarted) shows its stored result if there is one, else the start screen.
   */
  const follow = useCallback(
    async (runId: string, ctrl: AbortController) => {
      for (let attempt = 0; attempt < 8; attempt++) {
        if (ctrl.signal.aborted || abort.current !== ctrl) return;
        const res = await fetch(`/api/agent/plan/attach?runId=${encodeURIComponent(runId)}`, { signal: ctrl.signal, cache: "no-store" }).catch(() => null);
        if (ctrl.signal.aborted || abort.current !== ctrl) return;
        if (res?.status === 404) {
          const st = readStored(scopeRef.current);
          if (st?.runId === runId && st.status === "done" && st.terminal) {
            // The server has forgotten the run, but its result was kept here.
            runIdRef.current = undefined;
            setS({ ...initial(), startedAt: st.startedAt, endedAt: st.endedAt });
            apply(st.terminal, st.endedAt);
          } else {
            writeStored(scopeRef.current, null);
            runIdRef.current = undefined;
            setS(initial());
          }
          return;
        }
        if (res?.ok && res.body) {
          if (await consume(res, ctrl)) return settle();
          if (ctrl.signal.aborted || abort.current !== ctrl) return;
        }
        await wait(ctrl.signal, Math.min(4000, 400 * 2 ** attempt));
      }
      if (!ctrl.signal.aborted && abort.current === ctrl) setS((cur) => ({ ...cur, status: "error", error: "Lost the connection to the crew. The run may still be going: reload to pick it up again." }));
    },
    [apply, consume, settle],
  );

  // Coming back to a screen: pick up the run that went on while it was away (or show how it ended).
  useEffect(() => {
    if (!slot) return;
    const st = readStored(scopeRef.current);
    if (st?.seen && st.status !== "running" && scopeRef.current?.scope !== "discovery" && scopeRef.current?.scope !== "case") return; // already shown and saved by this screen: it shows its own file (the research and case screens keep their crew and history, so they always reattach)
    const ctrl = new AbortController();
    abort.current = ctrl;
    void (async () => {
      let runId = st?.runId;
      if (st) {
        flowRef.current = st.flow;
        startedRef.current = st.startedAt;
      } else {
        // Nothing stored here (cleared storage, another tab): ask the server whether a run is going in this slot.
        const found = await fetch(`/api/agent/plan/active?slot=${encodeURIComponent(slot)}`, { cache: "no-store", signal: ctrl.signal })
          .then((r) => r.json() as Promise<{ run: { runId: string; status: string } | null }>)
          .catch(() => null);
        if (ctrl.signal.aborted || found?.run?.status !== "running") return;
        runId = found.run.runId;
        setS((cur) => ({ ...cur, status: "running", runId }));
      }
      if (runId) await follow(runId, ctrl);
    })();
    // No cleanup here: the effect below detaches on leaving (and a restart in dev strict mode simply attaches again).
  }, [slot, follow]);

  // Leaving the screen only detaches. The run goes on, on the server.
  useEffect(
    () => () => {
      abort.current?.abort();
      abort.current = null;
      clearTimeout(rec.current?.timer);
    },
    [],
  );

  // Once this screen has shown how a run ended (and saved it), reopening it shows the saved file instead of replaying the run.
  useEffect(() => {
    if ((s.status === "done" || s.status === "error") && !s.demo) writeStored(scopeRef.current, { seen: true });
  }, [s.status, s.demo]);

  const start = useCallback(
    async (facts: CaseFacts, funding?: Partial<Funding>, flow: "compensation" | "complaint" | "discovery" | "complaint_anywhere" | "compensation_anywhere" | "escalation_anywhere" = "compensation", route?: RouteMap, progress?: EscalationInput, focus?: string) => {
      abort.current?.abort();
      stopReplay();
      const ctrl = new AbortController();
      abort.current = ctrl;
      const old = readStored(scopeRef.current);
      if (old?.status === "running") void cancel(old.runId); // a new run replaces the one still going (the server also does this per slot)
      writeStored(scopeRef.current, null);
      runIdRef.current = undefined;
      flowRef.current = flow;
      startedRef.current = Date.now();
      setS({ ...initial(), status: "running", startedAt: startedRef.current });
      try {
        const res = await fetch("/api/agent/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts, funding, flow, route, progress, focus, slot: slotOf(scopeRef.current) }), signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not start the crew");
        if (await consume(res, ctrl)) return settle();
        if (ctrl.signal.aborted || abort.current !== ctrl) return;
        // The stream broke before the run ended: the run did not (it belongs to the server), so pick it up again.
        if (runIdRef.current) return await follow(runIdRef.current, ctrl);
        settle();
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setS((cur) => ({ ...cur, status: "error", error: e instanceof Error ? e.message : String(e) }));
      }
    },
    [cancel, consume, follow, settle],
  );

  /** Send the user's answer (or null to skip). Returns false if it did not arrive, so the question can be retried. */
  const answer = useCallback(async (id: string, value: string | null): Promise<boolean> => {
    if (rec.current) {
      apply({ type: "answered", id, answer: value } as PlannerEvent);
      return true;
    }
    const runId = runIdRef.current;
    if (!runId) return false;
    const res = await fetch("/api/agent/plan/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, id, answer: value }) }).catch(() => null);
    return !!res?.ok;
  }, [apply]);

  /** Pause or resume the crew. Every screen on the run hears it back as a "paused" event. */
  const pause = useCallback(async (paused: boolean) => {
    const runId = runIdRef.current;
    if (!runId || rec.current) return;
    setS((cur) => ({ ...cur, paused }));
    const res = await fetch("/api/agent/plan/pause", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, paused }) }).catch(() => null);
    if (!res?.ok) setS((cur) => ({ ...cur, paused: !paused }));
  }, []);

  const tick = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    // Everything recorded within 80ms arrives together.
    const t = r.events[r.i]?.t ?? 0;
    while (r.i < r.events.length && r.events[r.i].t - t < 80) apply(r.events[r.i++].e);
    if (r.i >= r.events.length) {
      rec.current = null;
      setS((cur) => (cur.status === "running" ? { ...cur, status: cur.result || cur.complaint || cur.discovery || cur.escalation ? "done" : "error", error: cur.result || cur.complaint || cur.discovery || cur.escalation ? undefined : "The recording ended without a result" } : cur));
      return;
    }
    const gap = r.events[r.i].t - r.events[r.i - 1].t;
    r.timer = setTimeout(tick, Math.min(1600, Math.max(30, gap / 6)));
  }, [apply]);

  const replay = useCallback(
    async (opts: { toEnd?: boolean; place?: string; flow?: "compensation" | "complaint" | "discovery" } = {}) => {
      abort.current?.abort();
      stopReplay();
      setS({ ...initial(), status: "running", startedAt: Date.now(), demo: true });
      const res = await fetch(`/api/agent/plan/demo?flow=${opts.flow && opts.flow !== "compensation" ? opts.flow : "step3"}${opts.place ? `&place=${encodeURIComponent(opts.place)}` : ""}`).catch(() => null);
      const data = res?.ok ? ((await res.json()) as { events: Rec[] }) : null;
      if (!data?.events.length) {
        setS((cur) => ({ ...cur, status: "error", error: "No recorded demo run is available yet." }));
        return;
      }
      rec.current = { events: data.events, i: 0 };
      if (opts.toEnd) {
        for (const x of data.events) apply(x.e);
        rec.current = null;
        return;
      }
      tick();
    },
    [apply, tick],
  );

  /** Demo control: skip one crew member's work (or "all": wrap up now). Live runs tell the server; playback jumps ahead. */
  const skip = useCallback(
    async (crew: CrewId | "all") => {
      setS((cur) => ({ ...cur, skipped: [...cur.skipped, crew] }));
      const r = rec.current;
      if (r) {
        clearTimeout(r.timer);
        // Jump past everything that crew member did (or to the end), then play on.
        let to = r.events.length;
        if (crew !== "all") {
          const mine = new Set(r.events.filter((x) => x.e.type === "ask" && x.e.ask.crew === crew).map((x) => (x.e as Extract<PlannerEvent, { type: "ask" }>).ask.id));
          const touches = (e: PlannerEvent) =>
            (e.type === "say" && (e.say.from === crew || e.say.to === crew)) || (e.type === "crew" && e.id === crew) || (e.type === "spotlight" && e.crew === crew) || (e.type === "answered" && mine.has(e.id));
          let last = r.i - 1;
          r.events.forEach((x, i) => {
            if (i >= r.i && touches(x.e)) last = i;
          });
          to = last + 1;
        }
        while (r.i < to) apply(r.events[r.i++].e);
        tick();
        return;
      }
      const runId = runIdRef.current;
      if (runId) await fetch("/api/agent/plan/skip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, crew }) }).catch(() => null);
    },
    [apply, tick],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    writeStored(scopeRef.current, null);
    runIdRef.current = undefined;
    stopReplay();
    setS(initial());
  }, []);

  return { state: s, start, answer, reset, replay, skip, pause, cancel: () => cancel(runIdRef.current) };
}
