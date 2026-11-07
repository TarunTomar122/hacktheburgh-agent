"use client";

import { useState, type ReactNode } from "react";
import { EMPTY_FUNDING, fundingMissing, type AgentTile, type Funding, type Stats, type TraceStep } from "../../lib/agent/legalAidTypes";
import { setLegalAid, type Profile } from "../../lib/profile";
import { Button, control, cx, Eyebrow, PageTitle } from "../ui";
import AskMissing from "./AskMissing";
import { fixtureMode, runStep3 } from "./legalAidRun";
import FirmResults from "./FirmResults";
import { StatsLine } from "./scoreParts";

/**
 * Step 3 (D36): "Can I get legal aid?" plus "who could take my case".
 * D33: one sentence and one button. Only the calculator's money questions are asked, here, one at a time, and only if missing.
 */
export default function LegalAidStep({ profile, onContinue }: { profile: Profile; onContinue: () => void }) {
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

  const changeAnswers = (
    <button className="text-brand underline underline-offset-2" onClick={() => setLegalAid({ funding: EMPTY_FUNDING, result: null })}>
      Change them
    </button>
  );

  // With results on screen, the header shrinks to one row so the results start high up (progressive disclosure).
  if (saved && !running) {
    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Compensation · step 1</Eyebrow>
            <h1 className="display mt-2 text-[32px] text-ink">Can I get legal aid?</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            <span>
              {funding.skipped ? "You chose not to share money details. " : "Using your money answers. "}
              {changeAnswers}
            </span>
            <Button variant="secondary" size="sm" onClick={run}>
              Check again
            </Button>
          </div>
        </header>
        {error && <p className="text-sm text-danger">{error}</p>}
        <FirmResults
          result={saved}
          sample={profile.legalAid?.sample === true}
          selected={profile.legalAid?.selected ?? []}
          onSelected={(ids) => setLegalAid({ selected: ids })}
          onContinue={onContinue}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Compensation · step 1" title="Can I get legal aid?" lede={lede} />

      <AskMissing profile={profile} why="The lawyer search needs this, and it was not covered when we first talked." />

      {missing.length > 0 ? (
        <FundingAsk funding={funding} next={missing[0]} />
      ) : (
        <div className="space-y-3">
          <Button onClick={run} disabled={running}>
            {running ? "Checking…" : "Check legal aid and find lawyers"}
          </Button>
          {!running && (
            <p className="text-xs text-muted">
              {funding.skipped ? "You chose not to share money details. " : "Using your money answers. "}
              {changeAnswers}
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {(running || (tiles.length > 0 && !saved)) && <AgentsPanel tiles={tiles} stats={stats} status={status} live={live} />}

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

export function AgentsPanel({ tiles, stats, status, live }: { tiles: AgentTile[]; stats: Stats | null; status: string | null; live: TraceStep[] }) {
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
            <span className="w-44 shrink-0 font-medium text-ink">{t.label}</span>
            <span className="min-w-0 flex-1 text-ink-2">{t.note}</span>
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
              <span className="min-w-0">{s.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ results */
