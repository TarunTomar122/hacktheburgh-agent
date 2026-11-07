// Run the browser agent over real and practice sites. Nothing is ever submitted to an organisation.
// Usage: npx tsx --env-file=.env.local scripts/bench.ts [--only nhs,pizza] [--engine decisions|tools|both]
import { writeFileSync, mkdirSync } from "node:fs";
import type { Page } from "playwright";
import { dismissCookies, openSession } from "../lib/browser";
import { runBrowserAgent, type BrowserRun, type Value } from "../lib/agent/browserAgent";
import { runDecisionAgent } from "../lib/agent/decisionAgent";
import { observe, unfilledRequired, type El } from "../lib/agent/observe";
import { nhsValues } from "../lib/agent/nhsLothian";
import { SAMPLE } from "./agent-nhs";
import { fillOne } from "../lib/agent/enquiry";
import { SAMPLE_DRAFT, SAMPLE_FACTS, SAMPLE_SPSO } from "../lib/agent/sample";
import { SPSO_AGENT_OPTIONS, SPSO_FORM, spsoValues } from "../lib/agent/spso";
import type { AgentEvent } from "../lib/agent/events";

const v = (key: string, description: string, value: string): Value => ({ key, description, value });
const MSG = "I would like advice about a missed wrist fracture. I attended A&E at the Royal Infirmary of Edinburgh in early July 2026 and was told it was a sprain. A second X-ray in August showed a scaphoid fracture that has not healed.";
const PERSON = [
  v("first_name", "First name", "Ailsa"), v("last_name", "Last name", "Reid"), v("full_name", "Full name", "Ailsa Reid"),
  v("email", "Email address", "ailsa.reid@example.com"), v("phone", "Telephone number", "07700 900123"), v("city", "City", "Edinburgh"),
  v("message", "Message / summary of the situation / how can we help", MSG),
  v("urgency", "How soon help is needed", "General enquiry"), v("how_heard", "How the user heard about the firm", "Search engine, e.g. Google/Bing"),
  v("agree_privacy", "The user agrees to the Terms and Privacy Policy", "yes"),
  v("agree_legal_aid", "The user agrees they are not eligible for legal aid unless seeking help with medical negligence", "yes"),
];

type Check = { pass: boolean; why: string };
type Task = {
  id: string; url: string; goal: string; values: Value[];
  allowSubmit?: boolean; allowCheckboxes?: boolean; maxSteps?: number;
  /** Multi-page forms (advance / stopAtUrl / ignore) only exist in the Decisions engine. */
  decisionsOnly?: boolean; advance?: RegExp; stopAtUrl?: RegExp; ignore?: (el: { label: string; name: string; kind: string }, url: string) => boolean;
  check: (page: Page, run: BrowserRun, startUrl: string) => Promise<Check>;
  /** Tasks that run their own agent code (e.g. step 4's find-and-fill) instead of the plain engine. They navigate themselves. */
  custom?: (page: Page) => Promise<Check>;
};

async function els(page: Page): Promise<El[]> { return (await observe(page)).elements; }
const find = (all: El[], re: RegExp, kind?: string) => all.find((e) => re.test(e.label) && (!kind || e.kind === kind));
function expectVal(all: El[], re: RegExp, want: string | RegExp, fails: string[]) {
  const e = find(all, re);
  if (!e) return void fails.push(`missing field ${re}`);
  const ok = typeof want === "string" ? e.value.trim() === want : want.test(e.value);
  if (!ok) fails.push(`${re} = "${e.value.slice(0, 40)}"`);
}
const expectChecked = (all: El[], re: RegExp, want: boolean, fails: string[]) => {
  const e = find(all, re);
  if (!e) return void fails.push(`missing ${re}`);
  if (e.checked !== want) fails.push(`${re} checked=${e.checked}`);
};
async function honeypotsEmpty(page: Page): Promise<boolean> {
  return page.evaluate(() => [...document.querySelectorAll("input,textarea")].filter((e) => /(^|[-_])hp$|honey|trap/i.test((e as HTMLInputElement).name + e.id)).every((e) => !(e as HTMLInputElement).value));
}
const verdict = (fails: string[]): Check => ({ pass: fails.length === 0, why: fails.join("; ") || "ok" });
const pageText = (page: Page) => page.evaluate(() => (document.querySelector("main") ?? document.body).innerText.replace(/\s+/g, " "));

