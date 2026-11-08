"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Where you are in the case, kept in the address (`/case?step=3`) so reloading, the browser Back button and a shared link all keep your place.
 * "research" and "path" come before the steps; a number is one of the chosen path's steps. No `step` in the address means "wherever the case has got to".
 */
export type Stage = "research" | "path" | number;

const EVENT = "case-stage-change";

export function parseStage(v: string | null): Stage | null {
  if (v === "research" || v === "path") return v;
  return v && /^[1-9]$/.test(v) ? Number(v) : null;
}

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** The stage named in the address (or null), and a way to move: a new history entry, or `replace` to swap the current one. */
export function useStageParam(): [Stage | null, (s: Stage | null, replace?: boolean) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("step") ?? "",
    () => "",
  );
  const go = useCallback((s: Stage | null, replace = false) => {
    const url = new URL(window.location.href);
    if (s === null) url.searchParams.delete("step");
    else url.searchParams.set("step", String(s));
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [parseStage(raw || null), go];
}
