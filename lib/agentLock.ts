/**
 * One agent run at a time (2026-11-08). Each route that launches Elliot's browser claims the run first; a second start while
 * one is in progress gets 409 with a plain message, so a double click or a second step cannot start a second browser.
 *
 * Scope, on purpose:
 *  - One claim per request, not per tab: the compensation crew's parallel tabs and step 4's one-tab-per-firm all run inside one request.
 *  - Answers to the crew's questions, step 4's Send and the demo replays do not claim (they do not start a browser run).
 *  - The claim is released when the run ends OR when the page stops listening (refresh, restart). The old run is not stopped
 *    (as before), so a restart is never blocked. Stale claims expire after 20 minutes in case something never releases.
 * State lives on globalThis because Next.js may load this module once per route bundle in dev.
 */

type Run = { id: number; label: string; since: number };
const g = globalThis as typeof globalThis & { __agentRun?: Run | null; __agentRunNext?: number };
const STALE_MS = 20 * 60 * 1000;

export type Claim = { release: () => void };

/** Claim the run, or get what is already running. `label` finishes the sentence "Elliot is already ...". */
export function claimAgentRun(label: string): Claim | { busy: string } {
  const cur = g.__agentRun;
  if (cur && Date.now() - cur.since < STALE_MS) return { busy: cur.label };
  const id = (g.__agentRunNext = (g.__agentRunNext ?? 0) + 1);
  g.__agentRun = { id, label, since: Date.now() };
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      if (g.__agentRun?.id === id) g.__agentRun = null;
    },
  };
}

export function busyResponse(label: string): Response {
  return Response.json({ error: `Elliot is already ${label}. Wait for that to finish, then try again.` }, { status: 409 });
}
