import { chooseFinderLocation } from "./finderLocation";
import type { SearchLocation } from "./searchLocation";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { dismissCookies, openSession } from "../browser";
import { pointAt, setCursor } from "../agentCursor";
import { publishStats, setPageMeta } from "../liveview";
import type { Value } from "./browserAgent";
import { runDecisionAgent } from "./decisionAgent";
import { decide, type DAnswer } from "./decisions";
import { makeLogger } from "./events";
import {
  AGENT_COLORS,
  type AgentTile,
  type FirmFinding,
  type Funding,
  type Route,
  type ScoreItem,
  type Stats,
  type Step3Event,
  type Step3Result,
  type TraceStep,
  type Tri,
  type Verdict,
} from "./legalAidTypes";

/**
 * Step 3 (D36): can I get legal aid, and who could take my case. Several browser agents in parallel tabs of
 * one browser, each with its own cursor and live-grid tile:
 *   1. SLAB civil legal aid calculator   (Decisions engine fills it; we read the verdict off the page)
 *   2. SLAB solicitor finder              (Decisions engine runs the search; direct clicks if it fails)
 *   3. Law Society directory              (checks each shortlisted firm by name)
 *   4+ Firm websites                      (find the medical negligence page, read it, find the enquiry form)
 * Nothing is submitted anywhere: the calculator works out its estimate on the page, and the searches only search.
 */

export const SLAB_CALC = "https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/";
export const SLAB_FINDER = "https://www.slab.org.uk/new-to-legal-aid/find-a-solicitor/";
export const LAWSOC = "https://www.lawscot.org.uk/find-a-solicitor/";

const FIRMS_TO_VET = 4;
const FIRM_TIMEOUT_MS = 75_000;

export type Emit = (e: Step3Event) => void;

/** Counts what the agents did, for the live grid and the result. */
export class Tracker {
  sites = new Set<string>();
  pages = 0;
  actions = 0;
  agents = 0;
  constructor(private emit: Emit) {}
  get stats(): Stats {
    return { agents: this.agents, sites: this.sites.size, pages: this.pages, actions: this.actions };
  }
  bump(kind: "action" | "page", url?: string) {
    if (kind === "action") this.actions++;
    else {
      this.pages++;
      try {
        this.sites.add(new URL(url!).hostname.replace(/^www\./, ""));
      } catch {
        /* about:blank */
      }
    }
    publishStats(this.stats);
    this.emit({ type: "stats", stats: this.stats });
  }
}

/** Everything every agent did, in order, with screenshots (D39). Streamed live and returned with the result. */
export class Tracer {
  steps: TraceStep[] = [];
  t0 = Date.now();
  constructor(private emit: Emit, public runDir: string) {
    mkdirSync(runDir, { recursive: true });
  }
  add(step: Omit<TraceStep, "i" | "t">) {
    const full: TraceStep = { i: this.steps.length, t: Date.now() - this.t0, ...step };
    this.steps.push(full);
    this.emit({ type: "trace", step: full });
    return full;
  }
  async shot(page: Page, name: string): Promise<string | undefined> {
    const file = `${String(this.steps.length).padStart(3, "0")}-${name.replace(/[^a-z0-9-]+/gi, "-").slice(0, 40)}.jpg`;
    try {
      await page.screenshot({ path: path.join(this.runDir, file), type: "jpeg", quality: 55, timeout: 5000 });
      return file;
    } catch {
      return undefined;
    }
  }
}

export type LogExtra = Partial<Pick<TraceStep, "url" | "detail" | "confidence" | "firms">> & { shot?: boolean | string };
/** The tile note, plus `.log` (add a trace step, optionally with a screenshot) for the agent's own tab. */
export type Note = ((s: string) => void) & { log: (kind: TraceStep["kind"], text: string, extra?: LogExtra) => Promise<void> };

