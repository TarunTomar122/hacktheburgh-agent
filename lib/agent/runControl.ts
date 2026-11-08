import type { Browser } from "playwright";
import { currentRunId } from "./ledger";

/**
 * Explicit stop for a run. A run only ends when it finishes or when the user cancels or restarts it (never because
 * a browser tab went away). Cancelling marks the run, closes its browsers (so any tool in flight fails fast) and the
 * next model call of that run throws. State sits on globalThis so Next.js hot reloads do not lose it.
 */

type Control = { cancelled: Set<string>; browsers: Map<string, Set<Browser>> };
const g = globalThis as typeof globalThis & { __runControl?: Control };
const control = (g.__runControl ??= { cancelled: new Set(), browsers: new Map() });

export class RunCancelled extends Error {
  constructor() {
    super("The run was stopped");
  }
}

export const isCancelled = (runId?: string) => !!runId && control.cancelled.has(runId);

/** Called inside a run's async context before any model call: throws if the user stopped this run. */
export function throwIfCancelled() {
  if (isCancelled(currentRunId())) throw new RunCancelled();
}

/** Remember a browser launched for the current run, so cancelling can close it. Closes at once if already cancelled. */
export function registerBrowser(browser: Browser) {
  const runId = currentRunId();
  if (!runId) return;
  if (isCancelled(runId)) {
    void browser.close().catch(() => {});
    throw new RunCancelled();
  }
  const set = control.browsers.get(runId) ?? new Set();
  set.add(browser);
  control.browsers.set(runId, set);
  browser.on("disconnected", () => {
    set.delete(browser);
    if (!set.size) control.browsers.delete(runId);
  });
}

/** Mark the run cancelled and close its browsers. Returns false if it was already cancelled. */
export function cancelRunWork(runId: string): boolean {
  if (control.cancelled.has(runId)) return false;
  control.cancelled.add(runId);
  for (const b of control.browsers.get(runId) ?? []) void b.close().catch(() => {});
  control.browsers.delete(runId);
  return true;
}
