import path from "node:path";
import type { Browser, Locator, Page } from "playwright";
import type { CaseFacts } from "./facts";
import { closeWhenSubmitted, dismissCookies, openSession } from "../browser";
import type { BrowserRun, Value } from "./browserAgent";
import { runDecisionAgent } from "./decisionAgent";
import { decide, probOf } from "./decisions";
import { makeLogger, type OnEvent } from "./events";
import { PLACEHOLDER, type Observation } from "./observe";
import { extraValues, type ExtraAnswers } from "./extra";
import { problemMonthYear, splitAddress } from "./spso";
import { DEFAULT_SEVERITY, KIND_LABEL, YELLOW_CARD_SITE, type YellowCardAnswers } from "./yellowCardAnswers";

/**
 * Step 6 (proposed, feature/yellow-card): fill the MHRA Yellow Card report and STOP before it is sent.
 *
 * Seen on the live site (nothing sent): the home page has a product search box whose suggestions are
 * role=option items grouped by Medicine / Vaccine / Device; "Start report" opens /report-guide (member of the public
 * or professional; side effect / fake / defective), then /about-you (who it relates to, name, email, postcode,
 * optional address and phone, a contact-method checkbox, a required privacy checkbox, an optional "Set Password"
 * with a Register button, and "Continue without registering"), then /new-report with four steps on ONE url
 * (1 whose side effect, 2 side effects, 3 medicines, 4 additional details, ending in "Submit").
 * Every field, option and error: docs/probes/yellowcard-pages.md (probed 2026-11-08).
 */

const MAX_OPTIONS = 40;

/**
 * The report's last page ("Step 4 of 4", which ends in Submit) is the only page a run may finish on as "ready".
 * Run 2026-11-08 04:09 ended "ready" on /new-report while the app was still a loading spinner: an empty page has no required
 * fields left, so the engine called it done. Checked on the live page, visible text only (the app may keep other steps in the DOM).
 */
async function onLastStep(page: Page): Promise<boolean> {
  return (await page.getByText(/step 4 of 4/i).filter({ visible: true }).count().catch(() => 0)) > 0;
}

/** On /new-report, wait until the app has drawn one of its four steps, so a loading page is not judged. Never throws. */
async function waitForReportStep(page: Page, ms = 10000) {
  await page.getByText(/step [1-4] of 4/i).filter({ visible: true }).first().waitFor({ state: "visible", timeout: ms }).catch(() => {});
}

/** Never typed into or clicked: account creation, sign-in, and anything that would send the report. */
// "Continue without registering" is the button we need, so "register" only counts when not preceded by "without" (run 2026-11-08 00:03 hid it).
const FORBIDDEN = /password|(?<!without )register|sign ?in|log ?in|\bsubmit\b|\bsend\b|save (and|for)/i;

export const YELLOW_CARD_AGENT_OPTIONS = {
  /** Only these submit-type buttons move the form on. "Register" and any submit/send button are never in this list. */
  advance: /^(next step|next|continue without registering|continue)\b/i,
  /** The site has no separate review page (Step 4 ends in "Submit"), so this never matches. The FORBIDDEN filter and the Step 4 rule in fillYellowCard are the real guards. */
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
  await (await optionNamed(page, "[role=option]", choice)).click({ timeout: 5000 });
  emit({ type: "action", step: 0, tool: "select", args: { label: "Product", choice, confidence: +confidence.toFixed(2) }, result: "ok" });
  return choice;
}

