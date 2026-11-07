import path from "node:path";
import type { Page } from "playwright";
import type { FunctionTool, Response, ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";
import { z } from "zod";
import { dismissCookies, openSession } from "../browser";
import { pointAt } from "../agentCursor";
import type { CaseFacts } from "./facts";
import { EFFORT, MODELS, openai, structured } from "./llm";
import { makeLogger } from "./events";
import {
  agent,
  fillCalculatorDirectly,
  lawSocietyCheck,
  mergeCards,
  pageText,
  readVerdict,
  runFinder,
  score,
  slug,
  SLAB_CALC,
  Tracer,
  Tracker,
  vetFirm,
  type Evidence,
  type Note,
} from "./legalAid";
import type { FirmFinding, Funding, Route, Verdict } from "./legalAidTypes";
import type { AskSpec, PlannerEvent, PlannerResult, PlanStep, Thought } from "./plannerTypes";

/**
 * The planner agent (D47). A reasoning model plans its own route through the compensation research, calling
 * browser workers as tools. Several tools in one turn run at the same time in separate tabs. Workers ask the user
 * when a site needs something we do not know (the calculator asks the money questions itself, one at a time, only
 * those the site actually shows). Nothing is ever submitted.
 */

const MAX_TURNS = 14;
const MAX_TABS = 4;
const ASK_TIMEOUT_MS = 5 * 60 * 1000;
const SEARCH = "https://search.brave.com/search?q=";

type Emit = (e: PlannerEvent) => void;

/* ------------------------------------------------------------------ answers from the user, by run */

type Waiter = (answer: string | null) => void;
const g = globalThis as typeof globalThis & { __plannerAnswers?: Map<string, Map<string, Waiter>> };
const waiting = (g.__plannerAnswers ??= new Map());

/** Called by POST /api/agent/plan/answer. Returns false if nothing is waiting for that question. */
export function answerQuestion(runId: string, id: string, answer: string | null): boolean {
  const w = waiting.get(runId)?.get(id);
  if (!w) return false;
  waiting.get(runId)!.delete(id);
  w(answer);
  return true;
}

/* ------------------------------------------------------------------ small helpers */

/** At most `n` browser tools at once; the rest wait their turn. */
function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

const num = (s: string | null) => {
  if (s === null) return null;
  const v = Number(s.replace(/[£,\s]/g, "").replace(/k$/i, "000"));
  return Number.isFinite(v) && v >= 0 ? v : null;
};
const yes = (s: string | null) => (s === null ? null : /^(y|yes|true)/i.test(s.trim()));
const short = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* ------------------------------------------------------------------ the calculator, asking as it goes */

type Ask = (spec: Omit<AskSpec, "id">) => Promise<string | null>;

export async function calculatorAsking(page: Page, funding: Funding, ask: Ask, note: Note, track: Tracker) {
  note("Opening SLAB's calculator");
  await page.goto(SLAB_CALC, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  await dismissCookies(page, 3000);
  await note.log("open", "Opened SLAB's civil legal aid calculator", { shot: true });

  /** The calculator's yes/no questions in page order: 0 = benefits, 1 = partner. The site-search radios are skipped. */
  const radio = async (index: number, answer: "Yes" | "No") => {
    const id = await page.evaluate(
      ({ i, a }) => {
        const rs = ([...document.querySelectorAll("input[type=radio]")] as HTMLInputElement[]).filter((r) => !/search/.test(r.name));
        const names = [...new Set(rs.map((r) => r.name))];
        const r = rs.find((x) => x.name === names[i] && (x.labels?.[0]?.innerText ?? "").trim() === a);
        return r && !r.checked ? r.id : null;
      },
      { i: index, a: answer },
    );
    if (!id) return;
    const label = page.locator(`label[for="${id}"]`);
    await pointAt(page, label);
    await label.click().catch(() => {});
    track.bump("action");
    await page.waitForTimeout(800);
  };
  const field = async (label: RegExp, value: number) => {
    const el = page.getByLabel(label).first();
    if (!(await el.isVisible().catch(() => false))) return;
    await pointAt(page, el);
    await el.fill(String(value)).catch(() => {});
    await el.press("Tab").catch(() => {});
    track.bump("action");
  };
  // Ask only what is not known yet, at the moment the calculator shows that question.
  const need = async <K extends keyof Funding>(key: K, spec: Omit<AskSpec, "id" | "agent">, parse: (s: string | null) => Funding[K] | null) => {
    if (funding[key] !== null) return funding[key];
    note("Waiting for your answer");
    await pointAt(page, page.locator("input:visible, select:visible").last());
    const a = parse(await ask({ ...spec, agent: "SLAB calculator" }));
    if (a !== null) funding[key] = a;
    note("Got it, carrying on");
    return a;
  };

  const benefits = await need("onBenefits", { question: "Do you get Income Support, income-based Jobseeker's Allowance, income-related ESA or Universal Credit?", why: "This is the calculator's first question. If yes, you automatically qualify financially and it asks nothing else.", kind: "yes_no" }, yes);
  if (benefits === null) return { verdict: "unknown" as Verdict, quote: "", skipped: true };
  await radio(0, benefits ? "Yes" : "No");
  if (!benefits) {
    const partner = await need("partner", { question: "Do you have a partner or spouse?", why: "The calculator asks this next.", kind: "yes_no" }, yes);
    if (partner !== null) await radio(1, partner ? "Yes" : "No");
    const deps = await need("dependants", { question: "How many dependants (adults or children with no income of their own) live with you?", why: "The calculator asks this next.", kind: "number" }, (s) => (num(s) === null ? null : Math.min(10, Math.round(num(s)!))));
    const sel = page.getByLabel(/how many dependants/i).first();
    if (deps !== null && (await sel.isVisible().catch(() => false))) {
      await pointAt(page, sel);
      await sel.selectOption(String(deps)).catch(() => {});
      track.bump("action");
    }
    const income = await need("netIncomeYearly", { question: "Roughly what is your yearly income after tax?", why: "The calculator needs your net annual income. A rough figure is fine.", kind: "money" }, num);
    if (income !== null) await field(/net annual income/i, income);
    const out = await need("outgoingsYearly", { question: "Roughly how much do you spend a year on rent, bills and other essentials?", why: "The calculator needs your annual outgoings.", kind: "money" }, num);
    if (out !== null) await field(/annual outgoings/i, out);
    const savings = await need("savings", { question: "How much do you have in savings?", why: "The calculator needs your 'disposable capital'. Enter 0 if none.", kind: "money" }, num);
    if (savings !== null) await field(/total disposable capital/i, savings);
  }
  await page.waitForTimeout(1500);
  let { verdict, quote } = readVerdict(await page.evaluate(() => document.body.innerText));
  if (verdict === "unknown" && !funding.skipped) {
    // Recovery: something did not register on the page. Fill every answer again by label, then read again.
    note("No estimate yet; filling the answers again");
    await note.log("recover", "SLAB showed no estimate after the answers, so the agent filled them again by their labels", { shot: true });
    await fillCalculatorDirectly(page, funding, track);
    await page.waitForTimeout(1500);
    ({ verdict, quote } = readVerdict(await page.evaluate(() => document.body.innerText)));
  }
  await pointAt(page, page.getByText(/Step 5:?\s*Estimate/i).first());
  note(verdict === "likely" ? "Likely to qualify financially" : verdict === "unlikely" ? "Unlikely to qualify" : "No estimate");
  await note.log("result", verdict === "likely" ? "SLAB's estimate: likely to qualify financially" : verdict === "unlikely" ? "SLAB's estimate: unlikely to qualify" : "Could not read SLAB's estimate", { shot: true, detail: quote ? `"${quote}"` : undefined });
  return { verdict, quote, skipped: false };
}

/* ------------------------------------------------------------------ web search and reading any page */

async function webSearch(page: Page, query: string, note: Note, track: Tracker) {
  note(`Searching: ${short(query, 50)}`);
  await page.goto("https://search.brave.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
  const box = page.locator("textarea[name=q], input[name=q]").first();
  if (await box.isVisible({ timeout: 4000 }).catch(() => false)) {
    await pointAt(page, box);
    await box.fill(query);
    track.bump("action");
    await box.press("Enter");
  } else await page.goto(SEARCH + encodeURIComponent(query), { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);
  const results = await page.evaluate(() => {
    const seen = new Set<string>();
    const out: { title: string; url: string; snippet: string }[] = [];
    for (const a of [...document.querySelectorAll("a[href^='http']")] as HTMLAnchorElement[]) {
      const host = new URL(a.href).hostname;
      if (/brave\.com|bing\.com|google\.|youtube\.com|facebook\.com/.test(host) || seen.has(host)) continue;
      const title = (a.innerText || "").replace(/\s+/g, " ").trim();
      if (title.length < 12) continue;
      seen.add(host);
      const box = a.closest("div[class*=snippet], li, article, div") as HTMLElement | null;
      out.push({ title: title.slice(0, 100), url: a.href, snippet: (box?.innerText ?? "").replace(/\s+/g, " ").slice(0, 220) });
      if (out.length >= 8) break;
    }
    return out;
  });
  await note.log("read", `Search "${query}": ${results.length} results`, { shot: true, detail: results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n") });
  note(`${results.length} results`);
  return results;
}

const Reading = z.object({
  answer: z.string().describe("Answer to the question from this page only, at most 3 sentences. Say plainly if the page does not say."),
  links: z.array(z.object({ text: z.string(), url: z.string() })).describe("Up to 5 links on the page worth following for the question"),
});

async function visit(page: Page, url: string, question: string, note: Note) {
  note(`Opening ${short(new URL(url).hostname.replace(/^www\./, ""), 40)}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1500);
  await dismissCookies(page, 2500);
  await note.log("open", `Opened ${page.url()}`, { shot: true });
  await page.mouse.wheel(0, 600).catch(() => {});
  note("Reading");
  const text = (await pageText(page)).replace(/\s+/g, " ").slice(0, 8000);
  const links = await page.$$eval("a[href^='http']", (as) => as.slice(0, 120).map((a) => `${(a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60)} -> ${(a as HTMLAnchorElement).href}`).filter((l) => l.length > 10).join("\n"));
  const r = await structured({
    model: MODELS.browser,
    effort: EFFORT.browser,
    instructions: "You read one web page for a research agent. Answer only from the page text. Never invent facts.",
    input: `Question: ${question}\nPage: ${page.url()}\n\nPage text:\n${text}\n\nLinks:\n${links}`,
    schema: Reading,
    name: "page_reading",
  });
  await note.log("read", `Read ${page.url()}: ${short(r.answer, 160)}`, { detail: `Question: ${question}\n\n${r.answer}` });
  note("Done reading");
  return { url: page.url(), answer: r.answer, links: r.links.slice(0, 5) };
}

/* ------------------------------------------------------------------ the tools the planner can call */

const WHY = { why: { type: "string", description: "One short line, shown to the user: why you are doing this now." } } as const;
const tool = (name: string, description: string, props: Record<string, unknown>, required: string[]): FunctionTool => ({
  type: "function",
  name,
  description,
  strict: false,
  parameters: { type: "object", properties: { ...WHY, ...props }, required: ["why", ...required] },
});

const TOOLS: FunctionTool[] = [
  tool("update_plan", "Write or rewrite your plan as a short checklist. Call it first, and again whenever what you learn changes the plan.", {
    steps: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, status: { type: "string", enum: ["todo", "doing", "done", "dropped"] }, why: { type: "string" } }, required: ["id", "text", "status"] } },
  }, ["steps"]),
  tool("slab_calculator", "Run SLAB's civil legal aid calculator in a browser tab. It asks the user its money questions itself, only when needed. Returns SLAB's estimate.", {}, []),
  tool("slab_lawyer_list", "Search SLAB's Find a Solicitor for civil legal aid, medical negligence, active firms, nearest first. Returns the firms (ids you can use later).", {}, []),
  tool("web_search", "Search the web (Brave) in a browser tab. Use it to find firms or sources that are not on SLAB's list, e.g. no win no fee medical negligence solicitors.", { query: { type: "string" } }, ["query"]),
  tool("visit", "Open any web page in a browser tab and answer a question from it. Use for sites we have no special tool for.", { url: { type: "string" }, question: { type: "string" } }, ["url", "question"]),
  tool("check_firm", "Open a firm's website in a browser tab: find its medical negligence page, read whether it acts for patients and offers no win no fee, and look for its enquiry form. Give firm_id for a known firm, or name + website for a new one.", { firm_id: { type: "string" }, name: { type: "string" }, website: { type: "string" } }, []),
  tool("law_society_check", "Check firms by name on the Law Society of Scotland register, in one browser tab.", { firm_ids: { type: "array", items: { type: "string" } } }, ["firm_ids"]),
  tool("ask_user", "Ask the user one question when you need something no site and no tool can tell you. Do not ask for money details (the calculator does that).", {
    question: { type: "string" },
    kind: { type: "string", enum: ["yes_no", "choice", "text", "money", "number"] },
    options: { type: "array", items: { type: "string" } },
  }, ["question", "kind"]),
  tool("shortlist", "Score every firm checked so far and pick up to 3 for the user. route = how the claim would be paid for.", { firm_ids: { type: "array", items: { type: "string" } }, route: { type: "string", enum: ["legal_aid", "no_win_no_fee"] } }, ["firm_ids", "route"]),
  tool("finish", "End the research with a short summary for the user. Call after shortlist.", { summary: { type: "string" } }, ["summary"]),
];

const SYSTEM = `You are the research planner for a patient in Scotland who may want compensation after poor medical care.
You plan your own route and drive browser agents through tools. Each browser tool opens its own tab; tools you call in the same turn run at the same time, so batch independent work.
Goal:
1. Find out how a claim could be paid for: civil legal aid (SLAB's calculator) or, if that looks unlikely or the user skips the money questions, no win no fee.
2. Find solicitors near the patient who act for PATIENTS in medical negligence. SLAB's list gives legal aid firms; web_search can find others (needed especially for no win no fee).
3. Check the most promising firms on their own websites and on the Law Society register.
4. Shortlist up to 3 firms with the right route, then finish.
Rules:
- Start with update_plan. Update the plan whenever you learn something that changes it (mark steps done or dropped, add new ones) and say why.
- Every tool call needs a short "why" in plain words. No jargon.
- Budget: at most 4 check_firm calls, 2 web_search calls, 3 visit calls. Stop early when you have enough.
- Exclude firms that defend the NHS, health boards or insurers, and firms whose site redirects to a claims company.
- Only ask_user when you truly need something (e.g. whether they would travel further); never ask for money details or consent.
- Never say anyone was negligent. Never submit forms.`;

/* ------------------------------------------------------------------ the run */

export async function runPlanner(facts: CaseFacts, fundingIn: Partial<Funding> = {}, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string } = {}): Promise<PlannerResult> {
  const runId = opts.runId ?? `step3-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = path.join(process.cwd(), ".runs", runId);
  const log = makeLogger(runDir);
  const emit: Emit = (e) => {
    if (e.type !== "stats" && e.type !== "trace") log({ type: "status", message: JSON.stringify(e).slice(0, 2000) });
    opts.onEvent?.(e);
  };
  emit({ type: "run", runId });
  const track = new Tracker(emit);
  const tracer = new Tracer(emit, runDir);
  const { browser, context, page } = await openSession();
  const ctx = { context, emit, track, tracer, first: page };
  const tabs = limiter(MAX_TABS);
  waiting.set(runId, new Map());

  // What the run knows. Tools read and write it; the planner sees summaries.
  const funding: Funding = { onBenefits: null, partner: null, dependants: null, netIncomeYearly: null, outgoingsYearly: null, savings: null, skipped: false, ...fundingIn };
  const firms = new Map<string, FirmFinding>();
  const evidence = new Map<string, Evidence>();
  let verdict: Verdict = "unknown";
  let quote = "";
  let route: Route = "legal_aid";
  let shortlistIds: string[] = [];
  let plan: PlanStep[] = [];
  const thoughts: Thought[] = [];
  const t0 = Date.now();
  let asks = 0;

  const ask: Ask = (spec) => {
    const id = `q${++asks}`;
    const full: AskSpec = { id, ...spec };
    emit({ type: "ask", ask: full });
    return new Promise((resolve) => {
      const done = (a: string | null) => {
        clearTimeout(timer);
        emit({ type: "answered", id, answer: a });
        resolve(a);
      };
      const timer = setTimeout(() => {
        waiting.get(runId)?.delete(id);
        done(null);
      }, ASK_TIMEOUT_MS);
      waiting.get(runId)!.set(id, done);
    });
  };
  const finding = (text: string, source?: string) => emit({ type: "finding", text, source });
  const firmLine = (f: FirmFinding) =>
    `${f.id}: ${f.name}, ${f.town}${f.distanceMiles !== null ? ` (${f.distanceMiles} mi)` : ""}${f.website ? `, ${f.website}` : ", no website"}${f.legalAid ? ", SLAB legal aid" : ""}${f.sources.includes("website") ? `, checked: patients=${f.actsForPatients}, no-win-no-fee=${f.noWinNoFee}, form=${f.enquiryUrl ? "yes" : "no"}${f.excluded ? `, EXCLUDED: ${f.excluded}` : ""}` : ""}`;

  /** Run one tool. Returns the text the planner sees. Errors are returned, not thrown, so the planner can recover. */
  async function run(call: ResponseFunctionToolCall, thought: Thought): Promise<string> {
    const a = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
    const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
    switch (call.name) {
      case "update_plan": {
        plan = ((a.steps as PlanStep[]) ?? []).map((st, i) => ({ id: st.id || `s${i + 1}`, text: st.text, status: st.status ?? "todo", why: st.why }));
        emit({ type: "plan", steps: plan });
        return "Plan updated.";
      }
      case "slab_calculator": {
        if (funding.skipped) return "The user chose not to give money details. Treat legal aid as unknown and look at no win no fee.";
        const r = await tabs(() => agent(ctx, "SLAB calculator", (p, note) => calculatorAsking(p, funding, ask, note, track), 8 * 60 * 1000));
        if (!r.ok) return `The calculator failed: ${r.error}`;
        if (r.value.skipped) {
          funding.skipped = true;
          finding("You skipped the money questions, so legal aid is unknown", "SLAB calculator");
          return "The user did not answer the calculator's questions. Legal aid unknown: consider no win no fee.";
        }
        verdict = r.value.verdict;
        quote = r.value.quote;
        finding(verdict === "likely" ? "SLAB: likely to qualify financially for legal aid" : verdict === "unlikely" ? "SLAB: unlikely to qualify for legal aid" : "SLAB's estimate could not be read", "SLAB calculator");
        return `SLAB estimate: ${verdict}. Its words: "${quote}"`;
      }
      case "slab_lawyer_list": {
        const r = await tabs(() => agent(ctx, "SLAB lawyer list", (p, note) => runFinder(p, note, track), 120_000));
        if (!r.ok) return `SLAB's lawyer list failed: ${r.error}`;
        for (const f of mergeCards(r.value)) if (!firms.has(f.id)) firms.set(f.id, f);
        const list = [...firms.values()].filter((f) => f.legalAid);
        finding(`SLAB lists ${list.length} firms that take medical negligence legal aid`, "SLAB lawyer list");
        return `Found ${list.length} firms (nearest first):\n${list.slice(0, 15).map(firmLine).join("\n")}`;
      }
      case "web_search": {
        const r = await tabs(() => agent(ctx, "Web search", (p, note) => webSearch(p, s("query"), note, track), 60_000));
        if (!r.ok) return `Search failed: ${r.error}`;
        if (r.value.length) finding(`Web search found ${r.value.length} results for "${short(s("query"), 50)}"`, "Brave Search");
        return r.value.map((x, i) => `${i + 1}. ${x.title} — ${x.url}\n   ${x.snippet}`).join("\n") || "No results.";
      }
      case "visit": {
        let url = s("url");
        if (!/^https?:\/\//.test(url)) url = `https://${url}`;
        const r = await tabs(() => agent(ctx, short(new URL(url).hostname.replace(/^www\./, ""), 26), (p, note) => visit(p, url, s("question"), note), 60_000));
        if (!r.ok) return `Could not read ${url}: ${r.error}`;
        return `${r.value.answer}\nLinks: ${r.value.links.map((l) => `${l.text} -> ${l.url}`).join("; ")}`;
      }
      case "check_firm": {
        let f = s("firm_id") ? firms.get(s("firm_id")) : undefined;
        if (!f && s("name") && s("website")) {
          const id = slug(s("name"));
          f = firms.get(id) ?? { id, name: s("name"), town: "", distanceMiles: null, website: s("website"), email: null, phone: null, sources: [], legalAid: false, activeRecently: false, actsForPatients: "unknown", noWinNoFee: "unknown", enquiryUrl: null, score: 0, reasons: [], excluded: null };
          firms.set(id, f);
          finding(`New firm from the web: ${f.name}`, "Web search");
        }
        if (!f) return `Unknown firm. Use an id from slab_lawyer_list, or give name and website.`;
        const firm = f;
        const label = firm.name.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, "").slice(0, 28);
        const r = await tabs(() => agent(ctx, label, (p, note) => vetFirm(p, firm, note, track), 90_000, [firm.id]));
        if (!r.ok) {
          evidence.set(firm.id, { ...evidence.get(firm.id), checked: `Tried ${firm.website}: ${r.error}` });
          return `Could not check ${firm.name}: ${r.error}`;
        }
        const { evidence: ev, ...found } = r.value;
        evidence.set(firm.id, { ...evidence.get(firm.id), ...ev });
        const updated: FirmFinding = { ...firm, ...found, sources: [...new Set([...firm.sources, "website" as const])] };
        firms.set(firm.id, updated);
        emit({ type: "firm", firm: updated });
        finding(`${updated.name}: ${updated.excluded ? `ruled out (${updated.excluded})` : `acts for patients ${updated.actsForPatients}, no win no fee ${updated.noWinNoFee}, enquiry form ${updated.enquiryUrl ? "found" : "not found"}`}`, updated.website ?? undefined);
        return firmLine(updated);
      }
      case "law_society_check": {
        const list = ((a.firm_ids as string[]) ?? []).map((id) => firms.get(id)).filter((x): x is FirmFinding => !!x).slice(0, 5);
        if (!list.length) return "No known firm ids given.";
        const r = await tabs(() => agent(ctx, "Law Society register", (p, note) => lawSocietyCheck(p, list, note, track), 120_000));
        if (!r.ok) return `Law Society check failed: ${r.error}`;
        for (const f of list) {
          const on = r.value.has(f.id);
          if (on) firms.set(f.id, { ...firms.get(f.id)!, sources: [...new Set([...firms.get(f.id)!.sources, "lawsoc" as const])] });
          evidence.set(f.id, { ...evidence.get(f.id), lawsoc: on ? "Found by name on the Law Society of Scotland's Find a Solicitor" : "Searched the Law Society register by name; no matching firm" });
        }
        finding(`Law Society register: ${r.value.size} of ${list.length} firms found`, "Law Society of Scotland");
        return list.map((f) => `${f.id}: ${r.value.has(f.id) ? "on the register" : "not found"}`).join("\n");
      }
      case "ask_user": {
        const answer = await ask({ agent: "Planner", question: s("question"), why: s("why"), kind: (s("kind") as AskSpec["kind"]) || "text", options: a.options as string[] | undefined });
        return answer === null ? "The user did not answer. Carry on without it." : `The user answered: ${answer}`;
      }
      case "shortlist": {
        route = s("route") === "no_win_no_fee" ? "no_win_no_fee" : "legal_aid";
        for (const [id, f] of firms) firms.set(id, score(f, route, evidence.get(id)));
        shortlistIds = ((a.firm_ids as string[]) ?? []).filter((id) => firms.has(id) && !firms.get(id)!.excluded).sort((x, y) => firms.get(y)!.score - firms.get(x)!.score).slice(0, 3);
        finding(`Shortlisted ${shortlistIds.length}: ${shortlistIds.map((id) => firms.get(id)!.name).join(", ")}`, "Planner");
        return shortlistIds.map((id) => `${firms.get(id)!.name}: fit ${firms.get(id)!.fit}%`).join("\n") || "Nothing shortlisted.";
      }
      case "finish":
        return "Finished.";
      default:
        thought.result = "Unknown tool";
        return `Unknown tool ${call.name}`;
    }
  }

  let reviewing = false;
  let turns = 0;
  try {
    const story = [facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n");
    const known = Object.entries(funding).filter(([, v]) => v !== null && v !== false).map(([k, v]) => `${k}=${v}`).join(", ") || "none yet";
    let input: ResponseInputItem[] | string = `Patient: ${facts.firstName ?? "the patient"}, postcode ${facts.postcode ?? "unknown"}.\nWhere treated: ${facts.incidentLocation ?? "unknown"}.\nWhat happened:\n${story}\nWhat they want: ${facts.desiredOutcome ?? "not said"}\nMoney answers already known: ${known}\n\nPlan and run the research.`;
    let prev: string | undefined;
    let finished = false;

    for (turns = 1; turns <= MAX_TURNS && !finished; turns++) {
      const res: Response = await openai().responses.create({
        model: MODELS.draft,
        reasoning: { effort: "low" },
        instructions: SYSTEM,
        input,
        tools: TOOLS,
        tool_choice: "required",
        parallel_tool_calls: true,
        ...(prev ? { previous_response_id: prev } : {}),
      });
      prev = res.id;
      const calls: ResponseFunctionToolCall[] = res.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
      if (!calls.length) {
        input = [{ role: "user", content: "Call a tool. Use shortlist and then finish when you are done." }];
        continue;
      }
      const outputs: ResponseInputItem[] = await Promise.all(
        calls.map(async (call): Promise<ResponseInputItem> => {
          const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
          const thought: Thought = { i: thoughts.length, t: Date.now() - t0, text: String(args.why ?? call.name), tool: call.name, detail: JSON.stringify(Object.fromEntries(Object.entries(args).filter(([k]) => k !== "why")), null, 1) };
          thoughts.push(thought);
          if (call.name !== "update_plan") emit({ type: "thought", thought });
          let out: string;
          try {
            out = await run(call, thought);
          } catch (e) {
            out = `Error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
          }
          if (call.name !== "update_plan") {
            thought.result = short(out, 600);
            emit({ type: "thought", thought: { ...thought } });
          }
          if (call.name === "finish") finished = true;
          return { type: "function_call_output" as const, call_id: call.call_id, output: out };
        }),
      );
      input = outputs;
    }

    // If the planner never shortlisted, score what we have so the user still gets a result.
    if (!shortlistIds.length) for (const [id, f] of firms) firms.set(id, score(f, route, evidence.get(id)));
    const all = [...firms.values()].sort((a, b) => b.score - a.score);
    if (!shortlistIds.length) shortlistIds = all.filter((f) => !f.excluded && f.sources.includes("website")).slice(0, 3).map((f) => f.id);
    const result: PlannerResult = {
      verdict: funding.skipped ? "skipped" : verdict,
      route,
      calculatorText: quote,
      firms: all,
      shortlist: shortlistIds,
      stats: track.stats,
      runDir,
      runId,
      trace: tracer.steps,
      plan,
      thoughts,
      turns: turns - 1,
    };
    emit({ type: "result", result });
    emit({ type: "planner_result", result });
    if (opts.keepOpen) {
      reviewing = true;
      void context.waitForEvent("close", { timeout: 10 * 60 * 1000 }).catch(() => {}).then(() => browser.close().catch(() => {}));
    }
    return result;
  } finally {
    waiting.delete(runId);
    if (!reviewing) await browser.close().catch(() => {});
  }
}
