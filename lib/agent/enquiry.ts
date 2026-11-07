import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { z } from "zod";
import { dismissCookies, keepOnlyTabs, openSession } from "../browser";
import { pointAt } from "../agentCursor";
import type { Value } from "./browserAgent";
import { runBrowserAgent } from "./browserAgent";
import { runDecisionAgent } from "./decisionAgent";
import { decide } from "./decisions";
import type { EnquiryMessage, EnquiryOutcome, FieldEdit, FormField, Step4Event, Step4Result } from "./enquiryTypes";
import { MAX_ENQUIRIES } from "./enquiryTypes";
import { makeLogger } from "./events";
import type { CaseFacts } from "./facts";
import { agent, pageText, Tracer, Tracker, type Emit, type Note } from "./legalAid";
import type { FirmFinding, Step3Event, Step3Result } from "./legalAidTypes";
import { EFFORT, MODELS, structured } from "./llm";
import { observe, PLACEHOLDER } from "./observe";

/**
 * Step 4 (D45): contact up to 3 firms. Server only.
 *   draftEnquiry  -> one message from the profile (facts only, no claim of negligence)
 *   runEnquiries  -> one tab per firm: find the enquiry form (looking harder if needed), fill it, STOP before Send,
 *                    keep the tab open in a registry so the user's approval can be acted on
 *   sendEnquiry   -> the send gate first (ALLOW_REAL_SEND=1 and not a demo persona), then tick only the agreed
 *                    consent boxes, press Send, read what the page says
 * Nothing is ever sent without the user's approval of that firm, and never for a fictional (example.com) patient.
 */

export type LegalAidSummary = { verdict: Step3Result["verdict"]; route: Step3Result["route"] } | undefined;

/* ------------------------------------------------------------------ draft */

const DraftSchema = z.object({
  subject: z.string().describe("Short subject line, e.g. 'Enquiry: possible medical negligence (missed wrist fracture)'"),
  body: z.string().describe("The message, first person, plain, 120-220 words, ending with how to reach the person"),
});

const DRAFT_RULES = `You write a short first enquiry from a member of the public to a Scottish law firm about a possible medical negligence claim.
Rules:
- Use ONLY the facts given. Never invent symptoms, losses, dates, names or places.
- First person, plain and polite, 120-220 words. No legal jargon.
- Say what happened (with the dates and the place from the facts), how it has affected them if the facts say so, and what they want.
- Do NOT say anyone was negligent, at fault or liable, and do not say they have a claim. Ask whether the firm could advise.
- If a funding sentence is given, include it word for word.
- If a guideline point is given, add ONE neutral sentence: name the guideline, quote its point briefly, and ask whether the firm could advise on whether it applies to what happened. Never say the guideline was breached.
- End with how to reach them: the email and phone given. No postal address.`;

function fundingSentence(la: LegalAidSummary): string {
  if (!la) return "";
  if (la.verdict === "likely") return "The Scottish Legal Aid Board's online calculator suggests I may qualify financially for civil legal aid, though I understand this is only an estimate.";
  if (la.verdict === "unlikely") return "The Scottish Legal Aid Board's online calculator suggests I may not qualify financially for legal aid, so I would like to know whether you take cases like this on a no win, no fee basis.";
  return "I would also like to know how a case like this could be funded.";
}

export async function draftEnquiry(facts: CaseFacts, la: LegalAidSummary, evidence?: { guideline: string; point: string; question: string }): Promise<EnquiryMessage> {
  const name = [facts.firstName, facts.lastName].filter(Boolean).join(" ");
  const funding = fundingSentence(la);
  return structured({
    model: MODELS.draft,
    effort: EFFORT.draft,
    instructions: DRAFT_RULES,
    input: `Name: ${name}\nEmail: ${facts.email ?? ""}\nPhone: ${facts.phone ?? ""}\nWhere: ${facts.incidentLocation ?? ""}\nWhat happened: ${facts.incidentSummary ?? ""}\nTimeline:\n${facts.events.map((e) => `- ${e.date}: ${e.what}`).join("\n")}\nWhat they want: ${facts.desiredOutcome ?? ""}\nFunding sentence to include word for word: ${funding || "(none)"}${evidence ? `\nGuideline point (D62): ${evidence.guideline}: "${evidence.point}". Question it raises: ${evidence.question}` : ""}`,
    schema: DraftSchema,
    name: "enquiry_draft",
  });
}

