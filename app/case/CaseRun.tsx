"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Step3Result, TraceStep } from "../../lib/agent/legalAidTypes";
import type { RouteMap } from "../../lib/agent/routeTypes";
import { CREW, type AskSpec, type PlannerResult, type CrewId, type PlanStep, type Say } from "../../lib/agent/plannerTypes";
import { setCaseRun, setEnquiry, setLegalAid, skipStep, upsertEnquiries, type CaseRunRecord, type Profile } from "../../lib/profile";
import { Button, cx } from "../ui";
import { CREW_ORDER, CrewMark, StateMark } from "./crew/Crew";
import StepStrip, { routeSteps } from "./crew/StepStrip";
import CaseBoard from "./CaseBoard";
import FirmResults from "./FirmResults";
import InvestigationList from "./Investigation";
import { ScoreRow, whyFor } from "./scoreParts";
import TraceSheet, { type TraceScope } from "./TraceSheet";
import { usePlannerRun } from "./usePlannerRun";
import { shapeFromWorkers } from "./runProgress";
import { useRunProgress } from "./useRunProgress";
import RunProgressBar from "./RunProgressBar";
import { placeOf, useDemoAvailable } from "./useDemo";
import { summarise, type LedgerEntry } from "../../lib/agent/ledgerSummary";

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
  const { state, start, answer, replay, skip, pause } = usePlannerRun({ scope: "case", caseId: profile.createdAt });
  const place = placeOf(profile);
  const hasDemo = useDemoAvailable("step3", place);
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
    // A run picked up again after a reload is already in the case file: saving it again would undo the firms you picked.
    if (r.runId && saved?.runId === r.runId) {
      persisted.current = r.runId;
      return;
    }
    persisted.current = r.runId ?? "x";
    // A firm whose form needs a detail only the user has still goes to the review (D64), so it is kept like a ready one.
    const ready = r.enquiries.filter((e) => e.status === "ready_to_send" || e.status === "needs_input").map((e) => e.firmId);
    const selected = [...new Set([...ready, ...r.shortlist])].slice(0, 3);
    setLegalAid({ result: r as Step3Result, sample: state.demo, selected, ...(!state.demo && r.funding ? { funding: r.funding } : {}) });
    setEnquiry({ outcomes: r.enquiries, runId: r.runId, message: r.message, sample: state.demo });
    upsertEnquiries(r.enquiries.filter((e) => e.status === "ready_to_send" || e.status === "needs_input").map((e) => ({ firmId: e.firmId, firmName: e.firmName, status: e.status === "ready_to_send" ? ("ready_to_send" as const) : ("draft" as const) })));
    const run: CaseRunRecord = { runId: r.runId ?? "", says: r.says, plan: r.plan, evidence: r.evidence, asks: r.asks, recoveries: r.recoveries, turns: r.turns, durationMs: (state.endedAt ?? Date.now()) - (state.startedAt ?? Date.now()), finishedAt: new Date().toISOString() };
    setCaseRun(run);
  }, [state.status, state.result, state.startedAt, state.endedAt, state.demo, saved?.runId]);

  // Night plan ("Elliot anywhere"): with a route map, the generic crew works with the place's own checker and register.
  const routeMap = profile.route && "map" in profile.route ? profile.route.map : undefined;
  const go = () => (routeMap ? start(profile.facts, undefined, "compensation_anywhere", routeMap) : start(profile.facts, profile.legalAid?.funding));
  // The crew screen stays after the run, like the research screen: the case fills in on the left, what the crew did on the right.
  const [fileOpen, setFileOpen] = useState(false);
  const live = state.status === "running" || (state.status === "error" && state.says.length > 0) || (state.status === "done" && state.says.length > 0 && !fileOpen);
  const fundingStep = routeMap?.steps.find((x) => x.kind === "funding");
  const outs = state.result?.enquiries ?? state.enquiries;
  const ready = outs.filter((o) => o.status === "ready_to_send" || o.status === "needs_input");
  if (live)
    return (
      <Workspace
        state={state}
        onAnswer={answer}
        onPause={pause}
        onSkip={(crew) => {
          skipStep(3);
          return skip(crew);
        }}
        onRetry={() => go()}
        currency={routeMap ? currencyOf(routeMap.place.country) : undefined}
        main={
          <CaseBoard
            input={{ says: state.says, crew: state.crew, firms: state.firms, evidence: state.evidence, enquiries: state.enquiries, result: state.result, skipped: state.skipped, checker: fundingStep?.body }}
            checkerUrl={fundingStep?.url}
            next={state.status === "done" && state.result ? (ready.length ? { label: `Check and send ${ready.length} enquir${ready.length === 1 ? "y" : "ies"}`, note: "Kit filled the forms and stopped before Send. You can change anything before it goes.", run: onReviewEnquiries } : { label: "Finish preparing your case", note: "No enquiry form was filled this time. Run the crew again and Kit will prepare them.", run: () => go() }) : undefined}
            onFile={state.status === "done" && result ? () => setFileOpen(true) : undefined}
            onAgain={state.status === "done" ? () => go() : undefined}
          />
        }
      />
    );
  if (view === "firms" && result)
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <button className="text-[13px] text-brand hover:underline" onClick={() => setView("case")}>
          ← Back to your case file
        </button>
        <FirmResults checker={routeMap ? (routeMap.steps.find((x) => x.kind === "funding")?.body ?? "The legal aid checker") : undefined} result={result} sample={false} selected={profile.legalAid?.selected ?? []} onSelected={(ids) => setLegalAid({ selected: ids })} onContinue={onReviewEnquiries} />
      </div>
    );
  if (view === "replay" && saved) return <Replay run={saved} trace={result?.trace ?? []} onBack={() => setView("case")} />;
  if (saved && result)
    return (
      <div className="space-y-4">
        {fileOpen && state.says.length > 0 && (
          <button className="mx-auto block w-full max-w-4xl text-left text-[13px] text-brand hover:underline" onClick={() => setFileOpen(false)}>
            ← Back to the crew
          </button>
        )}
        <CaseFile profile={profile} run={saved} result={result} onFirms={() => setView("firms")} onReplay={() => setView("replay")} onReview={onReviewEnquiries} onRestart={go} />
      </div>
    );
  return (
    <Intro
      routeMap={routeMap}
      error={state.status === "error" ? state.error : undefined}
      onStart={go}
      recorded={hasDemo}
      onDemo={(toEnd) => {
        skipStep(3);
        return replay({ toEnd, place });
      }}
    />
  );
}

