import type { CrewId } from "./plannerTypes";

/** A sign-in or human check the patient may be asked to finish. Payment is never one of these. */
export type HandoffKind = "login" | "captcha" | "bot_check";

/** Which run is on screen. The sentence may only promise what this step actually does. */
export type HandoffFlow = "discovery" | "complaint" | "escalation" | "compensation";
export type HandoffStep = { flow: HandoffFlow; crew: CrewId };

export function flowOf(prefix: string): HandoffFlow {
  if (prefix === "complaint") return "complaint";
  if (prefix === "escalation") return "escalation";
  if (prefix === "step3" || prefix === "compensation") return "compensation";
  return "discovery";
}

export type HandoffInfo = {
  id: string;
  crew: CrewId;
  tab: string;
  url: string;
  kind: HandoffKind;
  why: string;
};

export const isHandoffKind = (kind: string): kind is HandoffKind => kind === "login" || kind === "captcha" || kind === "bot_check";

export function handoffHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "this site";
  }
}

/**
 * Staff and back-office consoles are never worth a hand-off. Matched on the address, title and headings only
 * (the words that mark an admin panel, including a "Secure Login" that belongs to one).
 */
const STAFF_RE = /\b(admin(?:istrator|istration)?|staff|intranet|back-?office|backoffice|employees?|management console|admin panel)\b/i;
const CONSOLE_RE = /\b(console|management|dashboard|cms|backend|back end)\b/i;

export function isStaffConsole(url: string, title: string, headings: string): boolean {
  let path = url;
  try {
    const u = new URL(url);
    path = decodeURIComponent(`${u.pathname} ${u.search}`);
  } catch {
    /* keep the raw string */
  }
  const blob = `${path} ${title} ${headings}`;
  if (STAFF_RE.test(blob)) return true;
  if (/secure\s*login/i.test(blob) && CONSOLE_RE.test(blob)) return true;
  return false;
}

/**
 * The one sentence for this step, in the second person. Discovery only finds or reads. The complaint step fills,
 * and the person presses Submit. Escalation reads the ombudsman's rules or reaches their form. Compensation
 * searches the register or reaches an enquiry form. Nothing here is sent or filed by the crew.
 */
export function handoffLine(step: HandoffStep, kind: HandoffKind): string {
  const act = kind === "login" ? "sign in" : "solve the check";
  const who = CREW_NAME[step.crew];
  const next = NEXT[step.flow][step.crew] ?? NEXT[step.flow].kit;
  return `This site wants you to ${act} before ${who} can ${next}.`;
}

const CREW_NAME: Record<CrewId, string> = { elliot: "Elliot", nell: "Nell", robin: "Robin", iona: "Iona", kit: "Kit" };

/** What that crew member is allowed to do in this step. The words after "can ". */
const NEXT: Record<HandoffFlow, Partial<Record<CrewId, string>> & { kit: string }> = {
  discovery: { kit: "reach the complaint form behind it", robin: "read the rules behind it", iona: "read the guidance behind it", nell: "read how help with costs works" },
  complaint: { kit: "fill in your complaint form (you press Submit yourself)", robin: "read this body's rules", iona: "read the guidance behind it", nell: "read how help with costs works" },
  escalation: { kit: "reach their form", robin: "read the ombudsman's rules", iona: "read the guidance behind it", nell: "read how help with costs works" },
  compensation: { kit: "reach the firm's enquiry form", robin: "search the register", iona: "read the guidance behind it", nell: "read how help with costs works" },
};

/**
 * The one sentence shown to the person. Second person, about 20 words, naming only this step's next action.
 * Vague, third-person, or a promise the step does not keep means: do not hand off.
 */
export function concreteBenefit(why: string, step?: HandoffStep): string | null {
  const clean = why.replace(/\s+/g, " ").trim();
  const one = (clean.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? clean).trim();
  const words = one.replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 8 || words.length > 22) return null;
  if (!/\byou\b/i.test(one)) return null;
  if (/\bpatient\b/i.test(one) || STAFF_RE.test(one)) return null;
  if (/\b(send|sent|file|filed|filing)\b/i.test(one)) return null;
  if (/\bsubmit/i.test(one) && !/you press Submit yourself/i.test(one)) return null;
  if (step && !actionFits(one, step)) return null;
  if (!step && !/\bcan (reach|read|fill in|search)\b/i.test(one)) return null;
  return one;
}

function actionFits(one: string, step: HandoffStep): boolean {
  const next = NEXT[step.flow][step.crew];
  if (!next) return false;
  const name = CREW_NAME[step.crew];
  if (!new RegExp(`${name} can ${escapeRe(next)}`).test(one)) return false;
  if (step.flow === "discovery" && /\bfill in\b/i.test(one)) return false;
  if (step.flow !== "complaint" && /\bfill in your complaint\b/i.test(one)) return false;
  if (step.flow !== "compensation" && step.crew === "robin" && /\bsearch the register\b/i.test(one)) return false;
  return true;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
