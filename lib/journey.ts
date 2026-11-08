import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { allRuns, type RunSummary } from "./insights";

/**
 * One real journey for the judges' page (app/insights): a Research run and the Prepare-your-case run that followed it,
 * read from their run folders and laid on one clock. Every figure is counted from events the runs wrote. Server only.
 */

export type Crew = "elliot" | "nell" | "robin" | "iona" | "kit";
export const CREW_IDS: Crew[] = ["elliot", "nell", "robin", "iona", "kit"];

export type Journey = {
  place: string;
  startedAt: string;
  research: RunSummary;
  case: RunSummary;
  /** research time + case time: the crew's working time, not the gap while the patient clicked on */
  ms: number;
  lanes: { crew: Crew; spans: [number, number][] }[];
  /** when something was found, on the same clock */
  moments: { t: number; crew: Crew; text: string }[];
  counts: { pages: number; browserPages: number; sites: number; handoffs: number; replans: number; forms: number; asks: number; searches: number };
  /** what Elliot asked each crew member to do, and the recorded screenshots of their browser */
  work: Record<Crew, { asked: string[]; shots: { run: string; file: string; site: string }[] }>;
  forms: { firm: string; fields: number; url: string; shot?: { run: string; file: string } }[];
  models: { model: string; where: "local" | "cloud"; calls: number; inTok: number; outTok: number; crew: string[] }[];
};

type Ev = { t: number; e: { type: string } & Record<string, unknown> };
function events(id: string): Ev[] {
  const f = path.join(process.cwd(), ".runs", id, "events.ndjson");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .flatMap((l) => {
      try {
        return l ? [JSON.parse(l) as Ev] : [];
      } catch {
        return [];
      }
    });
}

/** "084-Kit-Jones-Whyte-type.jpg" -> crew kit, site "Jones Whyte", action "type" */
function parseShot(file: string): { crew: Crew; site: string; action: string } | null {
  const m = /^\d+-([A-Za-z]+)-(.+)-([a-z]+)\.jpg$/.exec(file);
  if (!m) return null;
  const crew = m[1].toLowerCase() as Crew;
  if (!CREW_IDS.includes(crew)) return null;
  // a site named by its address ("nhslothian-scot") reads as one ("nhslothian.scot"); a named site keeps its words
  const site = /^[a-z0-9-]+$/.test(m[2]) ? m[2].replace(/-/g, ".") : m[2].replace(/-/g, " ");
  return { crew, site, action: m[3] };
}

/** The newest finished Prepare-your-case run that had a Research run just before it (same patient session). */
export function latestJourney(): Journey | null {
  const runs = allRuns().filter((r) => r.finished);
  for (const c of runs.filter((r) => r.flow === "compensation" && r.lanes.length >= 3)) {
    const cs = Date.parse(c.startedAt);
    const d = runs.find((r) => r.flow === "discovery" && cs - Date.parse(r.startedAt) > 0 && cs - Date.parse(r.startedAt) < 10 * 60_000);
    if (d) return build(d, c);
  }
  return null;
}

function build(research: RunSummary, kase: RunSummary): Journey {
  const off = research.ms;
  const lanes = CREW_IDS.map((crew) => ({
    crew,
    spans: [...(research.lanes.find((l) => l.crew === crew)?.spans ?? []), ...(kase.lanes.find((l) => l.crew === crew)?.spans ?? []).map(([a, b]) => [a + off, b + off] as [number, number])],
  })).filter((l) => l.spans.length);

  const moments: Journey["moments"] = [];
  const work = Object.fromEntries(CREW_IDS.map((c) => [c, { asked: [] as string[], shots: [] as { run: string; file: string; site: string }[] }])) as Journey["work"];
  let handoffs = 0;
  let replans = 0;
  let asks = 0;
  const ready = new Map<string, Journey["forms"][number]>();
  for (const [run, shift] of [[research, 0], [kase, off]] as const) {
    for (const { t, e } of events(run.id)) {
      if (e.type === "say") {
        const s = e.say as { from?: string; to?: string; kind?: string; text?: string; replan?: boolean };
        if (s.kind === "assign" || s.kind === "report") handoffs++;
        if (s.kind === "plan" && s.replan) replans++;
        if (s.kind === "assign" && s.to && CREW_IDS.includes(s.to as Crew) && s.text && !work[s.to as Crew].asked.includes(s.text)) work[s.to as Crew].asked.push(s.text);
      } else if (e.type === "finding") {
        const crew = String(e.crew ?? "elliot") as Crew;
        if (CREW_IDS.includes(crew) && typeof e.text === "string" && !/:\s*$/.test(e.text)) moments.push({ t: t + shift, crew, text: e.text });
      } else if (e.type === "ask") asks++;
      else if (e.type === "enquiry") {
        const q = e.enquiry as { firmName: string; status: string; formUrl: string | null; filled: unknown[] };
        if (q.status === "ready_to_send") ready.set(q.firmName, { firm: q.firmName, fields: q.filled.length, url: q.formUrl ?? "" });
      }
    }
    const dir = path.join(process.cwd(), ".runs", run.id);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort() : [];
    for (const f of files) {
      const p = parseShot(f);
      if (!p || p.action === "fail") continue;
      const list = work[p.crew].shots;
      // one picture per site and crew member: the last (most finished) state of that page
      const at = list.findIndex((s) => s.site === p.site);
      if (at >= 0) list.splice(at, 1);
      list.push({ run: run.id, file: f, site: p.site });
    }
  }
  for (const f of ready.values()) {
    const slug = f.firm.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const s = work.kit.shots.find((x) => x.run === kase.id && x.file.includes(`-Kit-${slug}-`));
    if (s) f.shot = { run: s.run, file: s.file };
  }

  const models = new Map<string, Journey["models"][number]>();
  for (const m of [...research.models, ...kase.models]) {
    const cur = models.get(m.model) ?? { model: m.model, where: m.where, calls: 0, inTok: 0, outTok: 0, crew: [] };
    cur.calls += m.calls;
    cur.inTok += m.inTok ?? 0;
    cur.outTok += m.outTok ?? 0;
    if (CREW_IDS.includes(m.agent as Crew) && !cur.crew.includes(m.agent)) cur.crew.push(m.agent);
    models.set(m.model, cur);
  }

  const pages = research.pages.fetch + research.pages.browser + kase.pages.fetch + kase.pages.browser;
  return {
    place: research.place,
    startedAt: research.startedAt,
    research,
    case: kase,
    ms: research.ms + kase.ms,
    lanes,
    moments: moments.sort((a, b) => a.t - b.t),
    counts: { pages, browserPages: research.pages.browser + kase.pages.browser, sites: research.sites + kase.sites, handoffs, replans, forms: ready.size, asks, searches: research.searches.api + kase.searches.api },
    work,
    forms: [...ready.values()],
    models: [...models.values()].sort((a, b) => b.calls - a.calls),
  };
}
