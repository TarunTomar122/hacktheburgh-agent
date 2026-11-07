import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";
import path from "node:path";
import type { CrewId } from "./plannerTypes";

/**
 * The model ledger (night plan, Phase 4b). Every model call in a run is written down: which agent made it, which
 * model, local or cloud, tokens in and out, time, and what kinds of the patient's data went into it. The run's
 * context (run, emitter, current crew member) travels with the async call chain, so call sites stay unchanged.
 */

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

type Ctx = { runId?: string; runDir?: string; agent?: LedgerEntry["agent"]; emit?: (e: { type: "model"; entry: LedgerEntry }) => void; t0?: number };
const store = new AsyncLocalStorage<Ctx>();

/** What each crew member may see by design (used when a call site does not say). */
export const SEES: Record<LedgerEntry["agent"], DataKind[]> = {
  elliot: ["place"],
  robin: ["place"],
  iona: ["health"],
  nell: ["money"],
  kit: ["identity"],
  onboarding: ["identity", "health"],
  system: [],
};

/** Run `fn` with ledger context. Nested calls inherit the run and override only what they set (e.g. the agent). */
export function withLedger<T>(patch: Ctx, fn: () => T): T {
  return store.run({ ...(store.getStore() ?? {}), ...patch }, fn);
}

/** Set the ledger context for the rest of this async function (a run's top level). */
export function enterLedger(ctx: Ctx) {
  store.enterWith({ ...(store.getStore() ?? {}), ...ctx });
}

export const currentAgent = () => store.getStore()?.agent ?? "system";

export function record(e: Omit<LedgerEntry, "t" | "agent" | "data" | "where"> & { agent?: LedgerEntry["agent"]; data?: DataKind[]; where?: LedgerEntry["where"] }) {
  const ctx = store.getStore() ?? {};
  const agent = e.agent ?? ctx.agent ?? "system";
  const entry: LedgerEntry = { t: Date.now() - (ctx.t0 ?? Date.now()), where: e.where ?? (e.model.startsWith("local:") ? "local" : "cloud"), ...e, agent, data: e.data ?? SEES[agent] };
  ctx.emit?.({ type: "model", entry });
  if (ctx.runDir) {
    try {
      appendFileSync(path.join(ctx.runDir, "ledger.ndjson"), JSON.stringify(entry) + "\n");
    } catch {
      /* the ledger must never stop a run */
    }
  }
  return entry;
}

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
