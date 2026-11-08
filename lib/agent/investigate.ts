import { z } from "zod";
import type { CaseFacts } from "./facts";
import type { CrewKit } from "./crewRun";
import { withLedger } from "./ledger";
import { modelFor, structured } from "./llm";
import { webSearch } from "./planner";
import type { EvidenceResult, Investigation, InvestigationItem, InvestigationLane, Thought } from "./plannerTypes";
import type { RouteMap } from "./routeTypes";
import { exploreSite, normText, readPage, type PageReading } from "./workers/explore";

/**
 * Iona's pre-action investigation (night plan, side backlog 2). Before the complaint is written, Iona looks for
 * official, public, checkable material that makes it stronger, in the bodies of THIS place:
 *   decision    published decisions or case reports of the ombudsman / health complaints body about similar cases
 *               (or, for a claim, of the compensation scheme or courts), with what was decided and why;
 *   policy      the provider's own published policies on the part of care in question (discharge, follow-up, escalation...);
 *   inspection  the regulator's inspection or performance reports about the provider or service;
 *   public_record  freedom-of-information answers, disclosure logs or public registers that touch the issue.
 * Nothing about any place is in this file. The bodies and sites come from the route map and from live web search;
 * search queries and picks are made by a model from the organisations' names. Rules, same as discovery's record_step:
 *  - every item has a quote that code found in the page's text (readPage's check), and a URL opened in this run;
 *  - a page counts only if its site is one the route map already found official, or a government-type domain that
 *    the model also judged official; anything else is dropped;
 *  - the one-line "why" keeps no number the quote does not contain (whole tokens);
 *  - where nothing is found, `nothing` says so in words written by code from what was searched and opened.
 * Privacy: the models here see only a generic condition and issue (no names, dates or contact details; made on this
 * Mac by `describeIssue` when the planner did not give it), organisation names, and public page text.
 */

export type IssueBrief = { condition: string; issue: string };
export type InvestigateOpts = { focus?: "complaint" | "compensation"; budgetMs?: number; lanes?: InvestigationLane[] };

const Issue = z.object({
  condition: z.string().describe("The medical condition or injury in plain words, no names and no dates, e.g. 'suspected scaphoid fracture'"),
  issue: z.string().describe("One sentence on what went wrong with the care, generic: no names, no dates, no places, e.g. 'a fracture missed on X-ray at an emergency department and the patient sent home as a sprain'"),
});

/** A generic, de-identified description of the case for web searches. Runs on this Mac for health data unless LOCAL_MODELS=0. */
export async function describeIssue(facts: CaseFacts): Promise<IssueBrief> {
  const story = [facts.incidentSummary, ...facts.events.map((e) => e.what)].filter(Boolean).join("\n");
  return withLedger({ agent: "iona" }, () =>
    structured({
      ...modelFor("check", ["health"]),
      instructions: "Describe a patient's case for a public web search, without any personal detail: no names, no dates, no places, no hospital names. Only the medical condition and what went wrong with the care.",
      input: story,
      schema: Issue,
      name: "investigation_issue",
      data: ["health"],
    }),
  );
}

/* ------------------------------------------------------------------ lanes */

type Brief = { provider: string; body: string; place: string; hospital: string; hosts: string[]; condition: string; issue: string };
type Lane = {
  id: InvestigationLane;
  label: string; // the crew tab
  cap: number; // most items shown for this lane
  seeds: (r: RouteMap, focus: "complaint" | "compensation") => string[];
  bodyOf: (r: RouteMap, focus: "complaint" | "compensation") => string;
  want: string; // what the searches should find
  goal: (b: Brief) => string; // for exploreSite, in plain words
  ask: (b: Brief) => string; // for readPage
};

