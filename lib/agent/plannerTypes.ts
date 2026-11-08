import type { EnquiryMessage, EnquiryOutcome } from "./enquiryTypes";
import type { Funding, Step3Event, Step3Result, Stats, TraceStep } from "./legalAidTypes";
import type { Draft } from "./draft";
import type { LedgerEntry } from "./ledgerSummary";
import type { Place, RouteMap } from "./routeTypes";

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
  // The complaint crew (D65): Elliot, Robin, Iona and Kit.
  read_process: "robin",
  check_time_limit: "robin",
  draft_complaint: "elliot",
  fill_complaint_form: "kit",
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

/**
 * Iona's pre-action investigation (night plan, side backlog 2): official, public material that a patient can cite,
 * found live on the pages of the place's own bodies. Every item has a quote that code found in the page text, and a
 * URL that was opened in the run. Where nothing was found, `nothing` says so; nothing is ever filled in.
 */
export type InvestigationLane = "decision" | "policy" | "inspection" | "public_record";
export type InvestigationItem = {
  lane: InvestigationLane;
  title: string; // the page's own title
  publisher: string; // the site's host
  url: string; // opened in this run
  quote: string; // checked word for word against the page text
  why: string; // one plain line on how it relates to the case; "" unless every number in it is in the quote
  fit: "close" | "partial";
  stance: "supports" | "neutral" | "against"; // for the complaint: only "supports" items are cited in the letter; the others are shown to the patient
};
export type Investigation = {
  items: InvestigationItem[];
  nothing: { lane: InvestigationLane; note: string }[]; // honest "not found" per lane, written by code from what was searched and opened
  searched: string[]; // the web searches run
  opened: string[]; // pages opened
  tookMs: number;
};

/** Evidence gathered by Iona, kept with the result (D48). */
export type EvidenceResult = {
  investigation?: Investigation;
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
  scheme?: { body: string; text: string; quote?: string; url: string }; // a redress / no-fault scheme read by Robin (night plan)
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

/** What the complaint crew found and did (D65): the route NHS Lothian describes, the time limit, the evidence, the draft, the form. */
export type ComplaintResult = {
  runId: string;
  runDir: string;
  plan: PlanStep[];
  thoughts: Thought[];
  turns: number;
  says: Say[];
  trace: TraceStep[];
  stats: Stats;
  asks: number;
  process?: { summary: string; steps: string[]; support: string; url: string };
  timeLimit?: { limit: string; status: "within" | "close" | "outside" | "unclear"; explanation: string; url: string };
  evidence: EvidenceResult;
  draft?: Draft;
  form: { status: "ready_to_submit" | "needs_input" | "incomplete" | "failed" | "not_started"; filled: { label: string; value: string }[]; unfilled: string[]; note: string; url: string; handedOff?: boolean };
  message?: string;
  stage?: "complaint" | "escalation";
};

/**
 * Step 2 anywhere (night plan, "Elliot anywhere"): taking the complaint to the independent body discovery found.
 * Where the patient is with step 1, as the app knows it (self-reported milestones, the complaint text, the reply).
 */
export type EscalationInput = { complaintSent: boolean; finalResponse: "yes" | "no" | "unknown"; complaintText?: string; providerReply?: string };

/** What the escalation crew found and prepared. Same shape as the complaint's, plus: can you go yet, and where it goes. */
export type EscalationResult = ComplaintResult & {
  stage: "escalation";
  body: string; // the independent body, as discovery named it
  provider: string; // who the complaint was made to first
  ready?: { status: "ready" | "not_yet" | "unclear"; when: string; explanation: string; include: string[]; url: string };
  sendTo?: { kind: "email" | "post"; address: string; quote: string; url: string }; // only from a code-checked quote on the body's own page
  subject?: string;
};

/** What discovery found (night plan, "Elliot anywhere"): the route map plus the crew's story. */
export type DiscoveryResult = {
  runId: string;
  runDir: string;
  route: RouteMap;
  plan: PlanStep[];
  thoughts: Thought[];
  says: Say[];
  turns: number;
  asks: number;
  trace: TraceStep[];
  stats: Stats;
};

export type PlannerEvent =
  | Step3Event
  | { type: "complaint_result"; result: ComplaintResult }
  | { type: "escalation_result"; result: EscalationResult }
  | { type: "model"; entry: LedgerEntry } // one model call (the ledger)
  | { type: "place"; place: Place } // where the patient's care happened, as read from their words
  | { type: "route"; route: RouteMap } // the route map so far (discovery)
  | { type: "discovery_result"; result: DiscoveryResult }
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
  | { type: "paused"; paused: boolean } // the user paused or resumed the crew
  | { type: "handoff"; id: string; crew: CrewId; tab: string; url: string; kind: "login" | "captcha" | "bot_check"; why: string }
  | { type: "handoff_done"; id: string; outcome: "continued" | "skipped" | "timeout" }
  | { type: "evidence"; evidence: EvidenceResult }
  | { type: "enquiry"; enquiry: EnquiryOutcome }
  | { type: "planner_result"; result: PlannerResult };
