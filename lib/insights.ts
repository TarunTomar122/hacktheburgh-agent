import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Access } from "./agent/access";

/**
 * The browser-use dashboard's numbers (app/insights): read from the run folders every crew run writes (.runs/<run>/).
 * Nothing is invented: every count comes from an event a run actually produced. Runs from before the access log
 * (access.ndjson) are counted from their final stats (pages read with a plain fetch vs in the browser) and their trace.
 * Server only.
 */

export type Flow = "discovery" | "complaint" | "escalation" | "compensation" | "enquiries" | "other";
export type RunSummary = {
  id: string;
  flow: Flow;
  startedAt: string;
  ms: number;
  finished: boolean;
  place: string;
  pages: { fetch: number; browser: number };
  searches: { api: number; cache: number; browser: number };
  jobs: number; // browser jobs that need a real browser: checkers, registers, forms
  actions: number; // clicks and typing
  sites: number;
  asks: number;
  models: { agent: string; model: string; where: "local" | "cloud"; calls: number; tokens: number; ms: number; data: string[]; /** calls per job (the ledger's task name) */ tasks: Record<string, number> }[];
  access: Access[];
  /** When each crew member was working (from the run's crew events): the parallel work, on one clock. */
  lanes: { crew: string; spans: [number, number][] }[];
};

const FLOW: [RegExp, Flow][] = [[/^discovery-/, "discovery"], [/^complaint-/, "complaint"], [/^escalation-/, "escalation"], [/^step3-/, "compensation"], [/^step4-/, "enquiries"]];
const flowOf = (id: string): Flow => FLOW.find(([re]) => re.test(id))?.[1] ?? "other";

type Ev = { t: number; e: Record<string, unknown> & { type: string } };
const cache = new Map<string, { mtime: number; run: RunSummary | null }>();

function readRun(dir: string, id: string): RunSummary | null {
  const file = path.join(dir, "events.ndjson");
  if (!existsSync(file)) return null;
  const mtime = Math.max(...[file, path.join(dir, "access.ndjson"), path.join(dir, "ledger.ndjson")].filter(existsSync).map((f) => statSync(f).mtimeMs));
  const hit = cache.get(id);
  if (hit && hit.mtime === mtime) return hit.run;
  let stats = { pages: 0, quick: 0, actions: 0, sites: 0 };
  let last = 0;
  let finished = false;
  let place = "";
  let asks = 0;
  const searches = { api: 0, cache: 0, browser: 0 };
  const models = new Map<string, RunSummary["models"][number]>();
  const open = new Map<string, number>();
  const spans = new Map<string, [number, number][]>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let x: Ev;
    try {
      x = JSON.parse(line) as Ev;
    } catch {
      continue;
    }
    last = Math.max(last, x.t);
    const e = x.e;
    if (e.type === "stats") stats = { ...stats, ...(e.stats as typeof stats) };
    else if (e.type === "crew") {
      const id = String(e.id);
      if (e.state === "working") {
        if (!open.has(id)) open.set(id, x.t);
      } else if (open.has(id)) {
        spans.set(id, [...(spans.get(id) ?? []), [open.get(id)!, x.t]]);
        open.delete(id);
      }
    }
    else if (/_result$|^result$/.test(e.type)) finished = true;
    else if (e.type === "ask") asks++;
    else if (e.type === "place" || e.type === "route") {
      const p = (e.type === "place" ? e.place : (e.route as { place?: unknown })?.place) as { region?: string; country?: string } | undefined;
      const w = [p?.region, p?.country].filter(Boolean).join(", ");
      if (w) place = w;
    } else if (e.type === "model") {
      const m = e.entry as { agent: string; model: string; where: "local" | "cloud"; inTok: number; outTok: number; ms: number; data: string[] };
      const k = `${m.agent}|${m.model}`;
      const cur = models.get(k) ?? { agent: m.agent, model: m.model, where: m.where, calls: 0, tokens: 0, ms: 0, data: [], tasks: {} as Record<string, number> };
      cur.calls++;
      cur.tokens += (m.inTok ?? 0) + (m.outTok ?? 0);
      cur.ms += m.ms ?? 0;
      cur.data = [...new Set([...cur.data, ...(m.data ?? [])])];
      const tk = String((m as { task?: string }).task ?? "other").replace(/ \(retry\)$/, "");
      cur.tasks[tk] = (cur.tasks[tk] ?? 0) + 1;
      models.set(k, cur);
    } else if (e.type === "trace") {
      const text = String((e.step as { text?: string })?.text ?? "");
      const m = /^(\w+) search "/.exec(text);
      if (m) {
        if (m[1] === "Linkup" || m[1] === "Tavily" || m[1] === "Brave") searches.api++;
        else if (m[1] === "Saved") searches.cache++;
        else searches.browser++;
      }
    }
  }
  // The access log, when the run has one, is the exact record.
  let access: Access[] = [];
  const af = path.join(dir, "access.ndjson");
  if (existsSync(af))
    access = readFileSync(af, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as Access;
        } catch {
          return null;
        }
      })
      .filter((a): a is Access => !!a);
  // The ledger is the authoritative routing record; do not count mirrored events twice.
  const ledger = path.join(dir, "ledger.ndjson");
  if (existsSync(ledger)) {
    models.clear();
    for (const line of readFileSync(ledger, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const m = JSON.parse(line);
        if (!m.agent || !m.model || !["local", "cloud"].includes(m.where)) continue;
        const key = `${m.agent}|${m.model}`;
        const cur = models.get(key) ?? { agent: m.agent, model: m.model, where: m.where, calls: 0, tokens: 0, ms: 0, data: [], tasks: {} as Record<string, number> };
        cur.calls++;
        cur.tokens += (m.inTok ?? 0) + (m.outTok ?? 0);
        cur.ms += m.ms ?? 0;
        cur.data = [...new Set([...cur.data, ...(m.data ?? [])])] as string[];
        const tk = String(m.task ?? "other").replace(/ \(retry\)$/, "");
        cur.tasks[tk] = (cur.tasks[tk] ?? 0) + 1;
        models.set(key, cur);
      } catch { /* a run may still be writing its final line */ }
    }
  }
  const pagesFromLog = access.filter((a) => a.kind === "page" || a.kind === "firm");
  const run: RunSummary = {
    id,
    flow: flowOf(id),
    startedAt: id.replace(/^[a-z0-9]+-/, "").replace(/T(\d\d)-(\d\d)-(\d\d)-\d+Z.*$/, "T$1:$2:$3Z"),
    ms: last,
    finished,
    place,
    pages: access.length ? { fetch: pagesFromLog.filter((a) => a.via === "fetch").length, browser: pagesFromLog.filter((a) => a.via === "browser").length } : { fetch: stats.quick, browser: Math.max(0, stats.pages - stats.quick) },
    searches: access.length ? { api: access.filter((a) => a.kind === "search" && a.via === "api").length, cache: access.filter((a) => a.kind === "search" && a.via === "cache").length, browser: access.filter((a) => a.kind === "search" && a.via === "browser").length } : searches,
    jobs: access.filter((a) => a.kind === "task").length,
    actions: stats.actions,
    sites: stats.sites,
    asks,
    models: [...models.values()],
    access,
    lanes: ["elliot", "nell", "robin", "iona", "kit"].map((crew) => ({ crew, spans: [...(spans.get(crew) ?? []), ...(open.has(crew) ? [[open.get(crew)!, last] as [number, number]] : [])] })).filter((l) => l.spans.length),
  };
  cache.set(id, { mtime, run });
  return run;
}