/** Open the site, pick the product from its suggestions and press "Start report". Returns the chosen product label, or null if none matched. Shared with the benchmark. */
export async function startYellowCardReport(page: Page, product: string, emit: OnEvent): Promise<string | null> {
  emit({ type: "status", message: "Opening the Yellow Card reporting site" });
  await page.goto(YELLOW_CARD_SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  if ((await dismissCookies(page, 3000)) !== "none") emit({ type: "status", message: "Cleared a cookie banner covering the page" });
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

/**
 * When the agent stops to ask the user something, its browser is parked on the page it stopped on, so the next run carries on from
 * there instead of reopening the site and going through every page again (Lea, 2026-11-08). State is on globalThis because Next.js can
 * load this module more than once in dev. Closed after 10 minutes, or as soon as the browser or its tab goes away.
 */
type Parked = { browser: Browser; page: Page; product: string; timer: ReturnType<typeof setTimeout> };
const PARK_MS = 10 * 60 * 1000;
const slot = globalThis as unknown as { __ycParked?: Parked | null };

function dropParked(close: boolean) {
  const p = slot.__ycParked;
  slot.__ycParked = null;
  if (!p) return;
  clearTimeout(p.timer);
  if (close) void p.browser.close().catch(() => {});
}

/** The parked browser if it is still open, else null. Either way nothing stays parked afterwards. */
function takeParked(): Parked | null {
  const p = slot.__ycParked ?? null;
  if (!p) return null;
  if (!p.browser.isConnected() || p.page.isClosed()) {
    dropParked(true);
    return null;
  }
  slot.__ycParked = null;
  clearTimeout(p.timer);
  return p;
}

function park(browser: Browser, page: Page, product: string) {
  dropParked(true);
  const timer = setTimeout(() => dropParked(true), PARK_MS);
  timer.unref?.();
  const parked: Parked = { browser, page, product, timer };
  slot.__ycParked = parked;
  browser.on("disconnected", () => {
    if (slot.__ycParked === parked) dropParked(false);
  });
}

/**
 * Step 2 ("Side Effects", seen 2026-11-08): "Reaction details" is required and is filled through an inline form that opens when "Add" is
 * pressed: a "Side effect" box that suggests terms as you type (pick from the list), an optional start date (year, month, day), a required
 * "still occurring, or resolved?" dropdown, an optional stop date, and a second "Add" (it does not grey out: with the dropdown empty it shows "Field is required" and the form stays open).
 * Only the typed term needs text, so it comes from this fixed list (the model CHOOSES one, D21); everything else is a dropdown.
 * Seen live 2026-11-08 (docs/probes/yellowcard-pages.md): the suggestions are react-select options (div.mhraUISelect__option, no role), the outcome select is the only required field in the sub-form.
 */
const REACTION_TERMS = [
  "Rash", "Urticaria", "Pruritus", "Angioedema", "Lip swelling", "Swelling face", "Hypersensitivity", "Anaphylactic reaction", "Nausea", "Vomiting",
  "Diarrhoea", "Abdominal pain", "Constipation", "Headache", "Dizziness", "Fatigue", "Somnolence", "Insomnia", "Anxiety", "Palpitations",
  "Dyspnoea", "Cough", "Pyrexia", "Myalgia", "Arthralgia", "Alopecia", "Dry mouth", "Injection site pain", "Vaccination site pain", "Tremor", "Pain",
];
/** Used when nothing in the story names a reaction and the model declines (run 2026-11-08 02:49: an NHS wrist-injury story, no medicine in it). Demo default, not a real finding. */
const DEFAULT_REACTION_TERM = "Pain";
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const PLACEHOLDER_OPTION = /^(yyyy|mm|dd|please select|select|open this select)/i;
const REACTION_FORM_OPEN = 'input[role=combobox], input[aria-autocomplete], input.autocomplete__input';

type ReactionState = { onPage: boolean; done: boolean; tries: number };

/**
 * The Decisions model answered "refusal" to the reaction questions (run 2026-11-08 02:36), so the words in the user's own story decide first,
 * in code. Order matters: the most specific terms come first, "Pruritus" (itching) last so "itchy rash" gives Rash, not Pruritus.
 */
const TERM_WORDS: [string, RegExp][] = [
  ["Anaphylactic reaction", /anaphyla/i],
  ["Angioedema", /angioedema/i],
  ["Lip swelling", /\blips?\b[^.]{0,40}\b(swell|swol|swelled|puffy)|\b(swell|swol|swelled)[^.]{0,40}\blips?\b/i],
  ["Swelling face", /\b(face|facial)\b[^.]{0,40}\b(swell|swol|swelled|puffy)|\b(swell|swol|swelled)[^.]{0,40}\b(face|facial)\b/i],
  ["Urticaria", /\b(hives|urticaria|welts?)\b/i],
  ["Rash", /\brash(es)?\b/i],
  ["Dyspnoea", /\b(short(ness)? of breath|breathless|difficulty breathing|trouble breathing|wheez)/i],
  ["Vomiting", /\b(vomit|threw up|being sick|was sick)/i],
  ["Nausea", /\b(nause|feeling sick|felt sick)/i],
  ["Diarrhoea", /diarrh/i],
  ["Abdominal pain", /\b(abdominal|stomach|tummy)\b[^.]{0,20}\b(pain|ache|cramp)/i],
  ["Constipation", /constipat/i],
  ["Headache", /\b(headache|head ache|migraine)/i],
  ["Dizziness", /\b(dizz|light-?headed|vertigo)/i],
  ["Palpitations", /\b(palpitat|heart racing|racing heart)/i],
  ["Fatigue", /\b(fatigue|exhaust|very tired|extremely tired)/i],
  ["Somnolence", /\b(drows|sleepy|sleepiness)/i],
  ["Insomnia", /\b(insomnia|could ?n.t sleep|unable to sleep)/i],
  ["Anxiety", /\banxi/i],
  ["Pyrexia", /\b(fever|high temperature)/i],
  ["Cough", /\bcough/i],
  ["Myalgia", /\bmuscle\b[^.]{0,20}\b(pain|ache)/i],
  ["Arthralgia", /\bjoint\b[^.]{0,20}\b(pain|ache)/i],
  ["Alopecia", /\b(hair loss|losing (my )?hair)/i],
  ["Dry mouth", /\bdry mouth/i],
  ["Tremor", /\b(tremor|shaking|trembl)/i],
  ["Pruritus", /\b(itch|itchy|itching)/i],
  ["Pain", /\b(pain|painful|sore|soreness|ache|aching)\b/i],
];
const termsFromWords = (story: string): string[] => TERM_WORDS.filter(([, re]) => re.test(story)).map(([t]) => t).slice(0, 2);

/** "Resolved" or "still occurring" from the user's own words, matched to the dropdown's options. Undefined if the words do not say. */
function statusFromWords(story: string, options: string[]): string | undefined {
  const resolved = /\b(cleared|resolved|went away|disappeared|stopped|settled|got better|recovered|gone away)\b/i.test(story);
  const ongoing = /\b(still|ongoing|continues|continuing|persists?|has ?n.t gone|not gone|not cleared)\b/i.test(story);
  if (resolved === ongoing) return undefined;
  return resolved
    ? options.find((o) => /resolved|recovered/i.test(o) && !/not|resolving|recovering/i.test(o)) ?? options.find((o) => /resolved|recovered/i.test(o))
    : options.find((o) => /not (yet )?(resolved|recovered)|still|ongoing|continuing/i.test(o));
}

/** Which standard reaction terms (at most 2) name what the user described. The model must pick the closest: "none" is not offered, so the form is never left empty. */
/** What the model really answered, in one short line for the progress console (a choice: value and confidence; anything else: in full). */
const shown = (a: unknown) => {
  const x = a as { type?: string; choice?: string; confidence?: number } | undefined;
  return (x?.type === "choice" ? `choice ${JSON.stringify(x.choice)} (confidence ${x.confidence?.toFixed?.(2)})` : JSON.stringify(a ?? "no answer for this question")).slice(0, 300);
};

async function chooseReactionTerms(story: string, emit: OnEvent): Promise<string[]> {
  const fromWords = termsFromWords(story);
  if (fromWords.length > 0) return fromWords;
  const { answers } = await decide(`The user describes a reaction to a medicine in their own words: ${JSON.stringify(story)}`, [
    {
      type: "choice",
      name: "term",
      instructions: "Which standard reaction term best names the main reaction they describe? Choose the closest one.",
      choices: REACTION_TERMS.map((t) => ({ value: t })),
    },
  ]);
  const a = answers.find((x) => x.name === "term");
  emit({ type: "status", message: `Model answer for the reaction term: ${shown(a)}` });
  if (!a || a.type !== "choice") {
    emit({ type: "status", message: `Nothing in the story names a reaction, so the demo adds "${DEFAULT_REACTION_TERM}"` });
    return [DEFAULT_REACTION_TERM];
  }
  const others = a.probabilities.filter((p) => p.value !== a.choice && p.probability >= 0.3).sort((x, y) => y.probability - x.probability).map((p) => p.value);
  return [a.choice, ...others].slice(0, 2);
}

/** The reaction box is a react-select (seen 2026-11-08): options are div.mhraUISelect__option with no ARIA role. The home page search uses role=option instead. */
const REACTION_OPTION = ".mhraUISelect__option, [role=option]";
/** Ids of the reaction form's own dropdowns (seen live). Month and day only get their options after the year (and month) is chosen. */
const START_DATE = "reaction_add_reactionstartdate";
const OUTCOME = "reaction_add_reactionoutcome";

/** The option whose whole text is `choice`. A plain hasText would also match "Pain head" for "Pain". Falls back to a partial match. */
async function optionNamed(page: Page, selector: string, choice: string): Promise<Locator> {
  const all = page.locator(selector);
  const words = choice.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const exact = all.filter({ hasText: new RegExp(`^\\s*${words}\\s*$`, "i") });
  return (await exact.count()) > 0 ? exact.first() : all.filter({ hasText: choice }).first();
}

/** Add one reaction through the page's own form. Throws with a plain reason if a step cannot be done. */
async function addOneReaction(page: Page, term: string, facts: CaseFacts, story: string, emit: OnEvent): Promise<void> {
  const combo = page.locator(REACTION_FORM_OPEN).or(page.getByLabel(/^\s*side effect\b/i)).first();
  if (!(await combo.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^\s*add\s*$/i }).first().click({ timeout: 8000 });
    await combo.waitFor({ state: "visible", timeout: 8000 });
  }
  await combo.click({ timeout: 5000 });
  await combo.fill("").catch(() => {}); // a half-finished earlier attempt may have left text in the box
  await combo.pressSequentially(term, { delay: 60 });
  await page.waitForSelector(REACTION_OPTION, { timeout: 8000 }).catch(() => {});
  const labels = [...new Set((await page.locator(REACTION_OPTION).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, MAX_OPTIONS);
  let choice = labels.find((l) => l.toLowerCase() === term.toLowerCase());
  if (!choice && labels.length > 0) {
    const { answers } = await decide(`The user's reaction is called ${JSON.stringify(term)}. These are the Yellow Card site's suggestions for it.`, [
      { type: "choice", name: "pick", instructions: "Which suggestion is that reaction? Prefer the plainest wording.", choices: labels.map((l) => ({ value: l })) },
    ]);
    const a = answers.find((x) => x.name === "pick");
    choice = a && a.type === "choice" ? a.choice : labels[0];
  }
  if (!choice) throw new Error(`the site suggested nothing for "${term}"`);
  await (await optionNamed(page, REACTION_OPTION, choice)).click({ timeout: 5000 });
  emit({ type: "action", step: 0, tool: "select", args: { label: "Side effect", choice }, result: "ok" });

  const optionsOf = (id: string) => page.locator(`#${id}`).evaluate((el) => Array.from((el as HTMLSelectElement).options).map((o) => o.text.trim())).catch(() => [] as string[]);
  const real = (o: string[]) => o.filter((x) => x && !PLACEHOLDER_OPTION.test(x));
  const waitForOptions = (id: string) => page.waitForFunction((i) => ((document.getElementById(i) as HTMLSelectElement | null)?.options.length ?? 0) > 1, id, { timeout: 3000 }).catch(() => {});
  const pick = async (id: string, test: (o: string) => boolean): Promise<boolean> => {
    const opts = await optionsOf(id);
    const index = opts.findIndex((o) => !PLACEHOLDER_OPTION.test(o) && test(o));
    if (index < 0) return false;
    await page.locator(`#${id}`).selectOption({ index }, { timeout: 5000 }).catch(() => {});
    return true;
  };

  // Optional start date. Year first, then month, then day: each only has options once the one before it is set.
  const when = problemMonthYear(facts);
  const iso = facts.events[0]?.date.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const monthNo = MONTH_NAMES.indexOf(when.month.toLowerCase()) + 1;
  if (when.year && (await pick(`${START_DATE}_year`, (o) => o === when.year))) {
    await waitForOptions(`${START_DATE}_month`);
    if (monthNo > 0 && (await pick(`${START_DATE}_month`, (o) => Number(o) === monthNo || o.toLowerCase().startsWith(MONTH_NAMES[monthNo - 1].slice(0, 3))))) {
      await waitForOptions(`${START_DATE}_day`);
      if (iso && iso[1] === when.year && Number(iso[2]) === monthNo) await pick(`${START_DATE}_day`, (o) => Number(o) === Number(iso[3]));
    }
  }

  // "Is the reaction still occurring, or has it resolved?" (required): the user's own words first (code), then the model, then "unknown".
  // "Caused death" is left out of the choices: it is never something to guess.
  const options = real(await optionsOf(OUTCOME)).filter((o) => !/death/i.test(o));
  if (options.length > 0) {
    let outcome = statusFromWords(story, options);
    if (!outcome) {
      const { answers } = await decide(`The user describes a reaction to a medicine in their own words: ${JSON.stringify(story)}`, [
        {
          type: "choice",
          name: "status",
          instructions: "Is the reaction still occurring, or has it resolved, according to what they say? Choose the closest option: the form needs an answer.",
          choices: [...new Set(options)].map((o) => ({ value: o })),
        },
      ]).catch(() => ({ answers: [] }));
      const a = answers.find((x) => x.name === "status");
      emit({ type: "status", message: `Model answer for still occurring or resolved: ${shown(a)}` });
      outcome = a && a.type === "choice" ? a.choice : options.find((o) => /unknown/i.test(o)) ?? options[0];
    }
    await page.locator(`#${OUTCOME}`).selectOption({ label: outcome }, { timeout: 5000 });
    emit({ type: "action", step: 0, tool: "select", args: { label: "Still occurring or resolved", choice: outcome }, result: "ok" });
  }

  await page.getByRole("button", { name: /^\s*add\s*$/i }).last().click({ timeout: 5000 });
  // The form closes when the reaction is accepted. If it stays open the site found a problem: say what it said instead of reporting success.
  const closed = await page.waitForFunction(() => !document.getElementById("reaction_add_reactionmeddrallt"), undefined, { timeout: 6000 }).then(() => true, () => false);
  if (!closed) {
    const said = await page.evaluate(() => Array.from(document.querySelectorAll("[role=alert], [class*=HelpText]")).map((n) => (n as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 3).join("; "));
    throw new Error(`the site did not accept the reaction${said ? ` (${said})` : ""}`);
  }
}

/** Runs before each step of the agent. On the Side Effects page with no reaction listed yet, add the reaction(s) the user described. */
async function addReactionsIfNeeded(page: Page, obs: Observation, facts: CaseFacts, story: string, state: ReactionState, emit: OnEvent): Promise<boolean> {
  state.onPage = /side effects/i.test(obs.headings.join(" "));
  if (!state.onPage || state.done || state.tries >= 2) return false;
  if (!/press .?add.? below/i.test(obs.text)) {
    state.done = true; // a reaction is already listed
    return false;
  }
  state.tries++;
  emit({ type: "status", message: "Adding the reaction from what you told us" });
  try {
    const terms = await chooseReactionTerms(story, emit);
    if (terms.length === 0) throw new Error(`no reaction term could be chosen from the story (${story.trim() ? "no known reaction word in it, and the model gave no answer" : "the story is empty"})`);
    emit({ type: "status", message: `Reaction: ${terms.join(", ")}` });
    // One that the site cannot find or will not take does not stop the others; the demo default is the last resort, so the page is never left with none.
    let added = 0;
    let lastError: unknown;
    for (const term of [...terms, ...(terms.includes(DEFAULT_REACTION_TERM) ? [] : [DEFAULT_REACTION_TERM])]) {
      if (added > 0 && !terms.includes(term)) break;
      try {
        await addOneReaction(page, term, facts, story, emit);
        added++;
      } catch (e) {
        lastError = e;
        emit({ type: "status", message: `Could not add "${term}": ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}` });
      }
    }
    if (added === 0) throw lastError;
    state.done = true;
    return true;
  } catch (e) {
    emit({ type: "status", message: `Could not add the reaction: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}` });
    return false;
  }
}

/** Step 3 asks nothing of us: the product chosen on the home page is already listed. Its first "Next step" only closes the open medicine form, so press it until the page moves on (seen live 2026-11-08, 2 presses). */
async function passMedicinePage(page: Page, obs: Observation, state: { medicineClicks: number }, emit: OnEvent): Promise<boolean> {
  if (!/step 3 of 4/i.test(obs.headings.join(" ")) || state.medicineClicks >= 3) return false;
  const next = obs.elements.find((e) => (e.kind === "submit" || e.kind === "button") && !e.disabled && /^next step$/i.test(e.label.trim()));
  if (!next) return false;
  state.medicineClicks++;
  await page.locator(`[data-aid="${next.id}"]`).click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
  emit({ type: "action", step: 0, tool: "click", args: { id: next.id, label: next.label.slice(0, 40), reason: "the medicine is already listed, nothing to fill on this page" }, result: "ok" });
  return true;
}

/**
 * Step 1 ("Whose Side Effect") labels every field "(Optional)" but refuses the page unless at least one of initials, sex or age is given
 * (seen live 2026-11-08). With nothing saved to put in the initials box, mark it as required so the engine asks the user for it by name
 * instead of clicking "Next step" until it is stuck.
 */
function markPatientIdentifier(obs: Observation, haveInitials: boolean): void {
  if (haveInitials || !/step 1 of 4/i.test(obs.headings.join(" "))) return;
  const given = obs.elements.some((e) => /^(patientinitial|patientsex|patientbirthdate_year)$/.test(e.name) && e.value.trim() !== "" && !PLACEHOLDER_OPTION.test(e.value.trim()) && !PLACEHOLDER.test(e.value.trim()));
  if (given) return;
  const initials = obs.elements.find((e) => e.name === "patientinitial");
  if (!initials) return;
  initials.required = true;
  initials.label = "Patient initials (the form needs at least one of initials, sex or age)";
}

export type YellowCardResult = BrowserRun & { screenshot?: string; runDir: string; product?: string };

export async function fillYellowCard(facts: CaseFacts, answers: YellowCardAnswers, opts: { onEvent?: OnEvent; keepOpen?: boolean; extra?: ExtraAnswers; resume?: boolean } = {}): Promise<YellowCardResult> {
  const runDir = path.join(process.cwd(), ".runs", "yellowcard-" + new Date().toISOString().replace(/[:.]/g, "-"));
  const emit = makeLogger(runDir, opts.onEvent, 6);
  // Resume: carry on from the page the last run stopped on. Otherwise (or if that browser has gone) start again from the site's home page.
  const parked = opts.resume ? takeParked() : (dropParked(true), null);
  const { browser, page } = parked ?? (await openSession());
  let reviewing = false;
  let stayParked = false;
  const reaction: ReactionState = { onPage: false, done: false, tries: 0 };
  const late = { onStep4: false, medicineClicks: 0 }; // Step 4 is left untouched: it only has optional boxes and the "Submit" button
  const haveInitials = !!yellowCardValues(facts, answers).find((v) => v.key === "patient_initials")?.value.trim();
  const stats = { calls: 0, ms: 0, inputTokens: 0 };
  try {
    if (parked) emit({ type: "status", message: "Carrying on from the page it stopped on" });
    const chosen = parked ? parked.product : await startYellowCardReport(page, answers.product, emit);
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
          "On the 'Side Effects' page the reaction is added for you: never press 'Add' there. " +
          "The page after that (the medicines) and the last page (additional details) need nothing from you: stop on the last page without pressing anything. " +
          "If the page needs something the saved values do not say, ask the user rather than guessing. Never create an account, never set a password, and never submit or send the report.",
        values: [...yellowCardValues(facts, answers), ...extraValues(opts.extra)],
        allowCheckboxes: answers.privacyAgreed,
        tick: answers.severity?.length ? answers.severity : [DEFAULT_SEVERITY], // the user's severity boxes; the site will not go on with none ticked, so a demo default if they chose none
        ...YELLOW_CARD_AGENT_OPTIONS,
        ignore: (el: { label: string; name: string; kind: string }) => YELLOW_CARD_AGENT_OPTIONS.ignore(el) || late.onStep4 || (reaction.onPage && /^\s*add\s*$/i.test(el.label)),
        beforeStep: async (pg: Page, obs: Observation) => {
          late.onStep4 = /step 4 of 4/i.test(obs.headings.join(" "));
          if (await addReactionsIfNeeded(pg, obs, facts, answers.reaction, reaction, emit)) return true;
          if (await passMedicinePage(pg, obs, late, emit)) return true;
          markPatientIdentifier(obs, haveInitials);
          return false;
        },
        onEvent: emit,
      });
    let run = await agent();
    // The engine says "ready" when a page has nothing left to decide. On these early pages that usually means the next
    // question had not been drawn yet (it appears after the previous answer), so look again, at most twice.
    // Also when a field stopped responding mid-action: the app redraws its form after loading, so the field we found was replaced
    // (run 2026-11-08 00:09: "locator.fill: Timeout" on Patient initials). A fresh look finds the new one.
    const transient = (r: typeof run) => r.status === "needs_input" && r.unfilled.length > 0 && r.unfilled.every((u) => /error: locator\.\w+: Timeout/.test(u));
    // "Ready" anywhere but the last step means the page had not been drawn yet (or the engine stopped short): look again.
    const notOnLastStep = async (r: typeof run) => r.status === "ready_to_submit" && !(await onLastStep(page));
    for (let retry = 1; retry <= 2 && ((await notOnLastStep(run)) || transient(run)); retry++) {
      emit({ type: "status", message: "The page was still loading. Looking again" });
      if (/\/new-report/.test(page.url())) await waitForReportStep(page);
      else await page.waitForTimeout(1500);
      run = await agent();
    }
    if (await notOnLastStep(run)) {
      run.status = "incomplete";
      run.summary = `Stopped before the last page of the report (on ${new URL(page.url()).pathname}). Nothing was sent. Try again to carry on from there.`;
      run.unfilled = [];
    }
    // It stopped to ask (or got stuck): keep the browser on this page for the next run.
    if (run.status !== "ready_to_submit") {
      park(browser, page, chosen);
      stayParked = true;
    }
    const screenshot = path.join(runDir, "final.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    emit({ type: "done", status: run.status, summary: run.summary, unfilled: run.unfilled, question: run.question, screenshot });
    if (opts.keepOpen && process.env.HEADLESS !== "1") {
      reviewing = true;
      closeWhenSubmitted(page, browser, { flow: "yellowcard" }); // stays open for the user to check and send; closes after they do (D57), and the app marks the step sent
    }
    return { ...run, screenshot, runDir, product: chosen };
  } finally {
    if (!reviewing && !stayParked) await browser.close();
  }
}
