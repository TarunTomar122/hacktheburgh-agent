import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { allRuns, browserReasons, type Flow, type RunSummary } from "../../lib/insights";

/**
 * How the crew uses the web (for judges): fetch first, a search API instead of a search engine, the browser only where a
 * page or a job needs one, and why. Plus why there is a crew of specialists, not one agent. Every number is read from the
 * runs' own logs on this machine (lib/insights.ts).
 */

const FLOW_NAME: Record<Flow, string> = { discovery: "Research", complaint: "Complaint", escalation: "Independent review", compensation: "Prepare your case", enquiries: "Contact lawyers", other: "Other" };
const mins = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = (rs: RunSummary[], f: (r: RunSummary) => number) => rs.reduce((n, r) => n + f(r), 0);

const CREW = [
  { id: "elliot", name: "Elliot", job: "Plans and re-plans the work, decides who does what next, and writes the summary.", why: "One reasoning model that sees the plan, not the pages: it stays cheap and focused." },
  { id: "robin", name: "Robin", job: "Finds the official bodies, the lawyer register, and checks each firm on its own website.", why: "Many sites at once, each in its own tab or plain fetch." },
  { id: "iona", name: "Iona", job: "Finds the place's clinical guidance and published decisions, and checks they apply to you.", why: "Slow reading that runs in the background so nobody waits for it." },
  { id: "nell", name: "Nell", job: "Answers the place's own legal-aid checker, asking you only what it needs.", why: "The only one who handles money answers, which stay in the checker." },
  { id: "kit", name: "Kit", job: "Fills each firm's enquiry form and stops before Send.", why: "The only one who types your name and contact details." },
];

