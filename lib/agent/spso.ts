import path from "node:path";
import type { CaseFacts } from "./facts";
import type { Draft } from "./draft";
import { closeWhenSubmitted, dismissCookies, openSession } from "../browser";
import type { BrowserRun, Value } from "./browserAgent";
import { runDecisionAgent } from "./decisionAgent";
import { formatObservation, observe } from "./observe";
import { DOC_OPTION, spsoProblems, type SpsoAnswers } from "./spsoAnswers";

export { spsoProblems };
export type { SpsoAnswers };
import { makeLogger, type OnEvent } from "./events";
import { extraValues, type ExtraAnswers } from "./extra";

/** The SPSO online complaint form starts here (the checker at /form/complaint-checker links to it). */
export const SPSO_FORM = "https://forms.spso.org.uk/spso/form/delay/";

/** Things only known once the NHS has replied. Asked at this step, not during onboarding. */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Month and year of the earliest event, read in code from the timeline ("early July 2026", "2026-07-03"). Empty if it cannot be read. */
export function problemMonthYear(facts: CaseFacts): { month: string; year: string } {
  const first = facts.events[0]?.date ?? "";
  const year = first.match(/\b(20\d{2}|19\d{2})\b/)?.[1] ?? "";
  const iso = first.match(/\b\d{4}-(\d{2})-\d{2}\b/);
  const month = iso ? MONTHS[Number(iso[1]) - 1] ?? "" : MONTHS.find((m) => new RegExp(m.slice(0, 3), "i").test(first)) ?? "";
  return { month: year ? month : "", year: month ? year : "" };
}