/* ------------------------------------------------------------------ open tabs, kept for the send */

export type Open = { page: Page; firm: FirmFinding; email: string | null; runId: string; tracer: Tracer; note: Note };
type Registry = { tabs: Map<string, Open>; browser?: Browser };
const holder = globalThis as unknown as { __enquiryTabs?: Registry };
// On globalThis: Next.js can load this module once per route bundle, and /send must see the tabs /step4 opened.
const REG: Registry = (holder.__enquiryTabs ??= { tabs: new Map<string, Open>() });

/** Keep a filled form's tab open so /api/agent/step4/send can press Send after the user approves (used by the planner, D47). */
export function keepForApproval(firmId: string, open: Open) {
  REG.tabs.set(firmId, open);
}

/** The filled forms in this browser that are still waiting for the user's OK. */
export function approvalTabs(context: BrowserContext): Page[] {
  return [...REG.tabs.values()].map((o) => o.page).filter((p) => !p.isClosed() && p.context() === context);
}

/** A form that has been sent (or refused) is finished with: close its tab. The browser closes itself with its last tab (D57). */
async function releaseTab(firmId: string) {
  const open = REG.tabs.get(firmId);
  REG.tabs.delete(firmId);
  await open?.page.close().catch(() => {});
}

/* ------------------------------------------------------------------ finding the form */

const FORM_SEL = "form textarea:visible, form input[type=email]:visible, textarea:visible";
const hasForm = async (page: Page) => (await page.locator(FORM_SEL).count().catch(() => 0)) > 0;

/** A form inside an iframe (embedded form tools): open the iframe's page in the tab so the agent can fill it. */
async function formInFrame(page: Page): Promise<string | null> {
  for (const f of page.frames()) {
    if (f === page.mainFrame() || !/^https?:/.test(f.url())) continue;
    const n = await f.locator("textarea, input[type=email]").count().catch(() => 0);
    if (n > 0) return f.url();
  }
  return null;
}

/**
 * Find a usable enquiry form: the URL step 3 found, else up to `maxHops` clicks on contact/enquiry links or buttons
 * (popups count: a button that reveals a form), with the Decisions API choosing when there are several. Iframes are opened directly.
 */
