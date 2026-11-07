import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "observe"; step: number; url: string; fields: number }
  | { type: "action"; step: number; tool: string; args: unknown; result: string }
  | { type: "blocked"; step: number; reason: string }
  | { type: "done"; status: RunStatus; summary: string; unfilled: string[]; question?: string; screenshot?: string };

export type RunStatus = "ready_to_submit" | "needs_input" | "incomplete" | "max_steps";
export type OnEvent = (e: AgentEvent) => void;

/** Fan events out to a callback (UI) and a JSONL file (debugging, demo evidence). */
export function makeLogger(runDir: string, onEvent?: OnEvent): OnEvent {
  mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, "events.jsonl");
  return (e) => {
    appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), ...e }) + "\n");
    onEvent?.(e);
  };
}
