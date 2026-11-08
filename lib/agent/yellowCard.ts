import path from "node:path";
import type { Page } from "playwright";
import type { CaseFacts } from "./facts";
import { closeWhenSubmitted, dismissCookies, openSession } from "../browser";
import type { BrowserRun, Value } from "./browserAgent";
import { runDecisionAgent } from "./decisionAgent";
import { decide, probOf } from "./decisions";
import { makeLogger, type OnEvent } from "./events";
import { extraValues, type ExtraAnswers } from "./extra";
import { problemMonthYear, splitAddress } from "./spso";
import { KIND_LABEL, YELLOW_CARD_SITE, type YellowCardAnswers } from "./yellowCardAnswers";

/**
 * Step 6 (proposed, feature/yellow-card): fill the MHRA Yellow Card report and STOP before it is sent.
 *
 * Seen on the live site 2026-11-07 (nothing sent): the home page has a product search box whose suggestions are
 * role=option items grouped by Medicine / Vaccine / Device; "Start report" opens /report-guide (member of the public
 * or professional; side effect / fake / defective), then /about-you (who it relates to, name, email, postcode,
 * optional address and phone, a contact-method checkbox, a required privacy checkbox, an optional "Set Password"
 * with a Register button, and "Continue without registering"). Pages after /about-you were NOT seen.
 */

const MAX_OPTIONS = 40;

/** Pages that come before the report's own questions. Finishing on one of these is never "ready". */
const EARLY_PAGE = /yellowcard\.mhra\.gov\.uk\/(\?|$|report-guide|about-you)/;

/** Never typed into or clicked: account creation, sign-in, and anything that would send the report. */
// "Continue without registering" is the button we need, so "register" only counts when not preceded by "without" (run 2026-11-08 00:03 hid it).
const FORBIDDEN = /password|(?<!without )register|sign ?in|log ?in|\bsubmit\b|\bsend\b|save (and|for)/i;

export const YELLOW_CARD_AGENT_OPTIONS = {
  /** Only these submit-type buttons move the form on. "Register" and any submit/send button are never in this list. */
  advance: /^(next step|next|continue without registering|continue)\b/i,
  /** Guesses at the final check page (not seen yet). The FORBIDDEN filter below is the real guard. */
  stopAtUrl: /\/(review|summary|check-your-answers|declaration|confirm)/i,
  ignore: (el: { label: string; name: string; kind: string }) => FORBIDDEN.test(el.label) || /password/i.test(el.name),
  maxSteps: 30,
};

export function yellowCardValues(facts: CaseFacts, a: YellowCardAnswers): Value[] {
  const addr = splitAddress(facts.address);
  const when = problemMonthYear(facts);
  const first = facts.events[0];
  return [
    { key: "reporter_type", description: "Is the user a member of the public or a healthcare professional?", value: "Member of the public" },
    { key: "report_relates_to", description: "What the report relates to (side effect, fake product or defective product)", value: KIND_LABEL[a.kind] },
    { key: "who_affected", description: "Who the report relates to: the user themselves ('You') or someone else", value: facts.complainingFor === "someone_else" ? "Someone else" : "You" },
    { key: "product", description: "The medicine, vaccine or device being reported, as the user named it", value: a.product },
    // Report step 1 ("Whose side effect") needs at least one of initials, sex or age; initials come from the name in code.
    { key: "patient_initials", description: "Patient initials (of the person who had the problem)", value: facts.complainingFor === "someone_else" ? "" : [facts.firstName, facts.lastName].map((n) => n?.trim()[0]?.toUpperCase() ?? "").join("") },
    { key: "title", description: "Title, e.g. Ms", value: facts.title ?? "" },
    { key: "first_name", description: "First name", value: facts.firstName ?? "" },
    { key: "last_name", description: "Last name", value: facts.lastName ?? "" },
    { key: "email", description: "Email address", value: facts.email ?? "" },
    { key: "address_line_1", description: "First line of the address (house number and street)", value: addr.line1 },
    { key: "town", description: "Town or city", value: addr.town },
    { key: "postcode", description: "Postcode", value: facts.postcode ?? "" },
    // The site rejects spaces ("Invalid phone number. Only digits are accepted", run 2026-11-08 00:05), so digits only.
    { key: "phone", description: "Telephone number (digits only)", value: (facts.phone ?? "").replace(/\D/g, "") },
    { key: "phone_country", description: "Telephone country code", value: facts.phone ? "United Kingdom (+44)" : "" },
    { key: "contact_method", description: "The one method the user prefers the MHRA to contact them with", value: facts.email ? "Email" : "" },
    { key: "privacy_agreed", description: "The user agrees that their report is handled in line with the MHRA privacy policy (tick-box). Only present if they said yes", value: a.privacyAgreed ? "agreed" : "" },
    { key: "what_happened", description: "What happened: the side effect, reaction or problem with the product, in the user's own words", value: a.reaction },
    { key: "when_started", description: "When the problem started or was noticed (from the user's timeline)", value: first?.date ?? "" },
    { key: "month_started", description: "Month the problem started", value: when.month },
    { key: "year_started", description: "Year the problem started", value: when.year },
  ];
}

