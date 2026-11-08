import { recordAccess } from "./access";
import { EnquiryFillGuard } from "./plannerGuards";
import { formatPostcode, isPostcode, parseFundingNumber } from "./inputs";
import type { SearchLocation } from "./searchLocation";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import type { FunctionTool, Response, ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";
import { z } from "zod";
import { dismissCookies, keepOnlyTabs, openSession } from "../browser";
import { pointAt } from "../agentCursor";
import type { CaseFacts } from "./facts";
import { EFFORT, MODELS, respond, structured } from "./llm";
import { enterLedger } from "./ledger";
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
import { fundingMissing } from "./legalAidTypes";
import { CREW, TOOL_CREW, type AskSpec, type CrewId, type EvidenceResult, type PlannerEvent, type PlannerResult, type PlanStep, type Say, type Thought } from "./plannerTypes";
import { compareCare, readGuideline, readJudgment, searchCaseLaw, type GuidelineReading } from "./evidence";
import { approvalTabs, draftEnquiry, fillOne, keepForApproval } from "./enquiry";
import type { EnquiryMessage, EnquiryOutcome } from "./enquiryTypes";

/**
 * The planner agent (D47). A reasoning model plans its own route through the compensation research, calling
 * browser workers as tools. Several tools in one turn run at the same time in separate tabs. Workers ask the user
 * when a site needs something we do not know (the calculator asks the money questions itself, one at a time, only
 * those the site actually shows). Nothing is ever submitted.
 */

const MAX_TURNS = 18;
const MAX_TABS = 4;
const ASK_TIMEOUT_MS = 5 * 60 * 1000;

export type Emit = (e: PlannerEvent) => void;

/* ------------------------------------------------------------------ answers from the user, by run */

type Waiter = (answer: string | null) => void;
const g = globalThis as typeof globalThis & { __plannerAnswers?: Map<string, Map<string, Waiter>> };
export const waiting = (g.__plannerAnswers ??= new Map());

/** Called by POST /api/agent/plan/answer. Returns false if nothing is waiting for that question. */
export function answerQuestion(runId: string, id: string, answer: string | null): boolean {
  const w = waiting.get(runId)?.get(id);
  if (!w) return false;
  waiting.get(runId)!.delete(id);
  w(answer);
  return true;
}

/* ------------------------------------------------------------------ skips from the user (demo), by run */

const gs = globalThis as typeof globalThis & { __plannerSkips?: Map<string, Set<CrewId | "all">> };
export const skips = (gs.__plannerSkips ??= new Map());

/** Called by POST /api/agent/plan/skip. From the next step on, that crew member's jobs (or all jobs: "all") are skipped. */
export function skipCrew(runId: string, crew: CrewId | "all"): boolean {
  const set = skips.get(runId);
  if (!set) return false;
  set.add(crew);
  return true;
}

/* ------------------------------------------------------------------ pause from the user, by run */

type PauseState = { paused: boolean; resume: (() => void)[]; emit: Emit };
const pg = globalThis as typeof globalThis & { __plannerPauses?: Map<string, PauseState> };
export const pauses = (pg.__plannerPauses ??= new Map());

export function trackPause(runId: string, emit: Emit) {
  pauses.set(runId, { paused: false, resume: [], emit });
}

/** Ends a run's pause for good (the run finished or was cancelled), so nothing stays waiting. */
export function dropPause(runId: string) {
  const st = pauses.get(runId);
  pauses.delete(runId);
  for (const fn of st?.resume ?? []) fn();
}

/** Called by POST /api/agent/plan/pause. Work already under way finishes; nothing new starts until resumed. */
export function setPaused(runId: string, paused: boolean): boolean {
  const st = pauses.get(runId);
  if (!st) return false;
  if (st.paused === paused) return true;
  st.paused = paused;
  st.emit({ type: "paused", paused });
  if (!paused) for (const fn of st.resume.splice(0)) fn();
  return true;
}

/** Waits here while the run is paused. */
export function untilResumed(runId: string): Promise<void> {
  const st = pauses.get(runId);
  if (!st?.paused) return Promise.resolve();
  return new Promise((r) => st.resume.push(r));
}

/* ------------------------------------------------------------------ hand-offs (the patient signs in; the tab stays open) */

type HandoffAction = "continue" | "skip";
const hg = globalThis as typeof globalThis & { __plannerHandoffs?: Map<string, Map<string, (a: HandoffAction) => void>> };
export const handoffs = (hg.__plannerHandoffs ??= new Map());

/** Called by POST /api/agent/plan/handoff. */
export function resolveHandoff(runId: string, id: string, action: HandoffAction): boolean {
  const fn = handoffs.get(runId)?.get(id);
  if (!fn) return false;
  handoffs.get(runId)!.delete(id);
  fn(action);
  return true;
}

/** End every open hand-off for a run (cancel, or the run finishing). */
export function dropHandoffs(runId: string) {
  const map = handoffs.get(runId);
  if (!map) return;
  for (const fn of map.values()) fn("skip");
  handoffs.delete(runId);
}

export function waitHandoff(runId: string, id: string, ms: number): Promise<"continued" | "skipped" | "timeout"> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (o: "continued" | "skipped" | "timeout") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handoffs.get(runId)?.delete(id);
      resolve(o);
    };
    const timer = setTimeout(() => finish("timeout"), Math.max(0, ms));
    const map: Map<string, (a: string) => void> = handoffs.get(runId) ?? new Map();
    handoffs.set(runId, map);
    map.set(id, (a) => finish(a === "continue" ? "continued" : "skipped"));
  });
}

/* ------------------------------------------------------------------ small helpers */

