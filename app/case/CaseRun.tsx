"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FIXTURE_RESULT } from "../../lib/agent/legalAidFixture";
import type { Step3Result, TraceStep } from "../../lib/agent/legalAidTypes";
import { CREW, type AskSpec, type CrewId, type PlanStep, type Say } from "../../lib/agent/plannerTypes";
import { setCaseRun, setEnquiry, setLegalAid, upsertEnquiries, type CaseRunRecord, type Profile } from "../../lib/profile";
import { Button, cx, Eyebrow } from "../ui";
import { CREW_ORDER, CrewMark, StateMark } from "./crew/Crew";
import StepStrip, { stepStatuses } from "./crew/StepStrip";
import FirmResults from "./FirmResults";
import TraceSheet, { type TraceScope } from "./TraceSheet";
import { usePlannerRun, type CrewState } from "./usePlannerRun";

/**
 * "Preparing your case" (D52): Elliot's crew plans its own route through funding, solicitors, evidence and enquiries.
 * Before: one sentence, one button, the crew. During: plan as workstreams, the crew, a decision timeline and one calm
 * question card on the left; their real browsers on the right. After: a case file, with the run kept for review.
 * Nothing here is decorative: every line comes from an event the agents actually produced.
 */

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const host = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

export default function CaseRun({ profile, onReviewEnquiries }: { profile: Profile; onReviewEnquiries: () => void }) {
  const { state, start, answer } = usePlannerRun();
  const [view, setView] = useState<"case" | "firms" | "replay">("case");
  const saved = profile.caseRun;
  const result = profile.legalAid?.result;

  // A finished run becomes the case file: result, selection, enquiries and the conversation are saved to the profile.
  const persisted = useRef<string | null>(null);
  useEffect(() => {
    const r = state.result;
    if (state.status !== "done" || !r || persisted.current === r.runId) return;
    persisted.current = r.runId ?? "x";
    const ready = r.enquiries.filter((e) => e.status === "ready_to_send").map((e) => e.firmId);
    const selected = [...new Set([...ready, ...r.shortlist])].slice(0, 3);
    setLegalAid({ result: r as Step3Result, sample: false, selected });
    setEnquiry({ outcomes: r.enquiries, runId: r.runId, sample: false });
    upsertEnquiries(r.enquiries.filter((e) => e.status === "ready_to_send").map((e) => ({ firmId: e.firmId, firmName: e.firmName, status: "ready_to_send" as const })));
    const run: CaseRunRecord = { runId: r.runId ?? "", says: r.says, plan: r.plan, evidence: r.evidence, asks: r.asks, recoveries: r.recoveries, turns: r.turns, durationMs: Date.now() - (state.startedAt ?? Date.now()), finishedAt: new Date().toISOString() };
    setCaseRun(run);
  }, [state.status, state.result, state.startedAt]);

  const live = state.status === "running" || (state.status === "error" && state.says.length > 0);
  if (live) return <Workspace state={state} onAnswer={answer} onRetry={() => start(profile.facts, profile.legalAid?.funding)} />;
  if (view === "firms" && result)
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <button className="text-[13px] text-brand hover:underline" onClick={() => setView("case")}>
          ← Back to your case file
        </button>
        <FirmResults result={result} sample={false} selected={profile.legalAid?.selected ?? []} onSelected={(ids) => setLegalAid({ selected: ids })} onContinue={onReviewEnquiries} />
      </div>
    );
  if (view === "replay" && saved) return <Replay run={saved} trace={result?.trace ?? []} onBack={() => setView("case")} />;
  if (saved && result) return <CaseFile profile={profile} run={saved} result={result} onFirms={() => setView("firms")} onReplay={() => setView("replay")} onReview={onReviewEnquiries} onRestart={() => start(profile.facts, profile.legalAid?.funding)} />;
  // Demo (D58): skip the research and go on to step 4 with the three sample firms, as if the crew had found them.
  const skipToStepFour = () => {
    setLegalAid({ result: FIXTURE_RESULT, sample: true, selected: FIXTURE_RESULT.shortlist.slice(0, 3) });
    onReviewEnquiries();
  };
  return <Intro error={state.status === "error" ? state.error : undefined} onStart={() => start(profile.facts, profile.legalAid?.funding)} onSkip={skipToStepFour} />;
}

