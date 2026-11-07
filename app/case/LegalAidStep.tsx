"use client";

import { useState, type ReactNode } from "react";
import { EMPTY_FUNDING, fundingMissing, type AgentTile, type FirmFinding, type Funding, type ScoreItem, type Stats, type Step3Result, type TraceStep } from "../../lib/agent/legalAidTypes";
import { setLegalAid, type Profile } from "../../lib/profile";
import { Button, Callout, control, cx, Eyebrow, PageTitle, SectionTitle } from "../ui";
import AskMissing from "./AskMissing";
import { fixtureMode, runStep3 } from "./legalAidRun";
import TraceSheet, { type TraceScope } from "./TraceSheet";

/**
 * Step 3 (D36): "Can I get legal aid?" plus "who could take my case".
 * D33: one sentence and one button. Only the calculator's money questions are asked, here, one at a time, and only if missing.
 */
export default function LegalAidStep({ profile }: { profile: Profile }) {
  const funding = profile.legalAid?.funding ?? EMPTY_FUNDING;
  const saved = profile.legalAid?.result;
  const missing = fundingMissing(funding);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiles, setTiles] = useState<AgentTile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [live, setLive] = useState<TraceStep[]>([]);

  async function run() {
    setRunning(true);
    setError(null);
    setTiles([]);
    setStats(null);
    setStatus(null);
    setLive([]);
    setLegalAid({ result: null });
    try {
      const sample = fixtureMode();
      const result = await runStep3({ facts: profile.facts, funding }, (e) => {
        if (e.type === "agent") setTiles((ts) => (ts.some((t) => t.id === e.tile.id) ? ts.map((t) => (t.id === e.tile.id ? e.tile : t)) : [...ts, e.tile]));
        else if (e.type === "stats") setStats(e.stats);
        else if (e.type === "status") setStatus(e.message);
        else if (e.type === "trace") setLive((l) => [...l.slice(-5), e.step]);
      });
      setLegalAid({ result, sample });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const lede = funding.skipped
    ? "We look for lawyers who take this kind of case and may work on a no win no fee basis, on several sites at once."
    : "We check the Scottish Legal Aid Board's calculator with your answers and look for lawyers who take this kind of case, on several sites at once.";

  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Step 3" title="Can I get legal aid?" lede={lede} />

      <AskMissing profile={profile} why="The lawyer search needs this, and it was not covered when we first talked." />

      {missing.length > 0 ? (
        <FundingAsk funding={funding} next={missing[0]} />
      ) : (
        <div className="space-y-3">
          <Button onClick={run} disabled={running}>
            {running ? "Checking…" : saved ? "Check again" : "Check legal aid and find lawyers"}
          </Button>
          {!running && (
            <p className="text-xs text-muted">
              {funding.skipped ? "You chose not to share money details. " : "Using your money answers. "}
              <button className="text-brand underline underline-offset-2" onClick={() => setLegalAid({ funding: EMPTY_FUNDING, result: null })}>
                Change them
              </button>
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {(running || (tiles.length > 0 && !saved)) && <AgentsPanel tiles={tiles} stats={stats} status={status} live={live} />}
      {saved && !running && <Results result={saved} sample={profile.legalAid?.sample === true} />}
    </div>
  );
}

/* ------------------------------------------------------------------ questions */

const BENEFITS = ["Income Support", "income-based Jobseeker's Allowance", "income-related Employment and Support Allowance", "Universal Credit"];

/** The next money question, in the calculator's order (fundingMissing). Income, outgoings and savings are asked together. */
function FundingAsk({ funding, next }: { funding: Funding; next: keyof Funding }) {
  const set = (patch: Partial<Funding>) => setLegalAid({ funding: patch });
  let body: ReactNode;
  let question: string;

  if (next === "onBenefits") {
    question = "Do you get any of these benefits?";
    body = (
      <>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-2">
          {BENEFITS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <YesNo onPick={(v) => set({ onBenefits: v })} />
      </>
    );
  } else if (next === "partner") {
    question = "Do you live with a partner?";
    body = <YesNo onPick={(v) => set({ partner: v })} />;
  } else if (next === "dependants") {
    question = "How many people depend on you for money, such as children?";
    body = <Dependants onPick={(n) => set({ dependants: n })} />;
  } else {
    question = "Roughly how much money comes in and goes out each year?";
    body = <MoneyForm funding={funding} onDone={set} />;
  }

  return (
    <section className="overflow-hidden rounded-card border border-brand/30 bg-white">
      <div className="space-y-1 bg-brand-soft/60 px-6 py-4">
        <Eyebrow className="text-brand">The legal aid calculator asks</Eyebrow>
        <p className="text-[15px] leading-6 text-ink">{question}</p>
        <p className="text-xs text-muted">Only for the calculator. We do not send these figures to any lawyer.</p>
      </div>
      <div className="space-y-4 p-6">
        {body}
        <button className="text-xs text-muted underline underline-offset-2 hover:text-ink" onClick={() => set({ skipped: true })}>
          Skip, I&apos;d rather not say (we will look for no win no fee lawyers instead)
        </button>
      </div>
    </section>
  );
}

function YesNo({ onPick }: { onPick: (v: boolean) => void }) {
  return (
    <div role="group" aria-label="Choose one" className="flex gap-2">
      <button type="button" className="btn-ghost !px-5 !py-2" onClick={() => onPick(true)}>
        Yes
      </button>
      <button type="button" className="btn-ghost !px-5 !py-2" onClick={() => onPick(false)}>
        No
      </button>
    </div>
  );
}

function Dependants({ onPick }: { onPick: (n: number) => void }) {
  return (
    <div role="group" aria-label="Number of dependants" className="flex flex-wrap gap-2">
      {Array.from({ length: 11 }, (_, n) => (
        <button key={n} type="button" className="btn-ghost !min-w-11 !px-3 !py-2" onClick={() => onPick(n)}>
          {n === 10 ? "10+" : n}
        </button>
      ))}
    </div>
  );
}

const pounds = (s: string) => {
  const n = Number(s.replace(/[£,\s]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

function MoneyForm({ funding, onDone }: { funding: Funding; onDone: (p: Partial<Funding>) => void }) {
  const fields = [
    { key: "netIncomeYearly" as const, label: "Income per year, after tax", hint: "Wages, benefits and anything else that comes in." },
    { key: "outgoingsYearly" as const, label: "Outgoings per year", hint: "Rent or mortgage, council tax, childcare and similar." },
    { key: "savings" as const, label: "Savings", hint: "Money in the bank and anything else you could use." },
  ].filter((f) => funding[f.key] === null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const parsed = Object.fromEntries(fields.map((f) => [f.key, pounds(vals[f.key] ?? "")]));
  const ok = fields.every((f) => parsed[f.key] !== null);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onDone(parsed as Partial<Funding>);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="block space-y-1.5">
            <span className="eyebrow block">{f.label}</span>
            <span className="relative block">
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                £
              </span>
              <input className={control + " pl-7"} inputMode="decimal" placeholder="0" value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            </span>
            <span className="block text-xs text-muted">{f.hint}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">A rough figure is fine.</p>
      <Button size="sm" type="submit" disabled={!ok}>
        Continue
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ while running */

const STATE: Record<AgentTile["state"], { text: string; cls: string }> = {
  starting: { text: "Starting", cls: "bg-subtle text-muted" },
  working: { text: "Working", cls: "bg-brand-soft text-brand" },
  done: { text: "Done", cls: "bg-teal-soft text-teal" },
  failed: { text: "Failed", cls: "bg-danger-soft text-danger" },
};

export function StatsLine({ stats }: { stats: Stats }) {
  return (
    <div className="text-xs tabular-nums text-muted">
      {stats.agents} agents · {stats.sites} sites · {stats.pages} pages · {stats.actions} actions
    </div>
  );
}

function AgentsPanel({ tiles, stats, status, live }: { tiles: AgentTile[]; stats: Stats | null; status: string | null; live: TraceStep[] }) {
  return (
    <section className="space-y-3" aria-live="polite">
      <div className="flex items-end justify-between gap-4">
        <Eyebrow>Agents at work</Eyebrow>
        {stats && <StatsLine stats={stats} />}
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}
      <ul className="divide-y divide-line-soft rounded-card border border-line bg-white">
        {tiles.length === 0 && <li className="px-5 py-3 text-sm text-muted">Starting the agents…</li>}
        {tiles.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
            <span className="w-44 shrink-0 truncate font-medium text-ink">{t.label}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{t.note}</span>
            <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATE[t.state].cls)}>{STATE[t.state].text}</span>
          </li>
        ))}
      </ul>
      {live.length > 0 && (
        <ol aria-label="Latest steps" className="space-y-1">
          {live.map((s) => (
            <li key={s.i} className="flex items-center gap-2 text-[12px] text-ink-2">
              <span aria-hidden className="h-2.5 w-1 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="shrink-0 font-medium" style={{ color: s.color }}>
                {s.agent}
              </span>
              <span className="truncate">{s.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ results */

const VERDICT: Record<Step3Result["verdict"], { tone: "ok" | "warn" | "info"; title: string; body: string }> = {
  likely: { tone: "ok", title: "You may qualify financially for legal aid.", body: "A solicitor applies for you, and SLAB also checks the case has merit." },
  unlikely: { tone: "warn", title: "You may not qualify financially for legal aid.", body: "Some lawyers take cases like this on a no win no fee basis, so we looked for those." },
  unknown: { tone: "info", title: "We could not get an answer from the calculator.", body: "A solicitor can check whether you qualify when you talk to them." },
  skipped: { tone: "info", title: "You chose not to share money details.", body: "So we looked for lawyers who may work on a no win no fee basis." },
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Badge({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}

/** "How well this firm fits what you need" (D39). A fit, never a chance of winning. */
function FitRing({ fit }: { fit: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[60px] shrink-0" title="How well this firm fits what you need, from the checks below. Not a chance of winning.">
      <svg viewBox="0 0 56 56" className="size-full -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-line-soft)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(fit / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[15px] font-medium tabular-nums text-ink">{fit}%</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-muted">fit</span>
      </div>
    </div>
  );
}

const BAR: Record<ScoreItem["status"], string> = { yes: "bg-teal", no: "bg-danger/60", unknown: "bg-fade" };
const MARK: Record<ScoreItem["status"], { t: string; cls: string }> = {
  yes: { t: "✓", cls: "text-teal" },
  no: { t: "✕", cls: "text-danger" },
  unknown: { t: "?", cls: "text-muted" },
};

/** One criterion: label, a small bar (points out of max, coloured by what we found), and the evidence when opened. */
function ScoreRow({ row }: { row: ScoreItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button onClick={() => setOpen((o) => !o)} title={row.evidence} aria-expanded={open} className="grid w-full grid-cols-[14px_1fr_96px_44px] items-center gap-2 py-1 text-left text-[13px] hover:bg-subtle">
        <span aria-hidden className={cx("text-center text-[12px]", MARK[row.status].cls)}>{MARK[row.status].t}</span>
        <span className="truncate text-ink-2">{row.label}</span>
        <span className="h-1.5 overflow-hidden rounded-full bg-line-soft">
          <span className={cx("block h-full rounded-full", BAR[row.status])} style={{ width: `${row.max ? (row.points / row.max) * 100 : 0}%` }} />
        </span>
        <span className="text-right text-[11px] tabular-nums text-muted">
          {row.points}/{row.max}
        </span>
      </button>
      {open && <p className="mb-1.5 ml-[22px] rounded bg-subtle px-3 py-2 text-[12px] leading-5 text-ink-2">{row.evidence}</p>}
    </li>
  );
}

function FirmCard({ firm, rank, onTrace }: { firm: FirmFinding; rank: number; onTrace?: () => void }) {
  return (
    <article className="rounded-card border border-line bg-white p-6">
      <div className="flex items-start gap-4">
        {firm.fit !== undefined && <FitRing fit={firm.fit} />}
        <div className="min-w-0 flex-1">
          <Eyebrow>Option {rank}</Eyebrow>
          <h3 className="mt-1 text-[17px] font-medium leading-6 text-ink">{firm.name}</h3>
          <p className="text-sm text-muted">
            {firm.town}
            {firm.distanceMiles !== null && ` · ${firm.distanceMiles < 10 ? firm.distanceMiles.toFixed(1) : Math.round(firm.distanceMiles)} miles away`}
          </p>
        </div>
        {firm.website && (
          <a href={firm.website} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-brand underline-offset-2 hover:underline">
            {host(firm.website)} ↗
          </a>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {firm.legalAid && <Badge cls="bg-brand-soft text-brand">Takes legal aid</Badge>}
        {firm.noWinNoFee === "yes" && <Badge cls="bg-teal-soft text-teal">No win no fee</Badge>}
        {firm.actsForPatients === "yes" && <Badge cls="bg-subtle text-ink-2">Acts for patients</Badge>}
      </div>
      {firm.breakdown && firm.breakdown.length > 0 ? (
        <ul className="mt-4 border-t border-line-soft pt-3" aria-label="How the score is made up">
          {firm.breakdown.map((r) => (
            <ScoreRow key={r.key} row={r} />
          ))}
        </ul>
      ) : (
        firm.reasons.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {firm.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-sm text-ink-2">
                <span aria-hidden className="text-teal">✓</span>
                {r}
              </li>
            ))}
          </ul>
        )
      )}
      {onTrace && (
        <button onClick={onTrace} className="mt-4 text-sm font-medium text-brand underline-offset-2 hover:underline">
          See how we found them →
        </button>
      )}
    </article>
  );
}

const CALCULATOR = "SLAB calculator";

function Results({ result, sample }: { result: Step3Result; sample: boolean }) {
  const v = VERDICT[result.verdict];
  const trace: TraceStep[] = result.trace ?? [];
  const [scope, setScope] = useState<TraceScope | null>(null);
  const firmScope = (f: FirmFinding): TraceScope => ({ title: f.name, subtitle: f.excluded ? `Left out: ${f.excluded}` : undefined, steps: trace.filter((s) => s.firms?.includes(f.id)) });
  const top = result.shortlist.map((id) => result.firms.find((f) => f.id === id)).filter((f): f is FirmFinding => !!f);
  const rest = result.firms.filter((f) => !result.shortlist.includes(f.id));
  return (
    <div className="space-y-8">
      {sample && (
        <Callout tone="warn" title="Sample data, not a real result.">
          This was played back from test data to show the layout. The firms are real names, but the scores and details are made up.
        </Callout>
      )}

      <Callout tone={v.tone} title={v.title}>
        <p>{v.body}</p>
        {result.calculatorText && result.verdict !== "skipped" && (
          <blockquote className="mt-3 border-l-2 border-line pl-3 font-serif text-[15px] leading-6 text-ink">
            &ldquo;{result.calculatorText}&rdquo;
            <span className="mt-1 block font-sans text-xs text-muted">SLAB&apos;s calculator</span>
          </blockquote>
        )}
        <p className="mt-3 text-xs text-muted">
          Most likely way to pay: <span className="font-medium text-ink">{result.route === "legal_aid" ? "legal aid" : "no win no fee"}</span>
        </p>
        {trace.some((s) => s.agent === CALCULATOR) && (
          <button
            onClick={() => setScope({ title: "The legal aid calculator", subtitle: "What we typed into SLAB's calculator and what it said.", steps: trace.filter((s) => s.agent === CALCULATOR) })}
            className="mt-2 text-xs font-medium text-brand underline-offset-2 hover:underline"
          >
            See how we checked →
          </button>
        )}
      </Callout>

      <section className="space-y-4">
        <SectionTitle>Lawyers who could take your case</SectionTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatsLine stats={result.stats} />
          {trace.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setScope({ title: "The whole run", subtitle: `${trace.length} steps by ${new Set(trace.map((s) => s.agent)).size} agents, in time order.`, steps: trace, whole: true })}>
              See the whole run
            </Button>
          )}
        </div>
        {top.length === 0 ? (
          <p className="text-sm text-ink-2">We did not find a firm we could recommend. A solicitor search on the Law Society of Scotland site is the next place to look.</p>
        ) : (
          <div className="space-y-3">
            {top.map((f, i) => (
              <FirmCard key={f.id} firm={f} rank={i + 1} onTrace={trace.length ? () => setScope(firmScope(f)) : undefined} />
            ))}
          </div>
        )}
      </section>

      {rest.length > 0 && (
        <details className="group rounded-card border border-line">
          <summary className="cursor-pointer list-none px-6 py-4 text-sm font-medium text-brand">
            We also checked {rest.length} other {rest.length === 1 ? "firm" : "firms"}
          </summary>
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {rest.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-4 px-6 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-ink">
                    {f.name}
                    {f.fit !== undefined && <span className="ml-2 text-xs font-normal tabular-nums text-muted">{f.fit}% fit</span>}
                  </div>
                  <div className="text-ink-2">{f.excluded ? `Left out: ${f.excluded}` : `Lower on the list${f.reasons.length ? `: ${f.reasons.join(", ")}` : ""}`}</div>
                </div>
                {trace.some((s) => s.firms?.includes(f.id)) && (
                  <button onClick={() => setScope(firmScope(f))} className="shrink-0 text-xs font-medium text-brand underline-offset-2 hover:underline">
                    How we checked
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {scope && <TraceSheet scope={scope} runId={result.runId} onClose={() => setScope(null)} />}
    </div>
  );
}
