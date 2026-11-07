"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Step3Result, TraceStep } from "../../lib/agent/legalAidTypes";
import { CREW, type AskSpec, type CrewId, type PlanStep, type Say } from "../../lib/agent/plannerTypes";
import { setCaseRun, setEnquiry, setLegalAid, skipStep, upsertEnquiries, type CaseRunRecord, type Profile } from "../../lib/profile";
import { Button, cx } from "../ui";
import { CREW_ORDER, CrewMark, StateMark } from "./crew/Crew";
import StepStrip from "./crew/StepStrip";
import FirmResults from "./FirmResults";
import { ScoreRow, whyFor } from "./scoreParts";
import TraceSheet, { type TraceScope } from "./TraceSheet";
import { usePlannerRun } from "./usePlannerRun";

/**
 * "Prepare your case" (D52, D62). Elliot's crew works through the case as a story, one step at a time.
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
const lowerFirst = (t: string) => t.replace(/^./, (c) => c.toLowerCase());

/** `value` for `ms` after it last changed to a non-null value, then null. Driven by a timer (an external clock). */
function useFresh(value: number | null, ms: number): number | null {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (value === null) return;
    const on = setTimeout(() => setShown(value), 0);
    const off = setTimeout(() => setShown(null), ms);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [value, ms]);
  return shown;
}

const SLAB_CALC = "https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/";

export default function CaseRun({ profile, onReviewEnquiries }: { profile: Profile; onReviewEnquiries: () => void }) {
  const { state, start, answer, replay, skip } = usePlannerRun();
  const [view, setView] = useState<"case" | "firms" | "replay">("case");
  const saved = profile.caseRun;
  const result = profile.legalAid?.result;

  useEffect(() => {
    if (state.funding && !state.demo) setLegalAid({ funding: state.funding });
  }, [state.funding, state.demo]);

  // A finished run becomes the case file: result, selection, enquiries, the message Kit used and the conversation.
  const persisted = useRef<string | null>(null);
  useEffect(() => {
    const r = state.result;
    if (state.status !== "done" || !r || persisted.current === r.runId) return;
    persisted.current = r.runId ?? "x";
    // A firm whose form needs a detail only the user has still goes to the review (D64), so it is kept like a ready one.
    const ready = r.enquiries.filter((e) => e.status === "ready_to_send" || e.status === "needs_input").map((e) => e.firmId);
    const selected = [...new Set([...ready, ...r.shortlist])].slice(0, 3);
    setLegalAid({ result: r as Step3Result, sample: state.demo, selected, ...(!state.demo && r.funding ? { funding: r.funding } : {}) });
    setEnquiry({ outcomes: r.enquiries, runId: r.runId, message: r.message, sample: state.demo });
    upsertEnquiries(r.enquiries.filter((e) => e.status === "ready_to_send" || e.status === "needs_input").map((e) => ({ firmId: e.firmId, firmName: e.firmName, status: e.status === "ready_to_send" ? ("ready_to_send" as const) : ("draft" as const) })));
    const run: CaseRunRecord = { runId: r.runId ?? "", says: r.says, plan: r.plan, evidence: r.evidence, asks: r.asks, recoveries: r.recoveries, turns: r.turns, durationMs: Date.now() - (state.startedAt ?? Date.now()), finishedAt: new Date().toISOString() };
    setCaseRun(run);
  }, [state.status, state.result, state.startedAt, state.demo]);

  const live = state.status === "running" || (state.status === "error" && state.says.length > 0);
  // A demo skip counts the whole step as done in the progress meter (D60).
  if (live)
    return (
      <Workspace
        state={state}
        onAnswer={answer}
        onSkip={(crew) => {
          skipStep(3);
          return skip(crew);
        }}
      />
    );
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
  return (
    <Intro
      error={state.status === "error" ? state.error : undefined}
      onStart={() => start(profile.facts, profile.legalAid?.funding)}
      onDemo={(toEnd) => {
        skipStep(3);
        return replay({ toEnd });
      }}
    />
  );
}

/* ------------------------------------------------------------------ before */

function Intro({ onStart, onDemo, error }: { onStart: () => void; onDemo: (toEnd: boolean) => void; error?: string }) {
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
      <DemoBar>
        <DemoButton onClick={() => onDemo(false)}>Play a recorded run, fast</DemoButton>
        <DemoButton onClick={() => onDemo(true)}>Jump to the finished case</DemoButton>
      </DemoBar>
    </div>
  );
}

