import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";
import path from "node:path";

/**
 * The model ledger (night plan, Phase 4b). Every model call in a run is written down: which agent made it, which
 * model, local or cloud, tokens in and out, time, and what kinds of the patient's data went into it. The run's
 * context (run, emitter, current crew member) travels with the async call chain, so call sites stay unchanged.
 */

import type { DataKind, LedgerEntry } from "./ledgerSummary";
export type { DataKind, LedgerEntry } from "./ledgerSummary";
export { summarise } from "./ledgerSummary";

type Ctx = { runId?: string; runDir?: string; agent?: LedgerEntry["agent"]; emit?: (e: { type: "model"; entry: LedgerEntry }) => void; t0?: number };
const store = new AsyncLocalStorage<Ctx>();

/** What each crew member may see by design (used when a call site does not say). */
export const SEES: Record<LedgerEntry["agent"], DataKind[]> = {
  elliot: ["place", "health"], // the planner reads the story (no names, no contact details) to plan
  robin: ["place"],
  iona: ["health"],
  nell: [], // her calls read public pages; the one that carries your answers (the checker's questions) says "money" itself
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
export const currentRunId = () => store.getStore()?.runId;

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