/* Step 4 enquiry forms verified on 2026-11-07. Nothing is ever submitted: fillOne stops before Send by design. */
const ENQ: { id: string; name: string; website: string; enquiryUrl?: string; consents?: number }[] = [
  { id: "anderson", name: "Anderson Strathern", website: "https://www.andersonstrathern.co.uk/", enquiryUrl: "https://www.andersonstrathern.co.uk/legal-expertise/medical-negligence/", consents: 2 },
  { id: "mfmac", name: "MFMac", website: "https://mfmac.com/legal-expertise/individuals-and-families/personal-injury/medical-negligence-compensation" },
  { id: "irwin", name: "Irwin Mitchell", website: "https://www.irwinmitchell.com/" },
  { id: "balfour", name: "Balfour and Manson", website: "https://www.balfour-manson.co.uk/" },
  { id: "drummond", name: "Drummond Miller", website: "https://www.drummondmiller.co.uk/" },
];
async function enquiryCheck(page: Page, e: (typeof ENQ)[number]): Promise<Check> {
  const firm = { id: e.id, name: e.name, town: "Edinburgh", distanceMiles: null, website: e.website, email: null, phone: null, sources: ["slab" as const], legalAid: true, activeRecently: true, actsForPatients: "unknown" as const, noWinNoFee: "unknown" as const, enquiryUrl: e.enquiryUrl ?? null, score: 0, reasons: [], excluded: null };
  const o = await fillOne(page, firm, { facts: SAMPLE_FACTS, message: { subject: "Benchmark test (never sent)", body: "Benchmark test message. This form is never submitted." } });
  const text = await pageText(page);
  const fails: string[] = [];
  if (o.status !== "ready_to_send") fails.push(`status ${o.status}: ${o.note}`);
  if (!o.filled.some((f) => f.value.trim() === SAMPLE_FACTS.email)) fails.push("our email is not on the form");
  if (/thank you for (your|getting)|has been (sent|received)|we will be in touch/i.test(text)) fails.push("a thank-you page appeared");
  if (e.consents !== undefined && o.consents.length !== e.consents) fails.push(`expected ${e.consents} consent boxes, got ${o.consents.length}`);
  return fails.length ? { pass: false, why: fails.join("; ") } : { pass: true, why: `${o.filled.length} fields, ${o.consents.length} consents, ${o.formUrl}` };
}