async function findForm(page: Page, firm: FirmFinding, note: Note, track: Tracker, maxHops = 5): Promise<boolean> {
  const start = firm.enquiryUrl ?? firm.website;
  if (!start) return false;
  note(firm.enquiryUrl ? "Opening their enquiry page" : "Opening their website");
  await page.goto(start, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1500);
  await dismissCookies(page, 2500);
  await note.log("open", firm.enquiryUrl ? "Opened the enquiry page step 3 found" : "Opened their website", { shot: true });
  const tried = new Set<string>();
  for (let hop = 0; hop <= maxHops; hop++) {
    if (await hasForm(page)) return true;
    const framed = await formInFrame(page);
    if (framed) {
      await note.log("recover", "The form is inside an embedded frame; opening it directly", { url: framed });
      await page.goto(framed, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1200);
      if (await hasForm(page)) return true;
    }
    if (hop === maxHops) break;
    note("Looking harder for their enquiry form");
    const cands = await page.$$eval("a[href], button, [role=button]", (els) =>
      els
        .map((el, i) => {
          el.setAttribute("data-enq", String(i));
          const r = (el as HTMLElement).getBoundingClientRect();
          return { i, text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60), href: (el as HTMLAnchorElement).href ?? "", visible: r.width > 0 && r.height > 0 };
        })
        .filter((c) => c.text || c.href),
    );
    const re = /contact|enquir|get in touch|make an enquiry|request a call|call ?back|free consultation|speak to|talk to us/i;
    const options = cands.filter((c) => c.visible && re.test(`${c.text} ${c.href}`) && !tried.has(c.href || c.text)).slice(0, 12);
    if (options.length === 0) break;
    let pick = options[0];
    if (options.length > 1) {
      // If the Decisions API is down (it has returned 503s), take the first plausible option and say so, instead of failing the firm.
      const decided = await decide(`Firm: ${firm.name}. We need the page or button that opens their online enquiry form. Options on ${page.url()}:\n${options.map((o, k) => `${k}: "${o.text}" ${o.href}`).join("\n")}`, [
        { type: "choice", name: "next", instructions: "Which option most likely opens a form to send the firm an enquiry (not a phone number, email link or office address)?", choices: options.map((o, k) => ({ value: String(k), description: o.text || o.href })) },
      ]).catch(() => null);
      const a = decided?.answers[0];
      if (a?.type === "choice") pick = options[Number(a.choice)] ?? pick;
      await note.log("decide", decided ? `Chose "${pick.text || pick.href}" out of ${options.length} contact options` : `The model was unavailable, so we tried the first contact option, "${pick.text || pick.href}"`, {
        confidence: a?.type === "choice" ? a.confidence : undefined,
        detail: options.map((o) => `${o === pick ? "→ " : "  "}${o.text || "(no text)"}  ${o.href}`).join("\n"),
      });
    }
    tried.add(pick.href || pick.text);
    if (/^mailto:|^tel:/i.test(pick.href)) break;
    const el = page.locator(`[data-enq="${pick.i}"]`).first();
    await pointAt(page, el).catch(() => {});
    const before = page.url();
    await el.click({ timeout: 5000 }).catch(async () => {
      if (/^https?:/.test(pick.href)) await page.goto(pick.href, { waitUntil: "domcontentloaded", timeout: 20000 });
    });
    track.bump("action");
    await page.waitForTimeout(2000);
    await dismissCookies(page, 1500);
    await note.log("click", page.url() !== before ? `Opened "${pick.text || pick.href}"` : `Clicked "${pick.text}" (it may open a popup)`, { shot: true });
  }
  return hasForm(page);
}

/* ------------------------------------------------------------------ filling */

