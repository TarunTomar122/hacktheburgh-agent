import { z } from "zod";
import type { Page } from "playwright";
import type { CaseFacts } from "./facts";
import { pageText } from "./legalAid";
import { searchBudgetUsed, searchViaApi, webSearch, type Emit } from "./planner";
import { detectPlace } from "./place";
import { ASK_TOOL, FINISH_TOOL, PLAN_TOOL, runCrew, short, tool, type CrewKit, type WorkersSpec, tabName } from "./crewRun";
import { MODELS, structured } from "./llm";
import { parseSpeed, speedLabel, type Speed } from "./discoverySpeed";
import { confidenceOf, evidenceOf, ROUTE_KINDS, type Place, type RouteKind, type RouteMap, type RouteStep, type Source } from "./routeTypes";
import { checkClaimNumbers, formatQuantity, isEnactedUrl, parseQuantities, scrubUnbacked, type EvidenceQuote } from "./evidence-claims";
import { CREW, type CrewId, type DiscoveryResult, type Thought } from "./plannerTypes";
import { normText, normUrl, quoteInText, readPage, type PageReading } from "./workers/explore";
import type { WorkerCtx } from "./workers/types";

/**
 * Discovery (night plan, "Elliot anywhere"): the crew works out, live, how the health and legal system works for this
 * patient's place, and finds the real pages. Nothing about any country or site is in this file: the place
 * comes from the patient's words, the sites from live search and exploration, and every fact from a quote that code
 * finds in the page it came from.
 */

const WHO = { who: { type: "string", enum: ["robin", "iona", "nell"], description: "Which crew member does this: Robin (rules, bodies, lawyers, free help and records), Iona (clinical guidance), Nell (funding)." } };

const TOOLS = [
  PLAN_TOOL,
  tool("web_search", "Search the web (a search API, with a browser search as backup) to find candidate pages; then open them to read and quote. Use it to find the official pages; prefer government, health service, ombudsman, regulator, court and law society sites.", { query: { type: "string" }, ...WHO }, ["query", "who"]),
  tool("read_page", "Open a page and answer a question from it, with short verbatim quotes and links worth following.", { url: { type: "string" }, question: { type: "string" }, ...WHO }, ["url", "question", "who"]),
  tool("record_step", "Record one part of the route once you have read it on real pages. Quotes must be copied word for word from pages you opened in this run; code checks them.", {
    kind: { type: "string", enum: ROUTE_KINDS.map((k) => k.kind) },
    body: { type: "string", description: "Who: ONLY the organisation's name as it calls itself, under 8 words (a board, ombudsman, register or scheme name). Never a sentence; the sentence goes in \"what\"." },
    what: { type: "string", description: "One or two plain sentences for the patient" },
    points: { type: "array", items: { type: "string" }, description: "Up to 6 key facts, each short and backed by one of the quotes: time limits, stages and response times, caps or thresholds, conditions, costs, what is free" },
    deadline: { type: "string", description: "The time limit, in the source's words, if there is one" },
    how: { type: "string", enum: ["online_form", "email", "post", "phone", "login_required", "court", "unknown"] },
    url: { type: "string", description: "The official page found" },
    wall: { type: "string", description: "Anything that stops an agent: login, CAPTCHA, phone or post only" },
    requires: { type: "array", items: { type: "string" }, description: "What must happen first, in the source's terms (e.g. the provider's final response)" },
    applies_if: { type: "string", description: "When this route applies at all (e.g. public care only; a value limit)" },
    alternatives: { type: "array", items: { type: "string" }, description: "Other routes for the same need" },
    missing: { type: "array", items: { type: "string" }, description: "Facts we would still need from the patient to use it" },
    sources: { type: "array", description: "1-6 verbatim quotes that back the body, the points and the deadline", items: { type: "object", properties: { url: { type: "string" }, quote: { type: "string" }, official: { type: "boolean" }, publisher: { type: "string" } }, required: ["url", "quote", "official", "publisher"] } },
  }, ["kind", "body", "what", "how", "sources"]),
  ASK_TOOL,
  FINISH_TOOL,
];