/** Quiet controls for presenting (D63). Kept apart from the product UI so they never read as part of it. */
export function DemoBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-16 flex flex-wrap items-center justify-center gap-2 text-[12px] text-muted">
      <span className="mr-1">Demo</span>
      {children}
    </div>
  );
}
export function DemoButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="rounded-full border border-dashed border-line px-3 py-1 text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40">
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ during */

type RunState = ReturnType<typeof usePlannerRun>["state"];

/** Who works in a flow, in story order, and what each one is called in it (the complaint crew reuses the same screen, D65). */
export type CrewKit = { workers: CrewId[]; role: (id: CrewId) => string };
const COMPENSATION_KIT: CrewKit = { workers: ["nell", "robin", "iona", "kit"], role: (id) => CREW[id].role };

export function Workspace({ state, onAnswer, onSkip, kit = COMPENSATION_KIT }: { state: RunState; onAnswer: (id: string, v: string | null) => Promise<boolean>; onSkip: (crew: CrewId | "all") => void; kit?: CrewKit }) {
  const [scope, setScope] = useState<TraceScope | null>(null);
  const [drawer, setDrawer] = useState<CrewId | "all" | null>(null);
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

  const question = state.asks[0];

  // Who is in focus: the crew member in the spotlight; between steps, Elliot deciding what's next.
  const spot = state.spotlight;
  const lastPlan = state.says.findLast((x) => x.kind === "plan");
  const replanned = useFresh(lastPlan?.replan ? lastPlan.i : null, 6000);
  const focusCrew: CrewId = question ? (question.crew ?? "elliot") : replanned !== null ? "elliot" : spot && state.crew[spot.crew]?.state !== "idle" ? spot.crew : "elliot";
  const task = question
    ? "needs one detail from you"
    : focusCrew === "elliot"
      ? replanned !== null
        ? lastPlan!.text
        : state.crew.elliot?.state === "working" && state.crew.elliot.note
          ? `is ${lowerFirst(state.crew.elliot.note)}`
          : lastPlan
          ? `is deciding the next step: ${lowerFirst(lastPlan.text)}`
          : "is reading your case and making a plan"
      : lowerFirst(state.crew[focusCrew]?.note || spot?.tab.split(" · ")[1] || "is working");
  const site = spot && focusCrew !== "elliot" ? host(state.trace.findLast((t) => t.agent === spot.tab && t.url)?.url) : "";
  const order = kit.workers;
  const stepNo = order.indexOf(focusCrew) + 1;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* The one thing to look at: who is working, on what, and their browser. A question appears right here. */}
      <section className="overflow-hidden rounded-card border border-line bg-white">
        <div className="flex items-start gap-5 border-b border-line-soft px-6 py-5">
          <CrewMark id={focusCrew} size={64} />
          <div className="min-w-0 flex-1">
            <p className={cx("text-[12px]", replanned !== null && !question ? "font-medium text-amber" : "text-muted")}>
              {replanned !== null && !question ? "Elliot · changed the plan" : `${CREW[focusCrew].name} · ${kit.role(focusCrew).toLowerCase()}${site ? ` · on ${site}` : ""}${stepNo > 0 ? ` · step ${stepNo} of ${order.length}` : ""}${state.demo ? " · recorded run" : ""}`}
            </p>
            <h1 key={`${focusCrew}-${task}`} className="rise display mt-1 text-[28px] leading-[1.2] text-ink">
              {question || (focusCrew === "elliot" && replanned === null) ? `${CREW[focusCrew].name} ${task}` : task.replace(/^./, (c) => c.toUpperCase())}
            </h1>
          </div>
          <div className="shrink-0 pt-0.5 text-right text-[13px] text-ink-2">
            <span className="tabular-nums">{mmss(elapsed)}</span>
            <span className="mx-2 text-fade">·</span>
            <button className="text-brand hover:underline" onClick={() => setDrawer("all")}>
              Plan and history
            </button>
          </div>
        </div>
        {question && <QuestionCard key={question.id} q={question} more={state.asks.length - 1} onAnswer={onAnswer} />}
      </section>

      <CrewRow state={state} ids={["elliot", ...kit.workers]} onOpen={(id) => setDrawer(id)} />

      <Found says={state.says} trace={state.trace} runId={state.runId} onTrace={setScope} />

      {/* The browsers working right now, small. Click one to watch it in a window. */}
      <section aria-label="Browsers working now">
        <div id="live-slot" />
      </section>
      {state.status === "error" && <p className="text-[13px] text-danger">{state.error}</p>}

      {state.status === "running" && (
        <DemoBar>
          {order.map((id) => {
            // Steps already behind us in the story are not offered.
            const reached = Math.max(0, ...order.map((o, i) => (state.says.some((x) => x.from === o && x.kind === "report") ? i : 0)));
            if (order.indexOf(id) < reached) return null;
            const asked = state.skipped.includes(id) || state.skipped.includes("all");
            return (
              <DemoButton key={id} disabled={asked} onClick={() => onSkip(id)}>
                {asked ? `Skipping ${CREW[id].name}` : `Skip ${CREW[id].name}`}
              </DemoButton>
            );
          })}
          <DemoButton disabled={state.skipped.includes("all")} onClick={() => onSkip("all")}>
            {state.skipped.includes("all") ? "Wrapping up" : "Finish now"}
          </DemoButton>
        </DemoBar>
      )}

      {drawer && (
        <Drawer
          title={drawer === "all" ? "The plan and everything that happened" : `${CREW[drawer].name}: ${kit.role(drawer).toLowerCase()}`}
          onClose={() => {
            setDrawer(null);
            window.dispatchEvent(new CustomEvent("live-focus", { detail: "follow" }));
          }}
        >
          {drawer === "all" ? (
            <div className="space-y-6">
              <PlanChips plan={state.plan} />
              <Timeline says={state.says} trace={state.trace} runId={state.runId} openAsks={state.asks.map((a) => a.id)} onTrace={setScope} />
            </div>
          ) : (
            <div className="space-y-4">
              <button className="text-[13px] text-brand hover:underline" onClick={() => window.dispatchEvent(new CustomEvent("live-focus", { detail: CREW[drawer].name }))}>
                Show {CREW[drawer].name}&apos;s browser
              </button>
              <Timeline says={state.says.filter((x) => x.from === drawer || (x.to === drawer && x.kind === "assign"))} trace={state.trace} runId={state.runId} openAsks={state.asks.map((a) => a.id)} onTrace={setScope} compact />
            </div>
          )}
        </Drawer>
      )}
      {scope && <TraceSheet scope={scope} runId={state.runId} onClose={() => setScope(null)} />}
    </div>
  );
}

