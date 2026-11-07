"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Step3Result, TraceStep } from "../../lib/agent/legalAidTypes";
import { CREW, type AskSpec, type CrewId, type PlanStep, type Say } from "../../lib/agent/plannerTypes";
import { setCaseRun, setEnquiry, setLegalAid, upsertEnquiries, type CaseRunRecord, type Profile } from "../../lib/profile";
import { Button, cx } from "../ui";
import { CREW_ORDER, CrewMark, StateMark } from "./crew/Crew";
import StepStrip from "./crew/StepStrip";
import FirmResults from "./FirmResults";
import { ScoreRow } from "./scoreParts";
import TraceSheet, { type TraceScope } from "./TraceSheet";
import { usePlannerRun, type CrewState } from "./usePlannerRun";

/**
 * "Prepare your case" (D52, D54). Elliot's crew works through the case as a story, one step at a time.
 *  Before: the four steps and one button.
 *  During: Elliot's current decision in one sentence (and a moment when he changes the plan), the question if one is
 *          open, then the crew on the left and the spotlight browser on the right. What each crew member did opens
 *          only when you pick them (progressive disclosure, Tarun's note 7).
 *  After:  the case file: the next action first, then funding, solicitors and evidence, each with its source.
 * Every line on screen comes from an event the agents actually produced.
 */

