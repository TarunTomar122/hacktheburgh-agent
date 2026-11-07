"use client";

import { useCallback, useRef, useState } from "react";
import type { CaseFacts } from "../../lib/agent/facts";
import type { EnquiryOutcome } from "../../lib/agent/enquiryTypes";
import type { AgentTile, FirmFinding, Funding, Stats, TraceStep } from "../../lib/agent/legalAidTypes";
import { CREW, type AskSpec, type CrewId, type EvidenceResult, type PlannerEvent, type PlannerResult, type PlanStep, type Say } from "../../lib/agent/plannerTypes";

/**
 * Client state for one planner run (D47, D48): streams /api/agent/plan, keeps the crew's conversation, plan, states,
 * open questions, findings, evidence and enquiries, and posts the user's answers back. UI-agnostic.
 */

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
  startedAt?: number;
};

const idleCrew = (): Record<CrewId, CrewState> =>
  Object.fromEntries((Object.keys(CREW) as CrewId[]).map((id) => [id, { state: "idle", note: "", since: Date.now() }])) as Record<CrewId, CrewState>;

const initial = (): PlannerRunState => ({ status: "idle", plan: [], says: [], crew: idleCrew(), asks: [], answered: {}, findings: [], tiles: [], stats: null, trace: [], firms: [], evidence: {}, enquiries: [] });

export function usePlannerRun() {
  const [s, setS] = useState<PlannerRunState>(initial);
  const runIdRef = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  const apply = useCallback((e: PlannerEvent | { type: "ping" }) => {
    setS((cur) => {
      switch (e.type) {
        case "ping":
          return cur;
        case "run":
          runIdRef.current = e.runId;
          return { ...cur, runId: e.runId };
        case "plan":
          return { ...cur, plan: e.steps };
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
        case "error":
          return { ...cur, status: "error", error: e.message };
        default:
          return cur;
      }
    });
  }, []);

  const start = useCallback(
    async (facts: CaseFacts, funding?: Partial<Funding>) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setS({ ...initial(), status: "running", startedAt: Date.now() });
      try {
        const res = await fetch("/api/agent/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts, funding }), signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not start the crew");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          buf += dec.decode(value, { stream: !done });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) apply(JSON.parse(line));
          if (done) break;
        }
        setS((cur) => (cur.status === "running" ? { ...cur, status: cur.result ? "done" : "error", error: cur.result ? undefined : "The run ended without a result" } : cur));
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setS((cur) => ({ ...cur, status: "error", error: e instanceof Error ? e.message : String(e) }));
      }
    },
    [apply],
  );

  /** Send the user's answer (or null to skip). Removed from the open list once the server confirms. */
  const answer = useCallback(async (id: string, value: string | null) => {
    const runId = runIdRef.current;
    if (!runId) return;
    await fetch("/api/agent/plan/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, id, answer: value }) }).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    setS(initial());
  }, []);

  return { state: s, start, answer, reset };
}