/** What the crew has found so far: one line per finished job, newest first, with its proof one click away. */
function Found({ says, trace, runId, onTrace }: { says: Say[]; trace: TraceStep[]; runId?: string; onTrace: (s: TraceScope) => void }) {
  const done = says.filter((s) => s.kind === "report").slice().reverse();
  if (!done.length) return null;
  return (
    <section aria-label="What the crew found so far">
      <h2 className="mb-2 text-[12px] text-muted">What the crew found so far</h2>
      <ol className="max-h-[21rem] divide-y divide-line-soft overflow-y-auto rounded-card border border-line bg-white">
        {done.map((s) => {
          const steps = s.tab ? trace.filter((t) => t.agent === s.tab) : [];
          const shot = steps.findLast((t) => t.shot)?.shot;
          return (
            <li key={s.i} className="rise flex items-center gap-3 px-4 py-3">
              <CrewMark id={s.from} size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-5 text-ink">
                  {s.ok === false && <span className="mr-1 rounded-[3px] bg-danger-soft px-1 text-[11px] font-medium text-danger">Problem</span>}
                  {s.text}
                </p>
                {s.facts && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.facts.map((f) => (
                      <span key={f.label} title={whyFor(f.label)} className={cx("inline-flex cursor-help items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px]", FACT[f.value].cls)}>
                        <span aria-hidden>{FACT[f.value].mark}</span>
                        {f.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {shot && (
                <button onClick={() => onTrace({ title: `${CREW[s.from].name}: ${s.text}`, steps })} title="How they found it" className="shrink-0 overflow-hidden rounded-[4px] border border-line hover:border-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element -- screenshots served by our own route */}
                  <img src={shotUrl(runId, shot)} alt="" className="h-[40px] w-[64px] object-cover object-top" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The crew as one quiet row: who has finished, who is working, who is waiting. Click someone to see what they did. */
function CrewRow({ state, ids, onOpen }: { state: RunState; ids: CrewId[]; onOpen: (id: CrewId) => void }) {
  return (
    <nav aria-label="The crew" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
      {ids.map((id, i) => {
        const c = state.crew[id];
        const started = c.state !== "idle" || state.says.some((s) => s.from === id);
        const done = c.state === "done" || (c.state === "idle" && state.says.some((s) => s.from === id && s.kind === "report" && s.ok !== false));
        return (
          <span key={id} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="h-px w-6 bg-line" />}
            <button onClick={() => onOpen(id)} title={`${CREW[id].name}: see what they did`} className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[13px] hover:bg-subtle">
              <span className="relative">
                <CrewMark id={id} size={30} className={cx("transition-[filter,opacity] duration-300", !started && "opacity-40 grayscale-[40%]")} />
                {started && (
                  <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-[3px] bg-white">
                    <StateMark state={c.state === "idle" && done ? "done" : c.state} />
                  </span>
                )}
              </span>
              <span className={cx(started ? "text-ink" : "text-muted")}>{CREW[id].name}</span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function PlanChips({ plan }: { plan: PlanStep[] }) {
  if (!plan.length) return null;
  return (
    <ol className="space-y-1.5" aria-label="The plan">
      {plan.map((p) => (
        <li key={`${p.id}-${p.status}-${p.text}`} className="flex items-start gap-2 text-[13px] leading-5" title={p.why}>
          <span className="mt-1">
            <PlanMark status={p.status} />
          </span>
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

/* ------------------------------------------------------------------ the timeline (behind a click) */

function Timeline({ says, trace, runId, openAsks, onTrace, compact }: { says: Say[]; trace: TraceStep[]; runId?: string; openAsks: string[]; onTrace: (s: TraceScope) => void; compact?: boolean }) {
  // An open question is on screen in its own card: don't repeat it here.
  const lastAsk = says.findLast((x) => x.kind === "ask");
  // Newest first (Tarun): what just happened is at the top.
  const shown = useMemo(() => says.filter((s) => !(s.kind === "ask" && openAsks.length > 0 && s === lastAsk)).reverse(), [says, openAsks.length, lastAsk]);
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
              <span key={f.label} title={whyFor(f.label)} className={cx("inline-flex cursor-help items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px]", FACT[f.value].cls)}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="rise relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-card bg-white">
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
    <section className="rise flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-amber/30 border-l-4 border-l-amber bg-amber-soft/40 px-5 py-4" role="region" aria-live="polite" aria-label="A question for you">
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
  const outcomes = profile.enquiry?.outcomes ?? [];
  const ready = outcomes.filter((o) => o.status === "ready_to_send" || o.status === "needs_input");
  const needs = outcomes.filter((o) => o.status === "needs_input");
  const s = result.stats;
  const gap = ev.gaps?.[0];
  const point = ev.guideline?.points[0];
  const askedInMessage = !!profile.enquiry?.message && /NICE|guideline|MRI/i.test(profile.enquiry.message.body);
  const similar = (ev.cases ?? []).filter((c) => c.kind === "medical_negligence");
  const other = (ev.cases ?? []).filter((c) => c.kind !== "medical_negligence");
  // Steps skipped from the demo controls, or never reached because the run was stopped early.
  const skipped = (id: CrewId) => run.says.some((x) => x.from === id && x.text === "Skipped, as you asked.");
  const reached = (id: CrewId) => run.says.some((x) => x.from === id && x.kind === "report" && x.text !== "Skipped, as you asked.");

  const funding =
    result.verdict === "likely"
      ? { title: "Legal aid looks likely", text: "SLAB's own calculator says you are likely to qualify, so legal aid could pay your solicitor. Nothing to do now: the solicitor applies for it with you." }
      : result.verdict === "unlikely"
        ? { title: "Legal aid looks unlikely", text: "SLAB's calculator says you probably do not qualify. Many firms take claims like yours on a no win, no fee basis instead; Robin checked which ones say so." }
        : result.verdict === "skipped" || skipped("nell") || !reached("nell")
          ? { title: "Funding not checked", text: skipped("nell") || !reached("nell") ? "Nell did not check legal aid this time. A solicitor can check it with you, or run the crew again." : "You skipped the money questions. A solicitor can check legal aid with you." }
          : { title: "Funding is unclear", text: "We could not read an estimate from SLAB's calculator. A solicitor can check legal aid with you." };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="display text-[40px] text-ink">Your case is ready</h1>
        {first && <p className="mt-3 max-w-3xl font-serif text-[18px] leading-7 text-ink-2">{first}</p>}
        {rest && (
          <>
            {full && <p className="rise mt-2 max-w-3xl font-serif text-[16px] leading-7 text-ink-2">{rest}</p>}
            <button className="mt-2 text-[13px] text-brand hover:underline" onClick={() => setFull((f) => !f)}>
              {full ? "Less" : "Elliot's full summary"}
            </button>
          </>
        )}
      </header>

      {/* The one next action */}
      <section className="flex flex-wrap items-center gap-5 rounded-card border border-brand/40 bg-white px-6 py-5">
        <CrewMark id="kit" size={56} />
        <div className="min-w-[16rem] flex-1">
          <p className="text-[12px] text-muted">Your next step</p>
          <h2 className="text-[18px] font-medium leading-7 text-ink">{ready.length ? `Check and send ${ready.length} enquir${ready.length === 1 ? "y" : "ies"}` : "Finish preparing your case"}</h2>
          <p className="text-[13px] leading-5 text-muted">{ready.length ? `Kit filled ${ready.length === 1 ? "the form" : "the forms"} for ${ready.map((r) => r.firmName).join(", ")} and stopped before Send.${needs.length ? ` ${needs.length === 1 ? "One form needs" : `${needs.length} forms need`} a detail from you, and you can change anything before it goes.` : " You can change anything before it goes."}` : top.length ? "Kit did not fill any enquiry forms this time. Run the crew again and Kit will prepare them." : "The crew stopped before it found solicitors. Run it again to finish the work."}</p>
        </div>
        <Button onClick={ready.length ? onReview : onRestart}>{ready.length ? "Review and send" : "Run again"}</Button>
      </section>

      <div className="divide-y divide-line rounded-card border border-line bg-white">
        <Row crew="nell" topic="Paying for a solicitor" title={funding.title}>
          <p className="text-[15px] leading-6 text-ink">{funding.text}</p>
          {result.calculatorText && (
            <Quote source="SLAB's calculator" href={SLAB_CALC}>
              {result.calculatorText}
            </Quote>
          )}
        </Row>

        <Row crew="robin" topic="Solicitors" title={top.length ? `${top.length} solicitor${top.length === 1 ? "" : "s"} who could take your case` : "No solicitors checked yet"}>
          <p className="text-[15px] leading-6 text-ink">{top.length ? "Robin checked each firm's own website and the Law Society register. These fit you best." : "Robin did not get to check any firms before the run ended."}</p>
          <ul className="mt-2 divide-y divide-line-soft">
            {top.map((f) => (
              <FirmLine key={f.id} f={f} />
            ))}
          </ul>
          {result.firms.length > 0 && (
            <button className="mt-3 text-[13px] text-brand hover:underline" onClick={onFirms}>
              See all {result.firms.length} firms Robin looked at
            </button>
          )}
        </Row>

        <Row crew="iona" topic="Medical evidence" title={gap ? "One question worth asking" : point ? "What the guidance says" : "Evidence not checked yet"}>
          {gap && point ? (
            <div className="space-y-4">
              <Said label="What doctors are advised to do">
                <Quote source={`NICE guideline ${ev.guideline!.name.match(/NG\d+/)?.[0] ?? ""}, ${point.id}`.replace(" ,", ",")} href={ev.guideline!.url} inline>
                  {point.text}
                </Quote>
              </Said>
              <Said label="What you told us">{gap.timeline}</Said>
              <Said label="Why it matters">This may be a gap in your care, or there may be a good reason for it. Only your medical records can show which, and a solicitor will check them.</Said>
              <div className="rounded-[6px] bg-purple-soft px-4 py-3">
                <p className="text-[13px] font-medium text-purple">The question to ask</p>
                <p className="mt-1 text-[14px] leading-6 text-ink">{gap.question}</p>
                <p className="mt-2 text-[12px] text-ink-2">{askedInMessage ? "Kit already put this in your enquiry. Nothing to do now." : "Mention this when a solicitor gets back to you."}</p>
              </div>
            </div>
          ) : point ? (
            <Quote source={ev.guideline!.name.split(":")[0]} href={ev.guideline!.url}>
              {point.text}
            </Quote>
          ) : (
            <p className="text-[15px] leading-6 text-ink">{reached("iona") ? "Iona did not find a guideline point about your injury." : "Iona did not read the clinical guidance this time."}</p>
          )}
          {ev.cases && (
            <p className="mt-4 text-[13px] leading-5 text-muted">
              {similar.length ? (
                <>
                  Similar Scottish court cases:{" "}
                  {similar.map((c, i) => (
                    <span key={c.url}>
                      {i > 0 && ", "}
                      <a className="text-brand hover:underline" href={c.url} target="_blank" rel="noreferrer">
                        {c.title} ({c.year})
                      </a>
                    </span>
                  ))}
                  .
                </>
              ) : (
                <>
                  Iona found no Scottish court case about a missed injury like yours. That is common: most claims settle without going to court.
                  {other[0] && (
                    <>
                      {" "}
                      The closest,{" "}
                      <a className="text-ink-2 underline decoration-line underline-offset-2 hover:text-brand" href={other[0].url} target="_blank" rel="noreferrer">
                        {other[0].title} ({other[0].year})
                      </a>
                      , is about a similar injury from another cause.
                    </>
                  )}
                </>
              )}
            </p>
          )}
        </Row>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 text-[12px] text-muted">
        <span className="tabular-nums">
          {s.agents > 0 ? `${s.agents} browser agents · ${s.sites} websites · ${s.pages} pages · ${s.actions} clicks and typing · ${run.asks} questions to you · ${mmss(run.durationMs)}` : "Nothing was checked in a browser this time"}
        </span>
        <span className="flex gap-4">
          <button className="text-brand hover:underline" onClick={onReplay}>
            How the crew worked
          </button>
          <button className="hover:text-ink" onClick={onRestart}>
            Run again
          </button>
        </span>
      </footer>
    </div>
  );
}

/** One part of the case file: who found it on the left, what it means on the right. */
export function Row({ crew, topic, title, children }: { crew: CrewId; topic: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 px-6 py-6 md:grid-cols-[180px_1fr] md:gap-8">
      <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-2">
        <CrewMark id={crew} size={40} />
        <div>
          <div className="text-[13px] font-medium text-ink">{topic}</div>
          <div className="text-[12px] text-muted">Found by {CREW[crew].name}</div>
        </div>
      </div>
      <div className="min-w-0">
        <h2 className="display text-[24px] leading-tight text-ink">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

export function Said({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <div className="mt-0.5 text-[15px] leading-6 text-ink">{children}</div>
    </div>
  );
}

/** A quote in the source's own words, with a link to where it came from. */
export function Quote({ source, href, inline, children }: { source: string; href: string; inline?: boolean; children: React.ReactNode }) {
  return (
    <figure className={cx(!inline && "mt-3 border-l-2 border-line pl-4")}>
      <blockquote className="font-serif text-[16px] leading-7 text-ink">&ldquo;{children}&rdquo;</blockquote>
      <figcaption className="mt-1 text-[12px] text-muted">
        <a className="text-brand hover:underline" href={href} target="_blank" rel="noreferrer">
          {source} ↗
        </a>
      </figcaption>
    </figure>
  );
}

/** A firm as plain facts; the score behind it opens on click (Codex: facts, not bare percentages). */
function FirmLine({ f }: { f: Step3Result["firms"][number] }) {
  const [open, setOpen] = useState(false);
  const facts: { label: string; on: boolean | null }[] = [
    { label: "Takes legal aid", on: f.legalAid },
    { label: "Represents patients", on: f.actsForPatients === "yes" ? true : f.actsForPatients === "no" ? false : null },
    { label: "No win no fee", on: f.noWinNoFee === "yes" ? true : f.noWinNoFee === "no" ? false : null },
    { label: "Online form", on: f.enquiryUrl ? true : null },
  ];
  const where = [f.town, f.distanceMiles != null ? `${f.distanceMiles < 1 ? f.distanceMiles.toFixed(1) : Math.round(f.distanceMiles)} miles away` : null].filter(Boolean).join(" · ");
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <span className="text-[15px] font-medium text-ink">{f.name}</span>
          {where && <span className="ml-2 text-[13px] text-muted">{where}</span>}
        </div>
        <span className="flex gap-4 text-[13px]">
          {f.breakdown && (
            <button className="text-muted hover:text-brand" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Hide why" : "Why this firm"}
            </button>
          )}
          {f.website && (
            <a className="text-brand hover:underline" href={f.website} target="_blank" rel="noreferrer">
              Website ↗
            </a>
          )}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {facts
          .filter((x) => x.on !== false)
          .map((x) => (
            <span key={x.label} title={whyFor(x.label)} className={cx("inline-flex cursor-help items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12px]", x.on ? "bg-teal-soft text-teal" : "bg-subtle text-muted")}>
              <span aria-hidden>{x.on ? "✓" : "?"}</span>
              {x.label}
              {x.on === null && <span className="sr-only">(not stated on their site)</span>}
            </span>
          ))}
      </div>
      {open && f.breakdown && (
        <ul className="rise mt-2">
          {f.breakdown.map((r) => (
            <ScoreRow key={r.key} row={r} />
          ))}
        </ul>
      )}
    </li>
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