export default function Insights() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-8 py-12 text-[14px] text-muted">Reading the runs…</main>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection(); // read the run folders on every visit, never at build time
  const runs = allRuns();
  const recent = runs.filter((r) => r.finished);
  const logged = runs.filter((r) => r.access.length);
  // The headline is about how the crew works now: the latest runs (the oldest ones predate fetch-first).
  const scope = runs.slice(0, 25);
  const pagesF = sum(scope, (r) => r.pages.fetch);
  const pagesB = sum(scope, (r) => r.pages.browser);
  const sApi = sum(scope, (r) => r.searches.api);
  const sCache = sum(scope, (r) => r.searches.cache);
  const sBrowser = sum(scope, (r) => r.searches.browser);
  const timed = logged.flatMap((r) => r.access.filter((a) => a.kind === "page" && typeof a.ms === "number"));
  const avg = (v: "fetch" | "browser") => {
    const xs = timed.filter((a) => a.via === v).map((a) => a.ms!);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  const latest = logged[0];
  const lanesRun = recent.find((r) => r.flow === "compensation" && r.lanes.length >= 3) ?? recent.find((r) => r.lanes.length >= 3);
  const jobs = logged.flatMap((r) => r.access.filter((a) => a.kind === "task"));
  const firms = logged.flatMap((r) => r.access.filter((a) => a.kind === "firm"));
  const reasons = browserReasons(logged);
  const places = new Set(runs.map((r) => r.place.split(", ").pop()).filter(Boolean));
  const flows: Flow[] = ["discovery", "compensation", "complaint", "escalation"];
  const speed = flows.map((f) => {
    const rs = recent.filter((r) => r.flow === f);
    const latest = rs.slice(0, 5);
    return { f, n: rs.length, median: median(rs.map((r) => r.ms)), latest: median(latest.map((r) => r.ms)) };
  });
  const byFlow = flows.map((f) => {
    const rs = scope.filter((r) => r.flow === f);
    return { f, fetch: sum(rs, (r) => r.pages.fetch), browser: sum(rs, (r) => r.pages.browser) };
  });
  const maxFlow = Math.max(1, ...byFlow.map((x) => x.fetch + x.browser));
  const models = new Map<string, { model: string; where: string; calls: number; tokens: number; data: Set<string> }[]>();
  for (const r of recent.slice(0, 30))
    for (const m of r.models) {
      const list = models.get(m.agent) ?? [];
      const cur = list.find((x) => x.model === m.model);
      if (cur) {
        cur.calls += m.calls;
        cur.tokens += m.tokens;
        m.data.forEach((d) => cur.data.add(d));
      } else list.push({ model: m.model, where: m.where, calls: m.calls, tokens: m.tokens, data: new Set(m.data) });
      models.set(m.agent, list);
    }

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-8 py-12">
      <header className="space-y-3">
        <p className="text-[13px] text-muted">
          <Link className="text-brand hover:underline" href="/">
            Elliot
          </Link>{" "}
          · for judges
        </p>
        <h1 className="display text-[40px] text-ink">How the crew uses the web</h1>
        <p className="max-w-[70ch] text-[15px] leading-6 text-ink-2">
          Fetch first, a search API instead of a search engine, and a real browser only where a page or a job needs one. Every number here comes from the logs of real runs on this machine ({runs.length} in total; the headline counts the latest {scope.length}){places.size ? `, across ${places.size} countr${places.size === 1 ? "y" : "ies"} (${[...places].join(", ")})` : ""}. Nothing is filled in or sent without the patient.
        </p>
      </header>

      {/* The headline numbers */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Headline numbers">
        <Tile big={`${pct(pagesF, pagesF + pagesB)}%`} label="of pages read without a browser" note={`${pagesF.toLocaleString()} plain reads, ${pagesB.toLocaleString()} in the browser`} />
        <Tile big={`${pct(sApi + sCache, sApi + sCache + sBrowser)}%`} label="of searches without a search engine" note={`${sApi} by search API (Linkup), ${sCache} remembered, ${sBrowser} in a browser`} />
        <Tile big={String(jobs.length)} label="browser jobs only a browser can do" note={`checkers answered, registers searched and forms filled, in the ${logged.length} runs with the full log`} />
        <Tile big={firms.length ? `${pct(firms.filter((a) => a.via === "fetch").length, firms.length)}%` : "–"} label="of firm checks done without a browser" note={firms.length ? `${firms.filter((a) => a.via === "fetch").length} of ${firms.length}; the rest needed the browser, and only the browser may rule a firm out` : "No firm checks logged yet"} />
      </section>

      {/* Fetch vs browser, per step */}
      <section className="space-y-4">
        <Title aside={<Legend />}>Fetch first, browser when it matters</Title>
        {avg("fetch") > 0 && avg("browser") > 0 && (
          <p className="text-[14px] text-ink">
            A plain read took <span className="font-medium tabular-nums">{(avg("fetch") / 1000).toFixed(1)} s</span> on average; a page in the browser took <span className="font-medium tabular-nums">{(avg("browser") / 1000).toFixed(1)} s</span>.
          </p>
        )}
        <p className="max-w-[70ch] text-[14px] leading-6 text-ink-2">A plain request reads most official pages and PDFs quickly. When a page is built by scripts, sits behind a bot check or a login, or is a form, the same agent opens a real browser instead. Every quote is checked against the page it came from either way.</p>
        <div className="space-y-3">
          {byFlow.map(({ f, fetch, browser }) => (
            <div key={f} className="grid grid-cols-[10rem_1fr_8rem] items-center gap-4">
              <span className="text-[13px] text-ink-2">{FLOW_NAME[f]}</span>
              <div className="flex h-6 items-stretch gap-[2px]" style={{ width: `${((fetch + browser) / maxFlow) * 100}%`, minWidth: fetch + browser ? 8 : 0 }}>
                {fetch > 0 && <div className="rounded-l-[4px] bg-teal" style={{ flex: fetch }} title={`${FLOW_NAME[f]}: ${fetch} pages read with a plain fetch`} />}
                {browser > 0 && <div className={fetch ? "rounded-r-[4px] bg-brand" : "rounded-[4px] bg-brand"} style={{ flex: browser }} title={`${FLOW_NAME[f]}: ${browser} pages opened in the browser`} />}
              </div>
              <span className="text-right text-[12px] tabular-nums text-muted">
                {fetch} fetch · {browser} browser
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* The crew at work, on one clock */}
      {lanesRun && (
        <section className="space-y-4">
          <Title>
            The crew working at the same time <span className="text-[14px] text-muted">({FLOW_NAME[lanesRun.flow]}{lanesRun.place ? `, ${lanesRun.place}` : ""}, {mins(lanesRun.ms)})</span>
          </Title>
          <p className="max-w-[70ch] text-[14px] leading-6 text-ink-2">Each bar is a stretch of work by one crew member in the latest run. Where bars overlap, they were working at the same time: that is why the whole step takes minutes, not the sum of everyone&apos;s work ({mins(lanesRun.lanes.reduce((n, l) => n + l.spans.reduce((m, [a, b]) => m + (b - a), 0), 0))} of work in {mins(lanesRun.ms)}).</p>
          <div className="space-y-2">
            {lanesRun.lanes.map((l) => (
              <div key={l.crew} className="grid grid-cols-[6rem_1fr] items-center gap-4">
                <span className="flex items-center gap-2 text-[13px] capitalize text-ink-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny static avatar */}
                  <img src={`/crew/${l.crew}-256.png`} alt="" aria-hidden className="size-5 object-contain" />
                  {l.crew}
                </span>
                <div className="relative h-5 rounded-[4px] bg-subtle">
                  {l.spans.map(([a, b], i) => (
                    <div key={i} className="absolute inset-y-0 rounded-[4px] bg-ink-2" style={{ left: `${(a / lanesRun.ms) * 100}%`, width: `max(3px, calc(${((b - a) / lanesRun.ms) * 100}% - 2px))` }} title={`${l.crew}: working from ${mins(a)} to ${mins(b)}`} />
                  ))}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[6rem_1fr] gap-4 text-[11px] text-muted">
              <span />
              <span className="flex justify-between tabular-nums">
                <span>0</span>
                <span>{mins(lanesRun.ms / 2)}</span>
                <span>{mins(lanesRun.ms)}</span>
              </span>
            </div>
          </div>
        </section>
      )}

      {/* The latest run, line by line */}
      {latest && (
        <section className="space-y-4">
          <Title>
            The latest run, line by line <span className="text-[14px] text-muted">({FLOW_NAME[latest.flow]}{latest.place ? `, ${latest.place}` : ""}, {mins(latest.ms)})</span>
          </Title>
          <ol className="divide-y divide-line-soft rounded-card border border-line bg-white">
            {latest.access.map((a, i) => (
              <li key={i} className="grid grid-cols-[4rem_6rem_7rem_1fr] items-baseline gap-3 px-5 py-2 text-[13px]">
                <span className="tabular-nums text-muted">{mins(a.t)}</span>
                <span className="capitalize text-ink-2">{a.agent}</span>
                <span className={a.via === "browser" ? "font-medium text-brand" : a.via === "fetch" ? "font-medium text-teal" : "text-ink-2"}>{a.via === "fetch" ? "Plain fetch" : a.via === "api" ? "Search API" : a.via === "cache" ? "Saved search" : "Browser"}</span>
                <span className="min-w-0 break-words text-ink">
                  {a.kind === "search" ? `Searched "${a.url}"` : a.url ? a.url.replace(/^https?:\/\/(www\.)?/, "") : ""}
                  <span className="text-muted"> · {a.reason}{typeof a.ms === "number" ? ` · ${(a.ms / 1000).toFixed(1)} s` : ""}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Why the browser */}
      <section className="space-y-4">
        <Title>Why the browser was needed</Title>
        {reasons.length ? (
          <table className="w-full text-left text-[14px]">
            <thead className="text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 font-normal">Reason</th>
                <th className="py-2 font-normal">What it was</th>
                <th className="py-2 text-right font-normal">Times</th>
                <th className="py-2 pl-6 font-normal">For example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {reasons.map((r) => (
                <tr key={r.kind + r.reason}>
                  <td className="py-2.5 pr-4 text-ink">{r.reason.replace(/^./, (c) => c.toUpperCase())}</td>
                  <td className="py-2.5 pr-4 text-ink-2">{r.kind === "task" ? "A job only a browser can do" : r.kind === "firm" ? "A firm's website" : r.kind === "search" ? "A search" : "A page"}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink">{r.n}</td>
                  <td className="py-2.5 pl-6 text-[13px] text-muted">{r.examples.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[14px] text-muted">The reasons appear once a run with the access log has finished.</p>
        )}
      </section>

      {/* Speed */}
      <section className="space-y-4">
        <Title>How long each step takes</Title>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {speed.map((s) => (
            <Tile key={s.f} big={s.n ? mins(s.latest) : "–"} label={FLOW_NAME[s.f]} note={s.n ? `typical of the last ${Math.min(5, s.n)} runs (all ${s.n} runs: ${mins(s.median)}), including time waiting for the patient's answers` : "No finished runs yet"} />
          ))}
        </div>
      </section>

      {/* Why a crew */}
      <section className="space-y-4">
        <Title>Why a crew of specialists, not one agent</Title>
        <p className="max-w-[70ch] text-[14px] leading-6 text-ink-2">Each crew member has its own tools, its own browser tabs and its own model, and sees only the data its job needs. They work at the same time: Iona reads guidance in the background while Robin checks firms side by side and Kit fills several forms at once. Elliot plans and changes the plan when something is learned.</p>
        <table className="w-full text-left text-[14px]">
          <thead className="text-[12px] text-muted">
            <tr className="border-b border-line">
              <th className="py-2 font-normal">Who</th>
              <th className="py-2 font-normal">Job</th>
              <th className="py-2 font-normal">Why separate</th>
              <th className="py-2 font-normal">Model, calls (last 30 runs)</th>
              <th className="py-2 font-normal">Sees</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft align-top">
            {CREW.map((c) => {
              const ms = models.get(c.id) ?? [];
              const sees = [...new Set(ms.flatMap((m) => [...m.data]))];
              return (
                <tr key={c.id}>
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static avatar */}
                      <img src={`/crew/${c.id}-256.png`} alt="" aria-hidden className="size-7 object-contain" />
                      {c.name}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-ink-2">{c.job}</td>
                  <td className="py-3 pr-4 text-ink-2">{c.why}</td>
                  <td className="py-3 pr-4 text-[13px] text-ink-2">{ms.length ? ms.map((m) => `${m.model} (${m.where === "local" ? "on this Mac" : "cloud"}), ${m.calls} calls`).join("; ") : "–"}</td>
                  <td className="py-3 text-[13px] text-ink-2">{sees.length ? sees.join(", ") : "none of your details"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* The runs */}
      <section className="space-y-4">
        <Title>The runs behind these numbers</Title>
        <table className="w-full text-left text-[13px]">
          <thead className="text-[12px] text-muted">
            <tr className="border-b border-line">
              <th className="py-2 font-normal">When</th>
              <th className="py-2 font-normal">Step</th>
              <th className="py-2 font-normal">Place</th>
              <th className="py-2 text-right font-normal">Time</th>
              <th className="py-2 text-right font-normal">Pages: fetch / browser</th>
              <th className="py-2 text-right font-normal">Searches: API / saved / browser</th>
              <th className="py-2 text-right font-normal">Browser jobs</th>
              <th className="py-2 text-right font-normal">Questions to you</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft tabular-nums">
            {runs.slice(0, 40).map((r) => (
              <tr key={r.id}>
                <td className="py-2 text-muted">{r.startedAt.replace("T", " ").slice(0, 16)}</td>
                <td className="py-2 text-ink">{FLOW_NAME[r.flow]}</td>
                <td className="py-2 text-ink-2">{r.place || "–"}</td>
                <td className="py-2 text-right text-ink">
                  {mins(r.ms)}
                  {!r.finished && <span className="text-muted"> (stopped)</span>}
                </td>
                <td className="py-2 text-right text-ink-2">
                  {r.pages.fetch} / {r.pages.browser}
                </td>
                <td className="py-2 text-right text-ink-2">
                  {r.searches.api} / {r.searches.cache} / {r.searches.browser}
                </td>
                <td className="py-2 text-right text-ink-2">{r.access.length ? r.jobs : "–"}</td>
                <td className="py-2 text-right text-ink-2">{r.asks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Tile({ big, label, note }: { big: string; label: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-white px-5 py-4">
      <p className="display text-[34px] leading-none text-ink tabular-nums">{big}</p>
      <p className="mt-2 text-[14px] font-medium text-ink">{label}</p>
      <p className="mt-1 text-[12px] leading-5 text-muted">{note}</p>
    </div>
  );
}

function Title({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-line pb-2">
      <h2 className="display text-[22px] text-ink">{children}</h2>
      {aside}
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-4 text-[12px] text-ink-2">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block size-2.5 rounded-[2px] bg-teal" /> Plain fetch, no browser
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block size-2.5 rounded-[2px] bg-brand" /> Real browser
      </span>
    </span>
  );
}