const SYSTEM = (place: Place) => `You lead a crew that works out, live in a browser, how the health and legal system works for one patient, and finds the real official pages they will need. You have no list of websites: find everything by searching and exploring, and trust only what you read on official pages in this run. You can only open pages this run found: a search result, or a link or path on a page already opened.
The patient's place: ${[place.hospital, place.city, place.region, place.country].filter(Boolean).join(", ")} (${place.careSetting} care). The rules of THAT place apply (countries with several systems, like the UK nations, Australian or US states, differ).
Your crew: Robin (complaints, ombudsman or regulator, compensation route, lawyers, free help, records), Iona (the clinical guidance doctors follow there), Nell (how a claim can be paid for). Do NOT look for online forms in this phase (a later step finds and fills them): for how to complain or apply, record the official page that explains it. Never ask the patient to sign in. Never fill anything here.
Find, for this place: ${ROUTE_KINDS.map((k) => `${k.kind}: ${k.question}`).join(" | ")}.
How to work:
- Start with update_plan. Give different crew members jobs in the SAME turn so they work at the same time (one tool call each); one member's calls run in order.
- First find who runs the hospital (it may be a board, trust, district, state agency or company) and PROVE it with a source on the hospital's or provider's own site; check whether the care was public or private, because the routes differ. Then its complaint process, then the independent body above it.
- Discover how the routes depend on each other, not just a list: what must happen first (requires), when a route applies at all (applies_if), what the alternatives are, and what facts we would still need from the patient (missing). Systems differ: some have no-fault schemes, redress schemes or conciliation bodies instead of court. Do not assume the shape of any other country.
- Deadlines and stages: take them from the national rules (the regulations or the health service's own national guidance) AND the provider's current page. A page of a different organisation (even a related one) does not set this provider's deadline. If the provider's page and the national rules differ, say so.
- Laws change: for any statute or regulation use the current, amended (consolidated or revised) text, never the as-enacted original; if a page is the original, find the revised version before recording a period.
- Sources can be out of date (schemes get renamed, limits change). When two sources disagree, prefer the body's own current page over third parties and the newer over the older; record the conflict in "what" ("X's page still says ...").
- When what you read contradicts your plan or your memory, say so with update_plan (drop or replace the step) and follow what the official page says.
- For complaint and escalation, record the official page that explains how to complain or apply. Do not hunt for the form itself.
- For lawyers, find the official register or directory the profession runs, and how to search it (by area of law and place). For funding, find any official online eligibility checker.
- Breadth first, then depth: record_step each part as soon as one official page backs it (you can record it again later with more), so all 8 parts are on the map even if time runs out. Then go deep.
- Go deep: a part is only done when you have its key facts from the body's own pages (time limits, stages and response times, caps or thresholds, conditions, costs, what is free), not just a home page. Read the second-level pages (eligibility, "how we handle", guidance documents). Do not stop at a finder page: for funding, find out whether the help actually covers this kind of claim for an adult.
- record_step as soon as a part is clear, with 1-3 verbatim quotes from pages you opened (code checks them; unchecked quotes count for nothing). Mark a source official only if it is the body itself or a government, health service, ombudsman, regulator, court or professional body site.
- Recover when a page fails: try the site's search, another page, or another official source. Say "not found" honestly rather than guess.
- Budget: about 55 tool calls in total; spend most on reading the right second-level pages. Then finish with two or three sentences for the patient on how it works where they live.
Never ask the patient to do browsing or searching for you: the crew does the web work, or reports honestly what it could not reach. Never submit, sign up or log in. Never type the patient's personal details anywhere.`;

const ASSIGN_TOOL = tool("assign_jobs", "Hand each crew member their job; they all work at the same time, each on their own, and report back when done. Give each one a clear brief: which parts of the route (kinds) to find, and what to start from.", {
  jobs: { type: "array", items: { type: "object", properties: { who: { type: "string", enum: ["robin", "iona", "nell"] }, brief: { type: "string", description: "What this member finds, as concrete as you can: the route parts (kinds) and the questions." } }, required: ["who", "brief"] } },
}, ["jobs"]);
const MEMBER_DONE = tool("member_done", "Call when your job is done (or you have found all you can).", { summary: { type: "string", description: "One short sentence: what you found and what you could not." } }, ["summary"]);
const withoutWho = (t: (typeof TOOLS)[number]) => {
  const params = t.parameters as { properties: Record<string, unknown>; required: string[] };
  const { who: _who, ...props } = params.properties;
  return { ...t, parameters: { ...params, properties: props, required: params.required.filter((r) => r !== "who") } };
};
const WORK_TOOLS = ["web_search", "read_page", "record_step"];

const Takeaways = z.object({
  items: z.array(z.object({ kind: z.enum(ROUTE_KINDS.map((k) => k.kind) as [RouteKind, ...RouteKind[]]), headline: z.string(), why: z.string(), inferred: z.boolean() })),
});

const AutoStep = z.object({
  record: z.boolean(),
  kind: z.enum(ROUTE_KINDS.map((k) => k.kind) as [RouteKind, ...RouteKind[]]),
  body: z.string(),
  what: z.string(),
  points: z.array(z.string()),
  deadline: z.string(),
  how: z.enum(["online_form", "email", "post", "phone", "login_required", "court", "unknown"]),
  official: z.boolean(),
  publisher: z.string(),
  quotes: z.array(z.number()),
});

const SEARCH_NOTE = `Searches are scarce: this run has about 12 in total, shared by the crew, and ONE query returns about 10 pages. Aim each query at one part of the route and read the results (and the links on the pages) instead of searching again; never reword the same question. When the limit is reached, read pages you already found and follow their links.`;
const BATCH_NOTE = `Speed: call every independent tool in the same turn (many searches, many reads, several record_steps at once); 6 to 12 calls per turn. Do not wait to see one result before starting work that does not depend on it. Aim to finish in about 6 turns.`;

/** One generic search per part of the route, built from the place only: it names no site, scheme or country-specific body. */
const PART_QUERY: Record<RouteKind, (p: Place) => string> = {
  complaint: (p) => `how to make a complaint about hospital care ${p.hospital ?? ""} ${p.city ?? ""} ${p.region ?? ""} ${p.country ?? ""}`,
  escalation: (p) => `independent review or ombudsman if a hospital complaint is not resolved ${p.region ?? ""} ${p.country ?? ""}`,
  compensation: (p) => `how to claim compensation for medical negligence harm from hospital care ${p.region ?? ""} ${p.country ?? ""}`,
  funding: (p) => `legal aid or funding for a clinical negligence claim ${p.region ?? ""} ${p.country ?? ""}`,
  lawyers: (p) => `official register to find a medical negligence solicitor or lawyer ${p.region ?? ""} ${p.country ?? ""}`,
  guideline: (p) => `national body that publishes clinical guidelines for doctors ${p.region ?? ""} ${p.country ?? ""}`,
  advice: (p) => `free independent patient advocacy or advice service for complaints about care ${p.region ?? ""} ${p.country ?? ""}`,
  records: (p) => `how to request a copy of your medical records from a hospital ${p.hospital ?? ""} ${p.region ?? ""} ${p.country ?? ""}`,
};

