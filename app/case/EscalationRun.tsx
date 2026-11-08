"use client";

import { useEffect, useRef, useState } from "react";
import { missingRequired } from "../../lib/agent/facts";
import { CREW, type CrewId, type EscalationInput, type EscalationResult } from "../../lib/agent/plannerTypes";
import type { RouteMap } from "../../lib/agent/routeTypes";
import { setOmbudsman, setProgress, skipStep, type Profile } from "../../lib/profile";
import { Button, cx } from "../ui";
import AskMissing from "./AskMissing";
import { CrewMark } from "./crew/Crew";
import StepStrip, { type Step } from "./crew/StepStrip";
import { DemoBar, DemoButton, Quote, Row, Said, Workspace, type CrewKit } from "./CaseRun";
import { closeAgentBrowser } from "./streamAgent";
import { usePlannerRun } from "./usePlannerRun";

/**
 * Step 2 anywhere (night plan, "Elliot anywhere"): take the complaint to the independent body discovery found.
 * Before: who does what, and one honest line when step 1 is not done. During: the shared crew workspace.
 * After: when you can go, the time limit, what the crew prepared, and the one next action.
 */

const ROLES: Partial<Record<CrewId, string>> = { elliot: "Leads your case", robin: "Reads the rules", kit: "Fills in the form" };
const KIT: CrewKit = { workers: ["robin", "kit"], role: (id) => ROLES[id] ?? CREW[id].role };

/** The last run, kept in this browser beside the profile (one per profile). */
const KEY = "case-escalation-v1";
type Saved = { profile: string; result: EscalationResult; finishedAt: string };
const load = (createdAt: string): Saved | null => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return s?.profile === createdAt ? s : null;
  } catch {
    return null;
  }
};

export default function EscalationRun({ profile, route, goToStepOne, onContinue }: { profile: Profile; route: RouteMap; goToStepOne: () => void; onContinue?: () => void }) {
  const { state, start, answer, skip } = usePlannerRun();
  const [saved, setSaved] = useState<Saved | null>(() => load(profile.createdAt));
  const [again, setAgain] = useState(false);
  const [reply, setReply] = useState("");

  const esc = route.steps.find((s) => s.kind === "escalation");
  const body = esc?.body ?? "the independent body";
  const provider = route.steps.find((s) => s.kind === "complaint")?.body ?? "the hospital";
  const skipped = profile.progress?.skipped ?? [];
  const sent = !!profile.progress?.nhsSent || skipped.includes(1);
  const replied = profile.ombudsman?.unlocked === true;

  // A finished run becomes the step 2 file.
  const persisted = useRef<string | null>(null);
  useEffect(() => {
    const r = state.escalation;
    if (state.status !== "done" || !r || persisted.current === r.runId) return;
    persisted.current = r.runId;
    const s: Saved = { profile: profile.createdAt, result: r, finishedAt: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* storage full: the file still shows for this visit */
    }
    if (r.form.status === "ready_to_submit") setProgress({ spsoFilled: true });
    setSaved(s);
    setAgain(false);
  }, [state.status, state.escalation, profile.createdAt]);

  const go = () => {
    const progress: EscalationInput = {
      complaintSent: sent,
      finalResponse: replied ? "yes" : sent ? "unknown" : "no",
      complaintText: profile.complaintRun?.result.draft?.details ?? profile.draft?.details,
      providerReply: reply.trim() || undefined,
    };
    void start(profile.facts, undefined, "escalation_anywhere", route, progress);
  };
  // Only when the chosen track goes on to step 3 (the complaint track ends here).
  const skipToStepThree = onContinue
    ? () => {
        void closeAgentBrowser();
        skipStep(2);
        onContinue();
      }
    : undefined;

  const live = state.status === "running" || (state.status === "error" && state.says.length > 0);
  if (live) return <Workspace state={state} onAnswer={answer} onSkip={skip} onRetry={() => go()} kit={KIT} />;
  if (saved && !again) return <EscalationFile run={saved.result} profile={profile} goToStepOne={goToStepOne} onAgain={() => setAgain(true)} onContinue={skipToStepThree} />;
  return (
    <Intro
      body={body}
      provider={provider}
      profile={profile}
      sent={sent}
      replied={replied}
      reply={reply}
      onReply={setReply}
      error={state.status === "error" ? state.error : undefined}
      onStart={go}
      goToStepOne={goToStepOne}
      onSkip={skipToStepThree}
    />
  );
}