/** At most `n` browser tools at once; the rest wait their turn. */
export function limiter(n: number) {
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

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const num = parseFundingNumber;
const yes = (s: string | null) => (s === null ? null : /^(y|yes|true)/i.test(s.trim()));
const short = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* ------------------------------------------------------------------ the calculator, asking as it goes */

export type Ask = (spec: Omit<AskSpec, "id">) => Promise<string | null>;
const crewOf = (agentName: string): CrewId => (agentName === "SLAB calculator" ? "nell" : "elliot");

export async function calculatorAsking(page: Page, funding: Funding, ask: Ask, note: Note, track: Tracker, onFunding?: (funding: Funding) => void) {
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
    if (a !== null) {
      funding[key] = a;
      onFunding?.({ ...funding });
    }
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
  // A skipped answer is unknown, not zero. Never run the fallback with incomplete finances.
  if (fundingMissing(funding).length) return { verdict: "unknown" as Verdict, quote: "", skipped: true };
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

/**
 * Web search. A search API first when a key is set (Linkup, Tavily or Brave: see searchApi); otherwise, or when it fails, a
 * browser tab: Brave first (typed into its box, so the user sees it); when a search engine shows a bot
 * check, wait once, then move to the next engine (Yahoo, DuckDuckGo's plain HTML page, then Bing) and remember that for a
 * while. Search engines are not about any country, so this is not a site script. Returns at most 10 results, up to 3
 * per site (a big portal must not hide its own deeper pages).
 */
const ENGINES = [
  { name: "Brave", home: "https://search.brave.com/", url: (q: string) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  { name: "Yahoo", home: "", url: (q: string) => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}` },
  { name: "DuckDuckGo", home: "", url: (q: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}` },
  { name: "Bing", home: "", url: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en` },
];
const engineCooldown = new Map<string, number>(); // engine -> walled until (ms)

async function searchEngines(page: Page, query: string, note: Note, track: Tracker): Promise<{ title: string; url: string; snippet: string }[]> {
  note(`Searching: ${query}`);
  const walled = async () => /captcha|verify(ing)? you('| a)?re? (not )?(a )?(human|bot|robot)|not a bot|unusual traffic|are you a robot|drag the slider/i.test(await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => ""));
  const engines = ENGINES.filter((e) => (engineCooldown.get(e.name) ?? 0) < Date.now());
  for (const engine of engines.length ? engines : ENGINES) {
    if (engine.home) {
      await page.goto(engine.home, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      const box = page.locator("textarea[name=q], input[name=q]").first();
      if (!(await walled()) && (await box.isVisible({ timeout: 4000 }).catch(() => false))) {
        await pointAt(page, box);
        await box.fill(query);
        track.bump("action");
        await box.press("Enter");
      } else await page.goto(engine.url(query), { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    } else {
      await page.goto(engine.url(query), { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      track.bump("action");
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1500);
    // Consent screens (common for UK and EU visitors) hide the results; refuse and, if they sent us away, search again.
    if ((await dismissCookies(page, 2500)) !== "none" || /consent|privacy/i.test(new URL(page.url()).hostname)) {
      // Refusing can reload the page: load the results again so they are read from a settled page.
      await page.waitForTimeout(1200);
      await page.goto(engine.url(query), { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    }
    await page.waitForTimeout(1500);
    if (await walled()) {
      await page.waitForTimeout(5000);
      if (await walled()) {
        engineCooldown.set(engine.name, Date.now() + 10 * 60 * 1000);
        await note.log("recover", `${engine.name} asked for a human check; trying another search engine`, { shot: true });
        continue;
      }
    }
    const results = await page.evaluate(() => {
      /** Search engines wrap result links in redirects: unwrap them to the real page. */
      const real = (href: string) => {
        try {
          const u = new URL(href, location.href);
          const yahoo = u.hostname.endsWith("search.yahoo.com") ? u.pathname.match(/\/RU=([^/]+)\//)?.[1] : null;
          if (yahoo) return decodeURIComponent(yahoo);
          const ddg = u.searchParams.get("uddg");
          if (ddg) return decodeURIComponent(ddg);
          const bing = u.hostname.endsWith("bing.com") && u.pathname.startsWith("/ck/") ? u.searchParams.get("u") : null;
          if (bing && bing.startsWith("a1")) return atob(bing.slice(2).replace(/-/g, "+").replace(/_/g, "/"));
          return u.href;
        } catch {
          return href;
        }
      };
      const perHost = new Map<string, number>();
      const urls = new Set<string>();
      const out: { title: string; url: string; snippet: string }[] = [];
      for (const a of [...document.querySelectorAll("a[href]")] as HTMLAnchorElement[]) {
        const href = real(a.href);
        if (!/^https?:/.test(href)) continue;
        const host = new URL(href).hostname;
        if (/brave\.com|bing\.com|duckduckgo\.com|yahoo\.com|yimg\.com|google\.|youtube\.com|facebook\.com|microsoft\.com/.test(host) || (perHost.get(host) ?? 0) >= 3 || urls.has(href.replace(/#.*$/, ""))) continue;
        const title = (a.innerText || "").replace(/\s+/g, " ").trim();
        if (title.length < 12) continue;
        perHost.set(host, (perHost.get(host) ?? 0) + 1);
        urls.add(href.replace(/#.*$/, ""));
        const box = a.closest("div[class*=snippet], div[class*=result], li, article, div") as HTMLElement | null;
        out.push({ title: title.slice(0, 100), url: href, snippet: (box?.innerText ?? "").replace(/\s+/g, " ").slice(0, 220) });
        if (out.length >= 10) break;
      }
      return out;
    });
    await note.log("read", `${engine.name} search "${query}": ${results.length} results`, { shot: true, detail: results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n") });
    note(`${results.length} results`);
    if (results.length || engine === ENGINES[ENGINES.length - 1]) return results;
  }
  throw new Error("Blocked: every search engine asked for a human check");
}

type SearchHit = { title: string; url: string; snippet: string };
/**
 * One search at a time for the whole process, a few seconds apart (a person does not fire five searches at once; parallel
 * searches are what brings up the bot check), and the same query asked twice in a short time is answered from memory.
 * Reading official pages stays parallel: those are different sites.
 */
/**
 * A search API where a key is set (LINKUP_API_KEY, TAVILY_API_KEY or BRAVE_API_KEY): finding which pages exist is not a browser
 * job, and an API never shows a bot check. Only the query leaves the machine (never patient values). The browser then opens
 * the pages, so every quote is still checked against a page this run really read. Returns null if no key or it failed.
 */
const LINKUP_PER_RUN = Number(process.env.LINKUP_MAX_PER_RUN ?? 12); // one query returns 10 pages: a run needs about 8 aimed queries, not dozens
const LINKUP_TOTAL = Number(process.env.LINKUP_MAX_TOTAL ?? 5000); // and one machine never spends more than this in total
const linkupUsed = new WeakMap<object, number>();
function linkupAllowed(track: Tracker): boolean {
  if ((linkupUsed.get(track) ?? 0) >= LINKUP_PER_RUN) return false;
  const file = path.join(process.cwd(), ".runs", "linkup-usage.json");
  let total = 0;
  try {
    total = (JSON.parse(readFileSync(file, "utf8")) as { n: number }).n;
  } catch {}
  if (total >= LINKUP_TOTAL) return false;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ n: total + 1, updated: new Date().toISOString() }));
  } catch {}
  linkupUsed.set(track, (linkupUsed.get(track) ?? 0) + 1);
  return true;
}
/** True once a run has used its searches: the crew must read the pages it has and follow their links, not open a search engine. */
export const searchBudgetUsed = (track: Tracker) => !!process.env.LINKUP_API_KEY && (linkupUsed.get(track) ?? 0) >= LINKUP_PER_RUN;
async function searchApi(query: string, note: Note, track: Tracker): Promise<SearchHit[] | null> {
  const sites = [...query.matchAll(/\bsite:([^\s]+)/g)].map((m) => m[1]);
  const q = query.replace(/\bsite:[^\s]+/g, "").replace(/\s+/g, " ").trim() || query;
  const post = async (url: string, headers: Record<string, string>, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return (await r.json()) as Record<string, unknown>;
  };
  const clean = (x: { title?: string; url?: string; snippet?: string }): SearchHit => ({ title: String(x.title ?? x.url ?? "").slice(0, 100), url: String(x.url ?? ""), snippet: String(x.snippet ?? "").replace(/\s+/g, " ").slice(0, 400) });
  const tries: [string, () => Promise<SearchHit[]>][] = [];
  let exhausted = false;
  if (process.env.LINKUP_API_KEY) {
    if (linkupAllowed(track))
      tries.push(["Linkup", async () => {
        const j = (await post("https://api.linkup.so/v1/search", { authorization: `Bearer ${process.env.LINKUP_API_KEY}` }, { q, depth: "standard", outputType: "searchResults", maxResults: 10, ...(sites.length ? { includeDomains: sites } : {}) })) as { results?: { name?: string; url?: string; content?: string }[] };
        return (j.results ?? []).map((x) => clean({ title: x.name, url: x.url, snippet: x.content }));
      }]);
    else exhausted = true;
  }
  if (process.env.TAVILY_API_KEY)
    tries.push(["Tavily", async () => {
      const j = (await post("https://api.tavily.com/search", { authorization: `Bearer ${process.env.TAVILY_API_KEY}` }, { query: q, max_results: 10, ...(sites.length ? { include_domains: sites } : {}) })) as { results?: { title?: string; url?: string; content?: string }[] };
      return (j.results ?? []).map((x) => clean({ ...x, snippet: x.content }));
    }]);
  if (process.env.BRAVE_API_KEY)
    tries.push(["Brave", async () => {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=10&q=${encodeURIComponent(query)}`, { headers: { "x-subscription-token": process.env.BRAVE_API_KEY!, accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`brave ${r.status}`);
      const j = (await r.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
      return (j.web?.results ?? []).map((x) => clean({ ...x, snippet: x.description }));
    }]);
  if (exhausted && !tries.length) {
    note("Search limit reached");
    return []; // no browser search: the crew carries on with the pages it already found
  }
  for (const [name, fn] of tries) {
    try {
      const hits = (await fn()).filter((h) => /^https?:/.test(h.url));
      if (!hits.length) continue;
      await note.log("read", `${name} search "${query}": ${hits.length} results`, { detail: hits.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n") });
      note(`${hits.length} results`);
      return hits;
    } catch {
      /* try the next provider, then the browser */
    }
  }
  return null;
}
const oneSearch = limiter(1);
const searchCache = new Map<string, { at: number; hits: Promise<SearchHit[]> }>();
let lastSearchAt = 0;
/** Search results are kept on disk for two weeks: the same persona or place asked again costs no search credit and no browser search. Pages are still read live. */
const SEARCH_CACHE_FILE = path.join(process.cwd(), ".runs", "search-cache.json");
const SEARCH_TTL = 14 * 24 * 3600 * 1000;
type DiskCache = Record<string, { at: number; hits: SearchHit[] }>;
const readDiskCache = (): DiskCache => {
  try {
    return JSON.parse(readFileSync(SEARCH_CACHE_FILE, "utf8")) as DiskCache;
  } catch {
    return {};
  }
};
const diskGet = (key: string): SearchHit[] | null => {
  if (process.env.SEARCH_CACHE === "0") return null;
  const e = readDiskCache()[key];
  return e && Date.now() - e.at < SEARCH_TTL && e.hits.length ? e.hits : null;
};
const diskPut = (key: string, hits: SearchHit[]) => {
  if (process.env.SEARCH_CACHE === "0" || !hits.length) return;
  try {
    mkdirSync(path.dirname(SEARCH_CACHE_FILE), { recursive: true });
    const all = readDiskCache();
    all[key] = { at: Date.now(), hits };
    writeFileSync(SEARCH_CACHE_FILE, JSON.stringify(all));
  } catch {}
};
/** One search by API only (cache, then Linkup): never opens a browser. [] when there is no key, the budget is used or it failed. */
export async function searchViaApi(query: string, track: Tracker): Promise<{ title: string; url: string; snippet: string }[]> {
  const key = query.toLowerCase().replace(/\s+/g, " ").trim();
  const saved = diskGet(key);
  if (saved) {
    recordAccess({ via: "cache", kind: "search", reason: "the same search from an earlier run", url: query });
    return saved;
  }
  const t0 = Date.now();
  const noop = Object.assign(() => {}, { log: async () => {} }) as unknown as Note;
  const hits = (await searchApi(query, noop, track)) ?? [];
  if (hits.length) diskPut(key, hits);
  recordAccess({ via: "api", kind: "search", reason: hits.length ? "Linkup search API" : "search API gave nothing (limit reached or no results)", url: query, ms: Date.now() - t0 });
  return hits;
}
export async function webSearch(page: Page, query: string, note: Note, track: Tracker): Promise<SearchHit[]> {
  const key = query.toLowerCase().replace(/\s+/g, " ").trim();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) {
    note(`Already searched: ${query}`);
    const r = await hit.hits.catch(() => null);
    if (r?.length) return r;
  }
  const saved = diskGet(key);
  if (saved) {
    recordAccess({ via: "cache", kind: "search", reason: "the same search from an earlier run", url: query });
    note(`Searched before: ${query}`);
    await note.log("read", `Saved search "${query}": ${saved.length} results (from an earlier run)`, { detail: saved.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n") });
    searchCache.set(key, { at: Date.now(), hits: Promise.resolve(saved) });
    return saved;
  }
  const tApi = Date.now();
  const viaApi = await searchApi(query, note, track);
  if (viaApi) recordAccess({ via: "api", kind: "search", reason: viaApi.length ? "Linkup search API" : "search limit for this run reached", url: query, ms: Date.now() - tApi });
  else recordAccess({ via: "browser", kind: "search", reason: "no search API available, so a search engine was opened in the browser", url: query });
  if (viaApi) {
    diskPut(key, viaApi);
    searchCache.set(key, { at: Date.now(), hits: Promise.resolve(viaApi) });
    return viaApi;
  }
  const hits = oneSearch(async () => {
    const gap = 2500 + Math.random() * 2500 - (Date.now() - lastSearchAt);
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    try {
      const found = await searchEngines(page, query, note, track);
      diskPut(key, found);
      return found;
    } finally {
      lastSearchAt = Date.now();
    }
  });
  searchCache.set(key, { at: Date.now(), hits });
  hits.catch(() => searchCache.delete(key));
  return hits;
}

const Reading = z.object({
  answer: z.string().describe("Answer to the question from this page only, at most 3 sentences. Say plainly if the page does not say."),
  links: z.array(z.object({ text: z.string(), url: z.string() })).describe("Up to 5 links on the page worth following for the question"),
});

async function visit(page: Page, url: string, question: string, note: Note) {
  note(`Opening ${new URL(url).hostname.replace(/^www\./, "")}`);
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
  tool("web_search", "Search the web (a search API, with a browser search as backup). Use it to find firms or sources that are not on SLAB's list, e.g. no win no fee medical negligence solicitors.", { query: { type: "string" } }, ["query"]),
  tool("visit", "Open any web page in a browser tab and answer a question from it. Use for sites we have no special tool for.", { url: { type: "string" }, question: { type: "string" } }, ["url", "question"]),
  tool("check_firm", "Open a firm's website in a browser tab: find its medical negligence page, read whether it acts for patients and offers no win no fee, and look for its enquiry form. Give firm_id for a known firm, or name + website for a new one.", { firm_id: { type: "string" }, name: { type: "string" }, website: { type: "string" } }, []),
  tool("law_society_check", "Check firms by name on the Law Society of Scotland register, in one browser tab.", { firm_ids: { type: "array", items: { type: "string" } } }, ["firm_ids"]),
  tool("read_guideline", "Iona: open the clinical guideline (NICE NG38 Fractures) and quote its recommendations about the patient's condition.", { topic: { type: "string", description: "e.g. 'suspected scaphoid fracture'" } }, ["topic"]),
  tool("compare_care", "Iona: compare the guideline you read with the patient's own timeline and list POSSIBLE gaps as questions for a solicitor. Call after read_guideline.", {}, []),
  tool("search_case_law", "Iona: search BAILII for Scottish court judgments, e.g. about a missed scaphoid fracture or wrist injury damages.", { query: { type: "string" } }, ["query"]),
  tool("read_judgment", "Iona: open one judgment from search_case_law and say how it relates (medical negligence, or only a similar injury) and any award.", { url: { type: "string" } }, ["url"]),
  tool("fill_enquiry", "Kit: fill a shortlisted firm's online enquiry form with the patient's message, stopping before Send (the user approves sending later).", { firm_id: { type: "string" } }, ["firm_id"]),
  tool("ask_user", "Ask the user one question when you need something no site and no tool can tell you. Do not ask for money details (the calculator does that).", {
    question: { type: "string" },
    kind: { type: "string", enum: ["yes_no", "choice", "text", "money", "number"] },
    options: { type: "array", items: { type: "string" } },
  }, ["question", "kind"]),
  tool("shortlist", "Score every firm checked so far and pick up to 3 for the user. route = how the claim would be paid for.", { firm_ids: { type: "array", items: { type: "string" } }, route: { type: "string", enum: ["legal_aid", "no_win_no_fee"] } }, ["firm_ids", "route"]),
  tool("finish", "End the research with a summary for the patient. Call after shortlist (and fill_enquiry).", { summary: { type: "string", description: "Two or three short sentences in plain words, written to the patient (\"you\"). No ids, field names or tool names." } }, ["summary"]),
];

const SYSTEM = `You are the research planner for a patient in Scotland who may want compensation after poor medical care.
You plan your own route and drive browser agents through tools. The patient watches the work as a story, so work ONE STEP AT A TIME: call one tool per turn, and let each result decide the next step. The only exceptions: check_firm calls for different firms may go in the same turn (they run side by side), and so may fill_enquiry calls for different firms.
You lead a crew: Nell (funding: the legal aid calculator), Robin (finds and checks solicitors), Iona (clinical evidence) and Kit (enquiry forms). Each tool belongs to one of them.
The story, in this order (adapt it when results call for it, and say why with update_plan):
1. Nell: slab_calculator, to find out how a claim could be paid for.
2. Decide the route from her result: legal aid if likely; no win no fee if unlikely or the patient skipped the money questions. Say so with update_plan.
3. Robin: slab_lawyer_list (firms that take legal aid for medical negligence). If the route is no win no fee, also web_search for no win no fee medical negligence solicitors near the patient.
4. Robin: check_firm the 3 most promising firms for that route (same turn), then law_society_check them.
5. Iona: read_guideline for the patient's condition, then compare_care, then search_case_law and read_judgment for at most 1 relevant result.
6. shortlist up to 3 firms with the route.
7. Kit: fill_enquiry for each shortlisted firm with a website (same turn). Kit's message carries Iona's guideline point.
8. finish.
Rules:
- Start with update_plan. Update the plan whenever you learn something that changes it (mark steps done or dropped, add new ones) and say why.
- Every tool call needs a short "why" in plain words. No jargon.
- Budget: at most 4 check_firm, 2 web_search, 2 visit, 1 read_guideline, 1 search_case_law, 1 read_judgment, 3 fill_enquiry calls. Stop early when you have enough.
- If a firm check fails or a firm is ruled out, replace it with the next most promising firm before shortlisting.
- The "why" is shown as your message to the crew member, so write it like a short instruction to them in plain words, e.g. "Find legal aid firms near EH8 that do medical negligence".
- Exclude firms that defend the NHS, health boards or insurers, and firms whose site redirects to a claims company.
- Only ask_user when you truly need something (e.g. whether they would travel further); never ask for money details, consent or the postcode (Robin handles location).
- Never say anyone was negligent. Never submit forms.`;

/* ------------------------------------------------------------------ the run */

export async function runPlanner(facts: CaseFacts, fundingIn: Partial<Funding> = {}, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string } = {}): Promise<PlannerResult> {
  const runId = opts.runId ?? `step3-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = path.join(process.cwd(), ".runs", runId);
  const log = makeLogger(runDir);
  const startedAt = Date.now();
  mkdirSync(runDir, { recursive: true });
  const emit: Emit = (e) => {
    if (e.type !== "stats" && e.type !== "trace") log({ type: "status", message: JSON.stringify(e).slice(0, 2000) });
    // The whole event stream, timed, so a run can be replayed for a demo (D63, /api/agent/plan/demo).
    try {
      appendFileSync(path.join(runDir, "events.ndjson"), JSON.stringify({ t: Date.now() - startedAt, e }) + "\n");
    } catch {
      /* recording must never stop the run */
    }
    opts.onEvent?.(e);
  };
  enterLedger({ runId, runDir, agent: "elliot", t0: startedAt, emit });
  emit({ type: "run", runId });
  const track = new Tracker(emit);
  const tracer = new Tracer(emit, runDir);
  const { browser, context, page } = await openSession();
  const ctx = { context, emit, track, tracer, first: page };
  const tabs = limiter(MAX_TABS);
  waiting.set(runId, new Map());
  skips.set(runId, new Set());
  trackPause(runId, emit);

  // What the run knows. Tools read and write it; the planner sees summaries.
  const funding: Funding = { onBenefits: null, partner: null, dependants: null, netIncomeYearly: null, outgoingsYearly: null, savings: null, skipped: false, ...fundingIn };
  const firms = new Map<string, FirmFinding>();
  const evidence = new Map<string, Evidence>();
  let location: SearchLocation = { allowed: false };
  let verdict: Verdict = "unknown";
  let quote = "";
  let route: Route = "legal_aid";
  let shortlistIds: string[] = [];
  let plan: PlanStep[] = [];
  const thoughts: Thought[] = [];
  const says: Say[] = [];
  const proof: EvidenceResult = {}; // Iona's findings (D48); `evidence` below is per-firm scoring evidence
  let guideline: GuidelineReading | null = null;
  let message: EnquiryMessage | null = null;
  const enquiries = new Map<string, EnquiryOutcome>();
  const fillGuard = new EnquiryFillGuard();
  const t0 = Date.now();
  let asks = 0;
  let replanned = false;
  const say = (s: Omit<Say, "i" | "t">) => {
    const full: Say = { i: says.length, t: Date.now() - t0, ...s };
    says.push(full);
    emit({ type: "say", say: full });
  };
  const crewState = (id: CrewId, state: "idle" | "working" | "waiting" | "done", note: string) => emit({ type: "crew", id, state, note });
  const open = new Map<CrewId, number>(); // jobs each crew member still has running (D62: never "idle" while busy)
  /** Same, remembering the tab's label on the planner's thought so the report can point at exactly its browser steps. */
  const crewFor = <T,>(th: Thought, id: CrewId, task: string, work: (p: Page, note: Note) => Promise<T>, timeoutMs: number, firms?: string[]) => {
    th.tab = `${CREW[id].name} · ${task}`;
    emit({ type: "spotlight", crew: id, tab: th.tab });
    return crewAgent(id, task, work, timeoutMs, firms);
  };
  /** A worker in its own tab, wearing its crew colour and name. */
  const crewAgent = <T,>(id: CrewId, task: string, work: (p: Page, note: Note) => Promise<T>, timeoutMs: number, firms?: string[]) =>
    agent(ctx, `${CREW[id].name} · ${task}`, work, timeoutMs, firms, { color: CREW[id].color, cursor: `${CREW[id].name} · ${task}` });

  const ask: Ask = (spec) => {
    const id = `q${++asks}`;
    const crew = spec.crew ?? crewOf(spec.agent);
    const full: AskSpec = { id, ...spec, crew };
    emit({ type: "ask", ask: full });
    say({ from: crew, to: "you", kind: "ask", text: spec.question, detail: spec.why });
    crewState(crew, "waiting", "Waiting for your answer");
    return new Promise((resolve) => {
      const done = (a: string | null) => {
        clearTimeout(timer);
        emit({ type: "answered", id, answer: a });
        crewState(crew, "working", a === null ? "Carrying on without it" : "Got your answer");
        resolve(a);
      };
      const timer = setTimeout(() => {
        waiting.get(runId)?.delete(id);
        done(null);
      }, ASK_TIMEOUT_MS);
      waiting.get(runId)!.set(id, done);
    });
  };
  const finding = (text: string, source?: string, crew?: CrewId) => emit({ type: "finding", text, source, crew });
  const said = (t: string) => (t === "yes" ? "yes" : t === "no" ? "no" : "not clear");
  const firmLine = (f: FirmFinding) =>
    `${f.id}: ${f.name}, ${f.town}${f.distanceMiles !== null ? ` (${f.distanceMiles} miles)` : ""}${f.website ? `, ${f.website}` : ", no website"}${f.legalAid ? ", takes legal aid" : ""}${f.sources.includes("website") ? `. Checked: acts for patients ${said(f.actsForPatients)}; no win no fee ${said(f.noWinNoFee)}; enquiry form ${f.enquiryUrl ? "found" : "not found"}${f.excluded ? `; RULED OUT: ${f.excluded}` : ""}` : ""}`;

  /** What a crew member is doing, in a few plain words, while the tool runs (shown as the hero line, D62). */
  const doing = (tool: string, a: Record<string, unknown>): string => {
    const firm = firms.get(String(a.firm_id ?? ""))?.name ?? (typeof a.name === "string" ? a.name : "");
    const short = (n: string) => n.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, "");
    switch (tool) {
      case "slab_calculator":
        return "Checking legal aid on SLAB's calculator";
      case "slab_lawyer_list":
        return "Searching SLAB's list of legal aid solicitors";
      case "web_search":
        return "Searching the web for more solicitors";
      case "visit":
        return `Reading ${host(String(a.url ?? "")) || "a web page"}`;
      case "check_firm":
        return firm ? `Checking ${short(firm)}'s website` : "Checking a firm's website";
      case "law_society_check":
        return "Checking firms on the Law Society register";
      case "read_guideline":
        return "Reading the NICE clinical guideline";
      case "compare_care":
        return "Comparing the guideline with your story";
      case "search_case_law":
        return "Searching Scottish court cases";
      case "read_judgment":
        return "Reading a court judgment";
      case "fill_enquiry":
        return firm ? `Filling ${short(firm)}'s enquiry form` : "Filling an enquiry form";
      default:
        return "Working";
    }
  };

  /** What a crew member says back after a tool: one plain sentence for the user, not the planner's raw notes. */
  const describe = (tool: string, a: Record<string, unknown>, out: string): string => {
    switch (tool) {
      case "slab_calculator":
        return funding.skipped ? "You skipped the money questions, so legal aid stays unknown." : verdict === "likely" ? `SLAB's estimate: likely to qualify for legal aid. "${quote}"` : verdict === "unlikely" ? `SLAB's estimate: unlikely to qualify. "${quote}"` : "I could not read SLAB's estimate.";
      case "slab_lawyer_list": {
        const list = [...firms.values()].filter((f) => f.legalAid);
        const near = list[0];
        return list.length ? `Found ${list.length} firms that take legal aid for medical negligence. Nearest: ${near.name}${near.distanceMiles != null ? `, ${near.distanceMiles} miles away` : ""}.` : out;
      }
      case "web_search": {
        const n = (out.match(/^\d+\./gm) ?? []).length;
        return n ? `${n} results for "${String(a.query ?? "")}".` : "No useful results.";
      }
      case "check_firm": {
        const f = firms.get(String(a.firm_id ?? "")) ?? [...firms.values()].find((x) => x.name === a.name);
        if (!f) return out;
        if (f.excluded) return `Ruled out ${f.name}: ${f.excluded}.`;
        return `Read ${f.name}'s website.`;
      }
      case "law_society_check": {
        const on = (out.match(/on the register/g) ?? []).length;
        const all = (out.match(/: /g) ?? []).length;
        return on === all ? `All ${all} firms are on the Law Society of Scotland register.` : on > 0 ? `Confirmed ${on} of ${all} firms on the Law Society of Scotland register; the others did not match by name.` : `Could not confirm these firms on the Law Society register by name.`;
      }
      case "read_guideline":
        return proof.guideline?.points.length ? `${proof.guideline.name}, ${proof.guideline.points[0].id}: "${proof.guideline.points[0].text}"` : "The guideline says nothing about this.";
      case "compare_care":
        return proof.gaps?.length ? `${proof.gaps.length} possible gap${proof.gaps.length === 1 ? "" : "s"} for a solicitor to check: ${proof.gaps[0].question}` : "No gap between the guideline and your account.";
      case "search_case_law": {
        const n = (out.match(/^\d+\./gm) ?? []).length;
        return n ? `${n} Scottish judgment${n === 1 ? "" : "s"} found. Top: ${out.split("\n")[0].replace(/^1\.\s*/, "").split(" — ")[0]}.` : "No Scottish judgments found.";
      }
      case "read_judgment": {
        const c = proof.cases?.at(-1);
        if (!c) return out;
        const kind = c.kind === "medical_negligence" ? "a medical negligence case" : c.kind === "similar_injury_other_cause" ? "a similar injury, but not medical negligence" : "not relevant";
        return `${c.title} (${c.year}) is ${kind}.${c.award ? ` Award: ${c.award}.` : ""}`;
      }
      case "fill_enquiry": {
        const e = enquiries.get(String(a.firm_id ?? ""));
        return e ? (e.status === "ready_to_send" ? `${e.firmName}: enquiry form filled. Waiting for your OK before anything is sent.` : e.status === "needs_input" ? `${e.firmName}: form filled as far as I could. It needs ${e.unfilled.join(", ")} from you, which you can add when you review.` : `${e.firmName}: ${e.note}`) : out;
      }
      default:
        return out.split("\n")[0];
    }
  };

  /** Run one tool. Returns the text the planner sees. Errors are returned, not thrown, so the planner can recover. */
  async function run(call: ResponseFunctionToolCall, thought: Thought): Promise<string> {
    const a = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
    const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
    switch (call.name) {
      case "update_plan": {
        const before = plan;
        plan = ((a.steps as PlanStep[]) ?? []).map((st, i) => ({ id: st.id || `s${i + 1}`, text: st.text, status: st.status ?? "todo", why: st.why }));
        // A replan = steps added, dropped or reworded (not just ticked off).
        const key = (xs: PlanStep[]) => xs.filter((x) => x.status !== "dropped").map((x) => x.text).join("|");
        replanned = before.length > 0 && (key(before) !== key(plan) || plan.some((x) => x.status === "dropped" && before.find((b) => b.id === x.id)?.status !== "dropped"));
        emit({ type: "plan", steps: plan });
        return "Plan updated.";
      }
      case "slab_calculator": {
        if (funding.skipped) return "The user chose not to give money details. Treat legal aid as unknown and look at no win no fee.";
        const r = await tabs(() => crewFor(thought, "nell", "SLAB calculator", (p, note) => calculatorAsking(p, funding, ask, note, track, (value) => emit({ type: "funding", funding: value })), 8 * 60 * 1000));
        if (!r.ok) return `The calculator failed: ${r.error}`;
        if (r.value.skipped) {
          funding.skipped = true;
          emit({ type: "funding", funding: { ...funding } });
          finding("You skipped the money questions, so legal aid is unknown", "SLAB calculator");
          return "The user did not answer the calculator's questions. Legal aid unknown: consider no win no fee.";
        }
        verdict = r.value.verdict;
        quote = r.value.quote;
        finding(verdict === "likely" ? "SLAB: likely to qualify financially for legal aid" : verdict === "unlikely" ? "SLAB: unlikely to qualify for legal aid" : "SLAB's estimate could not be read", "SLAB calculator");
        return `SLAB estimate: ${verdict}. Its words: "${quote}"`;
      }
      case "slab_lawyer_list": {
        let r = await tabs(() => crewFor(thought, "robin", "SLAB lawyer list", (p, note) => runFinder(p, note, track, location), 120_000));
        let noLocation = "";
        if (!r.ok && /could not confirm/i.test(r.error) && location.allowed) {
          // Recovery (D62): SLAB would not take the postcode. Search again without a location rather than asking again.
          tracer.add({ agent: thought.tab ?? "Robin", color: CREW.robin.color, kind: "recover", text: `SLAB could not confirm ${location.postcode}; searching again without a location` });
          noLocation = ` SLAB could not use ${location.postcode}, so this list is not sorted by distance; do not ask the user about the postcode again.`;
          location = { allowed: false };
          r = await tabs(() => crewFor(thought, "robin", "SLAB lawyer list", (p, note) => runFinder(p, note, track, location), 120_000));
        }
        if (!r.ok) return `SLAB's lawyer list failed: ${r.error}`;
        for (const f of mergeCards(r.value)) if (!firms.has(f.id)) firms.set(f.id, f);
        const list = [...firms.values()].filter((f) => f.legalAid);
        finding(`SLAB lists ${list.length} firms that take medical negligence legal aid`, "SLAB lawyer list");
        return `Found ${list.length} firms (${location.allowed ? `nearest to ${location.postcode} first` : "without distance ranking"}).${noLocation}\n${list.slice(0, 15).map(firmLine).join("\n")}`;
      }
      case "web_search": {
        const r = await tabs(() => crewFor(thought, "robin", "Web search", (p, note) => webSearch(p, s("query"), note, track), 60_000));
        if (!r.ok) return `Search failed: ${r.error}`;
        if (r.value.length) finding(`Web search found ${r.value.length} results for "${s("query")}"`, "Web search");
        return r.value.map((x, i) => `${i + 1}. ${x.title} — ${x.url}\n   ${x.snippet}`).join("\n") || "No results.";
      }
      case "visit": {
        let url = s("url");
        if (!/^https?:\/\//.test(url)) url = `https://${url}`;
        const r = await tabs(() => crewFor(thought, "robin", short(new URL(url).hostname.replace(/^www\./, ""), 26), (p, note) => visit(p, url, s("question"), note), 60_000));
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
        const r = await tabs(() => crewFor(thought, "robin", label, (p, note) => vetFirm(p, firm, note, track), 90_000, [firm.id]));
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
        const r = await tabs(() => crewFor(thought, "robin", "Law Society register", (p, note) => lawSocietyCheck(p, list, note, track), 120_000));
        if (!r.ok) return `Law Society check failed: ${r.error}`;
        for (const f of list) {
          const on = r.value.has(f.id);
          if (on) firms.set(f.id, { ...firms.get(f.id)!, sources: [...new Set([...firms.get(f.id)!.sources, "lawsoc" as const])] });
          evidence.set(f.id, { ...evidence.get(f.id), lawsoc: on ? "Found by name on the Law Society of Scotland's Find a Solicitor" : "Searched the Law Society register by name; no matching firm" });
        }
        finding(`Law Society register: ${r.value.size} of ${list.length} firms found`, "Law Society of Scotland");
        return list.map((f) => `${f.id}: ${r.value.has(f.id) ? "on the register" : "not found"}`).join("\n");
      }
      case "read_guideline": {
        const r = await tabs(() => crewFor(thought, "iona", "Clinical guideline", (p, note) => readGuideline(p, s("topic") || "suspected scaphoid fracture", note, track), 90_000));
        if (!r.ok) return `Could not read the guideline: ${r.error}`;
        guideline = r.value;
        proof.guideline = { name: r.value.guideline, url: r.value.url, points: r.value.points };
        emit({ type: "evidence", evidence: { ...proof } });
        if (r.value.points.length) finding(`${r.value.guideline} ${r.value.points.map((x) => x.id).join(", ")}: "${r.value.points[0].text}"`, r.value.url, "iona");
        return r.value.points.length ? `${r.value.guideline}:\n${r.value.points.map((x) => `${x.id}: ${x.text}`).join("\n")}` : "No recommendation about this on the page.";
      }
      case "compare_care": {
        if (!guideline) return "Read the guideline first (read_guideline).";
        const c = await compareCare(facts, guideline);
        proof.gaps = c.gaps;
        proof.caveat = c.caveat;
        emit({ type: "evidence", evidence: { ...proof } });
        for (const gap of c.gaps) finding(`Possible gap to check: ${gap.question}`, guideline.url, "iona");
        return c.gaps.length ? `${c.gaps.length} possible gap(s):\n${c.gaps.map((x) => `- ${x.question}`).join("\n")}\nCaveat: ${c.caveat}` : `No gap between the guideline and the account. ${c.caveat}`;
      }
      case "search_case_law": {
        const r = await tabs(() => crewFor(thought, "iona", "Court judgments", (p, note) => searchCaseLaw(p, s("query"), note, track), 90_000));
        if (!r.ok) return `BAILII search failed: ${r.error}`;
        return r.value.length ? r.value.map((h, i) => `${i + 1}. ${h.title} — ${h.url}`).join("\n") : "No judgments found.";
      }
      case "read_judgment": {
        const r = await tabs(() => crewFor(thought, "iona", "Reading a judgment", (p, note) => readJudgment(p, s("url"), "a missed scaphoid (wrist) fracture", note, track), 120_000));
        if (!r.ok) return `Could not read the judgment: ${r.error}`;
        const j = r.value;
        proof.cases = [...(proof.cases ?? []), { title: j.title, url: j.url, year: j.year, court: j.court, kind: j.kind, summary: j.summary, award: j.award }];
        emit({ type: "evidence", evidence: { ...proof } });
        finding(`${j.title} (${j.year}): ${j.kind === "medical_negligence" ? "medical negligence" : j.kind === "similar_injury_other_cause" ? "similar injury, different cause" : "not relevant"}${j.award ? `, award ${j.award}` : ""}`, j.url, "iona");
        return `${j.title} (${j.year}, ${j.court}): ${j.kind}. ${j.summary}${j.award ? ` Award: ${j.award}` : ""}`;
      }
      case "fill_enquiry": {
        const firm = firms.get(s("firm_id"));
        const blocked = fillGuard.claim(firm, shortlistIds);
        if (blocked || !firm) return `Blocked: ${blocked ?? "Unknown firm id."}`;
        let ready = false;
        try {
          if (!firm.website && !firm.enquiryUrl) return `${firm.name} has no website to fill a form on.`;
          const g = proof.guideline?.points[0];
          message ??= await draftEnquiry(facts, { verdict: funding.skipped ? "skipped" : verdict, route }, g && proof.gaps?.[0] ? { guideline: proof.guideline!.name.split(":")[0], point: g.text, question: proof.gaps[0].question } : undefined);
          const msg = message;
          const r = await tabs(() =>
            crewFor(thought, "kit", firm.name.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, "").slice(0, 24), async (p, note) => {
              const o = await fillOne(p, firm, { facts, message: msg }, note, track, (x) => emit({ type: "enquiry", enquiry: x }));
              if (o.status === "ready_to_send" || o.status === "needs_input") keepForApproval(firm.id, { page: p, firm, email: facts.email, runId, tracer, note });
              return o;
            }, 150_000, [firm.id]),
          );
          const o: EnquiryOutcome = r.ok ? r.value : { firmId: firm.id, firmName: firm.name, status: "failed", formUrl: null, filled: [], unfilled: [], consents: [], note: `Stopped: ${r.error}` };
          enquiries.set(firm.id, o);
          ready = o.status === "ready_to_send";
          emit({ type: "enquiry", enquiry: o });
          // Kit looks harder than Vera: if Kit found the form, the firm record says so too (one truth for the case file and step 4).
          if (o.status === "ready_to_send" && o.formUrl) {
            firms.set(firm.id, { ...firms.get(firm.id)!, enquiryUrl: o.formUrl });
            evidence.set(firm.id, { ...evidence.get(firm.id), form: `Kit found and filled their form at ${o.formUrl}` });
          }
          finding(`${firm.name}: ${o.status === "ready_to_send" ? "enquiry form filled, waiting for your OK" : o.note}`, o.formUrl ?? undefined, "kit");
          return `${firm.name}: ${o.status}. ${o.note}`;
        } finally {
          fillGuard.finish(firm.id, ready);
        }
      }
      case "ask_user": {
        const answer = await ask({ agent: "Planner", crew: "elliot", question: s("question"), why: s("why"), kind: (s("kind") as AskSpec["kind"]) || "text", options: a.options as string[] | undefined });
        return answer === null ? "The user did not answer. Carry on without it." : `The user answered: ${answer}`;
      }
      case "shortlist": {
        route = s("route") === "no_win_no_fee" ? "no_win_no_fee" : "legal_aid";
        for (const [id, f] of firms) firms.set(id, score(f, route, evidence.get(id)));
        shortlistIds = ((a.firm_ids as string[]) ?? []).filter((id) => firms.has(id) && !firms.get(id)!.excluded).sort((x, y) => firms.get(y)!.score - firms.get(x)!.score).slice(0, 3);
        // Keep the shortlist in fit order after the final rescore too.
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
    // The profile's postcode is used for the solicitor search without a separate question (Tarun, 2026-11-07).
    const savedPostcode = facts.postcode && isPostcode(facts.postcode) ? formatPostcode(facts.postcode) : null;
    location = savedPostcode ? { allowed: true, postcode: savedPostcode } : { allowed: false };
    const story = [facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n");
    const known = Object.entries(funding).filter(([, v]) => v !== null && v !== false).map(([k, v]) => `${k}=${v}`).join(", ") || "none yet";
    let input: ResponseInputItem[] | string = `Patient: ${facts.firstName ?? "the patient"}, approved search postcode ${location.allowed ? location.postcode : "not shared"}.\nWhere treated: ${facts.incidentLocation ?? "unknown"}.\nWhat happened:\n${story}\nWhat they want: ${facts.desiredOutcome ?? "not said"}\nMoney answers already known: ${known}\n\nUse only the approved search postcode for nearby-firm searches. Never infer the patient location from the hospital or treatment location. If location is not shared, do not use proximity ranking.\nPlan and run the research.`;
    let prev: string | undefined;
    let finished = false;

    for (turns = 1; turns <= MAX_TURNS && !finished; turns++) {
      await untilResumed(runId);
      const res: Response = await respond({
        model: MODELS.draft,
        reasoning: { effort: "low" },
        instructions: SYSTEM,
        input,
        tools: TOOLS,
        tool_choice: "required",
        parallel_tool_calls: true,
        ...(prev ? { previous_response_id: prev } : {}),
      }, "planner");
      prev = res.id;
      const calls: ResponseFunctionToolCall[] = res.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
      if (!calls.length) {
        input = [{ role: "user", content: "Call a tool. Use shortlist and then finish when you are done." }];
        continue;
      }
      // One step at a time (D62): calls run in order. Consecutive check_firm or fill_enquiry calls form one side-by-side batch.
      const PARALLEL = new Set(["check_firm", "fill_enquiry"]);
      // The story order wins over the order the model listed its calls in: Nell, Robin, Iona, shortlist, Kit.
      const STAGE: Record<string, number> = { update_plan: 0, ask_user: 0, slab_calculator: 1, slab_lawyer_list: 2, web_search: 2, visit: 2, check_firm: 3, law_society_check: 3, read_guideline: 4, compare_care: 4, search_case_law: 4, read_judgment: 4, shortlist: 5, fill_enquiry: 6, finish: 7 };
      calls.sort((x, y) => (STAGE[x.name] ?? 4) - (STAGE[y.name] ?? 4));
      const batches: ResponseFunctionToolCall[][] = [];
      for (const c of calls) {
        const last = batches.at(-1);
        if (last && PARALLEL.has(c.name) && last[0].name === c.name) last.push(c);
        else batches.push([c]);
      }
      const exec = async (call: ResponseFunctionToolCall): Promise<ResponseInputItem> => {
          await untilResumed(runId);
          const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
          const thought: Thought = { i: thoughts.length, t: Date.now() - t0, text: String(args.why ?? call.name), tool: call.name, detail: JSON.stringify(Object.fromEntries(Object.entries(args).filter(([k]) => k !== "why")), null, 1) };
          thoughts.push(thought);
          if (call.name !== "update_plan") emit({ type: "thought", thought });
          const who = TOOL_CREW[call.name] ?? "elliot";
          const why = String(args.why ?? "").trim();
          const skipSet = skips.get(runId);
          if (who !== "elliot" && (skipSet?.has(who) || skipSet?.has("all"))) {
            say({ from: who, to: "elliot", kind: "report", text: "Skipped, as you asked.", tool: call.name });
            crewState(who, "idle", "Skipped");
            return { type: "function_call_output" as const, call_id: call.call_id, output: `Skipped: the user asked to skip ${skipSet?.has("all") ? "the remaining research" : `${CREW[who].name}'s work`}. Do not call this tool again; carry on${skipSet?.has("all") ? ": call shortlist, then finish now" : ""}.` };
          }
          if (who !== "elliot" && call.name !== "update_plan") {
            say({ from: "elliot", to: who, kind: "assign", text: why || call.name, tool: call.name });
            open.set(who, (open.get(who) ?? 0) + 1);
            crewState(who, "working", doing(call.name, args));
          }
          let out: string;
          try {
            out = await run(call, thought);
          } catch (e) {
            out = `Error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
          }
          if (call.name === "update_plan") {
            say({ from: "elliot", kind: "plan", text: why || "Updated the plan", tool: call.name, replan: replanned });
          } else {
            thought.result = short(out, 600);
            emit({ type: "thought", thought: { ...thought } });
          }
          if (who !== "elliot") {
            const failed = /^(Error|Could not|Blocked:|Unknown firm|.*failed\b|.*: failed\.)/.test(out);
            // A Kit report is a success only if the form really is filled and waiting (Luigi, f17ed55).
            const ok = !failed && (call.name !== "fill_enquiry" || enquiries.get(String(args.firm_id))?.status === "ready_to_send");
            const text = failed ? `I hit a problem: ${out}` : describe(call.name, args, out);
            const f = call.name === "check_firm" ? firms.get(String(args.firm_id ?? "")) ?? [...firms.values()].find((x) => x.name === args.name) : undefined;
            const facts = f && f.sources.includes("website") && !failed
              ? [
                  { label: "Represents patients", value: f.actsForPatients },
                  { label: "No win no fee", value: f.noWinNoFee },
                  { label: "Enquiry form", value: f.enquiryUrl ? ("yes" as const) : ("no" as const) },
                ]
              : undefined;
            say({ from: who, to: "elliot", kind: "report", text, detail: out.includes("\n") ? short(out, 1500) : undefined, tool: call.name, tab: thought.tab, ok, facts, firm: f?.name });
            const left = Math.max(0, (open.get(who) ?? 1) - 1);
            open.set(who, left);
            const plural = (n: number, w: string) => `${n} more ${w}${n === 1 ? "" : "s"}`;
            const still = call.name === "check_firm" ? `Checking ${plural(left, "firm website")}` : call.name === "fill_enquiry" ? `Filling ${plural(left, "enquiry form")}` : doing(call.name, args);
            crewState(who, left > 0 ? "working" : "idle", left > 0 ? still : text);
          } else if (call.name === "shortlist") say({ from: "elliot", kind: "note", text: out.replace(/\n/g, "; "), tool: call.name });
          else if (call.name === "finish") say({ from: "elliot", to: "you", kind: "done", text: String(args.summary ?? "Done."), tool: call.name });
          if (call.name === "finish") finished = true;
          return { type: "function_call_output" as const, call_id: call.call_id, output: out };
      };
      const outputs: ResponseInputItem[] = [];
      for (const batch of batches) outputs.push(...(await Promise.all(batch.map(exec))));
      input = skips.get(runId)?.has("all") && !finished ? [...outputs, { role: "user" as const, content: "The user asked to finish now. Call shortlist with what you have, then finish." }] : outputs;
    }

    // Score everything once more at the end, so what Kit found counts (one truth for the case file and step 4).
    for (const [id, f] of firms) firms.set(id, score(f, route, evidence.get(id)));
    const all = [...firms.values()].sort((a, b) => b.score - a.score);
    if (!shortlistIds.length) shortlistIds = all.filter((f) => !f.excluded && f.sources.includes("website")).slice(0, 3).map((f) => f.id);
    const result: PlannerResult = {
      funding: { ...funding },
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
      says,
      evidence: proof,
      enquiries: [...enquiries.values()],
      message: message ?? undefined,
      asks,
      recoveries: tracer.steps.filter((x) => x.kind === "recover").length,
    };
    emit({ type: "result", result });
    emit({ type: "planner_result", result });
    // The research is over: close every tab. Only filled enquiry forms waiting for the user's OK stay up (D57).
    const waiting4Ok = approvalTabs(context);
    if (opts.keepOpen && waiting4Ok.length > 0) {
      reviewing = true;
      await keepOnlyTabs(context, waiting4Ok);
    }
    return result;
  } finally {
    waiting.delete(runId);
    skips.delete(runId);
    dropPause(runId);
    dropHandoffs(runId);
    if (!reviewing) await browser.close().catch(() => {});
  }
}