function enquiryValues(facts: CaseFacts, m: EnquiryMessage): Value[] {
  const parts = (facts.address ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const v = (key: string, description: string, value: string | null | undefined): Value => ({ key, description, value: value ?? "" });
  return [
    v("title", "Title, e.g. Ms", facts.title),
    v("first_name", "First name (forenames, given name)", facts.firstName),
    v("last_name", "Last name (surname, family name)", facts.lastName),
    v("full_name", "Full name (your name)", [facts.firstName, facts.lastName].filter(Boolean).join(" ")),
    v("email", "Email address (also 'confirm email')", facts.email),
    v("phone", "Telephone / mobile number", facts.phone),
    v("postcode", "Postcode", facts.postcode),
    v("address", "Address (first line)", parts[0]),
    v("town", "Town or city", parts.length > 1 ? parts[parts.length - 1] : ""),
    v("subject", "Subject of the enquiry", m.subject),
    v("message", "The enquiry message: 'how can we help', 'your message', 'brief details of your enquiry', 'tell us about your case'", m.body),
    v("area_of_law", "Area of law or type of enquiry: medical negligence (clinical negligence, personal injury if there is no medical option)", "Medical negligence"),
  ];
}

const CONSENT_RE = /agree|consent|privacy|terms|accept|confirm|acknowledge|understand|legal aid/i;

/** What is on their form now (for the review), the consent boxes still unticked, and required fields still empty. */
async function readForm(page: Page, before?: Map<string, string>) {
  const o = await observe(page);
  const filled: { label: string; value: string }[] = [];
  const unfilled: string[] = [];
  const consents: string[] = [];
  const fields: FormField[] = [];
  for (const e of o.elements) {
    const label = (e.label || e.name || "").replace(/\s+/g, " ").trim();
    if ((e.kind === "text" || e.kind === "textarea" || e.kind === "select") && label && !/search/i.test(label) && !e.disabled)
      fields.push({ name: e.name, label: cleanLabel(e), value: e.value, kind: e.kind, required: e.required, options: e.kind === "select" ? e.options.filter((x) => x.trim() && !PLACEHOLDER.test(x.trim())) : undefined });
    // A value that was already there before the agent started is the form's own default, not something we chose: say so.
    const mark = (v: string) => (before && before.get(label) === v ? `${label} (the form's default; we did not choose it)` : label);
    if ((e.kind === "text" || e.kind === "textarea") && e.value.trim() && !/search/i.test(label)) filled.push({ label: mark(e.value), value: e.value });
    else if (e.kind === "select" && e.value.trim() && !/^(-+|please|select|choose)/i.test(e.value.trim())) filled.push({ label: mark(e.value), value: e.value });
    else if (e.kind === "radio" && e.checked) filled.push({ label: e.group || label, value: label });
    if (e.kind === "checkbox" && !e.checked && (e.required || CONSENT_RE.test(label)) && label) consents.push(label);
    if ((e.kind === "text" || e.kind === "textarea" || e.kind === "select") && e.required && !e.value.trim()) unfilled.push(label);
  }
  return { filled, unfilled: [...new Set(unfilled)], consents: [...new Set(consents)], fields };
}

/** The form's values before the agent touches it (label -> value), to tell its defaults apart from what we typed. */
async function snapshot(page: Page) {
  const o = await observe(page);
  return new Map(o.elements.filter((e) => e.kind === "text" || e.kind === "textarea" || e.kind === "select").map((e) => [(e.label || e.name || "").replace(/\s+/g, " ").trim(), e.value]));
}


/* ------------------------------------------------------------------ one firm */

const noop = Object.assign(() => {}, { log: async () => {} }) as Note;

/**
 * Find and fill one firm's enquiry form in `page`, stopping before Send. Returns the outcome (never sends).
 * Used by the run (one tab per firm) and by the benchmark (`scripts/bench.ts`), which passes no note or tracker.
 */
export async function fillOne(
  p: Page,
  f: FirmFinding,
  input: { facts: CaseFacts; message: EnquiryMessage },
  note: Note = noop,
  track: Pick<Tracker, "bump"> = { bump: () => {} },
  put: (o: EnquiryOutcome) => void = () => {},
): Promise<EnquiryOutcome> {
  const base: EnquiryOutcome = { firmId: f.id, firmName: f.name, status: "queued", formUrl: null, filled: [], unfilled: [], consents: [], note: "Waiting" };
  put({ ...base, status: f.enquiryUrl ? "filling" : "finding_form", note: f.enquiryUrl ? "Opening their enquiry form" : "Looking for their enquiry form" });
  const found = await findForm(p, f, note, track as Tracker);
  if (!found) {
    await note.log("recover", "No online enquiry form on their site, even after a harder look", { shot: true });
    note("No online form");
    return { ...base, status: "no_form", note: "No online enquiry form on their website" };
  }
  const formUrl = p.url();
  put({ ...base, status: "filling", formUrl, note: "Filling their enquiry form" });
  note("Filling their enquiry form");
  await pointAt(p, p.locator(FORM_SEL).first()).catch(() => {});
  const before = await snapshot(p);
  const goal = "Fill in this law firm's enquiry form with the saved values. Leave fields empty when no saved value fits. Do not tick any checkbox and do not submit.";
  const values = enquiryValues(input.facts, input.message);
  const onEvent = (e: { type: string }) => {
    if (e.type === "action") track.bump("action");
  };
  let run: { status: string; question?: string };
  try {
    run = await runDecisionAgent({ page: p, goal, values, allowCheckboxes: false, allowSubmit: false, maxSteps: 6, onEvent });
  } catch (e) {
    // Recovery (D46): the Decisions API is down or overloaded. Switch to the backup engine (tool-calling model) and carry on.
    const why = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 120);
    note("Main engine unavailable; switching to the backup engine");
    await note.log("recover", `The decision service failed (${why}). Switched to the backup engine to fill the form.`);
    run = await runBrowserAgent({ page: p, goal, values, allowCheckboxes: false, allowSubmit: false, maxSteps: 10, onEvent });
  }
  const form = await readForm(p, before);
  await note.log("type", `Filled ${form.filled.length} field${form.filled.length === 1 ? "" : "s"}; stopped before Send`, {
    shot: true,
    detail: form.filled.map((x) => `${x.label}: ${x.value.length > 80 ? x.value.slice(0, 80) + "…" : x.value}`).join("\n"),
  });
  const missing = form.unfilled.filter((l) => !CONSENT_RE.test(l));
  if (missing.length > 0) {
    note("Needs an answer from you");
    return { ...base, status: "needs_input", formUrl, filled: form.filled, unfilled: missing, consents: form.consents, fields: form.fields, question: `Their form asks for: ${missing.join(", ")}. We do not have this.`, note: `The form asks for something we do not know (${missing.join(", ")})` };
  }
  if (run.status === "needs_input" && run.question && !/confirm/i.test(run.question)) await note.log("check", run.question);
  if (form.consents.length) await note.log("check", `${form.consents.length} consent box${form.consents.length === 1 ? "" : "es"} left unticked for your approval`, { detail: form.consents.join("\n") });
  note("Filled. Waiting for your approval");
  return { ...base, status: "ready_to_send", formUrl, filled: form.filled, unfilled: [], consents: form.consents, fields: form.fields, note: "Form filled and stopped before Send. Waiting for your approval" };
}

