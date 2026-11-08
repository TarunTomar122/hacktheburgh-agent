import type { CrewId } from "./plannerTypes";

/**
 * The route map (night plan, "Elliot anywhere"): how the system works for this patient's place, worked out live by
 * the crew. Client-safe. Every fact carries sources; a quote is `checked` only if code found it in that page's text.
 */

export type Place = {
  country: string; // "United Kingdom", "New Zealand"
  region: string; // "Wales", "England", "California", "" if none matters
  city: string;
  hospital: string; // where the care happened, as the patient said it
  careSetting: "public" | "private" | "unknown";
  why: string; // one line: how this was worked out from what the patient said
};

export type RouteKind = "complaint" | "escalation" | "compensation" | "funding" | "lawyers" | "guideline" | "advice" | "records";

export const ROUTE_KINDS: { kind: RouteKind; label: string; crew: CrewId; question: string }[] = [
  { kind: "complaint", label: "Complain", crew: "robin", question: "Who runs the hospital, how does a patient complain to them, by when, what are the stages and response times?" },
  { kind: "escalation", label: "If that fails", crew: "robin", question: "Who looks at it independently if the complaint answer is not good enough, when can you go, by when, and how do you apply?" },
  { kind: "compensation", label: "Compensation", crew: "robin", question: "How does a patient get compensation for harm from care here: court, a redress or no-fault scheme, conciliation? Limits, caps, conditions, how it starts, and the time limit for claiming." },
  { kind: "funding", label: "Paying for help", crew: "nell", question: "Does legal aid cover this kind of claim for an adult here? Is no win no fee allowed, with any cap? Is there free legal advice inside a scheme?" },
  { kind: "lawyers", label: "Finding a lawyer", crew: "robin", question: "Where do patients find a lawyer who does this work here?" },
  { kind: "guideline", label: "Clinical guidance", crew: "iona", question: "Which body publishes the clinical guidance doctors follow here?" },
  { kind: "advice", label: "Free help", crew: "robin", question: "Who gives patients free, independent help with this?" },
  { kind: "records", label: "Your records", crew: "robin", question: "How does a patient get a copy of their medical records here?" },
];

export type Source = { url: string; quote: string; checked: boolean; official: boolean; publisher: string };

/**
 * What a route step's evidence status is, in one stable shape, so later flows never re-derive it (night plan, round 5).
 * Computed by code in discovery's record_step; `evidenceOf(step)` gives the same shape for a step saved without it.
 *
 * Downstream rule (complaintAnywhere / escalationAnywhere / compensationAnywhere): use a step's `deadline`, `points`
 * and any number the model derives from it only when `evidence.confidence !== "unconfirmed"`; show "one official
 * source" wording when `confidence === "likely"` or `deadlineCheck === "one_site"`; say "sources differ" when
 * `deadlineCheck === "sources_differ"`; cite `evidence.official` (checked quotes from official pages) and never the
 * rest. For a number the model writes itself, call `vetClaim(text, step.sources, { requireSingle: true })` from
 * ./evidence-claims and use its `.text`.
 */
export type StepEvidence = {
  confidence: RouteStep["confidence"];
  deadlineCheck?: RouteStep["deadlineCheck"];
  deadlineOthers?: string[];
  /** Indexes into `sources` of quotes that code found in the page AND came from an official source: the only ones that back numbers. */
  official: number[];
  /** Checked in the page but not official (shown as background, back no number). */
  checkedOnly: number[];
  /** Not found in the page: ignored. */
  unchecked: number[];
  /** Distinct official hosts among `official`. */
  officialHosts: string[];
  /** Which `sources` back each claim's numbers (empty = the claim has no numbers). Absent claims were not kept. */
  claims?: { deadline?: number[]; what?: number[]; points?: (number[] | undefined)[] };
};

export type RouteStep = {
  kind: RouteKind;
  body: string; // who: "Cardiff and Vale University Health Board"
  what: string; // one plain sentence
  deadline?: string; // as the source says it
  deadlineCheck?: "two_sites" | "one_site" | "sources_differ"; // code: how many different official sites carry the deadline's numbers; or they disagree
  deadlineOthers?: string[]; // other periods for the same unit found in checked quotes, when sources differ
  how: "online_form" | "email" | "post" | "phone" | "login_required" | "court" | "unknown";
  url?: string; // the page or form the crew found
  wall?: string; // "needs a login", "CAPTCHA", "phone or post only"
  points?: string[]; // up to 6 key facts for the patient: time limits, stages and response times, caps, conditions, costs (each backed by a source)
  requires?: string[]; // what must happen first, in the source's terms ("the hospital's final response")
  appliesIf?: string; // when this route applies at all ("public hospital care", "harm worth more than ...")
  alternatives?: string[]; // other routes for the same need (a redress scheme instead of court)
  missing?: string[]; // facts we would still need from the patient to use it
  sources: Source[];
  confidence: "confirmed" | "likely" | "unconfirmed";
  evidence?: StepEvidence; // absent only on routes saved before round 5: use evidenceOf(step)
  by: CrewId;
};

export type RouteMap = { runId: string; place: Place; system: string; summary: string; steps: RouteStep[]; foundAt: string };

/** confirmed = checked quotes from official pages on two different sites; likely = one; unconfirmed = none. */
export function confidenceOf(sources: Source[]): RouteStep["confidence"] {
  const hosts = new Set(sources.filter((s) => s.checked && s.official).map((s) => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } }));
  return hosts.size >= 2 ? "confirmed" : hosts.size === 1 ? "likely" : "unconfirmed";
}

const hostOfUrl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** The step's evidence status in the stable shape (stored one if present, else derived from its sources). */
export function evidenceOf(step: Pick<RouteStep, "sources" | "confidence" | "deadlineCheck" | "deadlineOthers" | "evidence">): StepEvidence {
  if (step.evidence) return step.evidence;
  const idx = (f: (s: Source) => boolean) => step.sources.map((s, i) => (f(s) ? i : -1)).filter((i) => i >= 0);
  const official = idx((s) => s.checked && s.official);
  return {
    confidence: step.confidence,
    deadlineCheck: step.deadlineCheck,
    deadlineOthers: step.deadlineOthers,
    official,
    checkedOnly: idx((s) => s.checked && !s.official),
    unchecked: idx((s) => !s.checked),
    officialHosts: [...new Set(official.map((i) => hostOfUrl(step.sources[i].url)))],
  };
}