/** The profile keeps one address string; the SPSO form wants lines and a town. Split on commas, never invent a part. */
export function splitAddress(address: string | null): { line1: string; town: string } {
  const parts = (address ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return { line1: parts[0] ?? "", town: parts.length > 1 ? parts[parts.length - 1] : "" };
}

export function spsoValues(facts: CaseFacts, draft: Draft, a: SpsoAnswers): Value[] {
  const when = problemMonthYear(facts);
  const addr = splitAddress(facts.address);
  return [
    { key: "problem_month", description: "Month the problem happened (from the timeline)", value: when.month },
    { key: "problem_year", description: "Year the problem happened (from the timeline)", value: when.year },
    { key: "read_confirmation", description: "The user confirms they have read the page (tick-box 'Please tick to confirm you have read this page'). Only present if they said yes", value: a.readConfirmed ? "confirmed" : "" },
    { key: "is_health_service", description: "Is the complaint about a health service? (NHS Lothian is a health service)", value: "Yes" },
    { key: "is_education", description: "Is the complaint or appeal about a higher or further education institution?", value: "No" },
    { key: "children_affected", description: "Were any children or young people under 18 affected?", value: a.childAffected ? "Yes" : "No" },
    { key: "court_action", description: "Has this matter been considered in court, or does the user plan to raise it in court?", value: a.courtAction ? "Yes" : "No" },
    { key: "complained_directly", description: "Has the user complained to the organisation directly? (yes: step 1 was done)", value: "Yes" },
    { key: "final_response_received", description: "Has the user had a final complaint response from the organisation? (yes: this step only opens after that)", value: "Yes" },
    { key: "letter_refers_to_spso", description: "Does the organisation's final response clearly refer the user to the SPSO?", value: a.letterMentionsSpso ? "Yes" : "No" },
    { key: "title", description: "Title, e.g. Ms", value: facts.title ?? "" },
    { key: "first_name", description: "First name (also called forenames or given names)", value: facts.firstName ?? "" },
    { key: "last_name", description: "Last name (also called surname or family name)", value: facts.lastName ?? "" },
    { key: "address_line_1", description: "First line of the address (house number and street)", value: addr.line1 },
    { key: "town", description: "Town or city", value: addr.town },
    { key: "postcode", description: "Postcode", value: facts.postcode ?? "" },
    { key: "phone", description: "Telephone", value: facts.phone ?? "" },
    { key: "email", description: "Email address", value: facts.email ?? "" },
    { key: "confirm_email", description: "Confirm email address (the same email typed again)", value: facts.email ?? "" },
    { key: "organisation", description: "The organisation complained about", value: "NHS Lothian" },
    { key: "nhs_reference", description: "NHS Lothian's complaint reference number", value: a.nhsReference },
    { key: "what_happened", description: "What the user thinks the organisation has done wrong: the full account of the complaint (the main text box, at least 20 words)", value: draft.details },
    { key: "where", description: "Where the care happened", value: draft.location },
    { key: "doc_final_response", description: "Final stage 2 response from the organisation: how the user will provide the document", value: DOC_OPTION[a.documents.finalResponse] },
    { key: "doc_stage1_response", description: "Do you have a stage 1 response from the organisation in writing?", value: DOC_OPTION[a.documents.stage1Response] },
    { key: "doc_own_complaint", description: "If you complained to the organisation in writing, do you have a copy of this to provide?", value: DOC_OPTION[a.documents.ownComplaint] },
    { key: "doc_other", description: "Any other additional complaint correspondence, e.g. a copy of an SAER/SCI", value: DOC_OPTION[a.documents.other] },
    { key: "other_reviews", description: "Has the complaint been subject to any other reviews, e.g. a Significant Adverse Event Review?", value: { yes: "Yes", no: "No", dont_know: "Don't know" }[a.otherReviews] },
    { key: "reported_to_regulator", description: "Has the user reported the matter to any regulators, e.g. the GMC or NMC?", value: a.reportedToRegulator ? "Yes" : "No" },
    { key: "impact", description: "How the matter has affected the user (in their own words)", value: a.impact },
    { key: "desired_outcome", description: "What would resolve the complaint / the outcome the user wants the ombudsman to achieve", value: a.outcome },
  ];
}

/** How the engine must behave on the SPSO form. Shared with the benchmark so both always agree. */
export const SPSO_AGENT_OPTIONS = {
  /** Only buttons labelled "Next" may be clicked: never "Save for later" and never "Send complaint". */
  advance: /^next\b/i,
  /** "Review and send": the user ticks the box and presses Send themselves. The agent touches nothing there. */
  stopAtUrl: /\/form\/review\/?$/,
  /** The first pages carry a "resume a saved complaint" login (email + password). Never type into it. */
  ignore: (el: { label: string }, url: string) => /\/form\/(delay|start)\/?$/.test(url) && /^(email address|password|continue complaint)$/i.test(el.label.trim()),
  maxSteps: 30,
};

export type SpsoResult = BrowserRun & { screenshot?: string; runDir: string };

/**
 * Walk the SPSO online complaint form page by page and STOP before the final submit.
 * Only buttons labelled "Next" may be clicked ("Save for later" and "Submit" never are).
 */
export async function fillSpsoComplaint(facts: CaseFacts, draft: Draft, answers: SpsoAnswers, opts: { onEvent?: OnEvent; keepOpen?: boolean; extra?: ExtraAnswers } = {}): Promise<SpsoResult> {
  const runDir = path.join(process.cwd(), ".runs", "spso-" + new Date().toISOString().replace(/[:.]/g, "-"));
  const emit = makeLogger(runDir, opts.onEvent);
  const { browser, page } = await openSession();
  let reviewing = false;
  try {
    emit({ type: "status", message: "Opening the SPSO complaint form" });
    await page.goto(SPSO_FORM, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await dismissCookies(page, 2500);

    const run = await runDecisionAgent({
      page,
      goal: "Complete the SPSO online complaint form page by page using the saved values, clicking Next to move on. Never click Save for later and never submit the complaint.",
      values: [...spsoValues(facts, draft, answers), ...extraValues(opts.extra)],
      allowCheckboxes: answers.readConfirmed,
      ...SPSO_AGENT_OPTIONS,
      onEvent: emit,
    });

    if (process.env.DEBUG_OBS) console.log(formatObservation(await observe(page)));
    const screenshot = path.join(runDir, "final.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    emit({ type: "done", status: run.status, summary: run.summary, unfilled: run.unfilled, question: run.question, screenshot });
    if (opts.keepOpen && process.env.HEADLESS !== "1") {
      reviewing = true;
      closeWhenSubmitted(page, browser); // the browser closes once the user has submitted
    }
    return { ...run, screenshot, runDir };
  } finally {
    if (!reviewing) await browser.close();
  }
}