const TASKS: Task[] = [
  { id: "nhs", url: "https://www.nhslothian.scot/yourrights/online-feedback-form/", goal: "Fill in the NHS Lothian online feedback/complaint form using the saved values. Do not submit.", allowCheckboxes: true,
    values: nhsValues(SAMPLE, { details: MSG, location: "Royal Infirmary of Edinburgh, A&E", outcome: "An explanation and an apology." }),
    check: async (page) => { const a = await els(page), f: string[] = [];
      f.push(...unfilledRequired(await observe(page)).map((x) => `unfilled ${x}`));
      expectVal(a, /^First Name/i, "Ailsa", f); expectVal(a, /^Last Name/i, "Reid", f); expectVal(a, /^Email \*/i, "ailsa.reid@example.com", f);
      expectVal(a, /communicate/i, "Email", f); expectChecked(a, /Email Disclaimer/i, true, f);
      if (!(await honeypotsEmpty(page))) f.push("HONEYPOT FILLED"); return verdict(f); } },
  { id: "anderson", url: "https://www.andersonstrathern.co.uk/legal-expertise/medical-negligence/", goal: "Fill in the enquiry form on this page using the saved values. Do not submit.", allowCheckboxes: true, values: PERSON,
    check: async (page) => { const a = await els(page), f: string[] = [];
      f.push(...unfilledRequired(await observe(page)).map((x) => `unfilled ${x}`));
      expectVal(a, /^First name/i, "Ailsa", f); expectVal(a, /^Last name/i, "Reid", f); expectVal(a, /^Email/i, "ailsa.reid@example.com", f);
      expectVal(a, /^Phone/i, /^07700\s?900123$/, f); expectVal(a, /How can we help/i, /wrist/, f); expectVal(a, /^Company/i, "", f);
      expectChecked(a, /not eligible for legal aid/i, true, f); expectChecked(a, /Terms and Privacy/i, true, f);
      if (!(await honeypotsEmpty(page))) f.push("HONEYPOT FILLED"); return verdict(f); } },
  { id: "mfmac", url: "https://mfmac.com/legal-expertise/individuals-and-families/personal-injury/medical-negligence-compensation", goal: "Fill in the enquiry form popup using the saved values. Do not submit.", allowCheckboxes: true, values: PERSON,
    check: async (page) => { const a = await els(page), f: string[] = [];
      expectVal(a, /Your Name/i, "Ailsa Reid", f); expectVal(a, /Email Address/i, "ailsa.reid@example.com", f); expectVal(a, /Telephone/i, "07700 900123", f);
      expectVal(a, /short summary/i, /wrist/, f); expectVal(a, /How soon/i, "General enquiry", f); expectChecked(a, /Send a copy/i, false, f); return verdict(f); } },
  { id: "irwin", url: "https://www.irwinmitchell.com/personal-injury-claims/scotland", goal: "Find the firm's enquiry form (it may be lower on the page or behind a contact link) and fill it in using the saved values. Do not submit.", allowCheckboxes: true, values: PERSON, maxSteps: 8,
    check: async (page) => { const a = await els(page), f: string[] = [];
      expectVal(a, /^First Name/i, "Ailsa", f); expectVal(a, /^Last Name/i, "Reid", f); expectVal(a, /^Email/i, "ailsa.reid@example.com", f); expectVal(a, /^Phone number/i, "07700 900123", f); return verdict(f); } },
  { id: "pizza", url: "https://httpbin.org/forms/post", goal: "Fill in the pizza order form using the saved values. Do not submit.", allowCheckboxes: true,
    values: [v("customer_name", "Customer name", "Ailsa Reid"), v("phone", "Telephone", "07700 900123"), v("email", "Email", "ailsa.reid@example.com"), v("pizza_size", "Pizza size", "Medium"), v("toppings", "Toppings the customer wants", "Extra Cheese and Mushroom"), v("delivery_note", "Delivery instructions", "Leave it at the door")],
    check: async (page) => { const a = await els(page), f: string[] = [];
      expectVal(a, /Customer name/i, "Ailsa Reid", f); expectVal(a, /Telephone/i, "07700 900123", f); expectVal(a, /E-mail/i, "ailsa.reid@example.com", f);
      expectChecked(a, /^Medium/i, true, f); expectChecked(a, /Extra Cheese/i, true, f); expectChecked(a, /Mushroom/i, true, f); expectChecked(a, /Bacon/i, false, f); expectChecked(a, /Onion/i, false, f);
      expectVal(a, /Delivery instructions/i, "Leave it at the door", f); expectVal(a, /delivery time/i, "", f); return verdict(f); } },
  { id: "selenium", url: "https://www.selenium.dev/selenium/web/web-form.html", goal: "Fill in the web form using the saved values. Leave anything you have no value for. Do not submit.",
    values: [v("text_input", "Text input", "Ailsa Reid"), v("textarea_message", "Textarea", MSG), v("dropdown_choice", "Dropdown (select) option", "Two")],
    check: async (page) => { const a = await els(page), f: string[] = [];
      expectVal(a, /^Text input/i, "Ailsa Reid", f); expectVal(a, /^Textarea/i, /wrist/, f); expectVal(a, /Dropdown \(select\)/i, "Two", f);
      expectVal(a, /^Password/i, "", f); expectVal(a, /Date picker/i, "", f); expectChecked(a, /Default checkbox/i, false, f); return verdict(f); } },
  { id: "slab", url: "https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/", goal: "Complete the legal aid estimator using the saved answers and get the result.", allowSubmit: true, maxSteps: 16,
    values: [v("auto_qualify", "Does the user automatically qualify financially (e.g. on certain benefits)?", "No"), v("has_partner", "Does the user have a partner?", "No"), v("dependants", "Number of dependants (children or others)", "0"), v("income", "Annual income in pounds", "9000"), v("outgoings", "Annual outgoings/expenses in pounds", "6000"), v("savings", "Savings and capital in pounds", "0")],
    check: async (page) => { const t = await pageText(page); return /likely to qualify/i.test(t) ? { pass: true, why: "ok" } : { pass: false, why: `no result. page: ${t.slice(0, 160)}` }; } },
  { id: "spso-yes", url: "https://www.spso.org.uk/form/complaint-checker", goal: "Answer the complaint checker questions using the saved values, clicking Next each time, until the checker has asked all its questions.", allowSubmit: true, maxSteps: 12,
    values: [v("scottish_service", "Is the complaint about a Scottish public service?", "Yes"), v("final_response", "Has the user completed the organisation's complaints process and received a final written response?", "Yes"), v("final_response_when", "When did the user receive the final (stage 2) response?", "Less than 1 year ago"), v("first_knew", "When did the user first know about the issue?", "Less than 1 year ago"), v("outcome", "Outcome the user wants", "A decision to be changed or overturned")],
    check: async (page) => { const t = await pageText(page); const stuck = /Is your complaint about a Scottish public service|Have you completed the complaints process|When did you receive your final|When did you first know/i.test(t); return stuck ? { pass: false, why: `stopped early. page: ${t.slice(0, 140)}` } : { pass: true, why: `reached: ${t.slice(0, 100)}` }; } },
  { id: "spso-no", url: "https://www.spso.org.uk/form/complaint-checker", goal: "Answer the complaint checker questions using the saved values, clicking Next each time, until it gives a result or you run out of saved answers.", allowSubmit: true, maxSteps: 8,
    values: [v("scottish_service", "Is the complaint about a Scottish public service?", "Yes"), v("final_response", "Has the user completed the organisation's complaints process and received a final written response?", "No")],
    check: async (page) => { const t = await pageText(page); return /only consider a complaint once you have completed/i.test(t) ? { pass: true, why: "ok" } : { pass: false, why: `wrong end state: ${t.slice(0, 140)}` }; } },
  { id: "spso-form", url: SPSO_FORM, decisionsOnly: true, goal: "Complete the SPSO online complaint form page by page using the saved values, clicking Next to move on. Never click Save for later and never submit the complaint.",
    values: spsoValues(SAMPLE_FACTS, SAMPLE_DRAFT, SAMPLE_SPSO), allowCheckboxes: true, ...SPSO_AGENT_OPTIONS,
    check: async (page) => { const t = await pageText(page); const missing = ["Review and send your complaint", "Ailsa", "Reid", "14 Example Street", "July 2026", "DEMO-0001"].filter((x) => !t.includes(x)); return /\/form\/review\/?$/.test(page.url()) && missing.length === 0 ? { pass: true, why: "reached the review page with the right details; nothing sent" } : { pass: false, why: `url ${page.url()} missing ${missing.join(", ") || "-"}` }; } },
  // Step 4 (D45): find each firm's enquiry form (looking harder when no URL is known) and fill it, stopping before Send.
  ...ENQ.map((e): Task => ({ id: `enq-${e.id}`, url: e.website, goal: "", values: [], decisionsOnly: true, check: async () => ({ pass: false, why: "custom" }), custom: (page) => enquiryCheck(page, e) })),
  { id: "lawsoc", url: "https://www.lawscot.org.uk/find-a-solicitor/", goal: "Search the directory for firms: set the location and area of law from the saved values, then run the search.", allowSubmit: true, maxSteps: 8,
    values: [v("search_location", "City or postcode to search in", "Edinburgh"), v("area_of_law", "Area of law needed", "Accident and injury")],
    check: async (page) => { const t = await pageText(page); const m = t.match(/(\d+)\s+results? found/i); return m && Number(m[1]) > 0 ? { pass: true, why: `${m[1]} results` } : { pass: false, why: "no results shown" }; } },
];