const stepOf = (r: RouteMap, kinds: string[]) => kinds.map((k) => r.steps.find((s) => s.kind === k)).filter((s): s is NonNullable<typeof s> => !!s);
const originOf = (u?: string) => {
  try {
    return u ? new URL(u).origin : "";
  } catch {
    return "";
  }
};
const urlsOf = (steps: ReturnType<typeof stepOf>) => [...new Set(steps.map((s) => s.url ?? s.sources[0]?.url).map(originOf).filter(Boolean))];

const LANES: Lane[] = [
  {
    id: "decision",
    label: "Decisions",
    cap: 3,
    seeds: (r, f) => urlsOf(stepOf(r, f === "compensation" ? ["compensation"] : ["escalation"])),
    bodyOf: (r, f) => stepOf(r, f === "compensation" ? ["compensation"] : ["escalation"])[0]?.body ?? "the independent health complaints body",
    want: "published decisions, case reports or case summaries of the body about a complaint or claim like this one, saying what it decided and why",
    goal: (b) => `published decisions, case reports or case summaries of ${b.body} about ${b.issue}`,
    ask: (b) =>
      `Is this a published decision, case report, case summary or award by ${b.body} (or a similar body) about a case resembling: ${b.issue}? If so, quote word for word (1) one passage that says what the case was about and (2) the passages that say what was decided or found and why. If it is only a list, a form or a general page, or the case is not alike, say so and quote nothing.`,
  },
  {
    id: "policy",
    label: "Policies",
    cap: 2,
    seeds: (r) => urlsOf(stepOf(r, ["complaint", "records"])),
    bodyOf: (r) => stepOf(r, ["complaint"])[0]?.body ?? "the provider",
    want: "the provider's own published policy, protocol or guidance on the part of care in question (for example discharge, follow-up of test results or imaging, escalation, consent, information given to patients)",
    goal: (b) => `a policy, protocol or guidance document published by ${b.provider} about the part of care involved in: ${b.issue}`,
    ask: (b) =>
      `Is this a policy, protocol, procedure or guidance that ${b.provider} (or its health authority) publishes for its own staff or patients, on a part of care relevant to: ${b.issue}? If so quote word for word one passage that says what the document is about and the exact requirement or commitment (follow-up, discharge, escalation, information to patients). If it is not such a document, say so and quote nothing.`,
  },
  {
    id: "inspection",
    label: "Inspections",
    cap: 2,
    seeds: () => [],
    bodyOf: (r) => stepOf(r, ["complaint"])[0]?.body ?? "the provider",
    want: "an inspection, review or performance report by the health regulator or inspectorate about the provider, its hospital or the relevant department",
    goal: (b) => `an inspection or performance report by the health regulator about ${b.hospital || b.provider}`,
    ask: (b) =>
      `Is this an inspection, review or performance report by a health regulator, inspectorate or national quality body about ${b.hospital || b.provider} (or its relevant department)? If so quote word for word one passage that says which hospital or service it covers and the findings, ratings or requirements that touch the area of care in: ${b.issue}. If it is not such a report, say so and quote nothing.`,
  },
  {
    id: "public_record",
    label: "Public records",
    cap: 2,
    seeds: (r) => urlsOf(stepOf(r, ["complaint"])),
    bodyOf: (r) => stepOf(r, ["complaint"])[0]?.body ?? "the provider",
    want: "a freedom-of-information answer, disclosure log entry, public register or published statistic from the provider or a public body that touches this kind of issue",
    goal: (b) => `a freedom of information response, disclosure log or public statistics published by ${b.provider} about ${b.condition}`,
    ask: (b) =>
      `Is this a freedom-of-information response, disclosure log entry, public register entry or official statistic published by ${b.provider} or another public body that touches: ${b.issue}? If so quote word for word what it reveals. If not, say so and quote nothing.`,
  },
];

/* ------------------------------------------------------------------ small checks (code) */

const registrable = (host: string) => {
  const l = host.replace(/^www\./, "").toLowerCase().split(".");
  // co.uk, org.nz, govt.nz: a short second-level label under a two-letter country code
  return (l.length >= 3 && l[l.length - 1].length === 2 && l[l.length - 2].length <= 4 ? l.slice(-3) : l.slice(-2)).join(".");
};
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const govLike = (host: string) => host.split(".").some((l) => /^(gov|govt|gouv|gob|government|admin|bund)$/.test(l));