const WORKER_SYSTEM = (place: Place, id: CrewId, brief: string) => `You are ${CREW[id].name}, one member of a crew that works out, live, how the health and legal system works for one patient, and finds the real official pages. The lead gave you this job: ${brief}
The patient's place: ${[place.hospital, place.city, place.region, place.country].filter(Boolean).join(", ")} (${place.careSetting} care). The rules of THAT place apply.
Parts of the route (kinds): ${ROUTE_KINDS.map((k) => `${k.kind}: ${k.question}`).join(" | ")}.
Your brief gives the search results already found for your part. Turn 1: read the 3 or 4 most promising official pages AT THE SAME TIME (several read_page calls in one turn). Turn 2: follow their links to the page that holds the facts (time limits, stages, who it applies to, how to apply) and record_step. Searches are scarce (a shared budget): search at most once, and only if the results hold no official page. Work fast: many calls per turn. You can only open pages this run found (search results, or links on pages you opened). Search, read the official pages, and record_step each part as soon as an official page backs it, with 1-3 verbatim quotes copied from pages you opened (code checks them; unchecked quotes count for nothing). Mark a source official only for the body itself or a government, health service, ombudsman, regulator, court or professional body. Use current consolidated law, never the as-enacted text. Time limits come from the national rules AND the provider's page. Do not look for online forms; record the official page that explains how to complain or apply. Never ask the patient anything, never sign in, never fill anything. Say "not found" honestly. When you have all you can in a few turns, call member_done.`;

