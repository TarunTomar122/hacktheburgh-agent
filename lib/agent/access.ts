import { appendFileSync } from "node:fs";
import path from "node:path";
import { ledgerCtx } from "./ledger";

/**
 * How the crew got at the web, one line per page, search or browser job (the "browser use, smartly" log).
 *   fetch:   read with a plain HTTP request, no browser (fast)
 *   api:     a search API (Linkup) found the pages, no search engine opened
 *   cache:   answered from an earlier run's saved search
 *   browser: a real browser was needed, and `reason` says why (a script-built page, a bot check, a form to fill...)
 * Written to the run folder (access.ndjson) and streamed to the screen. Never holds patient data: only web addresses and reasons.
 */
export type Access = {
  t: number;
  agent: string;
  via: "fetch" | "api" | "cache" | "browser";
  kind: "page" | "firm" | "search" | "task";
  reason: string;
  url?: string;
  ms?: number;
};

export function recordAccess(a: Omit<Access, "t" | "agent"> & { agent?: string }) {
  const ctx = ledgerCtx();
  const entry: Access = { t: Date.now() - (ctx.t0 ?? Date.now()), agent: a.agent ?? ctx.agent ?? "system", ...a };
  (ctx.emit as unknown as ((e: { type: "access"; entry: Access }) => void) | undefined)?.({ type: "access", entry });
  if (ctx.runDir) {
    try {
      appendFileSync(path.join(ctx.runDir, "access.ndjson"), JSON.stringify(entry) + "\n");
    } catch {
      /* the log must never stop a run */
    }
  }
  return entry;
}
