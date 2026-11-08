"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CREW, type CrewId } from "../../lib/agent/plannerTypes";
import type { RouteMap, RouteStep } from "../../lib/agent/routeTypes";
import { trustOf } from "../../lib/agent/routeTypes";
import { getPersona } from "../../lib/personas";
import { cx } from "../ui";
import { CrewMark } from "../case/crew/Crew";
import { usePlannerRun } from "../case/usePlannerRun";

/**
 * One story, four countries (for judges): the same missed-fracture story, researched and then prepared live in four places,
 * side by side. Nothing about any country is in the app: each column is the ordinary crew run for a fictional patient whose
 * only difference is where it happened. "Play the recorded runs" plays four real past runs at speed (safe on stage);
 * "Run it live" starts eight real runs (research, then the case) with fictional money answers so nothing waits for anyone.
 * Separate from the patient's own case: its own run slots, no profile.
 */

type Col = { key: string; persona: string; place: string; flag: string; label: string };
const COLS: Col[] = [
  { key: "scotland", persona: "scotland-ailsa-wrist", place: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", label: "Edinburgh, Scotland" },
  { key: "ireland", persona: "ireland-aoife-wrist", place: "Ireland", flag: "🇮🇪", label: "Dublin, Ireland" },
  { key: "nz", persona: "nz-aroha-wrist", place: "New Zealand", flag: "🇳🇿", label: "Auckland, New Zealand" },
  { key: "california", persona: "us-ca-maya-wrist", place: "California", flag: "🇺🇸", label: "San Francisco, California" },
];
/** Fictional money answers for live runs, so each place's own legal-aid checker is answered without anyone at the keyboard. */
const DEMO_FUNDING = { onBenefits: false, partner: false, dependants: 0, netIncomeYearly: 14000, outgoingsYearly: 6000, savings: 1000, skipped: false };

type Mode = "idle" | "recorded" | "live";

export default function Compare() {
  const [mode, setMode] = useState<Mode>("idle");
  const [go, setGo] = useState(0); // bumps to start every column at once
  const [t0, setT0] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState<Record<string, number>>({});
  useEffect(() => {
    if (t0 === null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [t0]);
  const all = COLS.every((c) => done[c.key]);
  const elapsed = t0 === null ? 0 : (all ? Math.max(...Object.values(done)) : now || t0) - t0;
  const start = (m: Mode) => {
    setMode(m);
    setDone({});
    setT0(Date.now());
    setNow(Date.now());
    setGo((g) => g + 1);
  };
  const [answers, setAnswers] = useState<Record<string, ColumnAnswers>>({});

  return (
    <main className="mx-auto max-w-[1400px] space-y-10 px-6 py-10 sm:px-10">
      <header className="space-y-4">
        <p className="text-xs text-muted">
          <Link href="/insights" className="font-medium text-brand hover:underline">
            Elliot / for judges
          </Link>
        </p>
        <h1 className="display text-5xl text-ink">One story. Four countries.</h1>
        <p className="max-w-2xl text-base leading-7 text-ink-2">The same missed wrist fracture, worked out from scratch in four places. Nothing about any country is built in: each crew finds that place&apos;s own system, then prepares the case there.</p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button onClick={() => start("recorded")} className="btn-primary !px-6 !py-2.5">
            Play the recorded runs
          </button>
          <button onClick={() => start("live")} className="btn-ghost !px-6 !py-2.5">
            Run it live
          </button>
          {t0 !== null && (
            <span className="ml-2 text-sm tabular-nums text-ink-2">
              {mode === "recorded" ? "Recorded runs, played fast" : "Live"} · {Math.floor(elapsed / 60000)}:{String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}
              {all ? " · all four done" : ""}
            </span>
          )}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Four countries">
        {COLS.map((c) => (
          <Column key={c.key} col={c} mode={mode} go={go} onDone={() => setDone((d) => (d[c.key] ? d : { ...d, [c.key]: Date.now() }))} onAnswers={(a) => setAnswers((x) => ({ ...x, [c.key]: a }))} />
        ))}
      </section>

      {Object.keys(answers).length > 0 && <Differences answers={answers} />}

      <footer className="border-t border-line pt-5 text-xs text-muted">Fictional patients. Nothing is sent: every enquiry form is filled and stopped before Send.</footer>
    </main>
  );
}

/** What a column found, in one short line per row, for the comparison at the bottom. */
type ColumnAnswers = Partial<Record<"complain" | "compensation" | "funding" | "limit" | "checker" | "lawyers" | "enquiries", string>>;

const short = (s?: RouteStep) => s?.takeaway?.headline || s?.body || "";
const deadlineOf = (r?: RouteMap) => {
  const s = r?.steps.find((x) => x.kind === "compensation" && x.deadline) ?? r?.steps.find((x) => x.kind === "complaint" && x.deadline);
  return s?.deadline ? `${s.deadline} (${s.kind === "compensation" ? "to claim" : "to complain"})` : "";
};

function Column({ col, mode, go, onDone, onAnswers }: { col: Col; mode: Mode; go: number; onDone: () => void; onAnswers: (a: ColumnAnswers) => void }) {
  const research = usePlannerRun({ scope: "compare", caseId: `${col.key}-research` });
  const kase = usePlannerRun({ scope: "compare", caseId: `${col.key}-case` });
  const persona = getPersona(col.persona);
  const started = useRef(0);
  const caseStarted = useRef(0);

  // Start: research first (recorded or live).
  useEffect(() => {
    if (!go || started.current === go || !persona) return;
    started.current = go;
    caseStarted.current = 0;
    if (mode === "recorded") void research.replay({ flow: "discovery", place: col.place });
    else if (mode === "live") void research.start(persona.facts, undefined, "discovery");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one start per press
  }, [go]);
  // Then the case, as soon as the research has its route.
  const route = research.state.discovery?.route ?? (research.state.status === "done" ? research.state.route : undefined);
  useEffect(() => {
    if (!go || caseStarted.current === go || research.state.status !== "done" || !route || !persona) return;
    caseStarted.current = go;
    if (mode === "recorded") void kase.replay({ place: col.place });
    else void kase.start(persona.facts, DEMO_FUNDING, "compensation_anywhere", route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, research.state.status, route]);
  // Live runs never wait for a person: any question is skipped after a moment (the checker already has its money answers).
  const ask = kase.state.asks[0] ?? research.state.asks[0];
  useEffect(() => {
    if (mode !== "live" || !ask) return;
    const t = setTimeout(() => void (kase.state.asks[0] ? kase.answer(ask.id, null) : research.answer(ask.id, null)), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask?.id, mode]);

  const result = kase.state.result;
  const caseDone = kase.state.status === "done" || kase.state.status === "error";
  useEffect(() => {
    if (caseDone) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseDone]);

  const r = research.state.route ?? research.state.discovery?.route;
  const step = (k: RouteStep["kind"]) => r?.steps.find((s) => s.kind === k);
  const firms = result?.firms ?? kase.state.firms;
  const checked = firms.filter((f) => f.sources?.includes("website"));
  const outs = result?.enquiries ?? kase.state.enquiries;
  const filled = outs.filter((o) => o.status === "ready_to_send");
  const verdict = result?.verdict;
  const checker = verdict === "likely" ? "Legal aid looks likely" : verdict === "unlikely" ? "Legal aid looks unlikely" : verdict ? "No clear estimate from the checker" : "";
  const shortlist = result ? result.shortlist.map((id) => result.firms.find((f) => f.id === id)?.name).filter(Boolean).join(", ") : "";

  const answers: ColumnAnswers = {
    complain: step("complaint")?.body,
    compensation: short(step("compensation")),
    funding: short(step("funding")),
    limit: deadlineOf(r),
    checker,
    lawyers: checked.length ? `${checked.length} checked${shortlist ? `: ${shortlist}` : ""}` : "",
    enquiries: outs.length ? `${filled.length} of ${outs.length} filled` : "",
  };
  const key = JSON.stringify(answers);
  useEffect(() => {
    onAnswers(answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const phase = research.state.status === "idle" ? "Waiting to start" : research.state.status === "running" ? "Researching" : kase.state.status === "running" ? "Preparing the case" : kase.state.status === "error" ? "The case stopped" : caseDone ? "Done" : research.state.status === "error" ? "Research stopped" : "Researched";
  const crewOf = (s: typeof research.state) => (["elliot", "robin", "iona", "nell", "kit"] as CrewId[]).map((id) => ({ id, state: s.crew[id]?.state }));
  const live = kase.state.status !== "idle" ? kase.state : research.state;

  return (
    <article className="flex flex-col rounded-card border border-line bg-white">
      <header className="border-b border-line-soft px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none" aria-hidden>
            {col.flag}
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-ink">{col.label}</h2>
            <p className={cx("text-xs", phase === "Done" ? "text-teal" : phase === "Waiting to start" ? "text-muted" : "text-brand")}>{phase}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5" aria-label="The crew">
          {crewOf(live).map((m) => (
            <span key={m.id} title={`${CREW[m.id].name}: ${m.state ?? "idle"}`} className={cx("transition-opacity", m.state === "working" ? "opacity-100" : m.state === "done" ? "opacity-70" : "opacity-30")}>
              <CrewMark id={m.id} size={26} />
            </span>
          ))}
        </div>
      </header>
      <ol className="divide-y divide-line-soft">
        <Group title="Research" />
        <Row label="Complain to" value={step("complaint")?.body} step={step("complaint")} settled={research.state.status === "done"} />
        <Row label="If that fails" value={step("escalation")?.body} step={step("escalation")} settled={research.state.status === "done"} />
        <Row label="Compensation" value={short(step("compensation"))} step={step("compensation")} settled={research.state.status === "done"} />
        <Row label="Paying for help" value={short(step("funding"))} step={step("funding")} settled={research.state.status === "done"} />
        <Row label="Time limit" value={deadlineOf(r)} settled={research.state.status === "done"} />
        <Group title="The case" />
        <Row label="Legal aid checker" value={checker} sub={result?.calculatorText} settled={caseDone} />
        <Row label="Solicitors" value={checked.length ? `${checked.length} checked on their own sites` : ""} sub={shortlist ? `Shortlist: ${shortlist}` : undefined} settled={caseDone} />
        <Row label="Enquiries" value={outs.length ? `${filled.length} of ${outs.length} forms filled, stopped before Send` : ""} settled={caseDone} />
      </ol>
    </article>
  );
}

function Group({ title }: { title: string }) {
  return <li className="bg-subtle px-5 py-1.5 text-[13px] text-muted">{title}</li>;
}

function Row({ label, value, sub, step, settled }: { label: string; value?: string; sub?: string; step?: RouteStep; /** the run for this row has finished: an empty row is "not found", not "still looking" */ settled?: boolean }) {
  const [open, setOpen] = useState(false);
  const quote = step?.sources.find((s) => s.checked);
  const trust = step ? trustOf(step) : null;
  return (
    <li>
      <button className="w-full px-5 py-3 text-left enabled:hover:bg-subtle/40 disabled:cursor-default" disabled={!value || (!quote && !sub)} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="block text-[11px] text-muted">{label}</span>
        {value ? (
          <span key={value} className="rise mt-0.5 block text-[14px] leading-5 text-ink">
            {value}
            {trust && <span className="ml-2 rounded-[4px] bg-subtle px-1.5 py-0.5 text-[11px] text-ink-2">{trust.label}</span>}
          </span>
        ) : settled ? (
          <span className="mt-0.5 block text-[13px] leading-5 text-faint">Not found in this run</span>
        ) : (
          <span className="mt-1 block h-3 w-2/3 animate-pulse rounded bg-line-soft" aria-label="Not found yet" />
        )}
      </button>
      {open && (
        <div className="rise space-y-2 px-5 pb-4">
          {sub && <p className="text-[13px] leading-5 text-ink-2">{sub}</p>}
          {quote && (
            <p className="border-l-2 border-line pl-3 font-serif text-[14px] leading-6 text-ink">
              &ldquo;{quote.quote}&rdquo;{" "}
              <a className="font-sans text-[12px] text-brand hover:underline" href={quote.url} target="_blank" rel="noreferrer">
                {quote.publisher || new URL(quote.url).hostname.replace(/^www\./, "")} ↗
              </a>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** The differences, read across: each place's own answer side by side, straight from the runs. */
function Differences({ answers }: { answers: Record<string, ColumnAnswers> }) {
  const rows: { key: keyof ColumnAnswers; label: string }[] = [
    { key: "complain", label: "Complain to" },
    { key: "compensation", label: "Compensation" },
    { key: "limit", label: "Time limit" },
    { key: "checker", label: "Legal aid checker" },
    { key: "enquiries", label: "Enquiries" },
  ];
  return (
    <section className="space-y-3" aria-label="The differences">
      <h2 className="display text-3xl text-ink">Same story, four different systems.</h2>
      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-subtle text-[12px] text-muted">
            <tr>
              <th className="px-4 py-2 font-normal" />
              {COLS.map((c) => (
                <th key={c.key} className="px-4 py-2 font-normal">
                  <span aria-hidden>{c.flag}</span> {c.label.split(",")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft align-top">
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="w-36 px-4 py-2.5 font-normal text-muted">
                  {row.label}
                </th>
                {COLS.map((c) => (
                  <td key={c.key} className="px-4 py-2.5 text-ink">
                    {answers[c.key]?.[row.key] || <span className="text-faint">not yet</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