async function runOne(task: Task, engine: "decisions" | "tools") {
  if (task.decisionsOnly && engine === "tools") return { task: task.id, engine, pass: true, why: "skipped (Decisions engine only)", status: "skipped", steps: 0, calls: 0, modelMs: 0, wallMs: 0, tokens: 0, blocked: 0 };
  const { browser, page } = await openSession();
  const events: AgentEvent[] = [];
  const t0 = Date.now();
  try {
    if (task.custom) {
      const chk = await task.custom(page);
      return { task: task.id, engine, pass: chk.pass, why: chk.why, status: chk.pass ? "ready_to_submit" : "fail", steps: 0, calls: 0, modelMs: 0, wallMs: Date.now() - t0, tokens: 0, blocked: 0 };
    }
    await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    await dismissCookies(page, 3000);
    const run = engine === "decisions" ? await runDecisionAgent({ page, goal: task.goal, values: task.values, allowSubmit: task.allowSubmit, allowCheckboxes: task.allowCheckboxes, maxSteps: task.maxSteps, advance: task.advance, stopAtUrl: task.stopAtUrl, ignore: task.ignore, onEvent: (e) => events.push(e) })
      : await runBrowserAgent({ page, goal: task.goal, values: task.values, allowSubmit: task.allowSubmit, allowCheckboxes: task.allowCheckboxes, maxSteps: task.maxSteps, onEvent: (e) => events.push(e) });
    const chk = await task.check(page, run, task.url);
    return { task: task.id, engine, pass: chk.pass, why: chk.why, status: run.status, steps: run.steps, calls: run.stats?.calls ?? 0, modelMs: run.stats?.ms ?? 0, wallMs: Date.now() - t0, tokens: run.stats?.inputTokens ?? 0, blocked: events.filter((e) => e.type === "blocked").length };
  } catch (e) {
    return { task: task.id, engine, pass: false, why: `crash: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`, status: "error", steps: 0, calls: 0, modelMs: 0, wallMs: Date.now() - t0, tokens: 0, blocked: 0 };
  } finally { await browser.close(); }
}

async function main() {
  const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
  const only = arg("only")?.split(",");
  const engineArg = arg("engine") ?? "decisions";
  const engines = (engineArg === "both" ? ["decisions", "tools"] : [engineArg]) as ("decisions" | "tools")[];
  const rows = [];
  for (const task of TASKS.filter((t) => !only || only.includes(t.id))) for (const engine of engines) {
    const r = await runOne(task, engine);
    rows.push(r);
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.task.padEnd(9)} ${engine.padEnd(9)} steps=${r.steps} calls=${r.calls} model=${(r.modelMs / 1000).toFixed(1)}s wall=${(r.wallMs / 1000).toFixed(1)}s tok=${r.tokens}  ${r.pass ? "" : r.why}`);
  }
  mkdirSync(".runs", { recursive: true });
  writeFileSync(`.runs/bench-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify(rows, null, 2));
  for (const e of engines) { const m = rows.filter((r) => r.engine === e); console.log(`\n${e}: ${m.filter((r) => r.pass).length}/${m.length} passed`); }
}
main();
