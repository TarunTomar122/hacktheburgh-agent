"use client";

import { useCallback, useRef, useState } from "react";
import type { CaseFacts } from "../../lib/agent/facts";
import type { EnquiryOutcome } from "../../lib/agent/enquiryTypes";
import type { LedgerEntry } from "../../lib/agent/ledger";
import type { Place, RouteMap } from "../../lib/agent/routeTypes";
import type { AgentTile, FirmFinding, Funding, Stats, TraceStep } from "../../lib/agent/legalAidTypes";
import { CREW, type AskSpec, type CrewId, type ComplaintResult, type DiscoveryResult, type EvidenceResult, type PlannerEvent, type PlannerResult, type PlanStep, type Say } from "../../lib/agent/plannerTypes";

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
  startedAt?: number;
  spotlight: { crew: CrewId; tab: string } | null; // whose browser to show big (D62)
  demo: boolean; // playing back a recorded run (D63)
  skipped: (CrewId | "all")[]; // demo skips asked for
  models: LedgerEntry[]; // every model call so far (the ledger)
  place?: Place; // discovery: where the care happened
  route?: RouteMap; // discovery: the route map so far
  discovery?: DiscoveryResult;
};

const idleCrew = (): Record<CrewId, CrewState> =>
  Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "idle", note: "", since: Date.now() }])) as Record<CrewId, CrewState>;

const initial = (): PlannerRunState => ({ status: "idle", plan: [], says: [], crew: idleCrew(), asks: [], answered: {}, findings: [], tiles: [], stats: null, trace: [], firms: [], evidence: {}, enquiries: [], spotlight: null, demo: false, skipped: [], models: [] });

export function usePlannerRun() {
  const [s, setS] = useState<PlannerRunState>(initial);
  const runIdRef = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  // Demo playback (D63): a real recorded run, played faster. Gaps are shortened; skipping jumps ahead.
  const rec = useRef<{ events: Rec[]; i: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const stopReplay = () => {
    clearTimeout(rec.current?.timer);
    rec.current = null;
  };

  const apply = useCallback((e: PlannerEvent | { type: "ping" }) => {
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
        case "say":
          return { ...cur, says: [...cur.says, e.say] };
        case "crew":
          return { ...cur, crew: { ...cur.crew, [e.id]: { state: e.state, note: e.note, since: Date.now() } } };
        case "ask":
          return { ...cur, asks: [...cur.asks, e.ask] };
        case "answered":
          return { ...cur, asks: cur.asks.filter((a) => a.id !== e.id), answered: { ...cur.answered, [e.id]: e.answer } };
        case "finding":
          return { ...cur, findings: [...cur.findings, { i: cur.findings.length, text: e.text, source: e.source, crew: e.crew, t: Date.now() }] };
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
          return { ...cur, status: "done", result: e.result, firms: e.result.firms, crew: Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "done", note: cur.crew[id].note, since: Date.now() }])) as Record<CrewId, CrewState> };
        case "place":
          return { ...cur, place: e.place };
        case "route":
          return { ...cur, route: e.route };
        case "discovery_result":
          return { ...cur, status: "done", discovery: e.result, route: e.result.route, crew: Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "done", note: cur.crew[id].note, since: Date.now() }])) as Record<CrewId, CrewState> };
        case "model":
          return { ...cur, models: [...cur.models, e.entry] };
        case "complaint_result":
          return { ...cur, status: "done", complaint: e.result, crew: Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "done", note: cur.crew[id].note, since: Date.now() }])) as Record<CrewId, CrewState> };
        case "error":
          return { ...cur, status: "error", error: e.message };
        default:
          return cur;
      }
    });
  }, []);

  const start = useCallback(
    async (facts: CaseFacts, funding?: Partial<Funding>, flow: "compensation" | "complaint" | "discovery" | "complaint_anywhere" | "compensation_anywhere" = "compensation", route?: RouteMap) => {
      abort.current?.abort();
      stopReplay();
      const ctrl = new AbortController();
      abort.current = ctrl;
      runIdRef.current = undefined;
      setS({ ...initial(), status: "running", startedAt: Date.now() });
      try {
        const res = await fetch("/api/agent/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts, funding, flow, route }), signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not start the crew");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (ctrl.signal.aborted || abort.current !== ctrl) return;
            buf += dec.decode(value, { stream: !done });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) if (line.trim()) apply(JSON.parse(line));
            if (done) break;
          }
          if (buf.trim()) apply(JSON.parse(buf));
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        if (ctrl.signal.aborted || abort.current !== ctrl) return;
        setS((cur) => (cur.status === "running" ? { ...cur, status: cur.result || cur.complaint || cur.discovery ? "done" : "error", error: cur.result || cur.complaint || cur.discovery ? undefined : "The run ended without a result" } : cur));
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setS((cur) => ({ ...cur, status: "error", error: e instanceof Error ? e.message : String(e) }));
      }
    },
    [apply],
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

  const tick = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    // Everything recorded within 80ms arrives together.
    const t = r.events[r.i]?.t ?? 0;
    while (r.i < r.events.length && r.events[r.i].t - t < 80) apply(r.events[r.i++].e);
    if (r.i >= r.events.length) {
      rec.current = null;
      setS((cur) => (cur.status === "running" ? { ...cur, status: cur.result || cur.complaint || cur.discovery ? "done" : "error", error: cur.result || cur.complaint || cur.discovery ? undefined : "The recording ended without a result" } : cur));
      return;
    }
    const gap = r.events[r.i].t - r.events[r.i - 1].t;
    r.timer = setTimeout(tick, Math.min(1600, Math.max(30, gap / 6)));
  }, [apply]);

  const replay = useCallback(
    async (opts: { toEnd?: boolean; flow?: "compensation" | "complaint" | "discovery" } = {}) => {
      abort.current?.abort();
      stopReplay();
      setS({ ...initial(), status: "running", startedAt: Date.now(), demo: true });
      const res = await fetch(opts.flow && opts.flow !== "compensation" ? `/api/agent/plan/demo?flow=${opts.flow}` : "/api/agent/plan/demo").catch(() => null);
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
    runIdRef.current = undefined;
    stopReplay();
    setS(initial());
  }, []);

  return { state: s, start, answer, reset, replay, skip };
}