/** Every crew run on this machine, newest first (test and benchmark folders left out). */
export function allRuns(): RunSummary[] {
  const root = path.join(process.cwd(), ".runs");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => FLOW.some(([re]) => re.test(d)))
    .map((d) => readRun(path.join(root, d), d))
    .filter((r): r is RunSummary => !!r && r.ms > 5000)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/** The reasons the browser was needed, most common first, with a few example sites each. */
export function browserReasons(runs: RunSummary[]): { reason: string; n: number; kind: Access["kind"]; examples: string[] }[] {
  const by = new Map<string, { reason: string; n: number; kind: Access["kind"]; examples: Set<string> }>();
  for (const r of runs)
    for (const a of r.access) {
      if (a.via !== "browser") continue;
      const reason = a.kind === "task" ? a.reason.replace(/\s*\(.*\)$/, "").replace(/^filled .*'s enquiry form/, "filled a firm's enquiry form") : a.reason.replace(/^their (home|medical negligence) page: /, "");
      const k = `${a.kind}|${reason}`;
      const cur = by.get(k) ?? { reason, n: 0, kind: a.kind, examples: new Set<string>() };
      cur.n++;
      try {
        if (a.url && /^https?:/.test(a.url) && cur.examples.size < 3) cur.examples.add(new URL(a.url).hostname.replace(/^www\./, ""));
      } catch {}
      by.set(k, cur);
    }
  return [...by.values()].sort((a, b) => b.n - a.n).map((x) => ({ ...x, examples: [...x.examples] }));
}

/** Only select evidence the existing screenshot route can serve. */
export function browserEvidence(runs: RunSummary[]): { title: string; run: string; file: string }[] {
  const jobs = [
    { title: "Checker answered", crew: "Nell", reason: /eligibility checker/, shot: /-Nell-.*-found\.jpg$/ },
    { title: "Register searched", crew: "Robin", reason: /register.*filters/, shot: /-Robin-.*(?:Society|AVMA).*-(?:found|click)\.jpg$/ },
    { title: "Enquiry prepared", crew: "Kit", reason: /filled .*form \([1-9]\d* fields\)/, shot: /-Kit-.*-type\.jpg$/ },
  ];
  return jobs.flatMap((job) => {
    for (const r of runs) {
      if (!r.finished || !/^(step[34]|complaint|discovery)-[0-9T-]+Z?$/.test(r.id)) continue;
      if (!r.access.some((a) => a.kind === "task" && job.reason.test(a.reason))) continue;
      const files = readdirSync(path.join(process.cwd(), ".runs", r.id)).filter((f) => job.shot.test(f)).sort();
      if (files.length) return [{ title: job.title, run: r.id, file: files[files.length - 1] }];
    }
    return [];
  });
}