/* ------------------------------------------------------------------ before */

function Intro({ onStart, onSkip, error }: { onStart: () => void; onSkip: () => void; error?: string }) {
  return (
    <div className="mx-auto max-w-5xl py-4">
      <Eyebrow>Compensation · step 1</Eyebrow>
      <h1 className="display mt-3 text-[44px] text-ink">Preparing your case</h1>
      <div className="mt-12">
        <StepStrip />
      </div>
      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={onStart}>Start preparing my case</Button>
          <Button variant="secondary" onClick={onSkip} title="Demo: no research is done. Opens step 4 with three sample firms.">
            Skip and continue to step 4 (demo)
          </Button>
        </div>
        <p className="text-[13px] text-muted">
          <span className="text-teal">✓</span> Asks you only when needed <span className="mx-2 text-fade">·</span> <span className="text-teal">✓</span> Nothing sent without your OK <span className="mx-2 text-fade">·</span> ≈ 3 min
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ during */

type RunState = ReturnType<typeof usePlannerRun>["state"];

function Workspace({ state, onAnswer, onRetry }: { state: RunState; onAnswer: (id: string, v: string | null) => Promise<void>; onRetry: () => void }) {
  const [selected, setSelected] = useState<CrewId | null>(null);
  const [scope, setScope] = useState<TraceScope | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = state.startedAt ? now - state.startedAt : 0;
  const working = CREW_ORDER.filter((id) => state.crew[id].state === "working");
  const waiting = state.asks[0];
  const headline = waiting ? `${CREW[waiting.crew ?? "elliot"].name} needs one detail` : state.status === "error" ? "The run stopped" : working.length > 1 ? `${working.length} of the crew are working` : "Elliot's crew is on your case";

  // The workspace fills the rest of the window, whatever is above it (header, track bar, plan).
  const fit = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(640);
  useLayoutEffect(() => {
    const measure = () => {
      const top = fit.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(520, window.innerHeight - top - window.scrollY - 24));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [state.plan.length]);

  const select = (id: CrewId | null) => {
    setSelected(id);
    window.dispatchEvent(new CustomEvent("live-focus", { detail: id ? CREW[id].name : null }));
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div>
          <Eyebrow>Preparing your case</Eyebrow>
          <h1 className="display mt-2 text-[34px] text-ink">{headline}</h1>
        </div>
        <RunMeta elapsed={elapsed} state={state} />
      </header>

      <div className="rounded-card border border-line bg-white px-4 pt-4 pb-3">
        <StepStrip compact statuses={stepStatuses(state.crew, state.says, state.status === "done")} />
      </div>

      <div ref={fit} style={{ height }} className="grid min-h-[520px] grid-cols-1 overflow-hidden rounded-card border border-line bg-white lg:grid-cols-[minmax(340px,38%)_minmax(0,1fr)]">
        <section aria-label="What the crew is doing" className="flex min-h-0 flex-col border-line lg:border-r">
          <CrewStrip crew={state.crew} selected={selected} onSelect={select} />
          <Timeline says={state.says} trace={state.trace} runId={state.runId} filter={selected} onTrace={setScope} live />
          {state.status === "running" && <QuestionDock asks={state.asks} onAnswer={onAnswer} />}
          {state.status === "error" && <div className="space-y-2 border-t border-line px-5 py-3"><p className="text-[13px] text-danger">{state.error}</p><Button size="sm" onClick={onRetry}>Try again</Button></div>}
        </section>
        <section aria-label="The crew's browsers" className="min-h-0 bg-subtle p-3">
          <div id="live-slot" className="h-full" />
        </section>
      </div>
      {scope && <TraceSheet scope={scope} runId={state.runId} onClose={() => setScope(null)} />}
    </div>
  );
}

function RunMeta({ elapsed, state }: { elapsed: number; state: RunState }) {
  const [open, setOpen] = useState(false);
  const s = state.stats;
  return (
    <div className="relative text-right">
      <button onClick={() => setOpen((o) => !o)} className="text-[13px] tabular-nums text-ink-2 hover:text-ink" aria-expanded={open}>
        {mmss(elapsed)}
        {s ? ` · ${s.sites} sites · ${s.pages} pages` : ""} · Run details
      </button>
      {open && (
        <dl className="rise absolute right-0 top-7 z-20 grid w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 rounded-card border border-line bg-white p-4 text-left text-[13px] shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
          {[
            ["Browser agents", s?.agents ?? 0],
            ["Websites", s?.sites ?? 0],
            ["Pages opened", s?.pages ?? 0],
            ["Clicks and typing", s?.actions ?? 0],
            ["Questions to you", Object.keys(state.answered).length + state.asks.length],
            ["Recoveries", state.trace.filter((t) => t.kind === "recover").length],
          ].map(([k, v]) => (
            <div key={String(k)} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** The plan as workstreams, from the planner's own steps. They change as it learns; a change flashes once. */
function Workstreams({ plan }: { plan: PlanStep[] }) {
  if (!plan.length)
    return (
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <StateMark state="working" /> Elliot is making a plan
      </div>
    );
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="The plan">
      {plan.map((p) => (
        <li key={`${p.id}-${p.status}-${p.text}`} className="flash flex items-center gap-2 rounded-[4px] px-1 text-[13px] leading-5">
          <PlanMark status={p.status} />
          <span className={cx(p.status === "done" ? "text-ink-2" : p.status === "dropped" ? "text-faint line-through decoration-faint/60" : p.status === "doing" ? "text-ink" : "text-muted")} title={p.why}>
            {p.text}
          </span>
          {p.status === "dropped" && <span className="text-[12px] text-faint">no longer needed</span>}
        </li>
      ))}
    </ol>
  );
}

function PlanMark({ status }: { status: PlanStep["status"] }) {
  if (status === "doing") return <StateMark state="working" />;
  if (status === "done") return <StateMark state="done" />;
  return <span aria-hidden className={cx("inline-block size-2.5 rounded-[2px] border", status === "dropped" ? "border-faint" : "border-ink-2/40")} />;
}

function CrewStrip({ crew, selected, onSelect }: { crew: Record<CrewId, CrewState>; selected: CrewId | null; onSelect: (id: CrewId | null) => void }) {
  const sel = selected ? crew[selected] : null;
  return (
    <div className="border-b border-line px-4 pt-4 pb-3">
      <div className="grid grid-cols-6 gap-1">
        {CREW_ORDER.map((id) => {
          const c = crew[id];
          const on = selected === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(on ? null : id)}
              aria-pressed={on}
              title={`${CREW[id].name}: ${CREW[id].role}`}
              className={cx("flex flex-col items-center gap-1.5 rounded-ctl border px-1 py-2 text-[12px] transition-colors", on ? "border-brand bg-brand-soft" : "border-transparent hover:bg-subtle")}
            >
              <span className="relative">
                <CrewMark id={id} size={28} />
                <span className="absolute -right-1.5 -bottom-1 flex size-3.5 items-center justify-center rounded-[3px] bg-white">
                  <StateMark state={c.state} />
                </span>
              </span>
              <span className={cx("font-medium", on ? "text-brand" : "text-ink")}>{CREW[id].name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-5 px-1 text-[12px] leading-5 text-muted">
        {selected && sel ? (
          <>
            <span className="text-ink-2">{CREW[selected].name}</span> · {CREW[selected].role.toLowerCase()} · {sel.state === "working" ? `working: ${sel.note}` : sel.state === "waiting" ? "waiting for your answer" : sel.note || "not started yet"}
          </>
        ) : (
          "Pick someone to follow just their work and their browser."
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ the timeline */

function Timeline({ says, trace, runId, filter, onTrace, live }: { says: Say[]; trace: TraceStep[]; runId?: string; filter: CrewId | null; onTrace: (s: TraceScope) => void; live?: boolean }) {
  const shown = useMemo(() => says.filter((s) => !filter || s.from === filter || s.to === filter), [says, filter]);
  const box = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const seen = useRef(shown.length);

  // Follow new events only while the reader is at the bottom; otherwise count them.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const added = shown.length - seen.current;
    seen.current = shown.length;
    if (added <= 0) return;
    if (atBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else setUnseen((n) => n + added);
  }, [shown.length]);

  const steps = (s: Say) => {
    if (s.kind !== "report") return [];
    if (s.tab) return trace.filter((t) => t.agent === s.tab);
    const name = CREW[s.from].name;
    const assigned = [...says].reverse().find((x) => x.kind === "assign" && x.to === s.from && x.tool === s.tool && x.i < s.i);
    return trace.filter((t) => t.agent.startsWith(`${name} ·`) && t.t >= (assigned?.t ?? 0) - 500 && t.t <= s.t + 500);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          if (atBottom.current) setUnseen(0);
        }}
        className="h-full overflow-y-auto px-5 py-4"
      >
        {shown.length === 0 && <p className="text-[13px] text-muted">{live ? "Elliot is reading your case…" : "Nothing yet."}</p>}
        <ol className="space-y-3">
          {shown.map((s) => (
            <Event key={s.i} s={s} steps={steps(s)} onTrace={(st) => onTrace({ title: `${CREW[s.from].name}: ${s.text}`, steps: st })} runId={runId} />
          ))}
        </ol>
      </div>
      {unseen > 0 && (
        <button
          onClick={() => {
            box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
            setUnseen(0);
          }}
          className="rise absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-[12px] text-white"
        >
          {unseen} new update{unseen === 1 ? "" : "s"} ↓
        </button>
      )}
    </div>
  );
}

function Event({ s, steps, onTrace }: { s: Say; steps: TraceStep[]; onTrace: (st: TraceStep[]) => void; runId?: string }) {
  const [open, setOpen] = useState(false);
  const from = CREW[s.from];
  if (s.kind === "assign" && s.to && s.to !== "you")
    return (
      <li className="rise pl-[30px] text-[13px] leading-5">
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <CrewMark id={s.from} size={14} />
          {from.name}
          <span aria-hidden>→</span>
          <CrewMark id={s.to} size={14} />
          {CREW[s.to].name}
        </div>
        <p className="mt-0.5 text-ink-2">{s.text}</p>
      </li>
    );
  if (s.kind === "plan")
    return (
      <li className="rise border-l-2 border-brand py-0.5 pl-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-brand">Decision</div>
        <p className="mt-0.5 text-[14px] leading-6 text-ink">{s.text}</p>
      </li>
    );
  if (s.kind === "ask")
    return (
      <li className="rise flex items-start gap-2.5 text-[13px] leading-5 text-ink-2">
        <CrewMark id={s.from} size={20} />
        <span>
          <span className="font-medium text-ink">{from.name}</span> asked you: {s.text}
        </span>
      </li>
    );
  if (s.kind === "done")
    return (
      <li className="rise rounded-card bg-paper p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-2">
          <CrewMark id="elliot" size={18} /> Elliot&apos;s summary
        </div>
        <p className="mt-2 font-serif text-[16px] leading-7 text-ink">{s.text}</p>
      </li>
    );
  // report or note
  const src = steps.findLast((t) => t.url)?.url;
  return (
    <li className="rise flex items-start gap-2.5">
      <CrewMark id={s.from} size={22} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-6 text-ink">
          <span className="font-medium">{from.name}</span> <span className="text-ink-2">{s.text}</span>
        </p>
        {(steps.length > 0 || s.detail) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            {src && <span>{host(src)}</span>}
            {steps.length > 0 && (
              <button className="text-brand hover:underline" onClick={() => onTrace(steps)}>
                {steps.length} browser step{steps.length === 1 ? "" : "s"}
                {steps.some((t) => t.shot) ? " with screenshots" : ""}
              </button>
            )}
            {s.detail && (
              <button className="hover:text-ink" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                {open ? "Less" : "More"}
              </button>
            )}
          </div>
        )}
        {open && s.detail && <pre className="rise mt-2 whitespace-pre-wrap rounded-[5px] bg-subtle p-3 font-sans text-[12px] leading-5 text-ink-2">{s.detail}</pre>}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ the one question */

function QuestionDock({ asks, onAnswer }: { asks: AskSpec[]; onAnswer: (id: string, v: string | null) => Promise<void> }) {
  const q = asks[0];
  const [value, setValue] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<{ id: string; message: string } | null>(null);
  const [received, setReceived] = useState(false);
  const last = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Focus the answer box once per new question, without scrolling the page.
  useEffect(() => {
    if (q?.id) input.current?.focus({ preventScroll: true });
  }, [q?.id]);
  useEffect(() => {
    if (!q && last.current) {
      setReceived(true);
      const t = setTimeout(() => setReceived(false), 1400);
      last.current = null;
      return () => clearTimeout(t);
    }
    if (q && q.id !== last.current) {
      last.current = q.id;
      setValue("");
      setSent(null);
    }
  }, [q]);

  if (!q)
    return received ? (
      <div className="rise flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-teal">
        <StateMark state="done" /> Answer received. The crew carries on.
      </div>
    ) : null;

  const crew = q.crew ?? "elliot";
  const busy = sent === q.id;
  const submit = (v: string | null) => {
    if (busy) return;
    setSent(q.id);
    setAnswerError(null);
    void onAnswer(q.id, v).catch((error: unknown) => {
      setSent((id) => id === q.id ? null : id);
      setAnswerError({ id: q.id, message: error instanceof Error ? error.message : "Your answer could not be sent. Please try again." });
    });
  };
  const site = crew === "nell" ? "slab.org.uk" : "";

  return (
    <div className="rise border-t border-line bg-subtle/60 px-5 py-4" role="region" aria-live="polite" aria-label="A question for you">
      <div className="flex items-center gap-2">
        <CrewMark id={crew} size={22} />
        <span className="text-[14px] font-medium text-ink">{CREW[crew].name} needs one detail</span>
        {asks.length > 1 && <span className="ml-auto text-[12px] text-muted">+{asks.length - 1} more</span>}
      </div>
      <p className="mt-2 text-[15px] leading-6 text-ink">{q.question}</p>
      <p className="mt-0.5 text-[12px] leading-5 text-muted">
        {q.why}
        {site && (
          <>
            {" "}
            <button className="text-brand hover:underline" onClick={() => window.dispatchEvent(new CustomEvent("live-focus", { detail: CREW[crew].name }))}>
              See it on {site}
            </button>
          </>
        )}
      </p>
      {answerError?.id === q.id && <p role="alert" className="mt-2 text-sm text-danger">{answerError.message}</p>}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) submit(value.trim());
        }}
      >
        {q.kind === "yes_no" ? (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => submit("yes")}>
              Yes
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => submit("no")}>
              No
            </Button>
          </>
        ) : q.kind === "choice" && q.options?.length ? (
          q.options.map((o) => (
            <Button key={o} type="button" size="sm" variant="secondary" disabled={busy} onClick={() => submit(o)}>
              {o}
            </Button>
          ))
        ) : (
          <>
            <label className="flex items-center rounded-ctl border border-line bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft">
              {q.kind === "money" && <span className="pl-3 text-[14px] text-muted">£</span>}
              <input
                ref={input}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode={q.kind === "money" || q.kind === "number" ? "numeric" : "text"}
                className="w-40 bg-transparent px-3 py-1.5 text-[14px] text-ink outline-none"
                aria-label={q.question}
                disabled={busy}
              />
            </label>
            <Button type="submit" size="sm" disabled={busy || !value.trim()}>
              {busy ? "Sending…" : "Continue"}
            </Button>
          </>
        )}
        <button type="button" disabled={busy} onClick={() => submit(null)} className="ml-1 text-[12px] text-muted hover:text-ink">
          Skip this
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ after */

function CaseFile({ profile, run, result, onFirms, onReplay, onReview, onRestart }: { profile: Profile; run: CaseRunRecord; result: Step3Result; onFirms: () => void; onReplay: () => void; onReview: () => void; onRestart: () => void }) {
  const summary = run.says.findLast((s) => s.kind === "done")?.text;
  const top = result.shortlist.map((id) => result.firms.find((f) => f.id === id)).filter((f) => !!f);
  const ev = run.evidence;
  const ready = (profile.enquiry?.outcomes ?? []).filter((o) => o.status === "ready_to_send");
  const funding =
    result.verdict === "likely" ? "Legal aid looks likely" : result.verdict === "unlikely" ? "Legal aid looks unlikely" : result.verdict === "skipped" ? "You skipped the money questions" : "Legal aid is unclear";
  const s = result.stats;
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <header className="max-w-3xl">
        <Eyebrow>Your case file</Eyebrow>
        <h1 className="display mt-3 text-[40px] text-ink">Here&apos;s what the crew found</h1>
        {summary && <p className="mt-4 font-serif text-[17px] leading-7 text-ink-2">{summary}</p>}
      </header>

      <div className="@container">
        <div className="grid gap-4 @3xl:grid-cols-3">
          <Panel crew="nell" title={funding}>
            {result.calculatorText && <p className="font-serif text-[15px] leading-6 text-ink">&ldquo;{result.calculatorText}&rdquo;</p>}
            <p className="mt-3 text-[12px] leading-5 text-muted">SLAB&apos;s own calculator. A solicitor applies for you, and SLAB also checks the case has merit.</p>
            <p className="mt-2 text-[12px] text-muted">Route: {result.route === "legal_aid" ? "legal aid" : "no win, no fee"}</p>
          </Panel>

          <Panel crew="vera" title={`${top.length} solicitors for you`}>
            <ul className="space-y-3">
              {top.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-medium text-ink">{f.name}</div>
                    <div className="text-[12px] text-muted">
                      {[f.town, f.distanceMiles != null ? `${f.distanceMiles < 1 ? f.distanceMiles.toFixed(1) : Math.round(f.distanceMiles)} mi` : null, f.actsForPatients === "yes" ? "acts for patients" : null, f.noWinNoFee === "yes" ? "no win no fee" : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {f.fit !== undefined && <span className="shrink-0 rounded-[4px] bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-brand">{f.fit}%</span>}
                </li>
              ))}
            </ul>
            <button className="mt-4 text-[13px] text-brand hover:underline" onClick={onFirms}>
              See all {result.firms.length} firms we looked at
            </button>
          </Panel>

          <Panel crew="iona" title="Medical evidence">
            {ev.guideline?.points[0] ? (
              <>
                <p className="text-[12px] text-muted">
                  {ev.guideline.name.split(":")[0]}, {ev.guideline.points[0].id}
                </p>
                <p className="mt-1 font-serif text-[15px] leading-6 text-ink">&ldquo;{ev.guideline.points[0].text}&rdquo;</p>
              </>
            ) : (
              <p className="text-[13px] text-muted">No guideline found.</p>
            )}
            {ev.gaps?.[0] && (
              <div className="mt-3 rounded-[5px] bg-purple-soft px-3 py-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-purple">For a solicitor to check</div>
                <p className="mt-1 text-[13px] leading-5 text-ink">{ev.gaps[0].question}</p>
              </div>
            )}
            {ev.cases?.map((c) => (
              <p key={c.url} className="mt-3 text-[12px] leading-5 text-muted">
                <a className="text-ink-2 hover:text-brand hover:underline" href={c.url} target="_blank" rel="noreferrer">
                  {c.title} ({c.year})
                </a>
                : {c.kind === "medical_negligence" ? "a medical negligence case" : c.kind === "similar_injury_other_cause" ? "similar injury, not medical negligence" : "not relevant"}
              </p>
            ))}
          </Panel>
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-5 rounded-card border border-line bg-white p-5">
        <CrewMark id="kit" size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-ink">{ready.length ? `${ready.length} enquiry form${ready.length === 1 ? "" : "s"} filled and waiting for your OK` : "Enquiries not prepared yet"}</div>
          <div className="text-[13px] text-muted">{ready.length ? ready.map((r) => r.firmName).join(", ") : "Kit fills each firm's form and stops before Send."}</div>
        </div>
        <Button onClick={onReview}>{ready.length ? "Review and send" : "Prepare enquiries"}</Button>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-[12px] text-muted">
        <span className="tabular-nums">
          {CREW_ORDER.length} crew · {s.agents} browser agents · {s.sites} websites · {s.pages} pages · {s.actions} clicks and typing · {run.asks} questions to you · {run.recoveries} recover{run.recoveries === 1 ? "y" : "ies"} · {mmss(run.durationMs)}
        </span>
        <span className="flex gap-4">
          <button className="text-brand hover:underline" onClick={onReplay}>
            Review the run
          </button>
          <button className="hover:text-ink" onClick={onRestart}>
            Run again
          </button>
        </span>
      </footer>
    </div>
  );
}

function Panel({ crew, title, children }: { crew: CrewId; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-white p-5">
      <div className="flex items-center gap-2">
        <CrewMark id={crew} size={22} />
        <span className="text-[12px] text-muted">{CREW[crew].name}</span>
      </div>
      <h2 className="display mt-3 text-[22px] text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The finished run, read-only: plan and the crew's conversation, with the browser steps behind each report. */
function Replay({ run, trace, onBack }: { run: CaseRunRecord; trace: TraceStep[]; onBack: () => void }) {
  const [scope, setScope] = useState<TraceScope | null>(null);
  const [filter, setFilter] = useState<CrewId | null>(null);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button className="text-[13px] text-brand hover:underline" onClick={onBack}>
        ← Back to your case file
      </button>
      <div>
        <Eyebrow>Review the run</Eyebrow>
        <h1 className="display mt-2 text-[34px] text-ink">How the crew worked</h1>
      </div>
      <Workstreams plan={run.plan} />
      <div className="flex flex-wrap gap-1.5">
        {CREW_ORDER.map((id) => (
          <button key={id} onClick={() => setFilter(filter === id ? null : id)} aria-pressed={filter === id} className={cx("flex items-center gap-2 rounded-ctl border px-2 py-1.5 text-[13px]", filter === id ? "border-brand bg-brand-soft text-brand" : "border-line text-ink hover:bg-subtle")}>
            <CrewMark id={id} size={20} />
            {CREW[id].name}
          </button>
        ))}
      </div>
      <div className="h-[60vh] overflow-hidden rounded-card border border-line bg-white">
        <Timeline says={run.says} trace={trace} runId={run.runId} filter={filter} onTrace={setScope} />
      </div>
      {scope && <TraceSheet scope={scope} runId={run.runId} onClose={() => setScope(null)} />}
    </div>
  );
}