/* ------------------------------------------------------------------ the run */

export async function runEnquiries(
  input: { facts: CaseFacts; message: EnquiryMessage; firms: FirmFinding[]; reserves?: FirmFinding[]; legalAid?: LegalAidSummary },
  opts: { onEvent?: (e: Step4Event) => void; keepOpen?: boolean } = {},
): Promise<Step4Result> {
  const firms = input.firms.slice(0, MAX_ENQUIRIES);
  const runId = `step4-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = path.join(process.cwd(), ".runs", runId);
  const log = makeLogger(runDir);
  const send4 = (e: Step4Event) => {
    if (e.type !== "stats") log({ type: "status", message: JSON.stringify(e).slice(0, 2000) });
    opts.onEvent?.(e);
  };
  // The shared step 3 machinery speaks Step3Event; agent, stats, trace and status events are the same in step 4.
  const emit: Emit = (e: Step3Event) => {
    if (e.type === "agent" || e.type === "stats" || e.type === "trace" || e.type === "status") send4(e);
  };
  const track = new Tracker(emit);
  const tracer = new Tracer(emit, runDir);

  // Filling a newly selected firm must not close other forms awaiting approval.
  for (const firm of firms) await releaseTab(firm.id);

  const { browser, context, page } = await openSession();
  REG.browser = browser;
  const ctx = { context: context as BrowserContext, emit, track, tracer, first: page };
  const outcomes = new Map<string, EnquiryOutcome>();
  const put = (o: EnquiryOutcome) => {
    outcomes.set(o.firmId, o);
    send4({ type: "enquiry", enquiry: o });
  };
  let keep = false;
  try {
    send4({ type: "status", message: `Contacting ${firms.length} firm${firms.length === 1 ? "" : "s"}. Nothing is sent without your approval.` });
    const base = (f: FirmFinding): EnquiryOutcome => ({ firmId: f.id, firmName: f.name, status: "queued", formUrl: null, filled: [], unfilled: [], consents: [], note: "Waiting" });
    firms.forEach((f) => put(base(f)));

    // One worker per firm. A failure is retried once by itself; a firm with no online form is swapped for the
    // next best reserve firm (D46), so the user still ends up with up to 3 firms they can contact.
    const reserves = (input.reserves ?? []).filter((r) => r.website && !firms.some((f) => f.id === r.id));
    const order: string[] = firms.map((f) => f.id);
    const label = (f: FirmFinding) => f.name.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, "").slice(0, 28);
    const work = async (f: FirmFinding, swappedFor?: string): Promise<void> => {
      let attempts = 0;
      let last: EnquiryOutcome | undefined;
      while (attempts < 2) {
        attempts++;
        const r = await agent(
          ctx,
          attempts > 1 ? `${label(f)} (retry)` : label(f),
          async (p, note) => {
            const o = await fillOne(p, f, input, note, track, (x) => put({ ...x, swappedFor, attempts }));
            if (o.status === "ready_to_send" || o.status === "needs_input") REG.tabs.set(f.id, { page: p, firm: f, email: input.facts.email, runId, tracer, note });
            return o;
          },
          150_000,
          [f.id],
        );
        if (r.ok) {
          last = { ...r.value, swappedFor, attempts };
          break;
        }
        last = { ...(outcomes.get(f.id) ?? base(f)), status: "failed", note: `Stopped: ${r.error}`, swappedFor, attempts };
        if (attempts < 2) {
          put({ ...last, status: "filling", note: "Something went wrong; trying again" });
          tracer.add({ agent: label(f), color: "#e64d00", kind: "recover", text: `Failed (${r.error}); retrying once`, firms: [f.id] });
          await new Promise((res) => setTimeout(res, 2500));
        }
      }
      put(last!);
      if (last!.status === "no_form") {
        const next = reserves.shift();
        if (next) {
          put({ ...last!, note: `No online enquiry form, so we swapped in ${next.name}` });
          tracer.add({ agent: label(f), color: "#e64d00", kind: "recover", text: `${f.name} has no online form; swapping in ${next.name}`, firms: [f.id, next.id] });
          order.push(next.id);
          put({ ...base(next), status: "finding_form", note: `Replacing ${f.name}`, swappedFor: f.name });
          await work(next, f.name);
        } else put({ ...last!, note: "No online enquiry form, and no other checked firm left to try" });
      }
    };
    await Promise.all(firms.map((f) => work(f)));

    const result: Step4Result = { enquiries: order.map((id) => outcomes.get(id)!).filter(Boolean), stats: track.stats, runId, trace: tracer.steps };
    send4({ type: "result", result });
    const waiting4Ok = approvalTabs(context);
    if (opts.keepOpen && waiting4Ok.length > 0) {
      keep = true; // only the filled forms stay open for the approvals; the rest close now (D57). All close after 15 minutes.
      await keepOnlyTabs(context, waiting4Ok);
    }
    return result;
  } finally {
    if (!keep) {
      REG.tabs.clear();
      await browser.close().catch(() => {});
    }
  }
}

/* ------------------------------------------------------------------ send */

/** Why the server refuses to send, or null. Checked before anything else (D45). */
export function sendGate(email: string | null): string | null {
  if (email && /@(.+\.)?example\.(com|org|net)$/i.test(email.trim())) return "Not sent: this is a demo persona. We never send fictional enquiries to real firms.";
  if (process.env.ALLOW_REAL_SEND !== "1") return "Not sent: real sending is switched off on this server (ALLOW_REAL_SEND is not set).";
  return null;
}

/** A dropdown's label often swallows its option text ("AreaPlease selectMedical negligence"): show just the label. */
function cleanLabel(e: { label: string; name: string; kind: string; options: string[] }) {
  let l = (e.label || e.name || "").replace(/\s+/g, " ").trim();
  if (e.kind === "select") {
    const tail = e.options.join("");
    const tail2 = e.options.join(" ");
    for (const t of [tail, tail2]) if (t && l.endsWith(t) && l.length > t.length) l = l.slice(0, -t.length).trim();
  }
  return l;
}
const squash = (x: string) => x.replace(/\s+/g, " ").trim().toLowerCase();
const gone = (firmId: string, open?: Open): EnquiryOutcome => ({ firmId, firmName: open?.firm.name ?? firmId, status: "failed", formUrl: null, filled: [], unfilled: [], consents: [], note: "The filled form is no longer open (a form closes once it is sent, or after 15 minutes). Fill the forms again, then approve." });

/**
 * Type the user's edits into the open form (D64). Fields are found again by name and label, never by position.
 * Nothing is sent. Returns how many were applied and the labels that could not be found on the page any more.
 */
async function applyEdits(open: Open, edits: FieldEdit[]): Promise<{ applied: number; missed: string[] }> {
  const { page, note } = open;
  let applied = 0;
  const missed: string[] = [];
  for (const ed of edits) {
    const o = await observe(page);
    const fields = o.elements.filter((e) => e.kind === "text" || e.kind === "textarea" || e.kind === "select");
    const same = (e: (typeof fields)[number]) => squash(cleanLabel(e)) === squash(ed.label);
    const el = fields.find((e) => same(e) && e.name === ed.name) ?? fields.find(same) ?? fields.find((e) => ed.name && e.name === ed.name);
    if (!el) {
      missed.push(ed.label);
      continue;
    }
    const loc = page.locator(`[data-aid="${el.id}"]`);
    await pointAt(page, loc).catch(() => {});
    try {
      if (el.kind === "select") {
        const want = squash(ed.value);
        const opt = el.options.find((x) => squash(x) === want) ?? el.options.find((x) => squash(x).includes(want) || want.includes(squash(x)));
        if (!opt) {
          missed.push(ed.label);
          continue;
        }
        await loc.selectOption({ label: opt }, { timeout: 5000 });
      } else {
        await loc.fill(ed.value, { timeout: 5000 });
      }
      applied++;
      await note.log("type", `Changed "${ed.label.slice(0, 60)}" to what you entered`, { shot: applied === edits.length });
    } catch {
      missed.push(ed.label);
    }
  }
  return { applied, missed };
}

/** The open form as the review should show it now: ready, or still missing required fields only the user can supply. */
async function describeForm(open: Open, why?: string): Promise<EnquiryOutcome> {
  const form = await readForm(open.page);
  const missing = form.unfilled.filter((l) => !CONSENT_RE.test(l));
  const base: EnquiryOutcome = { firmId: open.firm.id, firmName: open.firm.name, status: "ready_to_send", formUrl: open.page.url(), filled: form.filled, unfilled: [], consents: form.consents, fields: form.fields, note: "" };
  if (missing.length) return { ...base, status: "needs_input", unfilled: missing, question: `Their form still needs: ${missing.join(", ")}.`, note: why ?? `The form needs ${missing.join(", ")} from you` };
  return { ...base, note: why ?? "Form filled and stopped before Send. Waiting for your approval" };
}

/** POST /api/agent/step4/edit: apply the user's edits to the open form and report how it looks now. Never sends. */
export async function editEnquiry(firmId: string, edits: FieldEdit[]): Promise<EnquiryOutcome> {
  const open = REG.tabs.get(firmId);
  if (!open || open.page.isClosed()) return gone(firmId, open);
  const { missed } = await applyEdits(open, edits);
  const out = await describeForm(open);
  return missed.length ? { ...out, note: `${out.note}. Could not find on their page any more: ${missed.join(", ")}` } : out;
}

export async function sendEnquiry(firmId: string, agreed: string[], edits: FieldEdit[] = []): Promise<EnquiryOutcome> {
  const open = REG.tabs.get(firmId);
  if (!open || open.page.isClosed()) return gone(firmId, open);
  const { page, firm, note } = open;
  let form = await readForm(page);
  const mk = (): EnquiryOutcome => ({ firmId, firmName: firm.name, status: "ready_to_send", formUrl: page.url(), filled: form.filled, unfilled: [], consents: form.consents, fields: form.fields, note: "" });
  let base = mk();

  const blocked = sendGate(open.email);
  if (blocked) {
    await note.log("check", blocked);
    await releaseTab(firmId); // it will never be sent from here, so do not leave a stale form on screen
    return { ...base, status: "send_blocked", note: blocked };
  }

  // The user's edits go into the form first, then we check nothing required is still empty.
  if (edits.length) {
    await applyEdits(open, edits);
    form = await readForm(page);
    base = mk();
  }
  const missing = form.unfilled.filter((l) => !CONSENT_RE.test(l));
  if (missing.length) return { ...base, status: "needs_input", unfilled: missing, question: `Their form still needs: ${missing.join(", ")}.`, note: `The form still needs ${missing.join(", ")}` };

  // Tick only the consent boxes whose text the user agreed to, word for word.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const ok = new Set(agreed.map(norm));
  const o = await observe(page);
  for (const e of o.elements) {
    if (e.kind !== "checkbox" || e.checked) continue;
    if (!ok.has(norm(e.label || e.name || ""))) continue;
    const box = page.locator(`[data-aid="${e.id}"]`);
    await box.check({ force: true, timeout: 4000 }).catch(() => box.click({ force: true }).catch(() => {}));
    await note.log("click", `Ticked "${(e.label || "").slice(0, 80)}" (you agreed to it)`);
  }
  const left = (await readForm(page)).consents.filter((c) => !ok.has(norm(c)));
  if (left.length) return { ...base, status: "needs_input", consents: left, question: "Their form still needs these boxes ticked.", note: "Some consent boxes still need your agreement" };

  const button = page.locator("form button[type=submit]:visible, form input[type=submit]:visible, button:visible").filter({ hasText: /send|submit|enquir|request|call ?back/i }).first();
  const submit = (await button.count()) ? button : page.locator("form button[type=submit]:visible, form input[type=submit]:visible").first();
  if (!(await submit.count())) return { ...base, status: "failed", note: "Could not find their Send button" };
  if (await submit.isDisabled().catch(() => false)) return { ...base, status: "failed", note: "Their Send button is still disabled (a required field may be empty)" };
  await pointAt(page, submit).catch(() => {});
  await note.log("click", "Pressing Send (you approved this firm)", { shot: true });
  await submit.click({ timeout: 8000 });
  await page.waitForTimeout(5000);

  const text = (await pageText(page)).replace(/\s+/g, " ");
  const captcha = (await page.locator("iframe[src*='recaptcha'][title*='challenge' i], iframe[src*='hcaptcha']").count().catch(() => 0)) > 0 || /captcha|verify you are human|i'?m not a robot/i.test(text);
  if (captcha) {
    await note.log("fail", "A CAPTCHA appeared after Send. We do not try to get past it: open the browser window and finish it yourself.", { shot: true });
    return { ...base, status: "failed", note: "A CAPTCHA appeared after Send. Finish it yourself in the browser window." };
  }
  const thanks = text.match(/[^.]*\b(thank you|thanks|received|has been sent|we will be in touch|we'll be in touch|been submitted)\b[^.]*\./i);
  if (thanks) {
    await note.log("result", "The firm's page confirmed the enquiry", { shot: true, detail: thanks[0] });
    await releaseTab(firmId);
    return { ...base, status: "sent", sentAt: new Date().toISOString(), confirmation: thanks[0].trim().slice(0, 240), note: "Sent. Their page confirmed it" };
  }
  const err = text.match(/[^.]*\b(required|invalid|please (enter|complete|fill)|error)\b[^.]*\./i);
  await note.log("fail", err ? `The form showed an error: ${err[0]}` : "No confirmation appeared after Send", { shot: true });
  return { ...base, status: "failed", note: err ? `Their form said: ${err[0].trim().slice(0, 160)}` : "We pressed Send but saw no confirmation. Check the browser window." };
}