const NUMBER_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty";
/** Every number in the claim (digits or number words) is a whole token in the quote. */
export function numbersBacked(claim: string, quote: string): boolean {
  const hay = ` ${normText(quote)} `;
  return [...claim.matchAll(new RegExp(`\\d[\\d,.]*|\\b(?:${NUMBER_WORDS})\\b`, "gi"))].every((m) => hay.includes(` ${normText(m[0])} `));
}

/** A PDF can come out with broken spacing ("f or first -line"): such quotes are not shown. */
const cleanQuote = (q: string) => {
  const w = q.split(/\s+/);
  // also: a sentence that starts by pointing back ("These included ...") makes no sense on its own
  return q.length >= 40 && q.length <= 500 && !/^(these|this|those|they|it|its|such|he|she|and|but|which|that|also)\b/i.test(q) && w.filter((x) => /^[a-z]{1,2}$/i.test(x)).length <= w.length * 0.25;
};

/* ------------------------------------------------------------------ the model's small jobs (public data only) */

const Queries = z.object({ queries: z.array(z.string()).describe("Two web search queries, 3 to 9 words each") });
const Picks = z.object({ picks: z.array(z.object({ id: z.number(), official: z.boolean().describe("Published by a government, health service, ombudsman, regulator, court, or the provider itself") })).describe("Up to 3 result ids, best first; empty if none is likely") });
const Judged = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      fit: z.enum(["close", "partial", "none"]).describe("close = about the same kind of problem; partial = same service or area of care, or a general rule that applies; none = unrelated, boilerplate, or only says when or how something was done, or who wrote it"),
      kind_ok: z.boolean().describe("The passage really is of the lane's kind (a decision or case report; the provider's own policy, guidance or patient information; an inspection or performance finding; a freedom-of-information answer, disclosure log or official statistic) and not general health advice"),
      about_provider: z.boolean().describe("It is published by, or is about, the organisation named (or its hospital or health authority), not another organisation"),
      stance: z.enum(["supports", "neutral", "against"]).describe("For the patient's complaint: supports = a finding of fault or a standard of care or follow-up the patient can point to; against = the body decided the care was appropriate or did not uphold; neutral = neither, or the passage does not show the outcome"),
      why: z.string().describe("One plain sentence, at most 30 words, on how this relates to the patient's case. Use only numbers that are in the quote. Never say anyone was at fault."),
    }),
  ),
});

async function queriesFor(lane: Lane, b: Brief): Promise<string[]> {
  const r = await structured({
    ...modelFor("check", []),
    instructions:
      "You write web search queries for a research agent looking for OFFICIAL public pages in one place. Return two short queries in the language the place's official sites use (usually English), using the organisations' names and the condition. Never include a person's name, a date or any personal detail. If a site address is given, make the second query restricted to it with site:address.",
    input: `Looking for: ${lane.want}\nPlace: ${b.place}\nProvider: ${b.provider}\nHospital: ${b.hospital}\nBody: ${b.body}\nCondition: ${b.condition}\nWhat went wrong: ${b.issue}\nOfficial site addresses to prefer: ${b.hosts.join(", ") || "none known"}`,
    schema: Queries,
    name: `investigate_queries_${lane.id}`,
    data: [],
  });
  return r.queries.map((q) => q.trim()).filter(Boolean).slice(0, 2);
}

/* ------------------------------------------------------------------ one lane */

type LaneOut = { items: InvestigationItem[]; searched: string[]; opened: string[]; note: string };

