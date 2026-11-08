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
  return shownPct(p);
}
