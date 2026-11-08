import { z } from "zod";

/**
 * Step 3 contract: "Can I get legal aid?" plus "who could take my case".
 * Client-safe (no Playwright imports). The backend (lib/agent/legalAid.ts, /api/agent/step3) produces these;
 * the frontend (app/case/LegalAidStep.tsx and the live grid) consumes them. Change this file only by agreement.
 */

/**
 * What SLAB's civil legal aid calculator asks (read from the live page on 2026-11-07). Asked on step 3 only.
 * If `onBenefits` is true the user automatically qualifies financially and nothing else is needed.
 * `skipped` = the user chose not to give money details; we then assume "no win, no fee" and skip the calculator.
 */
export const Funding = z.object({
  onBenefits: z.boolean().nullable(), // Income Support, income-based JSA, income-related ESA or Universal Credit
  partner: z.boolean().nullable(),
  dependants: z.number().int().min(0).max(10).nullable(),
  netIncomeYearly: z.number().min(0).nullable(), // pounds, after tax
  outgoingsYearly: z.number().min(0).nullable(), // pounds
  savings: z.number().min(0).nullable(), // pounds; the calculator calls it "Total disposable capital"
  skipped: z.boolean(),
});
export type Funding = z.infer<typeof Funding>;

export const EMPTY_FUNDING: Funding = {
  onBenefits: null,
  partner: null,
  dependants: null,
  netIncomeYearly: null,
  outgoingsYearly: null,
  savings: null,
  skipped: false,
};

/** The funding questions still to ask, in order. Empty = ready to run. */
export function fundingMissing(f: Funding): (keyof Funding)[] {
  if (f.skipped || f.onBenefits === true) return [];
  if (f.onBenefits === null) return ["onBenefits"];
  const order: (keyof Funding)[] = ["partner", "dependants", "netIncomeYearly", "outgoingsYearly", "savings"];
  return order.filter((k) => f[k] === null);
}

/**
 * What the calculator said. Never shown as "you qualify": the honest line is
 * "you may qualify financially; a solicitor applies for you, and SLAB also checks the case has merit".
 */
export type Verdict = "likely" | "unlikely" | "unknown" | "skipped";

/** How the money side would most likely work, which decides which firms step 4 contacts. */
export type Route = "legal_aid" | "no_win_no_fee";

export type Tri = "yes" | "no" | "unknown";

/** One firm, merged from every site that mentioned it. */
export type FirmFinding = {
  id: string; // stable slug of the firm name
  name: string;
  town: string;
  distanceMiles: number | null;
  distanceOrigin?: string; // from SLAB's finder
  website: string | null;
  email: string | null;
  phone: string | null;
  sources: ("slab" | "lawsoc" | "website" | "search")[]; // "search": found by a web search (its own site still has to be checked)
  legalAid: boolean; // registered with SLAB for civil legal aid, medical negligence
  activeRecently: boolean; // SLAB "active in the last 12 months" filter
  actsForPatients: Tri; // read from the firm's own site; "no" = defends the NHS or insurers
  noWinNoFee: Tri; // read from the firm's own site
  enquiryUrl: string | null; // where step 4 would fill in their form
  score: number; // higher is better; see `reasons`
  reasons: string[]; // plain words, shown to the user ("Takes legal aid", "Office 0.9 miles away")
  excluded: string | null; // why we dropped it, if we did
  /** How the score is made up, one row per criterion. Sum of `points` = `score`. */
  breakdown?: ScoreItem[];
  /** score / maximum possible score for this route, 0-100. "How well this firm fits what you need". NOT a chance of winning. */
  fit?: number;
};

/** One row of a firm's score: what we checked, what we found, and the evidence. */
export type ScoreItem = {
  key: "legal_aid" | "active" | "distance" | "lawsoc" | "patients" | "nwnf" | "form" | "checked";
  label: string; // "Acts for patients"
  points: number; // what the firm got
  max: number; // what it could have got
  status: Tri; // yes = met, no = not met, unknown = could not tell
  evidence: string; // "The model read their medical negligence page: yes (confidence 0.93)"
};

/**
 * One thing an agent did. The whole run is a list of these, so the UI can show exactly how each firm was
 * found and checked. `firms` lists the firm ids the step is about; `shot` is a screenshot file served by
 * GET /api/agent/step3/shot?run=<runId>&file=<shot>.
 */
export type TraceStep = {
  i: number; // order
  t: number; // ms since the run started
  agent: string; // tile label, e.g. "SLAB lawyer list"
  color: string;
  kind: "open" | "click" | "type" | "pick" | "decide" | "read" | "found" | "check" | "recover" | "fail" | "result";
  text: string; // one plain line: "Clicked 'Medical Negligence'"
  url?: string;
  detail?: string; // longer text: the links it chose between, the page excerpt it read, the model's answers
  confidence?: number; // for model decisions, 0-1
  shot?: string;
  firms?: string[];
};

export type Step3Result = {
  verdict: Verdict;
  route: Route;
  calculatorText: string; // the calculator's own words, quoted
  firms: FirmFinding[]; // everything we looked at, best first
  shortlist: string[]; // ids of the top 3
  stats: Stats;
  runDir: string;
  runId?: string; // for screenshot URLs
  trace?: TraceStep[]; // everything every agent did, in order
};

export type Stats = { agents: number; sites: number; pages: number; actions: number; quick?: number };

/** One browser agent working in its own tab. Shown as a tile in the live grid and a row in the step's log. */
export type AgentTile = {
  id: string; // also the live-view pageId
  label: string; // "SLAB calculator", "Drummond Miller website"
  color: string; // cursor and tile accent, a hex from AGENT_COLORS
  url: string;
  state: "starting" | "working" | "done" | "failed";
  note: string; // "Typing income", "Read 38 firms", "Timed out"
};

/** Cursor colours, one per agent, in order. Distinct on white and on the brand blue. */
export const AGENT_COLORS = ["#0060df", "#8600fa", "#e64d00", "#009587", "#d6336c", "#5c6f00"];

/**
 * Newline-delimited JSON from POST /api/agent/step3 { facts, funding }.
 * Order: agent/stats/firm events while it runs, then exactly one "result" or "error".
 */
export type Step3Event =
  | { type: "status"; message: string }
  | { type: "agent"; tile: AgentTile }
  | { type: "stats"; stats: Stats }
  | { type: "firm"; firm: FirmFinding }
  | { type: "trace"; step: TraceStep }
  | { type: "result"; result: Step3Result }
  | { type: "error"; message: string };