/* ------------------------------------------------------------------ before */

function Intro({ body, provider, profile, sent, replied, reply, onReply, onStart, goToStepOne, onSkip, error }: { body: string; provider: string; profile: Profile; sent: boolean; replied: boolean; reply: string; onReply: (v: string) => void; onStart: () => void; goToStepOne: () => void; onSkip?: () => void; error?: string }) {
  const missing = missingRequired(profile.facts);
  const steps: Step[] = [
    { crew: ["robin"], title: "Check you can go", line: "Robin reads their rules and time limit" },
    { crew: ["elliot"], title: "Write your case", line: "From your complaint and their reply" },
    { crew: ["kit"], title: "Fill in their form", line: "Kit fills it in; you press Submit" },
    { crew: ["robin"], title: "No form? Find the address", line: "Robin finds it on their own page" },
  ];
  return (
    <div className="mx-auto max-w-5xl py-4">
      <p className="text-[12px] text-muted">If that fails · step 2</p>
      <h1 className="display mt-1 text-[44px] text-ink">Take it to {body}</h1>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-2">
        <CrewMark id="elliot" size={28} /> If {provider}&apos;s final reply does not put things right, {body} can look at it independently.
      </p>
      {!sent ? (
        <p className="mt-4 text-[14px] text-amber">
          Step 1 is not done yet: they usually need the final reply first. You can still prepare.{" "}
          <button className="text-brand hover:underline" onClick={goToStepOne}>
            Back to step 1
          </button>
        </p>
      ) : null}
      <div className="mt-12">
        <StepStrip steps={steps} />
      </div>
      <div className="mx-auto mt-10 max-w-xl space-y-6">
        <AskMissing profile={profile} scope="nhs" why={`${body}'s form needs this.`} />
        {sent && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-[15px] text-ink">
              <input type="checkbox" className="size-4 accent-brand" checked={replied} onChange={(e) => setOmbudsman({ unlocked: e.target.checked })} />
              {provider} has sent its final reply
            </label>
            {replied && (
              <textarea
                value={reply}
                onChange={(e) => onReply(e.target.value)}
                rows={3}
                placeholder="What did they say? A line or two is enough (optional)"
                className="w-full rounded-[6px] border border-line bg-white px-3 py-2 text-[15px] leading-6 text-ink placeholder:text-faint focus:border-brand focus:outline-none"
              />
            )}
          </div>
        )}
      </div>
      <div className="mt-10 flex flex-col items-center gap-4">
        <Button onClick={onStart} disabled={missing.length > 0}>
          Prepare my case
        </Button>
        <p className="text-[13px] text-muted">
          <span className="text-teal">✓</span> Asks you only when needed <span className="mx-2 text-fade">·</span> <span className="text-teal">✓</span> Nothing sent until you press Submit <span className="mx-2 text-fade">·</span> ≈ 4 min
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      {onSkip && (
        <DemoBar>
          <DemoButton onClick={onSkip}>Skip and continue to step 3</DemoButton>
        </DemoBar>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ after */

const READY: Record<NonNullable<EscalationResult["ready"]>["status"], { label: string; cls: string; title: string }> = {
  ready: { label: "You can go now", cls: "bg-teal-soft text-teal", title: "You can go now" },
  not_yet: { label: "Not yet", cls: "bg-amber-soft text-amber", title: "Not yet" },
  unclear: { label: "Check first", cls: "bg-subtle text-ink-2", title: "We could not tell" },
};
const LIMIT: Record<NonNullable<EscalationResult["timeLimit"]>["status"], { label: string; cls: string }> = {
  within: { label: "Inside the time limit", cls: "bg-teal-soft text-teal" },
  close: { label: "Close to the time limit", cls: "bg-amber-soft text-amber" },
  outside: { label: "May be past the time limit", cls: "bg-danger-soft text-danger" },
  unclear: { label: "Depends on your dates", cls: "bg-subtle text-ink-2" },
};
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

function EscalationFile({ run, profile, goToStepOne, onAgain, onContinue }: { run: EscalationResult; profile: Profile; goToStepOne: () => void; onAgain: () => void; onContinue?: () => void }) {
  const [letterOpen, setLetterOpen] = useState(false);
  const body = run.body;
  const done = !!profile.progress?.spsoSent;
  const notYet = run.ready?.status === "not_yet";
  const ready = run.form.status === "ready_to_submit";
  const filledForm = ready || run.form.status === "needs_input";
  const byLetter = !filledForm && !!run.message;
  const email = run.sendTo?.kind === "email" ? run.sendTo.address : "";
  const summary = run.says.findLast((s) => s.kind === "done")?.text ?? "";
  const first = summary.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? summary;
  const r = run.ready ? READY[run.ready.status] : null;
  const needs = run.form.unfilled.map((u) => u.replace(/[.\s]+$/, "")).join(", ");
  const halfway = run.form.status === "needs_input";
  const limit = run.timeLimit ? LIMIT[run.timeLimit.status] : null;

  const title = done ? `Sent to ${body}` : notYet ? "Ready for when you can go" : halfway ? "Almost ready: one thing for you" : filledForm || byLetter ? `Your case for ${body} is ready` : "Not prepared yet";
  const next = done
    ? { h: `${body} has your case`, p: `They reply to you directly.${onContinue ? " Meanwhile, step 3 looks at compensation." : ""}` }
    : notYet
      ? { h: `Wait for ${run.provider}'s final reply`, p: `${run.ready?.explanation ?? ""} Everything below is ready for that day.` }
      : filledForm
        ? halfway
          ? { h: "Finish the form, then press Submit", p: `Kit ${run.form.filled.length ? "filled in what it could on" : "opened"} their form and stopped.${needs ? ` It needs from you: ${needs}.` : ""}` }
          : { h: "Check the form and press Submit", p: "Kit filled in their form and stopped before Submit." }
        : byLetter
          ? { h: email ? "Send your case by email" : run.sendTo ? "Post your letter" : "Send your letter", p: run.sendTo ? `Robin found where it goes on ${body}'s own page.` : `We could not confirm their address. Check ${body}'s website before sending.` }
          : { h: "Run the crew again", p: run.form.note };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-[12px] text-muted">If that fails · step 2</p>
        <h1 className="display mt-1 text-[40px] text-ink">{title}</h1>
        {first && <p className="mt-3 max-w-3xl font-serif text-[18px] leading-7 text-ink-2">{first}</p>}
      </header>

      {/* The one next action */}
      <section className={cx("flex flex-wrap items-center gap-5 rounded-card border bg-white px-6 py-5", notYet && !done ? "border-amber/50" : "border-brand/40")}>
        <CrewMark id={filledForm ? "kit" : notYet ? "robin" : "elliot"} size={56} />
        <div className="min-w-[16rem] flex-1">
          <p className="text-[12px] text-muted">Your next step</p>
          <h2 className="text-[18px] font-medium leading-7 text-ink">{next.h}</h2>
          <p className="text-[13px] leading-5 text-muted">{next.p}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {done ? (
            onContinue ? <Button onClick={onContinue}>Continue to step 3</Button> : null
          ) : notYet ? (
            <Button variant="secondary" onClick={goToStepOne}>
              Back to step 1
            </Button>
          ) : filledForm ? (
            <>
              <Button variant="secondary" onClick={() => window.dispatchEvent(new CustomEvent("live-focus", { detail: "Kit" }))}>
                Open the form
              </Button>
              <Button
                onClick={() => {
                  void closeAgentBrowser();
                  setProgress({ spsoSent: true });
                }}
              >
                I&apos;ve pressed Submit
              </Button>
            </>
          ) : byLetter ? (
            <>
              <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(run.message ?? "")}>
                Copy letter
              </Button>
              {email && (
                <a className="inline-flex" href={`mailto:${email}?subject=${encodeURIComponent(run.subject ?? "Complaint")}&body=${encodeURIComponent(run.message ?? "")}`}>
                  <Button>Open in your email</Button>
                </a>
              )}
              <Button variant="secondary" onClick={() => setProgress({ spsoSent: true })}>
                I&apos;ve sent it
              </Button>
            </>
          ) : (
            <Button onClick={onAgain}>Run again</Button>
          )}
        </div>
      </section>

      <div className="divide-y divide-line rounded-card border border-line bg-white">
        <Row crew="robin" topic="When you can go" title={r?.title ?? "Not checked this time"}>
          {run.ready && r ? (
            <div className="space-y-3">
              <span className={cx("inline-block rounded-[4px] px-2 py-0.5 text-[12px] font-medium", r.cls)}>{r.label}</span>
              <p className="text-[15px] leading-6 text-ink">{run.ready.explanation}</p>
              {run.ready.when && (
                <Quote source={`${body} · ${hostOf(run.ready.url)}`} href={run.ready.url} inline>
                  {run.ready.when}
                </Quote>
              )}
            </div>
          ) : (
            <p className="text-[15px] leading-6 text-ink">Robin did not read {body}&apos;s rules this time.</p>
          )}
        </Row>

        <Row crew="robin" topic="Time limit" title={run.timeLimit?.limit ? (limit?.label ?? "Time limit") : "Not stated on their page"}>
          {run.timeLimit?.limit && limit ? (
            <div className="space-y-3">
              <span className={cx("inline-block rounded-[4px] px-2 py-0.5 text-[12px] font-medium", limit.cls)}>{limit.label}</span>
              <Quote source={`${body} · ${hostOf(run.timeLimit.url)}`} href={run.timeLimit.url} inline>
                {run.timeLimit.limit}
              </Quote>
              {run.timeLimit.explanation && <p className="text-[13px] leading-5 text-muted">{run.timeLimit.explanation}</p>}
            </div>
          ) : (
            <p className="text-[15px] leading-6 text-ink">Ask {body} how long you have; their page did not say.</p>
          )}
        </Row>

        <Row crew="elliot" topic="Your case" title={run.draft ? "Written from your complaint" : "Not written yet"}>
          {run.draft ? (
            <div className="space-y-4">
              <p className={cx("whitespace-pre-line font-serif text-[16px] leading-7 text-ink", !letterOpen && "line-clamp-5")}>{run.draft.details}</p>
              <button className="text-[13px] text-brand hover:underline" onClick={() => setLetterOpen((o) => !o)}>
                {letterOpen ? "Less" : "Read it all"}
              </button>
              {run.draft.outcome && <Said label="What you would like">{run.draft.outcome}</Said>}
              {run.ready?.include.length ? <Said label={`${body} asks you to include`}>{run.ready.include.join(" · ")}</Said> : null}
            </div>
          ) : (
            <p className="text-[15px] leading-6 text-ink">Elliot did not get to write it before the run ended.</p>
          )}
        </Row>

        <Row crew={filledForm ? "kit" : "robin"} topic={filledForm ? `${body}'s form` : "Where it goes"} title={ready ? "Filled in, not sent" : filledForm ? (run.form.filled.length ? "Filled in as far as possible" : "Open, waiting for you") : run.sendTo ? (run.sendTo.kind === "email" ? "By email" : "By post") : "No online form"}>
          {filledForm ? (
            <div className="space-y-3">
              <ul className="divide-y divide-line-soft text-[14px]">
                {run.form.filled.slice(0, 12).map((f) => (
                  <li key={`${f.label}-${f.value}`} className="flex gap-4 py-1.5">
                    <span className="w-44 shrink-0 text-muted">{f.label}</span>
                    <span className="min-w-0 truncate text-ink">{f.value}</span>
                  </li>
                ))}
              </ul>
              {needs && <p className="text-[14px] leading-6 text-amber">Still needs: {needs}.</p>}
              <a className="inline-block text-[13px] text-brand hover:underline" href={run.form.url} target="_blank" rel="noreferrer">
                {body}&apos;s online form ↗
              </a>
            </div>
          ) : run.sendTo ? (
            <div className="space-y-3">
              <p className="text-[15px] text-ink">{run.sendTo.address}</p>
              <Quote source={`${body} · ${hostOf(run.sendTo.url)}`} href={run.sendTo.url} inline>
                {run.sendTo.quote}
              </Quote>
              {run.form.status === "failed" && <p className="text-[13px] leading-5 text-muted">Their online form could not be used: {run.form.note}</p>}
            </div>
          ) : (
            <p className="text-[15px] leading-6 text-ink">{run.form.note}</p>
          )}
        </Row>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[13px]">
        <button className="text-brand hover:underline" onClick={onAgain}>
          Run the crew again
        </button>
        {!done && onContinue && (
          <button className="text-muted hover:text-brand hover:underline" onClick={onContinue} title={`Demo: nothing is sent to ${body}.`}>
            Skip and continue to step 3 (demo)
          </button>
        )}
      </div>
    </div>
  );
}