async function runLane(kit: CrewKit, thought: Thought, lane: Lane, route: RouteMap, brief: Brief, focus: "complaint" | "compensation", browseUntil: number): Promise<LaneOut> {
  const left = () => browseUntil - Date.now();
  const seeds = lane.seeds(route, focus);
  const searched: string[] = [];
  const reads: { read: PageReading; official: boolean }[] = [];
  const walls: string[] = [];
  const routeHosts = new Set(brief.hosts.map(registrable));
  const officialHost = (u: string) => {
    const h = hostOf(u);
    return !!h && (routeHosts.has(registrable(h)) || govLike(h));
  };
  const seen = new Set<string>();
  let hitCount = 0;
  // Only real walls are reported as "stopped": a page that was just not there or led nowhere is not one.
  const wall = (w: { kind: string; url: string }) => void (/^(login|captcha|bot_check|payment|phone_or_post_only)$/.test(w.kind) && walls.push(`${hostOf(w.url)}: ${w.kind.replace(/_/g, " ")}`));

  await kit.inTab(
    thought,
    "iona",
    lane.label,
    async (p, note) => {
      const ctx = { page: p, note, track: kit.track };
      const readOne = async (url: string, official: boolean) => {
        const key = url.replace(/#.*$/, "").replace(/\/$/, "");
        if (seen.has(key) || left() < 25_000) return;
        seen.add(key);
        const r = await readPage(ctx, url, lane.ask(brief));
        seen.add(r.url.replace(/#.*$/, "").replace(/\/$/, ""));
        if (r.wall) wall({ kind: r.wall.kind, url: r.url || url });
        else reads.push({ read: r, official: official && officialHost(r.url) });
      };

      // 1. search, with queries made from the organisations' names: one at a time, the second only if the first led nowhere
      const good = () => reads.some((x) => x.official && x.read.quotes.some((q) => q.checked && cleanQuote(q.quote)));
      // Sites to prefer in the queries: the body's own (the lane's seeds); with no seed (inspections), any the route map found official.
      const prefer = seeds.length ? seeds.map(hostOf) : brief.hosts;
      const qs = left() > 60_000 ? await queriesFor(lane, { ...brief, hosts: prefer }).catch(() => []) : [];
      for (const q of qs) {
        if (good() || left() < 70_000) break;
        searched.push(q);
        const hits = await webSearch(p, q, note, kit.track).catch(() => []);
        hitCount += hits.length;
        if (!hits.length || left() < 50_000) continue;
        const pick = await structured({
          ...modelFor("check", []),
          instructions: `Choose the search results most likely to be: ${lane.want}. Prefer official pages and documents over news, blogs, law firms and forums.`,
          input: `What went wrong: ${brief.issue}\n\nResults:\n${hits.map((h, i) => `[${i}] ${h.title}\n    ${h.url}\n    ${h.snippet.slice(0, 160)}`).join("\n")}`,
          schema: Picks,
          name: `investigate_pick_${lane.id}`,
          data: [],
        }).catch(() => ({ picks: [] }));
        for (const k of pick.picks.slice(0, 3)) if (hits[k.id] && k.official && officialHost(hits[k.id].url) && left() > 25_000) await readOne(hits[k.id].url, true);
      }
      // 2. nothing usable yet: go through the body's own site, with its own menus and search
      if (!good() && seeds.length && left() > 50_000) {
        const found = await exploreSite(ctx, seeds[0], lane.goal(brief), { want: "page", maxHops: 4 });
        if (found.wall) wall(found.wall);
        if (found.ok && left() > 25_000) await readOne(found.url, true);
      }
    },
    Math.max(30_000, left() + 20_000),
  );

  // Quotes that code checked on pages from official sites only.
  const cand = reads.flatMap((x, i) => (x.official ? x.read.quotes.filter((q) => q.checked && cleanQuote(q.quote)).map((q, j) => ({ id: `${i}.${j}`, read: x.read, quote: q.quote })) : []));
  const opened = [...new Set(reads.map((x) => x.read.url))];
  const dropped = reads.filter((x) => !x.official && x.read.quotes.some((q) => q.checked)).map((x) => hostOf(x.read.url));
  let items: InvestigationItem[] = [];
  if (cand.length) {
    const j = await structured({
      ...modelFor("draft", []),
      instructions: `You judge whether passages from OFFICIAL pages are useful to a patient writing a complaint. The lane is: ${lane.want}. Be strict: boilerplate, forms, navigation text, unrelated cases, and passages that only give dates, methods or authorship are "none". For a decision, the "why" must say what the body decided (upheld, not upheld, or that the passage does not show the outcome).`,
      input: `The patient's case (generic): ${brief.issue}\nOrganisation: ${brief.body}\n\nPassages:\n${cand.map((c) => `[${c.id}] (${c.read.title.slice(0, 80)}, ${hostOf(c.read.url)}) "${c.quote}"`).join("\n")}`,
      schema: Judged,
      name: `investigate_judge_${lane.id}`,
      data: [],
    }).catch(() => ({ items: [] }));
    const byId = new Map(cand.map((c) => [c.id, c]));
    if (process.env.INVESTIGATE_DEBUG) console.log(`[investigate:${lane.id}] judged ${j.items.length} of ${cand.length} passages:\n${j.items.map((x) => `  ${x.id} ${x.fit} kind_ok=${x.kind_ok} about=${x.about_provider} stance=${x.stance} "${byId.get(x.id)?.quote.slice(0, 90)}"`).join("\n")}`);
    items = j.items
      // Only passages that fit: close ones, or related ones that give the patient a standard to point to; one per page.
      .filter((x) => (x.fit === "close" || (x.fit === "partial" && (x.stance === "supports" || lane.id === "inspection"))) && x.kind_ok && x.about_provider && byId.has(x.id))
      .sort((a, b) => Number(b.fit === "close") - Number(a.fit === "close") || Number(b.stance === "supports") - Number(a.stance === "supports"))
      .filter((x, i, all) => all.filter((y, k) => k <= i && byId.get(y.id)!.read.url === byId.get(x.id)!.read.url).length <= (lane.id === "decision" ? 2 : 1))
      .slice(0, lane.cap)
      .map((x) => {
        const c = byId.get(x.id)!;
        return { lane: lane.id, title: c.read.title.replace(/\s+/g, " ").slice(0, 120) || hostOf(c.read.url), publisher: hostOf(c.read.url), url: c.read.url, quote: c.quote, why: numbersBacked(x.why, c.quote) ? x.why.trim() : "", fit: x.fit as "close" | "partial", stance: x.stance };
      });
  }
  const note = items.length
    ? ""
    : [
        searched.length ? `Searched ${searched.map((q) => `"${q}"`).join(" and ")} (${hitCount} result${hitCount === 1 ? "" : "s"}).` : "Did not get to search.",
        opened.length ? `Opened ${opened.length} page${opened.length === 1 ? "" : "s"} (${[...new Set(opened.map(hostOf))].join(", ")}); none had a passage that fits this case.` : "No official page was opened.",
        dropped.length ? `Left out pages from ${[...new Set(dropped)].join(", ")}: not a source we could confirm as official.` : "",
        walls.length ? `Stopped, not bypassed: ${[...new Set(walls)].join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
  return { items, searched, opened, note };
}

/* ------------------------------------------------------------------ the investigation */

/**
 * Run the lanes at the same time, each in its own Iona tab, and stop by `budgetMs` (default 3.5 minutes) whatever
 * happened: what was gathered by then is judged and reported; the rest is reported as not reached.
 */
export async function investigate(kit: CrewKit, thought: Thought, route: RouteMap, brief: IssueBrief, proof: EvidenceResult, opts: InvestigateOpts = {}): Promise<Investigation> {
  const focus = opts.focus ?? "complaint";
  const budget = opts.budgetMs ?? 210_000;
  const t0 = Date.now();
  const lanes = LANES.filter((l) => (opts.lanes ? opts.lanes.includes(l.id) : focus === "compensation" ? l.id === "decision" : true));
  const provider = stepOf(route, ["complaint"])[0]?.body ?? "the provider";
  // Hosts the route map already found official (provider, ombudsman, guidance body, funding body ...): the basis of "official" in code.
  const hosts = [...new Set(route.steps.flatMap((s) => [s.url, ...s.sources.filter((x) => x.official && x.checked).map((x) => x.url)]).map((u) => (u ? hostOf(u) : "")).filter(Boolean))];
  const placeName = [route.place.city, route.place.region, route.place.country].filter(Boolean).join(", ");
  const outs = new Map<InvestigationLane, LaneOut>();
  const done = lanes.map((lane) =>
    runLane(kit, thought, lane, route, { provider, body: lane.bodyOf(route, focus), place: placeName, hospital: route.place.hospital, hosts, condition: brief.condition, issue: brief.issue }, focus, t0 + budget - 25_000)
      .then((o) => void outs.set(lane.id, o))
      .catch((e) => void outs.set(lane.id, { items: [], searched: [], opened: [], note: `Stopped: ${(e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 100)}.` })),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all(done), new Promise<void>((r) => (timer = setTimeout(r, budget + 15_000)))]);
  clearTimeout(timer);

  const seenQuote = new Set<string>();
  const inv: Investigation = { items: [], nothing: [], searched: [], opened: [], tookMs: Date.now() - t0 };
  for (const lane of lanes) {
    const o = outs.get(lane.id);
    if (!o) {
      inv.nothing.push({ lane: lane.id, note: "Ran out of time before this finished." });
      continue;
    }
    inv.searched.push(...o.searched);
    inv.opened.push(...o.opened);
    const fresh = o.items.filter((x) => !seenQuote.has(normText(x.quote)) && seenQuote.add(normText(x.quote)));
    inv.items.push(...fresh);
    if (!fresh.length) inv.nothing.push({ lane: lane.id, note: o.note || "Nothing found." });
  }
  inv.opened = [...new Set(inv.opened)];
  proof.investigation = inv;
  kit.emit({ type: "evidence", evidence: { ...proof } });
  for (const x of inv.items) kit.finding(`${LANE_NAME[x.lane]}: "${x.quote.slice(0, 110)}${x.quote.length > 110 ? "…" : ""}"`, x.url, "iona");
  if (!inv.items.length) kit.finding("No official public material found to cite", undefined, "iona");
  return inv;
}

export const LANE_NAME: Record<InvestigationLane, string> = { decision: "Decision", policy: "Provider policy", inspection: "Inspection", public_record: "Public record" };

/** What the planner (and a person reading the log) sees: each item with its quote and URL, then where nothing was found. */
export function describeInvestigation(inv: Investigation): string {
  const lines = inv.items.map((x) => `[${LANE_NAME[x.lane]}, ${x.fit}] ${x.title} (${x.url})\n  "${x.quote}"${x.why ? `\n  ${x.why}` : ""}`);
  const none = inv.nothing.map((x) => `[${LANE_NAME[x.lane]}] nothing found. ${x.note}`);
  return `${inv.items.length} item(s) in ${(inv.tookMs / 1000).toFixed(0)}s.\n${[...lines, ...none].join("\n")}`;
}

/** What goes into the complaint as "supporting evidence the patient can cite": the closest one or two items that support the patient's side. */
export type DraftSupport = { source: string; title: string; quote: string; url: string };
export function supportFor(inv: Investigation | undefined): DraftSupport[] {
  const rank = (x: InvestigationItem) => (x.fit === "close" ? 0 : 2) + (x.stance === "supports" ? 0 : 0.25) + (x.lane === "decision" ? 0 : x.lane === "policy" ? 0.5 : 1);
  return (inv?.items ?? [])
    .filter((x) => x.stance === "supports") // only what clearly backs the patient's side is cited in the letter; the rest (an unfavourable decision, a passage without its outcome) is shown, not cited
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 2)
    .map((x) => ({ source: x.publisher, title: x.title, quote: x.quote, url: x.url }));
}