const mmss = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor((Math.max(0, ms) % 60000) / 1000)).padStart(2, "0")}`;
const host = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};
const shotUrl = (runId: string | undefined, file: string) => `/api/agent/step3/shot?run=${encodeURIComponent(runId ?? "")}&file=${encodeURIComponent(file)}`;
const SLAB_CALC = "https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/";

export default function CaseRun({ profile, onReviewEnquiries }: { profile: Profile; onReviewEnquiries: () => void }) {
  const { state, start, answer } = usePlannerRun();
  const [view, setView] = useState<"case" | "firms" | "replay">("case");
  const saved = profile.caseRun;
  const result = profile.legalAid?.result;

  // A finished run becomes the case file: result, selection, enquiries, the message Kit used and the conversation.
  const persisted = useRef<string | null>(null);
  useEffect(() => {
    const r = state.result;
    if (state.status !== "done" || !r || persisted.current === r.runId) return;
    persisted.current = r.runId ?? "x";
    const ready = r.enquiries.filter((e) => e.status === "ready_to_send").map((e) => e.firmId);
    const selected = [...new Set([...ready, ...r.shortlist])].slice(0, 3);
    setLegalAid({ result: r as Step3Result, sample: false, selected });
    setEnquiry({ outcomes: r.enquiries, runId: r.runId, message: r.message });
    upsertEnquiries(r.enquiries.filter((e) => e.status === "ready_to_send").map((e) => ({ firmId: e.firmId, firmName: e.firmName, status: "ready_to_send" as const })));
    const run: CaseRunRecord = { runId: r.runId ?? "", says: r.says, plan: r.plan, evidence: r.evidence, asks: r.asks, recoveries: r.recoveries, turns: r.turns, durationMs: Date.now() - (state.startedAt ?? Date.now()), finishedAt: new Date().toISOString() };
    setCaseRun(run);
  }, [state.status, state.result, state.startedAt]);

  const live = state.status === "running" || (state.status === "error" && state.says.length > 0);
  if (live) return <Workspace state={state} onAnswer={answer} />;
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
  return <Intro error={state.status === "error" ? state.error : undefined} onStart={() => start(profile.facts, profile.legalAid?.funding)} />;
}

/* ------------------------------------------------------------------ before */

function Intro({ onStart, error }: { onStart: () => void; error?: string }) {
  return (
    <div className="mx-auto max-w-5xl py-4">
      <h1 className="display text-[44px] text-ink">Prepare your case</h1>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-2">
        <CrewMark id="elliot" size={28} /> Elliot plans the route, and changes it as he learns.
      </p>
      <div className="mt-12">
        <StepStrip />
      </div>
      <div className="mt-12 flex flex-col items-center gap-4">
        <Button onClick={onStart}>Start preparing my case</Button>
        <p className="text-[13px] text-muted">
          <span className="text-teal">✓</span> Asks you only when needed <span className="mx-2 text-fade">·</span> <span className="text-teal">✓</span> Nothing sent without your OK <span className="mx-2 text-fade">·</span> ≈ 4 min
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ during */

type RunState = ReturnType<typeof usePlannerRun>["state"];

function Workspace({ state, onAnswer }: { state: RunState; onAnswer: (id: string, v: string | null) => Promise<boolean> }) {
  const [selected, setSelected] = useState<CrewId | null>(null);
  const [scope, setScope] = useState<TraceScope | null>(null);
  const [everything, setEverything] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = state.startedAt ? now - state.startedAt : 0;

  // The spotlight follows the work: whoever just started is shown big (unless the user pinned a browser).
  const tab = state.spotlight?.tab;
  useEffect(() => {
    if (tab) window.dispatchEvent(new CustomEvent("live-focus", { detail: { tab, auto: true } }));
  }, [tab]);

  // The workspace fills the rest of the window, whatever is above it.
  const fit = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);
  const question = state.asks[0];
  const hasQuestion = !!question;
  useLayoutEffect(() => {
    const measure = () => {
      const top = fit.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(460, window.innerHeight - top - window.scrollY - 24));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [state.plan.length, hasQuestion]);

  const select = (id: CrewId | null) => {
    setSelected(id);
    if (id) window.dispatchEvent(new CustomEvent("live-focus", { detail: CREW[id].name }));
  };

  return (
    <div className="space-y-4">
      <Decision state={state} elapsed={elapsed} />
      {question && <QuestionCard key={question.id} q={question} more={state.asks.length - 1} onAnswer={onAnswer} />}

      <div ref={fit} style={{ height }} className="grid min-h-[460px] grid-cols-1 overflow-hidden rounded-card border border-line bg-white lg:grid-cols-[300px_minmax(0,1fr)]">
        <CrewRail state={state} selected={selected} onSelect={select} onTrace={setScope} onEverything={() => setEverything(true)} />
        <section aria-label="The crew's browsers" className="min-h-0 border-line bg-subtle p-4 lg:border-l">
          <div id="live-slot" className="h-full" />
        </section>
      </div>
      {state.status === "error" && <p className="text-[13px] text-danger">{state.error}</p>}
      {everything && (
        <Drawer title="Everything that happened" onClose={() => setEverything(false)}>
          <Timeline says={state.says} trace={state.trace} runId={state.runId} openAsks={state.asks.map((a) => a.id)} onTrace={setScope} />
        </Drawer>
      )}
      {scope && <TraceSheet scope={scope} runId={state.runId} onClose={() => setScope(null)} />}
    </div>
  );
}

/**
 * Elliot's current decision, big; what is happening right now, small; the plan as quiet chips. When Elliot changes
 * the plan because of something the crew found, that moment is marked for a few seconds (D54).
 */
function Decision({ state, elapsed }: { state: RunState; elapsed: number }) {
  const lastPlan = state.says.findLast((s) => s.kind === "plan");
  const waiting = state.asks[0];
  const sentence = waiting
    ? `${CREW[waiting.crew ?? "elliot"].name} needs one detail from you`
    : state.status === "error"
      ? "The run stopped"
      : (lastPlan?.text ?? "Elliot is reading your case and making a plan");
  const spot = state.spotlight;
  const now = spot && state.crew[spot.crew]?.state === "working" ? spot.tab.replace(" · ", " is on ") : null;

  // The replan moment: shown while it is fresh. Only reacts to a new plan event (external stream), never loops.
  const [flash, setFlash] = useState<number | null>(null);
  const planI = lastPlan?.i ?? -1;
  const isReplan = !!lastPlan?.replan;
  useEffect(() => {
    if (!isReplan || planI < 0) return;
    const show = setTimeout(() => setFlash(planI), 0);
    const hide = setTimeout(() => setFlash(null), 6000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [planI, isReplan]);
  const flashing = flash !== null && flash === planI && !waiting;

  return (
    <header className="space-y-3">
      <div className="flex items-start gap-4">
        <CrewMark id="elliot" size={52} className="-mt-1" />
        <div className="min-w-0 flex-1">
          {flashing ? (
            <div className="rise text-[12px] font-medium uppercase tracking-[0.1em] text-amber">Elliot changed the plan</div>
          ) : (
            <div className="text-[12px] text-muted">Elliot&apos;s current decision</div>
          )}
          <h1 key={sentence} className={cx("rise display mt-1 text-[30px] leading-[1.15] text-ink", flashing && "-mx-2 rounded-[5px] bg-amber-soft/70 px-2")}>
            {sentence}
          </h1>
          {now && <p className="mt-2 text-[14px] text-ink-2">Now: {now}</p>}
        </div>
        <RunMeta elapsed={elapsed} state={state} />
      </div>
      <PlanChips plan={state.plan} indent />
    </header>
  );
}

function PlanChips({ plan, indent }: { plan: PlanStep[]; indent?: boolean }) {
  if (!plan.length) return null;
  return (
    <ol className={cx("flex flex-wrap gap-x-5 gap-y-1.5", indent && "pl-[68px]")} aria-label="The plan">
      {plan.map((p) => (
        <li key={`${p.id}-${p.status}-${p.text}`} className="flash flex items-center gap-2 rounded-[4px] px-1 text-[13px] leading-5" title={p.why}>
          <PlanMark status={p.status} />
          <span className={cx(p.status === "done" ? "text-ink-2" : p.status === "dropped" ? "text-faint line-through decoration-faint/60" : p.status === "doing" ? "font-medium text-ink" : "text-muted")}>{p.text}</span>
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

function RunMeta({ elapsed, state }: { elapsed: number; state: RunState }) {
  const [open, setOpen] = useState(false);
  const s = state.stats;
  return (
    <div className="relative shrink-0 text-right">
      <button onClick={() => setOpen((o) => !o)} className="text-[13px] tabular-nums text-ink-2 hover:text-ink" aria-expanded={open}>
        {mmss(elapsed)} · Run details
      </button>
      {open && (
        <dl className="rise absolute right-0 top-7 z-20 grid w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 rounded-card border border-line bg-white p-4 text-left text-[13px]">
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

/* ------------------------------------------------------------------ the crew rail */

const statusLine = (id: CrewId, c: CrewState, says: Say[]) => {
  if (c.state === "waiting") return "Waiting for your answer";
  if (c.state === "working") return c.note || "Working";
  const last = says.findLast((s) => s.from === id && (s.kind === "report" || s.kind === "done" || s.kind === "plan"));
  if (last) return last.text;
  return id === "elliot" ? CREW[id].role : `${CREW[id].role} · not started`;
};

function CrewRail({ state, selected, onSelect, onTrace, onEverything }: { state: RunState; selected: CrewId | null; onSelect: (id: CrewId | null) => void; onTrace: (s: TraceScope) => void; onEverything: () => void }) {
  return (
    <aside aria-label="The crew" className="flex min-h-0 flex-col">
      <ul className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto">
        {CREW_ORDER.map((id) => {
          const c = state.crew[id];
          const on = selected === id;
          const started = c.state !== "idle" || state.says.some((s) => s.from === id);
          return (
            <li key={id}>
              <button onClick={() => onSelect(on ? null : id)} aria-expanded={on} className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors", on ? "bg-brand-soft/60" : "hover:bg-subtle")}>
                <span className="relative">
                  <CrewMark id={id} size={36} className={cx("transition-[filter,opacity] duration-300", !started && "opacity-45 grayscale-[35%]")} />
                  {started && (
                    <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-[4px] bg-white">
                      <StateMark state={c.state} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-medium text-ink">{CREW[id].name}</span>
                    <span aria-hidden className={cx("text-[11px] text-faint transition-transform", on && "rotate-90")}>
                      ›
                    </span>
                  </span>
                  <span className={cx("mt-0.5 block text-[12px] leading-[18px]", c.state === "waiting" ? "text-amber" : c.state === "working" ? "text-ink-2" : "text-muted")}>{statusLine(id, c, state.says)}</span>
                </span>
              </button>
              {on && (
                <div className="rise border-t border-line-soft bg-subtle/50 px-4 py-3">
                  <Timeline says={state.says.filter((s) => s.from === id || (s.to === id && s.kind === "assign"))} trace={state.trace} runId={state.runId} openAsks={state.asks.map((a) => a.id)} onTrace={onTrace} compact />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button onClick={onEverything} className="border-t border-line px-4 py-3 text-left text-[13px] text-brand hover:bg-subtle">
        Everything that happened ({state.says.length})
      </button>
    </aside>
  );
}

/* ------------------------------------------------------------------ the timeline (behind a click) */

function Timeline({ says, trace, runId, openAsks, onTrace, compact }: { says: Say[]; trace: TraceStep[]; runId?: string; openAsks: string[]; onTrace: (s: TraceScope) => void; compact?: boolean }) {
  // An open question is on screen in its own card: don't repeat it here.
  const lastAsk = says.findLast((x) => x.kind === "ask");
  const shown = useMemo(() => says.filter((s) => !(s.kind === "ask" && openAsks.length > 0 && s === lastAsk)), [says, openAsks.length, lastAsk]);
  const steps = (s: Say) => (s.kind === "report" && s.tab ? trace.filter((t) => t.agent === s.tab) : []);
  if (!shown.length) return <p className="text-[13px] text-muted">Nothing yet.</p>;
  return (
    <ol className={cx(compact ? "space-y-3" : "space-y-4")}>
      {shown.map((s) => (
        <Event key={s.i} s={s} steps={steps(s)} runId={runId} onTrace={(st) => onTrace({ title: `${CREW[s.from].name}: ${s.text}`, steps: st })} compact={compact} />
      ))}
    </ol>
  );
}

const FACT: Record<"yes" | "no" | "unknown", { mark: string; cls: string }> = {
  yes: { mark: "✓", cls: "bg-teal-soft text-teal" },
  no: { mark: "✕", cls: "bg-danger-soft text-danger" },
  unknown: { mark: "?", cls: "bg-subtle text-muted" },
};

function Event({ s, steps, runId, onTrace, compact }: { s: Say; steps: TraceStep[]; runId?: string; onTrace: (st: TraceStep[]) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const from = CREW[s.from];
  const time = <span className="w-9 shrink-0 pt-0.5 text-[11px] tabular-nums text-faint">{mmss(s.t)}</span>;
  if (s.kind === "assign" && s.to && s.to !== "you")
    return (
      <li className="flex gap-2 text-[13px] leading-5">
        {time}
        <span className="text-muted">
          {from.name} → {CREW[s.to].name}: <span className="text-ink-2">{s.text}</span>
        </span>
      </li>
    );
  if (s.kind === "plan")
    return (
      <li className="flex gap-2">
        {time}
        <div className={cx("border-l-2 pl-3", s.replan ? "border-amber" : "border-brand")}>
          <div className={cx("text-[11px] font-medium uppercase tracking-[0.1em]", s.replan ? "text-amber" : "text-brand")}>{s.replan ? "Changed the plan" : "Plan"}</div>
          <p className="text-[14px] leading-6 text-ink">{s.text}</p>
        </div>
      </li>
    );
  if (s.kind === "ask")
    return (
      <li className="flex gap-2 text-[13px] leading-5 text-ink-2">
        {time}
        <span>
          {from.name} asked you: {s.text} <span className="text-teal">answered</span>
        </span>
      </li>
    );
  if (s.kind === "done")
    return (
      <li className="flex gap-2">
        {time}
        <div className="rounded-card bg-paper p-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-2">Elliot&apos;s summary</div>
          <p className="mt-1 font-serif text-[15px] leading-6 text-ink">{s.text}</p>
        </div>
      </li>
    );
  const shot = steps.findLast((t) => t.shot);
  const src = steps.findLast((t) => t.url)?.url;
  return (
    <li className="flex gap-2">
      {time}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-[14px] leading-6 text-ink">
            {!compact && <span className="font-medium">{from.name}: </span>}
            {s.ok === false && <span className="mr-1 rounded-[3px] bg-danger-soft px-1 text-[11px] font-medium text-danger">Problem</span>}
            {s.text}
          </p>
          {shot?.shot && (
            <button onClick={() => onTrace(steps)} title="See the browser steps" className="shrink-0 overflow-hidden rounded-[4px] border border-line hover:border-brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- screenshots served by our own route */}
              <img src={shotUrl(runId, shot.shot)} alt="" className="h-[46px] w-[72px] object-cover object-top" />
            </button>
          )}
        </div>
        {s.facts && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {s.facts.map((f) => (
              <span key={f.label} className={cx("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px]", FACT[f.value].cls)}>
                <span aria-hidden>{FACT[f.value].mark}</span>
                {f.label}
              </span>
            ))}
          </div>
        )}
        {(steps.length > 0 || s.detail) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            {src && <span>{host(src)}</span>}
            {steps.length > 0 && (
              <button className="text-brand hover:underline" onClick={() => onTrace(steps)}>
                {steps.length} browser step{steps.length === 1 ? "" : "s"}
              </button>
            )}
            {s.detail && (
              <button className="hover:text-ink" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                {open ? "Less" : "More"}
              </button>
            )}
          </div>
        )}
        {open && s.detail && <pre className="rise mt-2 whitespace-pre-wrap rounded-[5px] bg-white p-3 font-sans text-[12px] leading-5 text-ink-2">{s.detail}</pre>}
      </div>
    </li>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <div className="rise relative flex h-full w-full max-w-xl flex-col border-l border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="display text-[22px] text-ink">{title}</h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the one question */

function QuestionCard({ q, more, onAnswer }: { q: AskSpec; more: number; onAnswer: (id: string, v: string | null) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  const crew = q.crew ?? "elliot";
  const submit = async (v: string | null) => {
    setBusy(true);
    setFailed(false);
    const ok = await onAnswer(q.id, v);
    if (!ok) {
      setFailed(true);
      setBusy(false);
    }
  };
  const site = crew === "nell" ? "slab.org.uk" : "";
  return (
    <section className="rise flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-amber/40 border-l-4 border-l-amber bg-white px-5 py-4" role="region" aria-live="polite" aria-label="A question for you">
      <CrewMark id={crew} size={44} />
      <div className="min-w-[16rem] flex-1">
        <p className="text-[16px] font-medium leading-6 text-ink">{q.question}</p>
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
          {more > 0 && <span className="ml-2">+{more} more after this</span>}
        </p>
        {failed && <p className="mt-1 text-[12px] text-danger">That answer did not reach the crew. Try again.</p>}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void submit(value.trim());
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
              <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} inputMode={q.kind === "money" || q.kind === "number" ? "numeric" : "text"} className="w-36 bg-transparent px-3 py-1.5 text-[14px] text-ink outline-none" aria-label={q.question} disabled={busy} />
            </label>
            <Button type="submit" size="sm" disabled={busy || !value.trim()}>
              {busy ? "Sending…" : "Continue"}
            </Button>
          </>
        )}
        <button type="button" disabled={busy} onClick={() => submit(null)} className="ml-1 text-[12px] text-muted hover:text-ink">
          Skip
        </button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ after */

function CaseFile({ profile, run, result, onFirms, onReplay, onReview, onRestart }: { profile: Profile; run: CaseRunRecord; result: Step3Result; onFirms: () => void; onReplay: () => void; onReview: () => void; onRestart: () => void }) {
  const [full, setFull] = useState(false);
  const summary = run.says.findLast((s) => s.kind === "done")?.text ?? "";
  const first = summary.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? summary;
  const rest = summary.slice(first.length).trim();
  const top = result.shortlist.map((id) => result.firms.find((f) => f.id === id)).filter((f) => !!f);
  const ev = run.evidence;
  const ready = (profile.enquiry?.outcomes ?? []).filter((o) => o.status === "ready_to_send");
  const funding = result.verdict === "likely" ? "Legal aid looks likely" : result.verdict === "unlikely" ? "Legal aid looks unlikely" : result.verdict === "skipped" ? "Money questions skipped" : "Legal aid is unclear";
  const s = result.stats;
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* The outcome and the next action, side by side, above everything else */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
        <header className="lg:col-span-7">
          <h1 className="display text-[40px] text-ink">Your case is ready</h1>
          <p className="mt-3 font-serif text-[18px] leading-7 text-ink-2">{first}</p>
          {rest && (
            <>
              {full && <p className="rise mt-2 font-serif text-[16px] leading-7 text-ink-2">{rest}</p>}
              <button className="mt-2 text-[13px] text-brand hover:underline" onClick={() => setFull((f) => !f)}>
                {full ? "Less" : "Elliot's full summary"}
              </button>
            </>
          )}
        </header>
        <section className="flex items-center gap-4 rounded-card border border-brand/40 bg-white p-5 lg:col-span-5">
          <CrewMark id="kit" size={52} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-ink">{ready.length ? `${ready.length} enquir${ready.length === 1 ? "y" : "ies"} ready for your OK` : "Enquiries not prepared yet"}</div>
            <div className="text-[12px] leading-5 text-muted">{ready.length ? ready.map((r) => r.firmName).join(" · ") : "Kit fills each firm's form and stops before Send."}</div>
            <Button className="mt-3" size="sm" onClick={onReview}>
              {ready.length ? "Review and send" : "Prepare enquiries"}
            </Button>
          </div>
        </section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel crew="nell" title={funding}>
          {result.calculatorText && <p className="font-serif text-[15px] leading-6 text-ink">&ldquo;{result.calculatorText}&rdquo;</p>}
          <p className="mt-3 text-[12px] leading-5 text-muted">
            From{" "}
            <a className="text-brand hover:underline" href={SLAB_CALC} target="_blank" rel="noreferrer">
              SLAB&apos;s calculator
            </a>
            . A solicitor applies for you, and SLAB also checks the case has merit.
          </p>
        </Panel>

        <Panel crew="robin" title={`${top.length} solicitor${top.length === 1 ? "" : "s"} for you`}>
          <ul className="space-y-4">
            {top.map((f) => (
              <FirmLine key={f.id} f={f} />
            ))}
          </ul>
          <button className="mt-4 text-[13px] text-brand hover:underline" onClick={onFirms}>
            All {result.firms.length} firms Robin looked at
          </button>
        </Panel>

        <Panel crew="iona" title="Medical evidence">
          {ev.guideline?.points[0] ? (
            <>
              <a className="text-[12px] text-brand hover:underline" href={ev.guideline.url} target="_blank" rel="noreferrer">
                {ev.guideline.name.split(":")[0]}, recommendation {ev.guideline.points[0].id}
              </a>
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

/** A firm as plain facts; the score behind it opens on click (Codex: facts, not bare percentages). */
function FirmLine({ f }: { f: Step3Result["firms"][number] }) {
  const [open, setOpen] = useState(false);
  const facts: { label: string; on: boolean | null }[] = [
    { label: "Takes legal aid", on: f.legalAid },
    { label: "Acts for patients", on: f.actsForPatients === "yes" ? true : f.actsForPatients === "no" ? false : null },
    { label: "No win no fee", on: f.noWinNoFee === "yes" ? true : f.noWinNoFee === "no" ? false : null },
    { label: "Online form", on: f.enquiryUrl ? true : null },
  ];
  return (
    <li>
      <div className="text-[14px] font-medium text-ink">{f.name}</div>
      <div className="text-[12px] text-muted">{[f.town, f.distanceMiles != null ? `${f.distanceMiles < 1 ? f.distanceMiles.toFixed(1) : Math.round(f.distanceMiles)} miles` : null].filter(Boolean).join(" · ")}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {facts
          .filter((x) => x.on !== false)
          .map((x) => (
            <span key={x.label} className={cx("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px]", x.on ? "bg-teal-soft text-teal" : "bg-subtle text-muted")}>
              <span aria-hidden>{x.on ? "✓" : "?"}</span>
              {x.label}
            </span>
          ))}
      </div>
      {f.breakdown && (
        <>
          <button className="mt-1.5 text-[12px] text-muted hover:text-brand" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide why" : "Why this firm"}
          </button>
          {open && (
            <ul className="rise mt-1">
              {f.breakdown.map((r) => (
                <ScoreRow key={r.key} row={r} />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function Panel({ crew, title, children }: { crew: CrewId; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-white p-5">
      <div className="flex items-center gap-2">
        <CrewMark id={crew} size={30} />
        <span className="text-[12px] text-muted">{CREW[crew].name}</span>
      </div>
      <h2 className="display mt-3 text-[22px] text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The finished run, read-only: the plan and everything the crew said, with the browser steps behind each report. */
function Replay({ run, trace, onBack }: { run: CaseRunRecord; trace: TraceStep[]; onBack: () => void }) {
  const [scope, setScope] = useState<TraceScope | null>(null);
  const [filter, setFilter] = useState<CrewId | null>(null);
  const says = filter ? run.says.filter((s) => s.from === filter || s.to === filter) : run.says;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button className="text-[13px] text-brand hover:underline" onClick={onBack}>
        ← Back to your case file
      </button>
      <h1 className="display text-[34px] text-ink">How the crew worked</h1>
      <PlanChips plan={run.plan} />
      <div className="flex flex-wrap gap-1.5">
        {CREW_ORDER.map((id) => (
          <button key={id} onClick={() => setFilter(filter === id ? null : id)} aria-pressed={filter === id} className={cx("flex items-center gap-2 rounded-ctl border px-2 py-1.5 text-[13px]", filter === id ? "border-brand bg-brand-soft text-brand" : "border-line text-ink hover:bg-subtle")}>
            <CrewMark id={id} size={22} />
            {CREW[id].name}
          </button>
        ))}
      </div>
      <div className="rounded-card border border-line bg-white p-6">
        <Timeline says={says} trace={trace} runId={run.runId} openAsks={[]} onTrace={setScope} />
      </div>
      {scope && <TraceSheet scope={scope} runId={run.runId} onClose={() => setScope(null)} />}
    </div>
  );
}
