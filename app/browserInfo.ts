/** A trace line, as much as the browsers' info panel needs. The run screen sends the trace with window event "live-trace". */
export type TraceLite = { agent: string; kind: string; text: string };
/** What one browser did: pages opened, clicks, and the answers it typed or chose (so you can see what you would have had to enter yourself). */
export type Summary = { pages: number; clicks: number; entered: string[]; /** What the crew member reported from this browser: what we learned. */ learned: string[] };
/** Ids of browsers kept on screen after their run ("old<run>-<id>"). */
export const KEPT = "old";

export function summarize(trace: TraceLite[], label: string): Summary {
  const mine = trace.filter((t) => t.agent === label);
  return {
    pages: mine.filter((t) => t.kind === "open" || t.kind === "read").length,
    clicks: mine.filter((t) => t.kind === "click").length,
    entered: mine.filter((t) => t.kind === "type" || t.kind === "pick").map((t) => t.text),
    learned: mine.filter((t) => t.kind === "learned").map((t) => t.text),
  };
}
