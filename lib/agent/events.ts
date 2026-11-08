import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fromEvents, type Effort, type TimedEvent } from "./effort";

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "observe"; step: number; url: string; fields: number }
  | { type: "action"; step: number; tool: string; args: unknown; result: string }
  | { type: "blocked"; step: number; reason: string }
  | { type: "done"; status: RunStatus; summary: string; unfilled: string[]; question?: string; screenshot?: string; effort?: Effort };

export type RunStatus = "ready_to_submit" | "needs_input" | "incomplete" | "max_steps";
export type OnEvent = (e: AgentEvent) => void;

/**
 * Fan events out to a callback (UI) and a JSONL file (debugging, demo evidence).
 * Patient insights: the logger also keeps this run's events and adds what Elliot did (`effort`) to the `done` event,
 * counted only from what was logged. `step` is the case step the run belongs to (1 NHS, 2 ombudsman, 6 Yellow Card).
 */
export function makeLogger(runDir: string, onEvent?: OnEvent, step = 0): OnEvent {
  mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, "events.jsonl");
  const seen: TimedEvent[] = [];
  return (e) => {
    const t = Date.now();
    seen.push({ t, e });
    const out = e.type === "done" ? { ...e, effort: fromEvents(seen, step) } : e;
    appendFileSync(file, JSON.stringify({ t: new Date(t).toISOString(), ...out }) + "\n");
    onEvent?.(out);
  };
}