/** One browser agent in its own tab: a coloured cursor, a grid tile, and a time limit. Failures are reported, not thrown. */
export async function agent<T>(
  ctx: { context: BrowserContext; emit: Emit; track: Tracker; tracer: Tracer; first?: Page },
  label: string,
  work: (page: Page, note: Note) => Promise<T>,
  timeoutMs = 120_000,
  firms?: string[], // every step of this agent is about these firms (a firm's own website)
  look?: { color?: string; cursor?: string }, // the planner's crew colour and cursor name (D48)
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const n = ++ctx.track.agents;
  const color = look?.color ?? AGENT_COLORS[(n - 1) % AGENT_COLORS.length];
  const page = ctx.first && ctx.first.url() === "about:blank" && !(ctx.first as Page & { __used?: boolean }).__used ? ctx.first : await ctx.context.newPage();
  (page as Page & { __used?: boolean }).__used = true;
  const tile: AgentTile = { id: "", label, color, url: page.url(), state: "starting", note: "Opening" };
  const update = (patch: Partial<AgentTile>) => {
    Object.assign(tile, patch, { url: page.isClosed() ? tile.url : page.url() });
    setPageMeta(page, { label, color, state: tile.state, note: tile.note });
    ctx.emit({ type: "agent", tile: { ...tile, id: `a${n}` } });
  };
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame() && f.url() !== "about:blank") {
      ctx.track.bump("page", f.url());
      update({});
    }
  });
  await setCursor(page, { color, label: look?.cursor ?? `Agent ${n} · ${label}` });
  update({});
  const note = Object.assign((s: string) => update({ state: "working", note: s }), {
    log: async (kind: TraceStep["kind"], text: string, extra: LogExtra = {}) => {
      const { shot, ...rest } = extra;
      const file = typeof shot === "string" ? shot : shot && !page.isClosed() ? await ctx.tracer.shot(page, `${label}-${kind}`) : undefined;
      ctx.tracer.add({ agent: label, color, kind, text, url: page.isClosed() ? undefined : page.url(), ...(firms ? { firms } : {}), ...rest, ...(file ? { shot: file } : {}) });
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      work(page, note),
      new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error("Took too long")), timeoutMs))),
    ]);
    update({ state: "done", note: tile.note });
    return { ok: true, value };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 120);
    update({ state: "failed", note: error });
    await note.log("fail", `Stopped: ${error}`, { shot: true }).catch(() => {});
    return { ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ 1. calculator */

function calculatorValues(f: Funding): Value[] {
  const v = (key: string, description: string, value: string): Value => ({ key, description, value });
  if (f.onBenefits) return [v("auto_qualify", "Does the user automatically qualify financially (receives one of the listed benefits)?", "Yes")];
  return [
    v("auto_qualify", "Does the user automatically qualify financially (receives one of the listed benefits)?", "No"),
    v("has_partner", "Does the user have a partner or spouse?", f.partner ? "Yes" : "No"),
    v("dependants", "How many dependants (adults and/or children) live with the user", String(f.dependants ?? 0)),
    v("income", "The user's net annual income in pounds", String(f.netIncomeYearly ?? 0)),
    v("outgoings", "The user's annual outgoings in pounds", String(f.outgoingsYearly ?? 0)),
    v("savings", "The user's total disposable capital (savings) in pounds", String(f.savings ?? 0)),
  ];
}

/**
 * The calculator's own words, read only from its "Step 5: Estimate" block (wording checked 2026-11-07):
 *   low income  -> "You are likely to qualify for civil legal aid. You may not have to pay a contribution."
 *   high income -> "It is likely you do NOT qualify for civil legal aid. based on your income."
 *   not filled  -> "Once you complete these fields, an estimate will be provided: ..."
 * The page's general guidance also says "likely to qualify", so the rest of the page must not be read.
 */
export function readVerdict(text: string): { verdict: Verdict; quote: string } {
  const start = text.search(/Step 5:?\s*Estimate/i);
  if (start < 0) return { verdict: "unknown", quote: "" };
  const after = text.slice(start).replace(/^Step 5:?\s*Estimate\s*/i, "");
  const end = after.search(/Some final points|Remember that this estimator/i);
  const block = (end >= 0 ? after.slice(0, end) : after.slice(0, 300)).replace(/\s+/g, " ").trim();
  if (!block || /once you complete these fields/i.test(block)) return { verdict: "unknown", quote: block };
  const verdict: Verdict = /do not qualify|not qualify|not eligible|unlikely/i.test(block) ? "unlikely" : /likely to qualify|automatically qualify|you qualify/i.test(block) ? "likely" : "unknown";
  return { verdict, quote: block.slice(0, 300) };
}

/** Visible text without waiting: some sites (SLAB) have no <main>, and a locator would wait 30 s for it. */
export const pageText = (page: Page) => page.evaluate(() => (document.querySelector("main") as HTMLElement | null)?.innerText || document.body.innerText).catch(() => "");

async function runCalculator(page: Page, funding: Funding, note: Note, track: Tracker) {
  note("Opening SLAB's calculator");
  await page.goto(SLAB_CALC, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  await dismissCookies(page, 3000);
  await note.log("open", "Opened SLAB's civil legal aid calculator", { shot: true, detail: `Answers it will use: ${calculatorValues(funding).map((v) => `${v.description}: ${v.value}`).join("; ")}` });
  note(funding.onBenefits ? "Answering: on benefits" : "Typing your money answers");
  let status = "error";
  try {
    const run = await runDecisionAgent({
      page,
      goal: "Complete the legal aid estimator using the saved answers so that it shows its estimate.",
      values: calculatorValues(funding),
      allowSubmit: true, // the estimate is worked out on the page; there is nothing to send
      maxSteps: 10,
      onEvent: (e) => {
        if (e.type === "action") {
          track.bump("action");
          const a = e.args as { label?: string; choice?: string; confidence?: number; group?: string };
          const what = `${e.tool === "fill" ? "Typed" : e.tool === "select" ? "Picked" : "Ticked"} ${String(a.group ?? a.label ?? "").slice(0, 40)}`;
          note(what);
          void note.log(e.tool === "fill" ? "type" : e.tool === "select" ? "pick" : "click", `${what}${a.choice ? ` (saved answer: ${a.choice})` : a.group ? `: ${a.label}` : ""}`, { confidence: a.confidence });
        }
      },
    });
    status = run.status;
  } catch (e) {
    note(`Agent error: ${(e instanceof Error ? e.message : String(e)).slice(0, 60)}`);
  }
  await page.waitForTimeout(1200); // the estimate updates as you type
  let { verdict, quote } = readVerdict(await page.evaluate(() => document.body.innerText));
  if (verdict === "unknown") {
    // Recovery: the agent stopped before the estimate appeared. Fill the same answers directly, then read again.
    note("No estimate yet; filling the rest directly");
    await note.log("recover", "The agent stopped before the estimate appeared, so the remaining answers were filled directly");
    await fillCalculatorDirectly(page, funding, track);
    await page.waitForTimeout(1500);
    ({ verdict, quote } = readVerdict(await page.evaluate(() => document.body.innerText)));
  }
  note(verdict === "likely" ? "Likely to qualify financially" : verdict === "unlikely" ? "Unlikely to qualify" : "Could not read the estimate");
  await pointAt(page, page.getByText(/Step 5:?\s*Estimate/i).first());
  await note.log("result", verdict === "likely" ? "SLAB's estimate: likely to qualify financially" : verdict === "unlikely" ? "SLAB's estimate: unlikely to qualify" : "Could not read SLAB's estimate", { shot: true, detail: quote ? `The calculator's own words: "${quote}"` : undefined });
  return { verdict, quote, status };
}

/** The calculator's fields by their labels (read 2026-11-07). Used only when the agent did not finish. */
export async function fillCalculatorDirectly(page: Page, f: Funding, track: Tracker) {
  const radio = async (question: RegExp, answer: "Yes" | "No") => {
    const id = await page.evaluate(
      ({ q, a }) => {
        const rs = [...document.querySelectorAll("input[type=radio]")] as HTMLInputElement[];
        const r = rs.find((x) => (x.labels?.[0]?.innerText ?? "").trim() === a && new RegExp(q, "i").test(x.closest("fieldset, .gfield, li")?.textContent ?? ""));
        return r && !r.checked ? r.id : null;
      },
      { q: question.source, a: answer },
    );
    if (!id) return;
    const label = page.locator(`label[for="${id}"]`);
    await pointAt(page, label);
    await label.click().catch(() => {});
    track.bump("action");
    await page.waitForTimeout(500);
  };
  const field = async (label: RegExp, value: string) => {
    const el = page.getByLabel(label).first();
    if (!(await el.isVisible().catch(() => false))) return;
    if ((await el.inputValue().catch(() => "")).replace(/[£\s0.,]/g, "") !== "") return; // already filled
    await pointAt(page, el);
    await el.fill(value).catch(() => {});
    await el.press("Tab").catch(() => {});
    track.bump("action");
  };
  await radio(/following benefits|automatically qualify/, f.onBenefits ? "Yes" : "No");
  if (f.onBenefits) return;
  await radio(/partner or spouse/, f.partner ? "Yes" : "No");
  const deps = page.getByLabel(/how many dependants/i).first();
  if (await deps.isVisible().catch(() => false)) {
    await pointAt(page, deps);
    await deps.selectOption(String(f.dependants ?? 0)).catch(() => {});
    track.bump("action");
  }
  await field(/net annual income/i, String(f.netIncomeYearly ?? 0));
  await field(/annual outgoings/i, String(f.outgoingsYearly ?? 0));
  await field(/total disposable capital/i, String(f.savings ?? 0));
}

/* ------------------------------------------------------------------ 2. SLAB finder */

export type SlabCard = { distanceOrigin?: string; name: string; town: string; distanceMiles: number | null; website: string | null; email: string | null; phone: string | null; profile: string | null };

async function readSlabCards(page: Page): Promise<SlabCard[]> {
  return page.$$eval(".card-solicitor", (cards) =>
    cards.map((c) => {
      const name = (c.querySelector("h3")?.textContent ?? "").trim();
      const h4 = (c.querySelector("h4")?.textContent ?? "").replace(/\s+/g, " ").trim();
      const dist = h4.match(/\(([\d.]+)\s*miles?\)/i);
      const links = [...c.querySelectorAll(".contact-details a")] as HTMLAnchorElement[];
      const website = links.find((a) => /^https?:/.test(a.getAttribute("href") ?? "") && !/slab\.org\.uk/.test(a.href))?.href ?? null;
      const email = links.find((a) => (a.getAttribute("href") ?? "").startsWith("mailto:"))?.getAttribute("href")?.slice(7) ?? null;
      const phone = [...c.querySelectorAll(".contact-details li")].map((li) => li.textContent?.trim() ?? "").find((t) => /^[\d\s+()]{9,}$/.test(t)) ?? null;
      return {
        name,
        town: h4.replace(/\(.*\)/, "").trim(),
        distanceMiles: dist ? Number(dist[1]) : null,
        website,
        email,
        phone,
        profile: (c.querySelector("h3 a") as HTMLAnchorElement | null)?.href ?? null,
      };
    }),
  );
}

export async function runFinder(page: Page, note: Note, track: Tracker, location?: SearchLocation): Promise<SlabCard[]> {
  note("Opening SLAB's lawyer list");
  await page.goto(SLAB_FINDER, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  await dismissCookies(page, 3000);
  const origin = await chooseFinderLocation(page, location);
  await note.log("open", "Opened SLAB's Find a Solicitor", { shot: true });
  note("Choosing Civil, Medical negligence, active firms");
  const v = (key: string, description: string, value: string): Value => ({ key, description, value });
  try {
    await runDecisionAgent({
      page,
      goal: "Search for legal aid solicitors: civil legal aid, medical negligence, active solicitors only, results as a list. Then run the search with Find Solicitors.",
      values: [
        v("assistance", "Type of legal aid assistance needed", "Civil"),
        v("category", "Legal aid sub-category", "Medical negligence"),
        v("active_only", "Search active solicitors only?", "Yes"),
        v("display", "How results should be displayed", "List"),
      ],
      allowSubmit: true,
      maxSteps: 8,
      // Location is set only through the consent-controlled helper.
      ignore: (el) => /auto detect|manually choose|language|entire website|solicitor's section|guidance|^news$/i.test(el.label) || /search_special|search_address_new/.test(el.name),
      onEvent: (e) => {
        if (e.type === "action") {
          track.bump("action");
          const a = e.args as { label?: string; group?: string; confidence?: number };
          void note.log(e.tool === "fill" ? "type" : e.tool === "select" ? "pick" : "click", `${e.tool === "select" ? "Picked" : "Clicked"} ${String(a.group ? `${a.group}: ${a.label}` : a.label ?? "").slice(0, 70)}`, { confidence: a.confidence });
        }
      },
    });
  } catch (e) {
    note(`Agent error: ${(e instanceof Error ? e.message : String(e)).slice(0, 60)}`);
  }
  await page.waitForTimeout(1500);
  let cards = await readSlabCards(page);
  if (cards.length === 0) {
    // Recovery: the hidden radios sometimes defeat the agent. Do the same search with direct clicks.
    note("Agent missed it; retrying with direct clicks");
    await note.log("recover", "The agent's search showed no firms (the radio buttons are hidden). Doing the same search with direct clicks", { shot: true });
    await page.goto(SLAB_FINDER, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000);
    await chooseFinderLocation(page, location);
    for (const sel of ["label[for=category_parent_civil]"]) {
      await pointAt(page, page.locator(sel));
      await page.locator(sel).click();
      track.bump("action");
    }
    await page.waitForTimeout(600);
    const cat = page.locator("#solicitor-finder-child-list, select[name='solicitor-finder-child-list']").first();
    await pointAt(page, cat);
    await cat.selectOption({ label: "Medical negligence" });
    track.bump("action");
    for (const sel of ["label[for=active_only_yes]", "label[for=results_type_list]", "#submitToNext"]) {
      await pointAt(page, page.locator(sel));
      await page.locator(sel).click();
      track.bump("action");
    }
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2500);
    cards = await readSlabCards(page);
  }
  cards = cards.map((card) => ({ ...card, distanceMiles: origin ? card.distanceMiles : null, distanceOrigin: origin }));
  if (!origin) cards.sort((a, b) => a.name.localeCompare(b.name));
  const total = (await page.locator("body").innerText()).match(/Showing (\d+) results?/i)?.[1];
  note(`Read ${cards.length}${total ? ` of ${total}` : ""} firms`);
  if (cards.length) await pointAt(page, page.locator(".card-solicitor").first());
  await note.log("found", `Found ${cards.length} offices: civil legal aid, medical negligence, active in the last 12 months, ${origin ? `nearest to ${origin} first` : "distance excluded"}`, { shot: true, detail: cards.slice(0, 12).map((c, i) => `${i + 1}. ${c.name}, ${c.town} (${c.distanceMiles ?? "?"} miles)`).join("\n") });
  const seen = new Set<string>();
  for (const [i, c] of cards.entries()) {
    const id = slug(c.name);
    if (seen.has(id)) continue;
    seen.add(id);
    await note.log("found", `${c.name} is #${i + 1} of ${cards.length} on SLAB's list, ${c.distanceMiles ?? "?"} miles away`, { firms: [id], detail: [c.town, c.website, c.email, c.phone].filter(Boolean).join(" · ") });
  }
  return cards;
}

/* ------------------------------------------------------------------ merging and scoring */

export const core = (name: string) =>
  name
    .toLowerCase()
    .replace(/[&+]/g, " ")
    .replace(/\b(llp|ltd|limited|solicitors?|lawyers?|law|the|and|co|ws|sssc|scotland|plc|nominees|trustees)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const slug = (name: string) => core(name).replace(/\s+/g, "-") || "firm";
/** "Balfour + Manson LLP" and "Balfour and Manson Solicitors" are the same firm. */
const sameFirm = (a: string, b: string) => {
  const x = core(a), y = core(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};

/** One entry per firm (SLAB lists every office), nearest office first. */
export function mergeCards(cards: SlabCard[]): FirmFinding[] {
  const byId = new Map<string, FirmFinding>();
  for (const c of cards) {
    const id = slug(c.name);
    const prev = byId.get(id);
    if (prev && (prev.distanceMiles ?? 999) <= (c.distanceMiles ?? 999)) {
      prev.website ??= c.website;
      prev.email ??= c.email;
      continue;
    }
    byId.set(id, {
      id,
      name: c.name,
      town: c.town,
      distanceMiles: c.distanceMiles,
      distanceOrigin: c.distanceOrigin,
      website: c.website ?? prev?.website ?? null,
      email: c.email ?? prev?.email ?? null,
      phone: c.phone,
      sources: ["slab"],
      legalAid: true,
      activeRecently: true,
      actsForPatients: "unknown",
      noWinNoFee: "unknown",
      enquiryUrl: null,
      score: 0,
      reasons: [],
      excluded: null,
    });
  }
  return [...byId.values()].sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999));
}

/** What the agents learned about a firm, in words, for the score breakdown. */
export type Evidence = Partial<Record<ScoreItem["key"], string>>;

/**
 * Score a firm against what the user needs (D39). One row per criterion, each with points, a maximum, a status
 * and the evidence, so the UI can show exactly why. `fit` = points / maximum for this route: how well the firm
 * fits, never a chance of winning. The weights are our judgement, not a standard.
 */
export function score(f: FirmFinding, route: Route, ev: Evidence = {}): FirmFinding {
  const la = route === "legal_aid";
  const checked = f.sources.includes("website");
  const tri = (b: boolean | null): ScoreItem["status"] => (b === null ? "unknown" : b ? "yes" : "no");
  const miles = f.distanceOrigin ? f.distanceMiles : null;
  const rows: ScoreItem[] = [
    { key: "legal_aid", label: "Takes legal aid for medical negligence", max: la ? 30 : 5, points: f.legalAid ? (la ? 30 : 5) : 0, status: tri(f.legalAid), evidence: ev.legal_aid ?? "Listed on SLAB's Find a Solicitor under Civil > Medical negligence" },
    { key: "active", label: "Did civil legal aid work in the last 12 months", max: 10, points: f.activeRecently ? 10 : 0, status: tri(f.activeRecently), evidence: "Still listed with SLAB's 'active solicitors only' filter on" },
    { key: "distance", label: "Close to you", max: miles === null ? 0 : 20, points: miles === null ? 0 : miles <= 3 ? 20 : miles <= 15 ? 10 : 0, status: miles === null ? "unknown" : miles <= 15 ? "yes" : "no", evidence: miles === null ? "Distance excluded: no confirmed patient search location" : `SLAB's finder: ${miles} miles from the approved patient postcode ${f.distanceOrigin}` },
    { key: "lawsoc", label: "On the Law Society register", max: 5, points: f.sources.includes("lawsoc") ? 5 : 0, status: f.sources.includes("lawsoc") ? "yes" : ev.lawsoc ? "no" : "unknown", evidence: ev.lawsoc ?? "Not looked up" },
    { key: "patients", label: "Acts for patients", max: 20, points: f.actsForPatients === "yes" ? 20 : 0, status: f.actsForPatients, evidence: ev.patients ?? "Website not checked" },
    { key: "nwnf", label: "Offers no win, no fee", max: la ? 10 : 30, points: f.noWinNoFee === "yes" ? (la ? 10 : 30) : 0, status: f.noWinNoFee, evidence: ev.nwnf ?? "Website not checked" },
    { key: "form", label: "Has an online enquiry form", max: 10, points: f.enquiryUrl ? 10 : 0, status: f.enquiryUrl ? "yes" : checked ? "no" : "unknown", evidence: ev.form ?? (f.enquiryUrl ? `Form at ${f.enquiryUrl}` : "Website not checked") },
    { key: "checked", label: "We could read their website", max: 15, points: checked ? 15 : 0, status: checked ? "yes" : f.website ? "unknown" : "no", evidence: ev.checked ?? (f.website ? "Not one of the firms we visited" : "No website on SLAB's list") },
  ];
  if (miles === null) rows.splice(rows.findIndex((row) => row.key === "distance"), 1);
  const points = rows.reduce((n, r) => n + r.points, 0);
  const max = rows.reduce((n, r) => n + r.max, 0);
  const reasons = rows.filter((r) => r.status === "yes" && r.points > 0).map((r) => (r.key === "distance" ? `Office ${miles! < 1 ? miles!.toFixed(1) : Math.round(miles!)} miles from ${f.distanceOrigin}` : r.label));
  return { ...f, distanceMiles: miles, score: points, fit: Math.round((points / max) * 100), breakdown: rows, reasons };
}

/* ------------------------------------------------------------------ 3. Law Society check */

export async function lawSocietyCheck(page: Page, firms: FirmFinding[], note: Note, track: Tracker) {
  await page.goto(LAWSOC, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("input[name=FirmName]", { timeout: 20000 });
  await dismissCookies(page, 3000);
  await note.log("open", "Opened the Law Society of Scotland's Find a Solicitor", { shot: true });
  const found = new Set<string>();
  for (const f of firms) {
    note(`Checking ${f.name.slice(0, 30)}`);
    const query = core(f.name).split(" ").slice(0, 3).join(" ");
    // The search box on a results page does not submit again, so every search starts from a fresh form.
    if (found.size + firms.indexOf(f) > 0) {
      await page.goto(LAWSOC, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector("input[name=FirmName]", { timeout: 20000 });
    }
    const box = page.locator("input[name=FirmName]:visible").first();
    await pointAt(page, box);
    await box.fill(query);
    track.bump("action");
    const form = box.locator("xpath=ancestor::form[1]");
    await form.locator("input[name=FirmPostcode]").fill("").catch(() => {});
    await note.log("type", `Searched the register for "${query}"`, { firms: [f.id] });
    const btn = form.locator("button[type=submit]").first();
    await pointAt(page, btn);
    // The search is a page load with the query in the URL: wait for *this* search, not the previous results.
    await Promise.all([
      page.waitForURL((u) => (u.searchParams.get("FirmName") ?? "").toLowerCase() === query, { timeout: 12000 }).catch(() => {}),
      btn.click(),
    ]);
    track.bump("action");
    await page.waitForSelector(".find-a-solicitor-list-item", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const names = await page.$$eval(".find-a-solicitor-list-item h2", (hs) => hs.map((h) => (h.textContent ?? "").trim()));
    const match = names.find((n) => sameFirm(n, f.name));
    if (match) found.add(f.id);
    if (match) await pointAt(page, page.locator(".find-a-solicitor-list-item h2", { hasText: match }).first());
    await note.log("check", match ? `On the Law Society register as "${match}"` : `Not found on the register under "${query}"`, { firms: [f.id], shot: true, detail: names.length ? `Results: ${[...new Set(names)].slice(0, 6).join("; ")}` : "No results" });
  }
  note(`${found.size} of ${firms.length} found on the Law Society register`);
  return found;
}

/* ------------------------------------------------------------------ 4. firm websites */

const tri = (a: DAnswer | undefined): Tri => (a && a.type === "choice" && a.confidence >= 0.6 ? (a.choice as Tri) : "unknown");
const conf = (a: DAnswer | undefined) => (a && a.type === "choice" ? a.confidence : undefined);
const registrable = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").split(".").slice(-3).join(".");
  } catch {
    return "";
  }
};
const said = (a: DAnswer | undefined) => (a && a.type === "choice" ? `${a.choice} (confidence ${a.confidence.toFixed(2)})` : "no answer");

export type Vetted = Partial<FirmFinding> & { evidence: Evidence };

export async function vetFirm(page: Page, firm: FirmFinding, note: Note, track: Tracker): Promise<Vetted> {
  if (!firm.website) throw new Error("No website listed");
  note("Opening their website");
  await page.goto(firm.website, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1500);
  await dismissCookies(page, 2500);
  const landed = page.url();
  const redirected = registrable(landed) !== registrable(firm.website) ? `Website sends you to ${new URL(landed).hostname.replace(/^www\./, "")}` : null;
  await note.log("open", redirected ? `Opened ${firm.website}; it redirected to ${landed}` : `Opened their website`, { shot: true });

  // Find their medical negligence page. If there are several candidates, the model picks.
  note("Looking for their medical negligence page");
  const links = await page.$$eval("a[href]", (as) =>
    as
      .map((a) => ({ text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80), href: (a as HTMLAnchorElement).href }))
      .filter((l) => /^https?:/.test(l.href) && /medical|clinical|negligence/i.test(l.text + " " + l.href)),
  );
  const uniqueLinks = [...new Map(links.map((l) => [l.href.split("#")[0], l])).values()].slice(0, 12);
  if (uniqueLinks.length === 0) await note.log("read", "No link about medical or clinical negligence on the home page; reading the home page instead");
  if (uniqueLinks.length > 0) {
    let target = uniqueLinks[0];
    if (uniqueLinks.length > 1) {
      const { answers } = await decide(`Firm: ${firm.name}. Links on its website:\n${uniqueLinks.map((l, i) => `${i}: ${l.text} (${l.href})`).join("\n")}`, [
        { type: "choice", name: "link", instructions: "Which link most likely leads to the firm's page about medical or clinical negligence claims for patients?", choices: uniqueLinks.map((l, i) => ({ value: String(i), description: l.text || l.href })) },
      ]);
      const a = answers[0];
      if (a?.type === "choice") target = uniqueLinks[Number(a.choice)] ?? target;
      await note.log("decide", `Chose the link "${target.text || target.href}" out of ${uniqueLinks.length}`, { confidence: conf(a), detail: uniqueLinks.map((l) => `${l === target ? "→ " : "  "}${l.text || "(no text)"}  ${l.href}`).join("\n") });
    }
    const loc = page.locator(`a[href="${new URL(target.href).pathname}"], a[href="${target.href}"]`).first();
    note(`Opening "${target.text.slice(0, 40) || "medical negligence"}"`);
    if (await loc.isVisible().catch(() => false)) {
      await pointAt(page, loc);
      await loc.click({ timeout: 5000 }).catch(() => page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 20000 }));
    } else await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 20000 });
    track.bump("action");
    await page.waitForTimeout(1500);
    await note.log("click", `Opened "${target.text || "their medical negligence page"}"`, { shot: true });
  }

  // Read the page and let the model answer three typed questions about it.
  note("Reading what they do");
  await page.mouse.wheel(0, 500).catch(() => {});
  const text = (await pageText(page)).replace(/\s+/g, " ").slice(0, 7000);
  await note.log("read", `Read ${text.length.toLocaleString()} characters of this page`, { detail: text.slice(0, 600) + (text.length > 600 ? "…" : "") });
  const yn = (value: string, description: string) => ({ value, description });
  const choices = [yn("yes", "The page clearly says so"), yn("no", "The page clearly says the opposite"), yn("unknown", "The page does not say")];
  const { answers } = await decide(`Firm: ${firm.name}\nPage: ${page.url()}\nPage text:\n${text}`, [
    { type: "choice", name: "patients", instructions: "Does this firm act for patients (claimants, pursuers) who were harmed by medical or clinical negligence?", choices },
    { type: "choice", name: "defends", instructions: "Does this firm mainly defend the NHS, health boards, doctors or insurers against medical negligence claims?", choices },
    { type: "choice", name: "nwnf", instructions: "Does the page say the firm offers no win, no fee (or a speculative fee / success fee agreement) for these claims?", choices },
  ]);
  const by = new Map(answers.map((a) => [a.name, a]));
  let actsForPatients = tri(by.get("patients"));
  if (tri(by.get("defends")) === "yes" && actsForPatients !== "yes") actsForPatients = "no";
  const noWinNoFee = tri(by.get("nwnf"));
  await note.log("decide", `Acts for patients: ${said(by.get("patients"))}`, { confidence: conf(by.get("patients")) });
  await note.log("decide", `Mainly defends the NHS or insurers: ${said(by.get("defends"))}`, { confidence: conf(by.get("defends")) });
  await note.log("decide", `Offers no win, no fee: ${said(by.get("nwnf"))}`, { confidence: conf(by.get("nwnf")) });
  const pageUrl = page.url();

  // Where would step 4 send the enquiry?
  note("Finding their enquiry form");
  const formSel = "form textarea:visible, form input[type=email]:visible";
  const hasForm = async () => (await page.locator(formSel).count().catch(() => 0)) > 0;
  let enquiryUrl: string | null = (await hasForm()) ? page.url() : null;
  if (!enquiryUrl) {
    const contact = page.locator("a[href]").filter({ hasText: /contact|enquir|get in touch|make an enquiry/i }).first();
    if (await contact.isVisible().catch(() => false)) {
      const label = ((await contact.textContent().catch(() => "")) ?? "").trim().slice(0, 40);
      await pointAt(page, contact);
      await contact.click({ timeout: 5000 }).catch(() => {});
      track.bump("action");
      await page.waitForTimeout(2000);
      await note.log("click", `Clicked "${label || "Contact"}" to look for a form`);
      if (await hasForm()) enquiryUrl = page.url();
    }
  }
  if (enquiryUrl) await pointAt(page, page.locator(formSel).first());
  await note.log("found", enquiryUrl ? "Found an enquiry form step 4 can fill in" : "No enquiry form found on the pages we opened", { shot: true });
  note(
    [actsForPatients === "yes" ? "Acts for patients" : actsForPatients === "no" ? "Defends claims" : "Unclear who they act for", noWinNoFee === "yes" ? "no win no fee" : null, enquiryUrl ? "form found" : "no form found"]
      .filter(Boolean)
      .join(" · "),
  );
  return {
    actsForPatients,
    noWinNoFee,
    enquiryUrl,
    excluded: actsForPatients === "no" ? "Their website says they defend medical negligence claims" : redirected,
    evidence: {
      patients: `The model read ${pageUrl}: acts for patients ${said(by.get("patients"))}; mainly defends ${said(by.get("defends"))}`,
      nwnf: `The model read ${pageUrl}: no win, no fee ${said(by.get("nwnf"))}`,
      form: enquiryUrl ? `Form found at ${enquiryUrl}` : "No form on the medical negligence or contact page",
      checked: redirected ?? `Opened ${firm.website} and ${pageUrl}`,
    },
  };
}