export async function runDiscovery(facts: CaseFacts, opts: { onEvent?: Emit; runId?: string; speed?: string | Speed; /** Follow-up: research one part more deeply, keeping the rest of `base`. */ focus?: RouteKind; base?: RouteMap } = {}): Promise<DiscoveryResult> {
  const speed: Speed = { ...(typeof opts.speed === "object" ? opts.speed : parseSpeed(opts.speed ?? process.env.DISCOVERY_SPEED ?? "fast")), ...(opts.focus ? { workers: true } : {}) }; // fast unless told otherwise
  const detected = await detectPlace(facts);
  // The country and region the patient confirmed in onboarding win over the model's reading.
  const f = facts as CaseFacts & { country?: string | null; region?: string | null };
  const place: Place = { ...detected, country: f.country || detected.country, region: f.region ?? detected.region, why: f.country ? `Confirmed by you: ${[f.region, f.country].filter(Boolean).join(", ")}` : detected.why };
  opts.onEvent?.({ type: "place", place });
  opts.onEvent?.({ type: "speed", speed: speedLabel(speed) } as never);
  const steps = new Map<RouteKind, RouteStep>();
  if (opts.base) for (const s of opts.base.steps) steps.set(s.kind, s); // a follow-up starts from what is already found
  const texts = new Map<string, string>(); // url -> page text, for checking quotes
  const keyOf = (u: string) => normUrl(u);
  const remember = (url: string, text: string) => texts.set(keyOf(url), normText(text));
  /** A quote counts only if code finds it in the exact page (by URL) this run opened. */
  const workerChecked = new Map<string, string[]>(); // url -> quotes the reader itself checked against the text it read (PDFs too)
  const check = (url: string, quote: string) => {
    if (quote.trim().length < 12) return false;
    const page = texts.get(keyOf(url));
    if (page && quoteInText(quote, page)) return true;
    const q = normText(quote);
    // Only a quote that is (part of) what the reader itself checked: never a longer text that merely contains it.
    return (workerChecked.get(keyOf(url)) ?? []).some((w) => q.length >= 12 && normText(w).includes(q));
  };
  /** Provenance: the crew may only open pages this run found (search results, links on opened pages, explore paths), or other pages on those sites. */
  const known = new Set<string>();
  const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const learn = (u: string) => { const h = hostOf(u); if (h) known.add(h); };
  const allowed = (u: string) => known.has(hostOf(u));
  const opened = new Set<string>(); // hosts whose pages were really opened (for "official")
  const visited = new Set<string>(); // exact pages opened in this run (normalised URLs)
  const signedIn = new Set<string>(); // pages the patient signed in on, so the crew could carry on
  const titles = new Map<string, string>(); // url -> normalised page title + first heading (for officialness)
  const rememberTitle = async (p: Page) => {
    const t = await p.evaluate(() => `${document.title} ${document.querySelector("h1")?.textContent ?? ""}`).catch(() => "");
    titles.set(keyOf(p.url()), normText(t));
  };
  const fullText = (p: Page) => p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  let route: RouteMap = { runId: "", place, system: "", summary: "", steps: [], foundAt: "" };
  const publish = (kit: CrewKit) => {
    route = { ...route, runId: kit.runId, steps: ROUTE_KINDS.map((k) => steps.get(k.kind)).filter((x): x is RouteStep => !!x) };
    kit.emit({ type: "route", route });
  };
  const ctxFor = (kit: CrewKit, p: Page, note: WorkerCtx["note"], who: CrewId): WorkerCtx => ({ page: p, note, track: kit.track, ask: (spec) => kit.ask({ ...spec, crew: who }) });
  const whoOf = (a: Record<string, unknown>): CrewId => (["robin", "iona", "nell"].includes(String(a.who)) ? (a.who as CrewId) : "robin");
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

  let partHits = new Map<RouteKind, { title: string; url: string; snippet: string }[]>(); // search results per part (speed lever "workers")
  const readings = new Map<string, PageReading>(); // url -> what the reader found (for autorecord)
  const autoDone = new Set<string>();
  const labelOf = (k: string) => ROUTE_KINDS.find((x) => x.kind === k)?.label ?? k;

  /** Speed lever "autorecord": the small model drafts the route step from the checked quotes of the page just read; code checks it as always. */
  const autoRecord = async (a: Record<string, unknown>, out: string, who: CrewId, kit: CrewKit): Promise<string> => {
    try {
      const v = readings.get(keyOf(String(a.url ?? "")));
      if (!v || v.wall || autoDone.has(keyOf(v.url))) return out;
      const quotes = v.quotes.filter((q) => q.checked).map((q) => q.quote);
      if (!quotes.length) return out;
      autoDone.add(keyOf(v.url));
      const draft = await structured({
        model: MODELS.browser,
        effort: "low",
        name: "auto_record",
        instructions: `You write one part of a patient's route through the health and legal system from ONE page that was just read. Parts: ${ROUTE_KINDS.map((k) => `${k.kind} (${k.question})`).join(" | ")}. Set record=false unless this page, by itself, clearly gives the real information for one part from the body that owns it (not a news item, not a different organisation's page). Use only the numbered quotes: "points" are short facts (time limits, stages, caps, costs) each carried by a quote; "deadline" is the time limit in the page's words or empty; "quotes" are the indexes of the quotes that back the body, points and deadline. "official" is true only for the body itself or a government, health service, ombudsman, regulator, court or professional body. Never invent a number. "how": online_form only if the page is the form itself.`,
        input: `Place: ${[place.hospital, place.city, place.region, place.country].filter(Boolean).join(", ")}\nPage: ${v.title} (${v.url})\nWhat the reader said: ${v.answer}\nQuotes:\n${quotes.map((q, i) => `${i}. ${q}`).join("\n")}`,
        schema: AutoStep,
      });
      if (!draft.record || !draft.body.trim()) return out;
      const prev = steps.get(draft.kind);
      if (prev && prev.confidence !== "unconfirmed" && (prev.points?.length ?? 0) >= draft.points.length) return out;
      const picked = draft.quotes.filter((i) => i >= 0 && i < quotes.length);
      const bodyName = draft.body.length > 70 || /[.;]\s/.test(draft.body) ? draft.publisher || host(v.url) : draft.body;
      recordStep({ kind: draft.kind, body: bodyName, what: draft.what, points: draft.points, deadline: draft.deadline || undefined, how: draft.how, url: v.url, sources: (picked.length ? picked : quotes.map((_, i) => i)).slice(0, 4).map((i) => ({ url: v.url, quote: quotes[i], official: draft.official, publisher: draft.publisher || host(v.url) })) }, kit);
      const now = steps.get(draft.kind);
      if (now) kit.finding(`${labelOf(draft.kind)}: ${now.body}`, v.url, who);
      return `${out}\nAuto-recorded ${draft.kind} (${now?.confidence ?? "unconfirmed"}) from this page. Record it yourself only if you have more to add.`;
    } catch {
      return out; // the planner can still record it
    }
  };
  /** Speed lever "selfrecover": a page that cannot be read is replaced by the best other page a search finds, without a planner turn. */
  const recoverRead = async (a: Record<string, unknown>, out: string, who: CrewId, thought: Thought, kit: CrewKit): Promise<string> => {
    if (!/^Could not read/.test(out)) return speed.autorecord ? autoRecord(a, out, who, kit) : out;
    const url = String(a.url ?? "");
    const hits = await searchOne({ query: `${host(url)} ${String(a.question ?? "")}`.slice(0, 160) }, who, thought, kit);
    const alt = /^Search limit/.test(hits) ? undefined : [...hits.matchAll(/^\d+\. .*? — (\S+)/gm)].map((m) => m[1]).find((u) => keyOf(u) !== keyOf(url) && !visited.has(keyOf(u)) && !isEnactedUrl(u));
    if (!alt) return out;
    const out2 = await readOne({ ...a, url: alt }, who, thought, kit);
    return `${out}\nTried another page instead: ${alt}\n${speed.autorecord ? await autoRecord({ ...a, url: alt }, out2, who, kit) : out2}`;
  };
  /** Read one page for the crew; returns what the planner sees. */
  const readOne = async (a: Record<string, unknown>, who: CrewId, thought: Thought, kit: CrewKit): Promise<string> => {
    const url = String(a.url ?? "");
    if (!allowed(url)) return `Blocked: ${url} was not found in this run. Search for it, or follow a link from a page you opened.`;
    const r = await kit.inTab(thought, who, tabName(host(url)), async (p, note) => {
      const v = await readPage(ctxFor(kit, p, note, who), url, String(a.question ?? ""));
      if (!p.isClosed()) {
        // The DOM text belongs to the page the browser shows; a PDF's text is checked by the reader itself (workerChecked).
        if (!/\.pdf(\?|#|$)/i.test(v.url) && keyOf(v.url) === keyOf(p.url())) {
          remember(p.url(), [await pageText(p), await fullText(p)].join("\n"));
          await rememberTitle(p);
        } else if (v.via === "fetch" && v.text) {
          // Read directly (no browser): its own text and title are the evidence for this page.
          remember(v.url, v.text);
          titles.set(keyOf(v.url), normText(v.title));
        }
        if (!v.wall) opened.add(hostOf(v.url));
      }
      return v;
    }, 90_000);
    if (!r.ok) return `Could not read ${url}: ${r.error}`;
    const v = r.value;
    learn(v.url);
    visited.add(keyOf(v.url));
    visited.add(keyOf(url));
    readings.set(keyOf(url), v);
    readings.set(keyOf(v.url), v);
    v.links.forEach((l) => learn(l.url));
    for (const u of [url, v.url]) workerChecked.set(keyOf(u), [...(workerChecked.get(keyOf(u)) ?? []), ...v.quotes.filter((q) => q.checked).map((q) => q.quote)]);
    if (v.wall) return `Blocked: ${v.wall.kind} at ${v.wall.url} (${v.wall.detail})`;
    return `${v.title} (${v.url})\n${v.answer}\nQuotes: ${v.quotes.filter((q) => q.checked).map((q) => `"${q.quote}"`).join(" | ") || "none checked"}\nLinks: ${v.links.map((l) => `${l.text} -> ${l.url}`).join("; ")}`;
  };

  const searchOne = async (a: Record<string, unknown>, who: CrewId, thought: Thought, kit: CrewKit): Promise<string> => {
    const r = await kit.inTab(thought, who, "Search", (p, note) => webSearch(p, String(a.query ?? ""), note, kit.track), 150_000);
    if (!r.ok) return `Could not search: ${r.error}`;
    r.value.forEach((x) => learn(x.url));
    return r.value.map((x, i) => `${i + 1}. ${x.title} — ${x.url}\n   ${x.snippet}`).join("\n") || (searchBudgetUsed(kit.track) ? "Search limit reached for this run: do not search again. Read pages you already found, follow their links." : "No results.");
  };

  /** At the end: the small model says, for each part with checked quotes, what it means for the patient and why; code vets every number in it. */
  const explain = async (kit: CrewKit) => {
    const have = [...steps.values()].filter((s) => s.confidence !== "unconfirmed" && s.sources.some((x) => x.checked));
    if (!have.length) return;
    try {
      const out = await structured({
        model: MODELS.browser,
        effort: "low",
        name: "route_takeaways",
        instructions: `You tell a patient what each part of their route means for them, in plain words, from the checked quotes only. For each part: "headline" is at most 14 words, in the second person, saying what it means for them (e.g. "Complain to the health board first, within 12 months"); "why" is at most 30 words: the reason, taken from the quotes. Use a number only if it is in a quote. Set "inferred" true if the headline is a conclusion drawn from what a page lists or leaves out (for example "this is probably not covered" because the page lists only other cases), and false if a quote states it outright. Say what the sources say, no more. No jargon, no advice beyond the quotes.`,
        input: have.map((s) => `PART ${s.kind} (${labelOf(s.kind)}), body: ${s.body}
Summary: ${s.what}
Quotes:\n${s.sources.filter((x) => x.checked).map((x) => `- ${x.quote} (${hostOf(x.url)})`).join("\n")}`).join("\n\n"),
        schema: Takeaways,
      });
      for (const it of out.items) {
        const s = steps.get(it.kind);
        if (!s || !s.sources.some((x) => x.checked) || !it.headline.trim()) continue;
        const evQ: EvidenceQuote[] = s.sources.map((x) => ({ quote: x.quote, checked: x.checked, official: x.official && !isEnactedUrl(x.url) }));
        const vet = (t: string) => scrubUnbacked(t, checkClaimNumbers(t, evQ));
        s.takeaway = { headline: vet(it.headline.trim()), why: vet(it.why.trim()), inferred: !!it.inferred };
      }
      publish(kit);
    } catch {
      /* the cards fall back to their own sentences */
    }
  };
  /** Record one route step (the code checks every quote, number, officialness and form claim). */
  const recordStep = (aIn: Record<string, unknown>, kit: CrewKit): string => {
    let a = aIn;
    const kind = String(a.kind) as RouteKind;
    if (!ROUTE_KINDS.some((k) => k.kind === kind)) return `Error: unknown kind ${kind}`;
    if (String(a.body ?? "").length > 70 || /[.;]\s/.test(String(a.body ?? ""))) {
      // A sentence where the organisation's name belongs: keep the sentence as "what" and name the body after the source's
      // publisher or site, instead of sending the planner round again (it used to retry up to six times).
      const srcs = (a.sources as { url?: string; publisher?: string }[] | undefined) ?? [];
      const pub = srcs.find((x) => x.publisher && x.publisher.length <= 60 && !/[.;]\s/.test(x.publisher))?.publisher;
      let site = "";
      try {
        site = new URL(String(a.url ?? srcs[0]?.url ?? "")).hostname.replace(/^www\./, "");
      } catch {}
      if (!pub && !site) return "Error: body must be only the organisation's name (under 8 words), not a sentence. Put the sentence in \"what\" and record_step again.";
      a = { ...a, what: a.what ? `${String(a.what)} ${String(a.body)}` : a.body, body: pub ?? site };
    }
    // "official" needs both: the model's judgement of the publisher, and a page on that host really opened in this run.
    // "official" needs three things: the model's judgement, a page on that host really opened in this run, and (code) that page
    // naming its publisher or the body itself. Unknown text (e.g. a PDF) keeps the model's judgement only with the host check.
    const bodyName = normText(String(a.body ?? ""));
    // Compound names ("Healthcare Improvement Scotland / SIGN", "NIPSO (Ombudsman)"): any part names the body.
    const bodyParts = String(a.body ?? "").split(/\s*(?:\/|\(|\)|,|\band\b|&)\s*/).map(normText).filter((x) => x.length > 3);
    const namesBody = (t: string) => (bodyName.length > 3 && t.includes(bodyName)) || bodyParts.some((x) => t.includes(x));
    const names = (s: Source) => {
      // The page is the body's (or the publisher's) own: its title or its site address names it, not just its text.
      const title = titles.get(keyOf(String(s.url))) ?? "";
      const hostWords = normText(hostOf(String(s.url)).replace(/\./g, " "));
      const pub = normText(String(s.publisher ?? ""));
      const parts = [...bodyParts, ...(pub.length > 3 ? [pub] : [])];
      const acronym = (x: string) => x.split(" ").filter((w) => w.length > 2).map((w) => w[0]).join("");
      return parts.some((x) => title.includes(x) || hostWords.split(" ").some((h) => h.length > 3 && (x.replace(/ /g, "").includes(h) || acronym(x) === h)));
    };
    const withScheme = (u: string) => (/^[a-z][a-z0-9+.-]*:/i.test(u.trim()) ? u.trim() : `https://${u.trim().replace(/^\/+/, "")}`); // the model sometimes writes www.site.org/page: a browser cannot open that
    const sources: Source[] = ((a.sources as Source[]) ?? []).slice(0, 6).map((s) => ({ url: withScheme(String(s.url)), quote: String(s.quote), official: !!s.official && opened.has(hostOf(String(s.url))) && names(s) && !isEnactedUrl(String(s.url)), publisher: String(s.publisher ?? host(String(s.url))), checked: check(String(s.url), String(s.quote)) }));
    // A claim with numbers (a time limit, a cap, a percentage) only stands if EVERY number (with its currency or unit)
    // is in a checked quote from an OFFICIAL source, ideally one quote (evidence-claims.ts). Unofficial quotes, and law as
    // originally enacted (already not "official" above), back nothing: "£500" does not back "$500" or "€500".
    const evQuotes: EvidenceQuote[] = sources.map((x) => ({ quote: x.quote, checked: x.checked, official: x.official && !isEnactedUrl(x.url) }));
    const claimSupport = new Map<string, number[]>();
    const backed = (claim?: string, opts: { requireSingle?: boolean } = {}) => {
      if (!claim) return true;
      const c = checkClaimNumbers(claim, evQuotes, opts);
      if (c.ok) claimSupport.set(claim, c.support);
      return c.ok;
    };
    /** The claim with only its unbacked numbers replaced by "[see source]". */
    const scrubbed = (claim: string) => scrubUnbacked(claim, checkClaimNumbers(claim, evQuotes));
    /** Corroboration in code: the deadline's period appears in checked official quotes on two different sites; or the quotes give different periods. */
    const deadlineCheckOf = (d: string | undefined, srcs: Source[]): Pick<RouteStep, "deadlineCheck" | "deadlineOthers"> => {
      if (!d) return {};
      const dq = parseQuantities(d).find((x) => x.kind === "duration");
      if (!dq) return {};
      const periods = new Map<string, Set<string>>(); // period as written ("12 months", "6-12 months") -> hosts
      for (const x of srcs.filter((y) => y.checked && y.official))
        for (const q of parseQuantities(x.quote))
          if (q.kind === "duration" && q.unit === dq.unit) periods.set(formatQuantity(q), new Set([...(periods.get(formatQuantity(q)) ?? []), hostOf(x.url)]));
      const mine = formatQuantity(dq);
      const others = [...periods.keys()].filter((k) => k !== mine);
      if (others.length) return { deadlineCheck: "sources_differ", deadlineOthers: others };
      return { deadlineCheck: (periods.get(mine)?.size ?? 0) >= 2 ? "two_sites" : "one_site" };
    };
    const deadlineOk = !!a.deadline && backed(String(a.deadline), { requireSingle: true });
    const whatOk = backed(String(a.what ?? ""));
    const keptPoints = Array.isArray(a.points) ? (a.points as string[]).map(String).filter((pt) => backed(pt, { requireSingle: true })).slice(0, 6) : undefined;
    const step: RouteStep = {
      kind,
      body: String(a.body ?? ""),
      // The card's sentence too: if its numbers are not in a checked quote, keep it but without them (say "see the source").
      what: whatOk ? String(a.what ?? "") : scrubbed(String(a.what ?? "")),
      deadline: deadlineOk ? String(a.deadline) : undefined,
      ...deadlineCheckOf(deadlineOk ? String(a.deadline) : undefined, sources),
      // "online form" only where the crew really reached a form; a URL only if this run opened that page (code checks).
      how: ((h) => (h === "online_form" ? "unknown" : h))((String(a.how ?? "unknown") as RouteStep["how"]) || "unknown"), // forms are found later, when the case is filed
      url: a.url && visited.has(keyOf(String(a.url))) ? String(a.url) : undefined,
      wall: a.wall ? String(a.wall) : undefined,
      handedOff: a.url && signedIn.has(keyOf(String(a.url))) ? true : undefined,
      points: keptPoints,
      requires: Array.isArray(a.requires) ? (a.requires as string[]).map(String) : undefined,
      appliesIf: a.applies_if ? String(a.applies_if) : undefined,
      alternatives: Array.isArray(a.alternatives) ? (a.alternatives as string[]).map(String) : undefined,
      missing: Array.isArray(a.missing) ? (a.missing as string[]).map(String) : undefined,
      sources,
      // The headline (who) must be backed too: the body's name appears in a checked quote or on a page whose quote checked.
      confidence: sources.some((x) => x.checked && (namesBody(normText(x.quote)) || namesBody(texts.get(keyOf(x.url)) ?? ""))) ? confidenceOf(sources) : "unconfirmed",
      by: ROUTE_KINDS.find((k) => k.kind === kind)!.crew,
    };
    step.evidence = {
      ...evidenceOf(step),
      claims: { deadline: deadlineOk ? claimSupport.get(String(a.deadline)) : undefined, what: whatOk ? claimSupport.get(String(a.what ?? "")) : undefined, points: keptPoints?.map((pt) => claimSupport.get(pt)) },
    };
    // A new record replaces the old one only if it is at least as well backed (a deeper look must never make a part worse).
    const rank = (c: RouteStep["confidence"]) => (c === "confirmed" ? 3 : c === "likely" ? 2 : 1);
    const prev = steps.get(kind);
    const worse = prev && (rank(step.confidence) < rank(prev.confidence) || (rank(step.confidence) === rank(prev.confidence) && (step.points?.length ?? 0) < (prev.points?.length ?? 0)));
    if (!worse) steps.set(kind, step);
    publish(kit);
    const bad = sources.filter((s) => !s.checked);
    const dropped = [...(a.deadline && !step.deadline ? [String(a.deadline)] : []), ...(!whatOk ? [String(a.what ?? "")] : []), ...((Array.isArray(a.points) ? (a.points as string[]) : []).filter((pt) => !step.points?.includes(String(pt))))];
    const dl = step.deadlineCheck === "one_site" ? " The deadline has only one official source: confirm it on a second official site (e.g. the national rules) and record_step again." : step.deadlineCheck === "sources_differ" ? ` Official sources give different periods (${[step.deadline, ...(step.deadlineOthers ?? [])].join(" / ")}): find which applies to this case now and record_step again.` : "";
    return `Recorded ${kind} (${step.confidence}).${dl}${dropped.length ? ` Not kept (or shown as \"[see source]\"), because their numbers (with their currency or unit) are not in ONE checked quote from an official page: ${dropped.map((d) => `"${short(String(d), 60)}"`).join("; ")}.` : ""}${bad.length ? ` ${bad.length} quote(s) were NOT found on the page and do not count: ${bad.map((s) => `"${short(s.quote, 60)}" (${s.url})`).join("; ")}. Re-read the page and copy the words exactly if this matters.` : ""}`;
  };

  return runCrew<DiscoveryResult>(
    {
      prefix: "discovery",
      system: SYSTEM(place) + (opts.focus ? `\nThis is a follow-up: only the part "${opts.focus}" is being researched more deeply (the rest is already recorded). update_plan with one step, then the crew starts by itself; when it reports back, finish.` : "") + `\n${SEARCH_NOTE}` + (speed.batch ? `\n${BATCH_NOTE}` : "") + (speed.workers ? `
You do not search or read yourself in this run: call update_plan with one short step per part of the route, then call update_plan again or wait: the crew (one worker per part) starts by itself, and you get the merged route back. Then record_step anything still unrecorded, and finish.` : ""),
      tools: speed.workers ? [PLAN_TOOL, ...TOOLS.filter((t) => t.name === "record_step"), ASK_TOOL, FINISH_TOOL] : TOOLS,
      ...(speed.fastmodel || speed.workers ? { turnModel: (turn: number) => (turn === 1 && !speed.workers ? { model: MODELS.draft, effort: "low" as const } : { model: MODELS.browser, effort: "low" as const }) } : {}),
      ...(speed.batch ? { tabLimit: 6 } : {}),
      ...(speed.workers
        ? {
            workers: {
              model: { model: MODELS.browser, effort: "low" as const },
              maxTurns: opts.focus ? 4 : 3,
              maxRounds: opts.focus ? 1 : 2,
              take: async (round: number, kit: CrewKit) => {
                const hitsOf = (hits: { title: string; url: string; snippet: string }[]) => hits.filter((h) => !visited.has(keyOf(h.url))).slice(0, 8).map((h, i) => `${i + 1}. ${h.title} — ${h.url}\n   ${h.snippet.slice(0, 300)}`).join("\n");
                if (opts.focus) {
                  // Follow-up on one part: three differently worded searches at once, then one worker reads the best of all of them.
                  const k = ROUTE_KINDS.find((x) => x.kind === opts.focus)!;
                  const where = [place.region, place.country].filter(Boolean).join(" ");
                  const qs = [PART_QUERY[k.kind](place), `${k.question} ${where}`, `${k.label} official guidance ${where}`].map((q) => q.replace(/\s+/g, " ").trim());
                  const all = (await Promise.all(qs.map((q) => searchViaApi(q, kit.track).catch(() => [])))).flat();
                  const seen = new Set<string>();
                  const hits = all.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true)));
                  hits.forEach((h) => learn(h.url));
                  const have = steps.get(k.kind);
                  return [{ who: k.crew, brief: `Part "${k.kind}" (${k.label}): ${k.question}\n${have ? `Already found: ${have.body}. ${have.what}\nGo deeper: the time limits, stages, who it applies to, costs, and how to apply, from the body's own pages.` : "Not found yet."}\nSearch results:\n${hitsOf(hits)}` }];
                }
                if (round === 0) {
                  // One generic search per part, all at once, in code: no planner turn spent on finding the first pages.
                  const found = await Promise.all(ROUTE_KINDS.map(async (k) => ({ k, hits: await searchViaApi(PART_QUERY[k.kind](place).replace(/\s+/g, " ").trim(), kit.track).catch(() => []) })));
                  for (const f of found) for (const h of f.hits) learn(h.url);
                  partHits = new Map(found.map((f) => [f.k.kind, f.hits]));
                  return found.map(({ k, hits }) => ({ who: k.crew, brief: `Part "${k.kind}" (${k.label}): ${k.question}\nSearch results already found for it:\n${hitsOf(hits) || "none: search once with different words."}` }));
                }
                // Gap fill: only the parts still missing or unbacked, each on its own, with what the first pass left unread.
                const gaps = ROUTE_KINDS.filter((k) => !steps.has(k.kind) || steps.get(k.kind)!.confidence === "unconfirmed");
                return gaps.map((k) => ({ who: k.crew, brief: `Part "${k.kind}" (${k.label}): ${k.question}\nA first try did not back this part. Pages not read yet:\n${hitsOf(partHits.get(k.kind) ?? []) || "none"}\nRead the best of them at the same time, follow links to the page that holds the facts, and you may search once with different words.` }));
              },
              system: (id: CrewId, brief: string) => WORKER_SYSTEM(place, id, brief),
              tools: () => [...TOOLS.filter((t) => WORK_TOOLS.includes(t.name)).map(withoutWho), MEMBER_DONE],
              merge: () => {
                const have = ROUTE_KINDS.map((k) => ({ k, s: steps.get(k.kind) }));
                const lines = have.map(({ k, s }) => (s ? `- ${k.kind}: ${s.body} (${s.confidence}${s.deadline ? `, limit ${s.deadline}` : ""}${s.deadlineCheck === "one_site" ? ", limit on one site only" : ""})` : `- ${k.kind}: NOT FOUND`));
                return `The crew has finished. The route:\n${lines.join("\n")}\nrecord_step anything still unrecorded that was reported with quotes, then finish with two or three plain sentences for the patient on what was found and what was not.`;
              },
            } satisfies WorkersSpec,
          }
        : {}),
      firstInput: `Patient's story: ${facts.incidentSummary ?? ""}\nTimeline: ${facts.events.map((e) => `${e.date}: ${e.what}`).join("; ")}\nWhere: ${place.hospital}, ${place.city}, ${place.region}, ${place.country}. (${place.why})`,
      maxTurns: 40,
      effort: "medium",
      who: (name, a) => (name === "record_step" || name === "assign_jobs" ? "elliot" : whoOf(a)),
      after: ["record_step"],
      doing: (name, a) => {
        switch (name) {
          case "web_search":
            return `Searching: ${short(String(a.query ?? ""), 60)}`;
          case "read_page":
            return `Reading ${host(String(a.url ?? "")) || "a page"}`;
          case "record_step":
            return "Writing down what we found";
          case "assign_jobs":
            return "Handing out the research";
          default:
            return "Working";
        }
      },
      describe: (name, a, out) => {
        if (name === "record_step") {
          const s = steps.get(String(a.kind) as RouteKind);
          const label = ROUTE_KINDS.find((k) => k.kind === a.kind)?.label ?? String(a.kind);
          return s ? `${label}: ${s.body}. ${s.what}${s.confidence === "confirmed" ? "" : s.confidence === "likely" ? " (one official source)" : " (not confirmed yet)"}` : out;
        }
        if (name === "assign_jobs") return "The crew worked on it at the same time";
        if (name === "web_search") {
          const hits = [...out.matchAll(/^\d+\. (.*?) — (\S+)/gm)];
          return hits.length ? `${hits.length} results for "${String(a.query ?? "")}". Top: ${host(hits[0][2])}.` : "No useful results.";
        }
        if (name === "read_page") return out.split("\n")[1] ?? out;
        return out.split("\n")[0];
      },
      failed: (name, out) => /^(Error|Could not|Blocked)/.test(out) || false,
      exec: async (call, a, thought, kit) => {
        const who = whoOf(a);
        switch (call.name) {
          case "web_search":
            return searchOne(a, who, thought, kit);
          case "read_page": {
            const out = await readOne(a, who, thought, kit);
            return speed.selfrecover ? await recoverRead(a, out, who, thought, kit) : speed.autorecord ? await autoRecord(a, out, who, kit) : out;
          }
          case "record_step":
            return recordStep(a, kit);
          default:
            return `Unknown tool ${call.name}`;
        }
      },
      finish: async (kit, x) => {
        await explain(kit);
        const summary = x.says.findLast((s) => s.kind === "done")?.text ?? "";
        route = { ...route, runId: kit.runId, summary, system: [place.region, place.country].filter(Boolean).join(", "), foundAt: new Date().toISOString(), steps: ROUTE_KINDS.map((k) => steps.get(k.kind)).filter((s): s is RouteStep => !!s) };
        const result: DiscoveryResult = { runId: kit.runId, runDir: kit.runDir, route, plan: x.plan, thoughts: x.thoughts, says: x.says, turns: x.turns, asks: x.asks, trace: kit.tracer.steps, stats: kit.track.stats };
        kit.emit({ type: "route", route });
        kit.emit({ type: "discovery_result", result });
        return result;
      },
    },
    opts,
  );
}
