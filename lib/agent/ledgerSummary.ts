import type { CrewId } from "./plannerTypes";

/** Client-safe part of the model ledger: the entry type and the per-agent totals (lib/agent/ledger.ts records them). */

export type DataKind = "place" | "health" | "money" | "identity";
export type LedgerEntry = {
  t: number;
  agent: CrewId | "onboarding" | "system";
  task: string; // what the call was for: "page_reading", "planner", "form decisions", ...
  model: string;
  where: "cloud" | "local";
  inTok: number;
  outTok: number;
  ms: number;
  data: DataKind[]; // kinds of personal data in the input (empty = none)
};

/** Totals per agent and model, for the UI and the run's summary. */
export function summarise(entries: LedgerEntry[]) {
  const by = new Map<string, { agent: LedgerEntry["agent"]; model: string; where: LedgerEntry["where"]; calls: number; inTok: number; outTok: number; ms: number; data: Set<DataKind> }>();
  for (const e of entries) {
    const k = `${e.agent}|${e.model}`;
    const cur = by.get(k) ?? { agent: e.agent, model: e.model, where: e.where, calls: 0, inTok: 0, outTok: 0, ms: 0, data: new Set<DataKind>() };
    cur.calls++;
    cur.inTok += e.inTok;
    cur.outTok += e.outTok;
    cur.ms += e.ms;
    e.data.forEach((d) => cur.data.add(d));
    by.set(k, cur);
  }
  return [...by.values()].map((x) => ({ ...x, data: [...x.data] }));
}
