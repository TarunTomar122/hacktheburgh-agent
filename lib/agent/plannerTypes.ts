import type { EnquiryMessage, EnquiryOutcome } from "./enquiryTypes";
import type { Funding, Step3Event, Step3Result } from "./legalAidTypes";

/**
 * Planner agent contract (D47). Client-safe.
 * A reasoning model plans its own route through the compensation research (and, later, the enquiries), calling
 * browser workers as tools. It shows its plan, explains each move in one line, and asks the user when a site needs
 * something we do not know.
 *
 * POST /api/agent/plan        { facts, funding? }  -> NDJSON PlannerEvent (first event: {type:"run", runId})
 * POST /api/agent/plan/answer { runId, id, answer } -> { ok }   (answer = string, or null to skip)
 */

/**
 * The crew (D48): the planner and its workers, each with a name, a role and a colour. Every tool belongs to one of
 * them, so the user sees a team at work rather than a script. Visual identity lives in the UI; ids are stable.
 */
export type CrewId = "elliot" | "nell" | "robin" | "iona" | "kit";
/** Order matters: it is the order of the crew strip. Colours are palette tokens (docs/DESIGN.md); see app/case/crew for the marks. */
export const CREW: Record<CrewId, { name: string; role: string; color: string }> = {
  elliot: { name: "Elliot", role: "Leads your case", color: "#0060df" },
  nell: { name: "Nell", role: "Funding", color: "#e64d00" },
  robin: { name: "Robin", role: "Finds and checks solicitors", color: "#525252" },
  iona: { name: "Iona", role: "Clinical evidence", color: "#8600fa" },
  kit: { name: "Kit", role: "Enquiries", color: "#181818" },
};
/** Which crew member runs each planner tool. */
export const TOOL_CREW: Record<string, CrewId> = {
  update_plan: "elliot",
  ask_user: "elliot",
  shortlist: "elliot",
  finish: "elliot",
  slab_calculator: "nell",
  slab_lawyer_list: "robin",
  web_search: "robin",
  visit: "robin",
  check_firm: "robin", // one agent for solicitors (Tarun, D62): Robin finds and checks them
  law_society_check: "robin",
  read_guideline: "iona",
  search_case_law: "iona",
  read_judgment: "iona",
  compare_care: "iona",
  fill_enquiry: "kit",
};

/** One line in the crew's conversation: Elliot assigns, a worker reports, someone asks you. */
export type Say = {
  i: number;
  t: number;
  from: CrewId;
  to?: CrewId | "you";
  kind: "assign" | "report" | "plan" | "ask" | "note" | "done";
  text: string;
  detail?: string;
  tool?: string;
  tab?: string; // the worker tab label, to match its trace steps exactly
  ok?: boolean; // reports: false when the worker failed (never shown as a success)
  replan?: boolean; // plan: the plan changed because of something learned (not the first plan)
  facts?: { label: string; value: "yes" | "no" | "unknown" }[]; // reports: structured findings (e.g. a firm check)
  firm?: string; // reports: the firm this is about
};

/** Evidence gathered by Iona, kept with the result (D48). */
export type EvidenceResult = {
  guideline?: { name: string; url: string; points: { id: string; text: string }[] };
  gaps?: { guideline: string; timeline: string; question: string }[];
  caveat?: string;
  cases?: { title: string; url: string; year: string; court: string; kind: string; summary: string; award: string }[];
};

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
  crew?: CrewId;
  question: string;
  why: string; // why it needs this, one line
  kind: "yes_no" | "choice" | "text" | "money" | "number";
  options?: string[]; // for "choice"
};

/** One move of the planner: the tool it chose and why. `detail` is the arguments / result, shown collapsed. */
export type Thought = { i: number; t: number; text: string; tool?: string; detail?: string; result?: string; tab?: string };

export type PlannerResult = Step3Result & {
  funding?: Funding; // optional for older recorded runs
  message?: EnquiryMessage; // the message Kit actually put in the forms
  plan: PlanStep[];
  thoughts: Thought[];
  turns: number;
  says: Say[];
  evidence: EvidenceResult;
  enquiries: EnquiryOutcome[];
  asks: number;
  recoveries: number;
};

export type PlannerEvent =
  | Step3Event
  | { type: "run"; runId: string }
  | { type: "funding"; funding: Funding }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "thought"; thought: Thought }
  | { type: "ask"; ask: AskSpec }
  | { type: "answered"; id: string; answer: string | null }
  | { type: "finding"; text: string; source?: string; crew?: CrewId }
  | { type: "say"; say: Say }
  | { type: "crew"; id: CrewId; state: "idle" | "working" | "waiting" | "done"; note: string }
  | { type: "spotlight"; crew: CrewId; tab: string } // the worker to show big right now (D62)
  | { type: "evidence"; evidence: EvidenceResult }
  | { type: "enquiry"; enquiry: EnquiryOutcome }
  | { type: "planner_result"; result: PlannerResult };