/* ------------------------------------------------------------------ before */

/** The money symbol, only where the place makes it obvious ("" otherwise, so we never show the wrong one). */
function currencyOf(country: string): string {
  const c = country.trim().toLowerCase();
  if (/^(united kingdom|uk|england|scotland|wales|northern ireland|great britain)$/.test(c)) return "£";
  if (/^(ireland|france|germany)$/.test(c)) return "€";
  if (/^(united states|usa|us|united states of america|new zealand|australia)$/.test(c)) return "$";
  return "";
}

function Intro({ onStart, onDemo, recorded, error, routeMap }: { onStart: () => void; onDemo: (toEnd: boolean) => void; recorded: boolean; error?: string; routeMap?: RouteMap }) {
  return (
    <div className="mx-auto max-w-5xl py-4">
      <h1 className="display text-[44px] text-ink">Prepare your case</h1>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-2">
        <CrewMark id="elliot" size={28} /> Elliot plans the route, and changes it as he learns.
      </p>
      <div className="mt-12">
        <StepStrip steps={routeMap ? routeSteps(routeMap) : undefined} />
      </div>
      <div className="mt-12 flex flex-col items-center gap-4">
        <Button onClick={onStart}>Start preparing my case</Button>
        <p className="text-[13px] text-muted">
          <span className="text-teal">✓</span> Asks you only when needed <span className="mx-2 text-fade">·</span> <span className="text-teal">✓</span> Nothing sent without your OK <span className="mx-2 text-fade">·</span> ≈ 4 min
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      {recorded && (
        <DemoBar>
          <DemoButton onClick={() => onDemo(false)}>Play a recorded run, fast</DemoButton>
          <DemoButton onClick={() => onDemo(true)}>Jump to the finished case</DemoButton>
        </DemoBar>
      )}
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

export function Workspace({ state, onAnswer, onSkip, onPause, onRetry, kit = COMPENSATION_KIT, currency = "£", main }: { state: RunState; onAnswer: (id: string, v: string | null) => Promise<boolean>; onSkip: (crew: CrewId | "all") => void; onPause?: (paused: boolean) => void; onRetry?: () => void; kit?: CrewKit; currency?: string; main?: React.ReactNode }) {
  const [scope, setScope] = useState<TraceScope | null>(null);
  const [drawer, setDrawer] = useState<CrewId | "all" | null>(null);
  // The clock stops while the run is paused: it adds each second to the total only when not paused, so a pause never counts.
  const [elapsed, setElapsed] = useState(0);
  const clock = useRef({ last: 0, paused: false, startedAt: null as number | null, seeded: false, over: false });
  useEffect(() => {
    clock.current.paused = !!state.paused;
    clock.current.startedAt = state.startedAt ?? null;
    // The clock stops when the run is over, and shows how long it took.
    clock.current.over = state.status === "done" || state.status === "error";
    if (clock.current.over && state.startedAt) setElapsed(Math.max(0, (state.endedAt ?? Date.now()) - state.startedAt));
  }, [state.paused, state.startedAt, state.status, state.endedAt]);
  useEffect(() => {
    clock.current.last = Date.now();
    const t = setInterval(() => {
      const c = clock.current;
      const n = Date.now();
      const dt = n - c.last;
      c.last = n;
      if (c.startedAt === null || c.over) return;
      if (!c.seeded) {
        c.seeded = true;
        setElapsed(n - c.startedAt);
      } else if (!c.paused) setElapsed((e) => e + dt);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const pct = useRunProgress(state, shapeFromWorkers(kit.workers));
  // A screen that picked up a run that went on while it was away says so, briefly.
  const back = useFresh(state.reconnectedAt ?? null, 4000);

  // The spotlight follows the work: whoever just started is shown big (unless the user pinned a browser).
  const tab = state.spotlight?.tab;
  useEffect(() => {
    if (tab) window.dispatchEvent(new CustomEvent("live-focus", { detail: { tab, auto: true } }));
  }, [tab]);

  const question = state.asks[0];
  const needs = state.handoffs.filter((h) => !h.outcome);
  useEffect(() => {
    document.title = needs.length ? `(${needs.length}) Needs you · Elliot` : "Elliot";
    return () => {
      document.title = "Elliot";
    };
  }, [needs.length]);
  const needsKey = needs.map((h) => h.id).join(",");
  useEffect(() => {
    const h = needs[0];
    window.dispatchEvent(new CustomEvent("live-handoff", { detail: h ? { ...h, runId: state.runId, demo: state.demo } : null }));
    // The modal stays closed until the patient clicks the tile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsKey, state.runId, state.demo]);

  // The browsers' info panel (app/LiveView.tsx) summarises what each browser did from the trace.
  useEffect(() => {
    // What each browser's crew member reported from it ("what we learned"), as lines the panel can match by tab.
    const learned = state.says.filter((x) => x.kind === "report" && x.tab && x.ok !== false && x.text !== "Skipped, as you asked.").map((x) => ({ agent: x.tab!, kind: "learned", text: x.text }));
    window.dispatchEvent(new CustomEvent("live-trace", { detail: [...state.trace.map((t) => ({ agent: t.agent, kind: t.kind, text: t.text })), ...learned] }));
  }, [state.trace, state.says]);

  // Who is in focus: the crew member in the spotlight; between steps, Elliot deciding what's next.
  const spot = state.spotlight;
  const lastPlan = state.says.findLast((x) => x.kind === "plan");
  const replanned = useFresh(lastPlan?.replan ? lastPlan.i : null, 6000);
  const focusCrew: CrewId = question ? (question.crew ?? "elliot") : replanned !== null ? "elliot" : spot && state.crew[spot.crew]?.state !== "idle" ? spot.crew : "elliot";
  const one = (t: string) => t.replace(/[.;:,]$/, "");
  const task = question
    ? "needs one detail from you"
    : focusCrew === "elliot"
      ? replanned !== null
        ? one(lastPlan!.text)
        : state.crew.elliot?.state === "working" && state.crew.elliot.note
          ? `is ${lowerFirst(state.crew.elliot.note)}`
          : lastPlan
          ? "is planning what the crew does next"
          : "is reading your case and making a plan"
      : lowerFirst(one(state.crew[focusCrew]?.note || spot?.tab.split(" · ")[1] || "is working"));
  const site = spot && focusCrew !== "elliot" ? host(state.trace.findLast((t) => t.agent === spot.tab && t.url)?.url) : "";
  const order = kit.workers;
  const stepNo = order.indexOf(focusCrew) + 1;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* The one thing to look at: who is working, on what, and their browser. A question appears right here. */}
      <section className="relative overflow-hidden rounded-card border border-line bg-white">
        {back !== null && <span className="rise absolute right-6 top-1.5 text-[11px] text-muted">Reconnected, picking up where the crew is</span>}
        <div className="relative flex items-start gap-5 border-b border-line-soft px-6 py-5">
          <CrewMark id={focusCrew} size={64} />
          <div className="min-w-0 flex-1">
            <p className={cx("text-[12px]", replanned !== null && !question ? "font-medium text-amber" : "text-muted")}>
              {replanned !== null && !question ? "Elliot · changed the plan" : `${CREW[focusCrew].name} · ${kit.role(focusCrew).toLowerCase()}${site ? ` · on ${site}` : ""}${stepNo > 0 ? ` · step ${stepNo} of ${order.length}` : ""}${state.demo ? " · recorded run" : ""}`}
            </p>
            {needs.length ? (
              <h1 className="rise display mt-1 text-[28px] leading-[1.2] text-amber" data-needs-you-title>
                ({needs.length}) Needs you
              </h1>
            ) : state.paused && !question ? (
              <h1 className="rise display mt-1 text-[28px] leading-[1.2] text-ink">Paused. The crew finishes what it is doing, then waits for you.</h1>
            ) : state.status === "done" && !question ? (
              <h1 className="rise display mt-1 text-[28px] leading-[1.2] text-ink">The crew has finished. Here is what they found.</h1>
            ) : (
              <h1 key={`${focusCrew}-${task}`} className="rise display mt-1 text-[28px] leading-[1.2] text-ink">
                {question || (focusCrew === "elliot" && replanned === null) ? `${CREW[focusCrew].name} ${task}` : task.replace(/^./, (c) => c.toUpperCase())}
              </h1>
            )}
          </div>
          <div className="shrink-0 pt-0.5 text-right text-[13px] text-ink-2">
            <span className="font-medium tabular-nums text-ink" title="An estimate, from what the crew has finished so far">
              {pct}%
            </span>
            <span className="mx-2 text-fade">·</span>
            <span className="tabular-nums">{mmss(elapsed)}</span>
            <span className="mx-2 text-fade">·</span>
            <button className="text-brand hover:underline" onClick={() => setDrawer("all")}>
              Plan and history
            </button>
            {onPause && state.status === "running" && !state.demo && (
              <>
                <span className="mx-2 text-fade">·</span>
                <button className="font-medium text-brand hover:underline" aria-pressed={!!state.paused} onClick={() => onPause(!state.paused)}>
                  {state.paused ? "Resume" : "Pause"}
                </button>
              </>
            )}
          </div>
          <RunProgressBar pct={pct} />
        </div>
        <div className={cx("px-6 py-3.5", question && "border-b border-line-soft")}>
          <CrewRow state={state} ids={["elliot", ...kit.workers]} onOpen={(id) => setDrawer(id)} />
        </div>
        {question && <QuestionCard key={question.id} q={question} more={state.asks.length - 1} onAnswer={onAnswer} currency={currency} />}
      </section>

      {main ? (
        // One row: what the crew builds (3/4) beside the feed of what it did (1/4).
        <div className="grid items-start gap-5 lg:grid-cols-4">
          <div className="min-w-0 lg:col-span-3">{main}</div>
          <div className="min-w-0 lg:sticky lg:top-4 lg:col-span-1">
            <Found says={state.says} trace={state.trace} runId={state.runId} onTrace={setScope} needs={needs} narrow />
          </div>
        </div>
      ) : (
        <Found says={state.says} trace={state.trace} runId={state.runId} onTrace={setScope} needs={needs} />
      )}

      {/* The browsers working right now, small. Click one to watch it in a window. */}
      <section aria-label="Browsers working now">
        <div id="live-slot" />
      </section>
      {state.status === "error" && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-danger/30 bg-white px-5 py-4">
          <p className="flex-1 text-[14px] text-danger">The run stopped: {state.error}</p>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}

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
              <ModelsTable entries={state.models} />
              <Timeline says={state.says} trace={state.trace} runId={state.runId} openAsks={state.asks.map((a) => a.id)} onTrace={setScope} needs={needs} />
            </div>
          ) : (
            <div className="space-y-4">
              <button className="text-[13px] text-brand hover:underline" onClick={() => window.dispatchEvent(new CustomEvent("live-focus", { detail: CREW[drawer].name }))}>
                Show {CREW[drawer].name}&apos;s browser
              </button>
              <ModelsLine entries={state.models.filter((m) => m.agent === drawer)} />
              <Timeline says={state.says.filter((x) => x.from === drawer || (x.to === drawer && x.kind === "assign"))} trace={state.trace} runId={state.runId} openAsks={state.asks.map((a) => a.id)} onTrace={setScope} compact needs={needs.filter((h) => h.crew === drawer)} />
            </div>
          )}
        </Drawer>
      )}
      {scope && <TraceSheet scope={scope} runId={state.runId} onClose={() => setScope(null)} />}
    </div>
  );
}

/** The instruction Elliot gave for this report's job (the 8-word "why"), so the history can say what the agent was trying to do. */
const goalOf = (says: Say[], s: Say) => says.findLast((x) => x.kind === "assign" && x.to === s.from && x.tool === s.tool && x.i < s.i)?.text;

/** What the crew has found so far: one line per finished job, newest first, with its proof one click away. */
function Found({ says, trace, runId, onTrace, needs = [], narrow }: { says: Say[]; trace: TraceStep[]; runId?: string; onTrace: (s: TraceScope) => void; needs?: RunState["handoffs"]; narrow?: boolean }) {
  const open = needs.filter((h) => !h.outcome);
  const done = says.filter((s) => s.kind === "report").slice().reverse();
  // Only the latest report from the tab that is waiting on the patient; earlier ones are history.
  const waiting = new Set(open.map((h) => done.find((s) => s.tab === h.tab)?.i).filter((i) => i !== undefined));
  if (!done.length && !open.length)
    return narrow ? (
      <section aria-label="What the crew found so far" className="rounded-card border border-line bg-white">
        <h2 className="border-b border-line-soft px-4 py-5 text-[12px] text-muted">What the crew found so far</h2>
        <p className="px-4 py-5 text-[13px] leading-5 text-muted">Each page the crew reads will show up here.</p>
      </section>
    ) : null;
  return (
    <section aria-label="What the crew found so far" className={cx(narrow && "overflow-hidden rounded-card border border-line bg-white")}>
      <h2 className={cx("text-[12px] text-muted", narrow ? "border-b border-line-soft px-4 py-5" : "mb-2")}>What the crew found so far</h2>
      <ol className={cx("divide-y divide-line-soft overflow-y-auto", narrow ? "max-h-[70vh]" : "max-h-[21rem] rounded-card border border-line bg-white")}>
        {open.map((h) => (
          <li key={h.id} className="flex items-center gap-3 bg-amber-soft px-4 py-3">
            <CrewMark id={h.crew} size={30} />
            <p className="min-w-0 flex-1 text-[14px] leading-5 text-ink">
              <span className="mr-1 text-[13px] font-medium text-amber">Needs you</span>
              {h.why}
            </p>
          </li>
        ))}
        {done.map((s) => {
          const tabSteps = s.tab ? trace.filter((t) => t.agent === s.tab) : [];
          // A report with no recorded steps still opens: the modal then shows the report itself.
          const steps: TraceStep[] = tabSteps.length ? tabSteps : [{ i: s.i, t: s.t, agent: CREW[s.from].name, color: CREW[s.from].color, kind: s.ok === false ? "fail" : "found", text: s.text, detail: s.detail }];
          const shot = tabSteps.findLast((t) => t.shot)?.shot;
          return (
            <li key={s.i} className="rise">
              <button
                onClick={() => onTrace({ title: goalOf(says, s) ?? `${CREW[s.from].name}: ${s.text}`, subtitle: `What ${CREW[s.from].name} tried and found`, steps })}
                title="See what they tried and found"
                className={cx("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none", narrow ? "items-start" : "items-center")}
              >
                <CrewMark id={s.from} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-5 text-ink">
                    {waiting.has(s.i) ? <span className="mr-1 text-[13px] font-medium text-amber">Needs you</span> : s.ok === false && <span className="mr-1 rounded-[3px] bg-danger-soft px-1 text-[11px] font-medium text-danger">Problem</span>}
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
                {shot && !narrow && (
                  <span className="shrink-0 overflow-hidden rounded-[4px] border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element -- screenshots served by our own route */}
                    <img src={shotUrl(runId, shot)} alt="" className="h-[40px] w-[64px] object-cover object-top" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The crew as one quiet row: who has finished, who is working, who is waiting. Click someone to see what they did. */
function CrewRow({ state, ids, onOpen }: { state: RunState; ids: CrewId[]; onOpen: (id: CrewId) => void }) {
  const open = state.handoffs.filter((h) => !h.outcome);
  return (
    <nav aria-label="The crew" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
      {ids.map((id, i) => {
        const c = state.crew[id];
        const mine = open.find((h) => h.crew === id);
        const started = c.state !== "idle" || state.says.some((s) => s.from === id) || !!mine;
        const done = c.state === "done" || (c.state === "idle" && state.says.some((s) => s.from === id && s.kind === "report" && s.ok !== false));
        return (
          <span key={id} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="h-px w-6 bg-line" />}
            <button
              onClick={() => {
                if (mine && !state.demo) {
                  window.dispatchEvent(new globalThis.Event("live-open"));
                  window.dispatchEvent(new CustomEvent("live-handoff-open"));
                  return;
                }
                onOpen(id);
              }}
              title={mine ? "Needs you" : `${CREW[id].name}: see what they did`}
              className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[13px] hover:bg-subtle"
            >
              <span className="relative">
                <CrewMark id={id} size={30} className={cx("transition-[filter,opacity] duration-300", !started && "opacity-40 grayscale-[40%]")} />
                {started && (
                  <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-[3px] bg-white">
                    <StateMark state={c.state === "idle" && done ? "done" : c.state} />
                  </span>
                )}
              </span>
              <span className={cx(started ? "text-ink" : "text-muted")}>{CREW[id].name}</span>
              {mine && <span className="rounded-full bg-amber px-1.5 py-0.5 text-[11px] font-medium text-white">Needs you</span>}
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

/* ------------------------------------------------------------------ models and data (the ledger, night plan Phase 4b) */

const DATA_WORDS: Record<string, string> = { place: "where you are", health: "your health story", money: "your money", identity: "who you are" };
const shortModel = (m: string) => m.replace(/^local:/, "").replace(/^hf\.co\/[^/]+\//, "").replace(/-GGUF.*$/, "");
const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** One quiet line per crew member: which model they ran on, where, how much, and what of yours it saw. */
function ModelsLine({ entries }: { entries: LedgerEntry[] }) {
  if (!entries.length) return null;
  const rows = summarise(entries);
  return (
    <div className="space-y-1 rounded-[6px] bg-subtle px-3 py-2 text-[12px] leading-5 text-ink-2">
      {rows.map((r) => (
        <p key={r.model}>
          <span className="font-medium text-ink">{shortModel(r.model)}</span> · {r.where === "local" ? "on this Mac" : "in the cloud"} · {r.calls} call{r.calls === 1 ? "" : "s"} · {tok(r.inTok + r.outTok)} tokens · {r.data.length ? `saw ${r.data.map((d) => DATA_WORDS[d] ?? d).join(", ")}` : "saw none of your details"}
        </p>
      ))}
    </div>
  );
}

/** What a model saw, in plain words. */
const SAW: Record<string, string> = { place: "where you are", health: "your health story", money: "your money", identity: "who you are" };

/** The whole run: every model, local or cloud, by crew member. */
function ModelsTable({ entries }: { entries: LedgerEntry[] }) {
  if (!entries.length) return null;
  const rows = summarise(entries);
  const local = rows.filter((r) => r.where === "local").reduce((a, r) => a + r.calls, 0);
  const total = rows.reduce((a, r) => a + r.calls, 0);
  return (
    <section aria-label="Models used" className="space-y-2">
      <p className="text-[12px] text-muted">
        Models used · {total} calls · {local} on this Mac · {tok(rows.reduce((a, r) => a + r.inTok + r.outTok, 0))} tokens
      </p>
      <ul className="divide-y divide-line-soft rounded-[6px] border border-line-soft text-[12px]">
        {rows.map((r) => (
          <li key={`${r.agent}-${r.model}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
            {r.agent in CREW ? <CrewMark id={r.agent as CrewId} size={18} /> : null}
            <span className="w-14 text-ink">{r.agent in CREW ? CREW[r.agent as CrewId].name : r.agent}</span>
            <span className="text-ink-2">{shortModel(r.model)}</span>
            <span className={cx("rounded-[4px] px-1.5", r.where === "local" ? "bg-teal-soft text-teal" : "bg-subtle text-ink-2")}>{r.where === "local" ? "on this Mac" : "cloud"}</span>
            {r.data.length > 0 && <span className="text-muted">saw {r.data.map((d) => SAW[d] ?? d).join(", ")}</span>}
            <span className="ml-auto tabular-nums text-muted">
              {r.calls} · {tok(r.inTok + r.outTok)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ the timeline (behind a click) */

function Timeline({ says, trace, runId, openAsks, onTrace, compact, needs = [] }: { says: Say[]; trace: TraceStep[]; runId?: string; openAsks: string[]; onTrace: (s: TraceScope) => void; compact?: boolean; needs?: RunState["handoffs"] }) {
  // An open question is on screen in its own card: don't repeat it here.
  const lastAsk = says.findLast((x) => x.kind === "ask");
  // Newest first (Tarun): what just happened is at the top.
  const shown = useMemo(() => says.filter((s) => !(s.kind === "ask" && openAsks.length > 0 && s === lastAsk)).reverse(), [says, openAsks.length, lastAsk]);
  const steps = (s: Say) => (s.kind === "report" && s.tab ? trace.filter((t) => t.agent === s.tab) : []);
  const open = needs.filter((h) => !h.outcome);
  if (!shown.length && !open.length) return <p className="text-[13px] text-muted">Nothing yet.</p>;
  return (
    <ol className={cx(compact ? "space-y-3" : "space-y-4")}>
      {open.map((h) => (
        <li key={h.id} className="border-l-2 border-amber pl-3 text-[14px] leading-6 text-ink">
          <span className="mr-1 font-medium text-amber">Needs you</span>
          {h.why}
        </li>
      ))}
      {shown.map((s) => (
        <Event key={s.i} s={s} steps={steps(s)} runId={runId} onTrace={(st) => onTrace({ title: goalOf(says, s) ?? `${CREW[s.from].name}: ${s.text}`, subtitle: `${CREW[s.from].name}'s steps`, steps: st })} compact={compact} needsYou={open.some((h) => h.crew === s.from)} />
      ))}
    </ol>
  );
}

const FACT: Record<"yes" | "no" | "unknown", { mark: string; cls: string }> = {
  yes: { mark: "✓", cls: "bg-teal-soft text-teal" },
  no: { mark: "✕", cls: "bg-danger-soft text-danger" },
  unknown: { mark: "?", cls: "bg-subtle text-muted" },
};

function Event({ s, steps, runId, onTrace, compact, needsYou }: { s: Say; steps: TraceStep[]; runId?: string; onTrace: (st: TraceStep[]) => void; compact?: boolean; needsYou?: boolean }) {
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
            {needsYou ? <span className="mr-1 font-medium text-amber">Needs you</span> : s.ok === false && <span className="mr-1 rounded-[3px] bg-danger-soft px-1 text-[11px] font-medium text-danger">Problem</span>}
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

function QuestionCard({ q, more, onAnswer, currency }: { q: AskSpec; more: number; onAnswer: (id: string, v: string | null) => Promise<boolean>; currency: string }) {
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
              {q.kind === "money" && currency && <span className="pl-3 text-[14px] text-muted">{currency}</span>}
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

  const routeMap = profile.route && "map" in profile.route ? profile.route.map : undefined;
  const fundingStep = routeMap?.steps.find((x) => x.kind === "funding");
  const checker = fundingStep ? `the official checker (${fundingStep.body})` : routeMap ? "the legal aid checker" : "SLAB's calculator";
  const registerName = routeMap?.steps.find((x) => x.kind === "lawyers")?.body ?? (routeMap ? "the official register" : "the Law Society register");
  const checkerUrl = fundingStep?.url ?? (routeMap ? undefined : SLAB_CALC);
  const funding =
    result.verdict === "likely"
      ? { title: "Legal aid looks likely", text: `${checker} says you are likely to qualify, so legal aid could pay your solicitor. Nothing to do now: the solicitor applies for it with you.` }
      : result.verdict === "unlikely"
        ? { title: "Legal aid looks unlikely", text: `${checker} says you probably do not qualify. Many firms take claims like yours on a no win, no fee basis instead; Robin checked which ones say so.` }
        : result.verdict === "skipped" || skipped("nell") || !reached("nell")
          ? { title: "Funding not checked", text: skipped("nell") || !reached("nell") ? "Nell did not check legal aid this time. A solicitor can check it with you, or run the crew again." : "You skipped the money questions. A solicitor can check legal aid with you." }
          : { title: "Funding is unclear", text: `We could not read an estimate from ${checker}. A solicitor can check legal aid with you.` };

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
            <Quote source={checker.replace(/^./, (c) => c.toUpperCase())} href={checkerUrl}>
              {result.calculatorText}
            </Quote>
          )}
        </Row>

        {(result as PlannerResult).scheme && !/does not (describe|say|mention)/i.test((result as PlannerResult).scheme!.text) && (
          <Row crew="robin" topic="Compensation scheme" title={(result as PlannerResult).scheme!.body}>
            <p className="text-[15px] leading-6 text-ink">{(result as PlannerResult).scheme!.text}</p>
            {(result as PlannerResult).scheme!.quote && (
              <Quote source={(result as PlannerResult).scheme!.body} href={(result as PlannerResult).scheme!.url}>
                {(result as PlannerResult).scheme!.quote}
              </Quote>
            )}
          </Row>
        )}

        <Row crew="robin" topic="Solicitors" title={top.length ? `${top.length} solicitor${top.length === 1 ? "" : "s"} who could take your case` : "No solicitors checked yet"}>
          <p className="text-[15px] leading-6 text-ink">{top.length ? `Robin checked each firm's own website and ${registerName}. These fit you best.` : "Robin did not get to check any firms before the run ended."}</p>
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
                <Quote source={/NG\d+/.test(ev.guideline!.name) ? `NICE guideline ${ev.guideline!.name.match(/NG\d+/)![0]}, ${point.id}` : ev.guideline!.name} href={ev.guideline!.url} inline>
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
                  Similar {routeMap ? `${routeMap.place.region || routeMap.place.country} ` : "Scottish "}court cases:{" "}
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
                  Iona found no {routeMap ? `${routeMap.place.region || routeMap.place.country} ` : "Scottish "}court case about a missed injury like yours. That is common: most claims settle without going to court.
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

        {ev.investigation && (
          <Row crew="iona" topic="Supporting evidence" title={ev.investigation.items.length ? "Decisions and awards in similar cases" : "No published decisions found"}>
            <InvestigationList inv={ev.investigation} />
          </Row>
        )}
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
export function Quote({ source, href, inline, children }: { source: string; href?: string; inline?: boolean; children: React.ReactNode }) {
  return (
    <figure className={cx(!inline && "mt-3 border-l-2 border-line pl-4")}>
      <blockquote className="font-serif text-[16px] leading-7 text-ink">&ldquo;{children}&rdquo;</blockquote>
      <figcaption className="mt-1 text-[12px] text-muted">
        {href ? (
          <a className="text-brand hover:underline" href={href} target="_blank" rel="noreferrer">
            {source} ↗
          </a>
        ) : (
          source
        )}
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