/* ------------------------------------------------------------------ the run */

export async function runStep3(funding: Funding, opts: { onEvent?: Emit } = {}): Promise<Step3Result> {
  const runId = `step3-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = path.join(process.cwd(), ".runs", runId);
  const log = makeLogger(runDir); // events.jsonl for debugging and demo evidence
  const emit: Emit = (e) => {
    if (e.type !== "stats") log({ type: "status", message: JSON.stringify(e).slice(0, 2000) });
    opts.onEvent?.(e);
  };
  const track = new Tracker(emit);
  const tracer = new Tracer(emit, runDir);
  const { browser, context, page } = await openSession();
  const ctx = { context, emit, track, tracer, first: page };
  const evidence = new Map<string, Evidence>();
  try {
    emit({ type: "status", message: "Starting the agents" });

    // Phase 1, in parallel: the calculator and SLAB's lawyer list.
    const calc = funding.skipped ? null : agent(ctx, "SLAB calculator", (p, note) => runCalculator(p, funding, note, track), 120_000);
    const finder = agent(ctx, "SLAB lawyer list", (p, note) => runFinder(p, note, track), 120_000);

    const finderRes = await finder;
    const cards: SlabCard[] = finderRes.ok ? finderRes.value : [];
    let firms = mergeCards(cards);
    emit({ type: "status", message: `SLAB lists ${firms.length} firms for medical negligence legal aid` });

    // Phase 2, in parallel: Law Society check and the nearest firms' own websites.
    const toVet = firms.filter((f) => f.website).slice(0, FIRMS_TO_VET);
    const lawsoc = toVet.length ? agent(ctx, "Law Society register", (p, note) => lawSocietyCheck(p, toVet, note, track), 120_000) : null;
    const vets = toVet.map((f) =>
      agent(ctx, f.name.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, "").slice(0, 28), (p, note) => vetFirm(p, f, note, track), FIRM_TIMEOUT_MS, [f.id]).then((r) => {
        const i = firms.findIndex((x) => x.id === f.id);
        if (r.ok) {
          const { evidence: ev, ...found } = r.value;
          evidence.set(f.id, { ...evidence.get(f.id), ...ev });
          firms[i] = { ...firms[i], ...found, sources: [...firms[i].sources, "website"] };
        } else evidence.set(f.id, { ...evidence.get(f.id), checked: `Tried ${f.website}: ${r.error}` });
        emit({ type: "firm", firm: firms[i] });
      }),
    );

    const calcRes = calc ? await calc : null;
    const verdict: Verdict = funding.skipped ? "skipped" : calcRes?.ok ? calcRes.value.verdict : "unknown";
    const quote = calcRes?.ok ? calcRes.value.quote : "";
    // Unknown stays on legal aid: every firm on SLAB's list takes it, and a solicitor can check eligibility properly.
    const route: Route = verdict === "unlikely" || verdict === "skipped" ? "no_win_no_fee" : "legal_aid";

    await Promise.all(vets);
    const onRegister = lawsoc ? await lawsoc : null;
    if (onRegister?.ok) {
      firms = firms.map((f) => (onRegister.value.has(f.id) ? { ...f, sources: [...new Set([...f.sources, "lawsoc" as const])] } : f));
      for (const f of toVet) evidence.set(f.id, { ...evidence.get(f.id), lawsoc: onRegister.value.has(f.id) ? "Found by name on the Law Society of Scotland's Find a Solicitor" : "Searched the Law Society register by name; no matching firm" });
    }

    firms = firms.map((f) => score(f, route, evidence.get(f.id))).sort((a, b) => b.score - a.score);
    const shortlist = firms.filter((f) => !f.excluded && f.sources.includes("website")).slice(0, 3).map((f) => f.id);
    tracer.add({ agent: "Shortlist", color: "#181818", kind: "result", text: `Scored ${firms.length} firms; shortlisted ${shortlist.length}`, firms: shortlist, detail: firms.slice(0, 8).map((f) => `${shortlist.includes(f.id) ? "★" : " "} ${f.fit}% ${f.name}`).join("\n") });
    const result: Step3Result = { verdict, route, calculatorText: quote, firms, shortlist, stats: track.stats, runDir, runId, trace: tracer.steps };
    emit({ type: "result", result });
    return result; // the crawl is over, so the browser closes now (D55)
  } finally {
    await browser.close().catch(() => {});
  }
}
