"use client";

import { useEffect, useRef, useState } from "react";
import { advance, inputFrom, shownPct, startProgress, type ProgressShape } from "./runProgress";

/**
 * The run's progress as a whole percent (0 to 100), honest and never going backwards (see runProgress.ts).
 * Reads the run state it is given; keeps its own small tracker and re-reads it twice a second and whenever the run changes.
 */
export function useRunProgress(state: Parameters<typeof inputFrom>[0], shape: ProgressShape): number {
  const [p, setP] = useState(() => startProgress());
  const latest = useRef({ state, shape });
  useEffect(() => {
    latest.current = { state, shape };
    // Tick from a timer, not in the effect body: the screen's state is the source and the tracker only follows it.
    const t = setTimeout(() => setP((prev) => advance(prev, inputFrom(latest.current.state, latest.current.shape), Date.now())), 0);
    return () => clearTimeout(t);
  }, [state, shape]);
  useEffect(() => {
    const t = setInterval(() => setP((prev) => advance(prev, inputFrom(latest.current.state, latest.current.shape), Date.now())), 500);
    return () => clearInterval(t);
  }, []);
  // Never backwards across navigation either: the highest percent this run has shown is kept for the browser session, and a
  // finished run is 100% (coming back to a screen replays the run quickly, which would otherwise start the estimate low again).
  const run = (state as { runId?: string; status?: string }).runId;
  const done = (state as { status?: string }).status === "done";
  const shown = shownPct(p);
  const key = run ? `run-progress:${run}` : "";
  let floor = 0;
  if (key && typeof window !== "undefined") {
    try {
      floor = Number(sessionStorage.getItem(key) ?? 0) || 0;
    } catch {}
  }
  const value = done ? 100 : Math.max(shown, floor);
  useEffect(() => {
    if (!key || value <= floor) return;
    try {
      sessionStorage.setItem(key, String(value));
    } catch {}
  }, [key, value, floor]);
  return value;
}
