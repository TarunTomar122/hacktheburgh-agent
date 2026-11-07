import type { Step3Event, Step3Result } from "./legalAidTypes";

/**
 * Planner agent contract (D47). Client-safe.
 * A reasoning model plans its own route through the compensation research (and, later, the enquiries), calling
 * browser workers as tools. It shows its plan, explains each move in one line, and asks the user when a site needs
 * something we do not know.
 *
 * POST /api/agent/plan        { facts, funding? }  -> NDJSON PlannerEvent (first event: {type:"run", runId})
 * POST /api/agent/plan/answer { runId, id, answer } -> { ok }   (answer = string, or null to skip)
 */

export type PlanStep = {
  id: string;
  text: string; // "Check what SLAB's calculator says"
  status: "todo" | "doing" | "done" | "dropped";
  why?: string; // one line, shown when expanded
};

/** A question from the agent to the user. `kind` decides the input shown. */
export type AskSpec = {
  id: string;
  agent: string; // who is asking: "Planner", "SLAB calculator"
  question: string;
  why: string; // why it needs this, one line
  kind: "yes_no" | "choice" | "text" | "money" | "number";
  options?: string[]; // for "choice"
};

/** One move of the planner: the tool it chose and why. `detail` is the arguments / result, shown collapsed. */
export type Thought = { i: number; t: number; text: string; tool?: string; detail?: string; result?: string };

export type PlannerResult = Step3Result & { plan: PlanStep[]; thoughts: Thought[]; turns: number };

export type PlannerEvent =
  | Step3Event
  | { type: "run"; runId: string }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "thought"; thought: Thought }
  | { type: "ask"; ask: AskSpec }
  | { type: "answered"; id: string; answer: string | null }
  | { type: "finding"; text: string; source?: string }
  | { type: "planner_result"; result: PlannerResult };
