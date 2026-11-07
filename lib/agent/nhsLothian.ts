import path from "node:path";
import type { CaseFacts } from "./facts";
import type { Draft } from "./draft";
import { dismissCookies, openSession } from "../browser";
import { runBrowserAgent, type BrowserRun, type Value } from "./browserAgent";
import { makeLogger, type OnEvent } from "./events";

export const NHS_LOTHIAN_FORM = "https://www.nhslothian.scot/yourrights/online-feedback-form/";

/** Everything the agent is allowed to type, with a plain description so it can match form labels. */
export function nhsValues(facts: CaseFacts, draft: Draft): Value[] {
  return [
    { key: "complaint_about", description: "Who the feedback is about: 'Me' or 'Someone Else'", value: facts.complainingFor === "someone_else" ? "Someone Else" : facts.complainingFor === "me" ? "Me" : "" },
    { key: "title", description: "Title, e.g. Ms (optional)", value: facts.title ?? "" },
    { key: "first_name", description: "First name", value: facts.firstName ?? "" },
    { key: "last_name", description: "Last name", value: facts.lastName ?? "" },
    { key: "address", description: "Address", value: facts.address ?? "" },
    { key: "postcode", description: "Postcode", value: facts.postcode ?? "" },
    { key: "phone", description: "Telephone", value: facts.phone ?? "" },
    { key: "email", description: "Email", value: facts.email ?? "" },
    { key: "preferred_contact", description: "How to communicate: Letter, Email or Phone Call", value: facts.preferredContact ?? "" },
    { key: "email_risk_consent", description: "The user explicitly agreed to the email-risk disclaimer checkbox (only present if they said yes)", value: facts.emailRiskAccepted === true ? "agreed" : "" },
    { key: "feedback_details", description: "Details of the feedback/complaint", value: draft.details },
    { key: "location_details", description: "Location the feedback relates to (hospital, ward, clinic)", value: draft.location },
    { key: "desired_outcome", description: "What the user would like to happen (optional)", value: draft.outcome },
  ];
}

export type Step1Result = BrowserRun & { screenshot?: string; runDir: string };

/**
 * Fill the NHS Lothian form in a visible browser and STOP before submitting.
 * Submitting is deliberately not implemented yet: it needs a human approval path and a decision on test data.
 */
export async function fillNhsComplaint(facts: CaseFacts, draft: Draft, opts: { onEvent?: OnEvent } = {}): Promise<Step1Result> {
  const runDir = path.join(process.cwd(), ".runs", new Date().toISOString().replace(/[:.]/g, "-"));
  const emit = makeLogger(runDir, opts.onEvent);
  const { browser, page } = await openSession();
  try {
    emit({ type: "status", message: "Opening the NHS Lothian form" });
    await page.goto(NHS_LOTHIAN_FORM, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea", { timeout: 20000 });
    await dismissCookies(page, 2500);

    const run = await runBrowserAgent({
      page,
      goal: "Fill in the NHS Lothian online feedback/complaint form using VALUES. Do not submit.",
      values: nhsValues(facts, draft),
      allowCheckboxes: facts.emailRiskAccepted === true,
      onEvent: emit,
    });

    const screenshot = path.join(runDir, "final.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    emit({ type: "done", status: run.status, summary: run.summary, unfilled: run.unfilled, question: run.question, screenshot });
    if (!process.env.HEADLESS) await page.waitForTimeout(4000); // leave the filled form visible
    return { ...run, screenshot, runDir };
  } finally {
    await browser.close();
  }
}