/**
 * Type the product into the site's search and let the Decisions model CHOOSE the matching suggestion (D21: it never
 * writes text). Returns the chosen label, or null if nothing fits.
 */
async function pickProduct(page: Page, product: string, emit: OnEvent): Promise<string | null> {
  const box = page.getByLabel(/find the medicine/i).first();
  await box.click({ timeout: 10000 });
  await box.pressSequentially(product.slice(0, 40), { delay: 60 });
  await page.waitForSelector("[role=option]", { timeout: 10000 }).catch(() => {});
  const labels = [...new Set((await page.locator("[role=option]").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, MAX_OPTIONS);
  emit({ type: "status", message: `The Yellow Card site suggested ${labels.length} products for "${product}"` });
  if (labels.length === 0) return null;
  // The site lists one entry per maker ("ACCORD HEALTHCARE AMOXICILLIN", "BERK AMOXICILLIN", …). Run 2026-11-07 23:54: for
  // "amoxicillin" the model answered "none" because no entry was exactly that, so a plain name now takes the closest generic entry.
  const exact = labels.find((l) => l.toLowerCase() === product.trim().toLowerCase());
  let choice = exact;
  let confidence = 1;
  if (!choice) {
    const { answers } = await decide(`The user wants to report this product: ${JSON.stringify(product)}. The Yellow Card site's search suggested the products below. Many are the same medicine from different makers.`, [
      {
        type: "choice",
        name: "product",
        instructions:
          'Which suggestion is the product the user named? If several are the same medicine from different makers and the user did not name a maker, choose the plainest one (fewest extra words). Answer "none" only if none of them is that medicine, vaccine or device at all.',
        choices: [...labels.map((l) => ({ value: l })), { value: "none", description: "None of the suggestions is that product" }],
      },
    ]);
    const a = answers.find((x) => x.name === "product");
    // Confidence is naturally split across near-identical makers, so the test is "how likely is it that none fits", not the top choice's share.
    if (!a || a.type !== "choice" || a.choice === "none" || probOf(a, "none") >= 0.5) return null;
    choice = a.choice;
    confidence = a.confidence;
  }
  await page.locator("[role=option]").filter({ hasText: choice }).first().click({ timeout: 5000 });
  emit({ type: "action", step: 0, tool: "select", args: { label: "Product", choice, confidence: +confidence.toFixed(2) }, result: "ok" });
  return choice;
}

/** Open the site, pick the product from its suggestions and press "Start report". Returns the chosen product label, or null if none matched. Shared with the benchmark. */
export async function startYellowCardReport(page: Page, product: string, emit: OnEvent): Promise<string | null> {
  emit({ type: "status", message: "Opening the Yellow Card reporting site" });
  await page.goto(YELLOW_CARD_SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await dismissCookies(page, 3000);
  const chosen = await pickProduct(page, product, emit);
  if (!chosen) return null;
  // Seen as a plain element in the accessibility tree, so match by text on anything clickable rather than by role.
  await page.locator("button, a, [role=button]").filter({ hasText: /^\s*start report\s*$/i }).first().click({ timeout: 10000 });
  await page.waitForURL(/report-guide|about-you/, { timeout: 15000 }).catch(() => {});
  // The site is a JavaScript app: the URL changes before the page is drawn. Run 2026-11-07 23:38 looked 46 ms after the
  // URL changed, saw no dropdown, and wrongly finished. Wait until the first question's dropdown has its options.
  await page.waitForFunction(() => [...document.querySelectorAll("select")].some((s) => s.options.length > 1), undefined, { timeout: 15000 }).catch(() => {});
  emit({ type: "status", message: "Started the report. Filling it in page by page" });
  return chosen;
}

export type YellowCardResult = BrowserRun & { screenshot?: string; runDir: string; product?: string };

export async function fillYellowCard(facts: CaseFacts, answers: YellowCardAnswers, opts: { onEvent?: OnEvent; keepOpen?: boolean; extra?: ExtraAnswers } = {}): Promise<YellowCardResult> {
  const runDir = path.join(process.cwd(), ".runs", "yellowcard-" + new Date().toISOString().replace(/[:.]/g, "-"));
  const emit = makeLogger(runDir, opts.onEvent);
  const { browser, page } = await openSession();
  let reviewing = false;
  const stats = { calls: 0, ms: 0, inputTokens: 0 };
  try {
    const chosen = await startYellowCardReport(page, answers.product, emit);
    if (!chosen) {
      const question = `The Yellow Card site did not list "${answers.product}". What is the exact name on the box or label?`;
      emit({ type: "done", status: "needs_input", summary: "Product not found in the Yellow Card list.", unfilled: ["Product"], question });
      return { status: "needs_input", summary: "Product not found", unfilled: ["Product"], steps: 0, question, runDir, stats };
    }
    const agent = () =>
      runDecisionAgent({
        page,
        goal:
          "Fill in the Yellow Card report page by page using the saved values, moving on with 'Next step' or 'Continue without registering'. " +
          "On the 'Side Effects' page, reactions are entered one at a time by pressing 'Add'; tick a severity box only if the saved values or the user's answers say how badly they were affected. " +
          "If the page needs something the saved values do not say, ask the user rather than guessing. Never create an account, never set a password, and never submit or send the report.",
        values: [...yellowCardValues(facts, answers), ...extraValues(opts.extra)],
        allowCheckboxes: answers.privacyAgreed,
        ...YELLOW_CARD_AGENT_OPTIONS,
        onEvent: emit,
      });
    let run = await agent();
    // The engine says "ready" when a page has nothing left to decide. On these early pages that usually means the next
    // question had not been drawn yet (it appears after the previous answer), so look again, at most twice.
    // Also when a field stopped responding mid-action: the app redraws its form after loading, so the field we found was replaced
    // (run 2026-11-08 00:09: "locator.fill: Timeout" on Patient initials). A fresh look finds the new one.
    const transient = (r: typeof run) => r.status === "needs_input" && r.unfilled.length > 0 && r.unfilled.every((u) => /error: locator\.\w+: Timeout/.test(u));
    for (let retry = 1; retry <= 2 && ((run.status === "ready_to_submit" && EARLY_PAGE.test(page.url())) || transient(run)); retry++) {
      emit({ type: "status", message: "The page was still loading. Looking again" });
      await page.waitForTimeout(1500);
      run = await agent();
    }
    if (run.status === "ready_to_submit" && EARLY_PAGE.test(page.url())) {
      run.status = "incomplete";
      run.summary = `Stopped early on ${new URL(page.url()).pathname}. Nothing was sent.`;
    }
    const screenshot = path.join(runDir, "final.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    emit({ type: "done", status: run.status, summary: run.summary, unfilled: run.unfilled, question: run.question, screenshot });
    if (opts.keepOpen && process.env.HEADLESS !== "1") {
      reviewing = true;
      closeWhenSubmitted(page, browser); // stays open for the user to check and send; closes after they do (D57)
    }
    return { ...run, screenshot, runDir, product: chosen };
  } finally {
    if (!reviewing) await browser.close();
  }
}
