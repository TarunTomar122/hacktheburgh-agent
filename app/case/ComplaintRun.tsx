"use client";

import { useEffect, useRef, useState } from "react";
import UnsupportedComplaint from "./UnsupportedComplaint";
import { supportsLothian } from "../../lib/agent/complaintScope";
import { hasSupport } from "../../lib/agent/complaintSupport";
import { missingRequired } from "../../lib/agent/facts";
import { CREW, type ComplaintResult, type CrewId } from "../../lib/agent/plannerTypes";
import { setComplaintRun, setDraft, setOmbudsman, setProgress, skipStep, type Profile } from "../../lib/profile";
import { Button, cx } from "../ui";
import AskMissing from "./AskMissing";
import InvestigationList from "./Investigation";
import { CrewMark } from "./crew/Crew";
import StepStrip, { type Step } from "./crew/StepStrip";
import { DemoBar, DemoButton, Quote, Row, Said, Workspace, type CrewKit } from "./CaseRun";
import { closeAgentBrowser } from "./streamAgent";
import { usePlannerRun } from "./usePlannerRun";
import { placeOf, useDemoAvailable } from "./useDemo";

/**
 * Step 1, "Complain to NHS Lothian" (D65): the same crew story as "Prepare your case", with the crew that makes
 * sense for a complaint. Robin reads NHS Lothian's rules and the time limit, Iona reads the guideline, Elliot writes
 * the complaint, Kit fills in NHS Lothian's form and stops. The patient checks it in the browser and presses Submit.
 */

const ROLES: Partial<Record<CrewId, string>> = { elliot: "Leads your complaint", robin: "Reads the rules", iona: "Clinical evidence", kit: "Fills in the form" };
const KIT: CrewKit = { workers: ["robin", "iona", "kit"], role: (id) => ROLES[id] ?? CREW[id].role };
const STEPS: Step[] = [
  { crew: ["robin"], title: "Read the rules", line: "Robin reads the provider's process and the time limit" },
  { crew: ["iona"], title: "Gather evidence", line: "Iona reads the clinical guideline" },
  { crew: ["elliot"], title: "Write your complaint", line: "Elliot writes it from your story" },
  { crew: ["kit"], title: "Fill in the form", line: "Kit fills it in; you press Submit" },
];
const NHS_PAGE = "https://www.nhslothian.scot/yourrights/patient-experience-team-tell-us-about-your-experience/how-do-i-make-a-complaint/";

export default function ComplaintRun({ profile, onContinue }: { profile: Profile; onContinue: () => void }) {
  const { state, start, answer, replay, skip, pause } = usePlannerRun({ scope: "complaint", caseId: profile.createdAt });
  const saved = profile.complaintRun;
  const [again, setAgain] = useState(false);

  // A finished run becomes the complaint file, and the draft the crew wrote is kept as the profile's draft.
  const persisted = useRef<string | null>(null);
  useEffect(() => {
    const r = state.complaint;
    if (state.status !== "done" || !r || persisted.current === r.runId) return;
    persisted.current = r.runId;
    if (r.draft) setDraft(r.draft);
    if (r.form.status === "ready_to_submit" && !state.demo) setProgress({ nhsFilled: true });
    setComplaintRun({ result: r, sample: state.demo, durationMs: (state.endedAt ?? Date.now()) - (state.startedAt ?? Date.now()), finishedAt: new Date().toISOString() });
    setAgain(false);
  }, [state.status, state.complaint, state.startedAt, state.endedAt, state.demo]);

  const live = state.status === "running" || (state.status === "error" && state.says.length > 0);
  // Night plan ("Elliot anywhere"): with a route map, the generic crew complains to whichever body discovery found.
  const route = profile.route && "map" in profile.route ? profile.route.map : undefined;
  const body = route?.steps.find((x) => x.kind === "complaint")?.body ?? "NHS Lothian";
  const go = () => (route ? start(profile.facts, undefined, "complaint_anywhere", route) : start(profile.facts, undefined, "complaint"));
  const place = placeOf(profile);
  const hasDemo = useDemoAvailable("complaint", place);
  const demo = (toEnd: boolean) => replay({ toEnd, flow: "complaint", place });
  const skipToStepTwo = () => {
    void closeAgentBrowser(); // a half-filled form is no use any more
    skipStep(1);
    setOmbudsman({ unlocked: true });
    onContinue();
  };

  if (!route && !supportsLothian(profile.facts)) return <UnsupportedComplaint key={JSON.stringify(profile.facts)} facts={profile.facts} />;
  if (live) return <Workspace state={state} onAnswer={answer} onSkip={skip} onPause={pause} onRetry={() => go()} kit={KIT} />;
  if (saved && !again) return <ComplaintFile body={body} profile={profile} run={saved.result} sample={saved.sample} onAgain={() => setAgain(true)} onContinue={onContinue} onSkip={skipToStepTwo} />;
  // A recorded run is offered only if one was made for this case's place.
  return <Intro body={body} recorded={hasDemo} profile={profile} error={state.status === "error" ? state.error : undefined} onStart={go} onDemo={demo} onSkip={skipToStepTwo} />;
}

/* ------------------------------------------------------------------ before */

function Intro({ body, recorded, profile, onStart, onDemo, onSkip, error }: { body: string; recorded: boolean; profile: Profile; onStart: () => void; onDemo: (toEnd: boolean) => void; onSkip: () => void; error?: string }) {
  const missing = missingRequired(profile.facts);
  return (
    <div className="mx-auto max-w-5xl py-4">
      <p className="text-[12px] text-muted">Complaint · step 1</p>
      <h1 className="display mt-1 text-[44px] text-ink">Complain to {body}</h1>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-2">
        <CrewMark id="elliot" size={28} /> Elliot plans the route, and changes it as he learns. You check the form and press Submit yourself.
      </p>
      <div className="mt-12">
        <StepStrip steps={STEPS} />
      </div>
      <div className="mx-auto mt-10 max-w-xl">
        <AskMissing profile={profile} scope="nhs" why={`${body}'s form needs this. We only ask it now that you are making a complaint.`} />
      </div>
      <div className="mt-10 flex flex-col items-center gap-4">
        <Button onClick={onStart} disabled={missing.length > 0}>
          Start my complaint
        </Button>
        <p className="text-[13px] text-muted">
          <span className="text-teal">✓</span> Asks you only when needed <span className="mx-2 text-fade">·</span> <span className="text-teal">✓</span> Nothing sent until you press Submit <span className="mx-2 text-fade">·</span> ≈ 3 min
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <DemoBar>
        {recorded && <DemoButton onClick={() => onDemo(false)}>Play a recorded run, fast</DemoButton>}
        {recorded && <DemoButton onClick={() => onDemo(true)}>Jump to the finished complaint</DemoButton>}
        <DemoButton onClick={onSkip}>Skip and continue to step 2</DemoButton>
      </DemoBar>
    </div>
  );
}

/* ------------------------------------------------------------------ after */

const LIMIT: Record<NonNullable<ComplaintResult["timeLimit"]>["status"], { label: string; cls: string }> = {
  within: { label: "Inside the time limit", cls: "bg-teal-soft text-teal" },
  close: { label: "Close to the time limit", cls: "bg-amber-soft text-amber" },
  outside: { label: "May be past the time limit", cls: "bg-danger-soft text-danger" },
  unclear: { label: "Dates too vague to tell", cls: "bg-subtle text-ink-2" },
};

function ComplaintFile({ body, profile, run, sample, onAgain, onContinue, onSkip }: { body: string; profile: Profile; run: ComplaintResult; sample: boolean; onAgain: () => void; onContinue: () => void; onSkip: () => void }) {
  const [full, setFull] = useState(false);
  const sent = !!profile.progress?.nhsSent;
  const summary = run.says.findLast((s) => s.kind === "done")?.text ?? "";
  const first = summary.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? summary;
  const rest = summary.slice(first.length).trim();
  const ready = run.form.status === "ready_to_submit";
  const filledForm = ready || run.form.status === "needs_input";
  // No online form: the crew prepared the message and found where it goes (D66 draft).
  const byEmail = !filledForm && !!run.message;
  const to = run.message?.match(/^To: (.+)$/m)?.[1] ?? "";
  const subject = run.message?.match(/^Subject: (.+)$/m)?.[1] ?? "Complaint";
  const letter = run.message?.replace(/^To: .+\n/m, "").replace(/^Subject: .+\n+/m, "") ?? "";
  const ev = run.evidence;
  const gap = ev.gaps?.[0];
  const point = ev.guideline?.points[0];
  const reached = (id: CrewId) => run.says.some((x) => x.from === id && x.kind === "report" && x.text !== "Skipped, as you asked.");
  const skipped = (id: CrewId) => run.says.some((x) => x.from === id && x.text === "Skipped, as you asked.");
  const limit = run.timeLimit ? LIMIT[run.timeLimit.status] : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-[12px] text-muted">Complaint · step 1{sample ? " · recorded run" : ""}</p>
        <h1 className="display mt-1 text-[40px] text-ink">{ready ? "Your complaint is ready" : "Your complaint is half done"}</h1>
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
          <h2 className="text-[18px] font-medium leading-7 text-ink">{sent ? "Your complaint is sent" : ready ? "Check the form and press Submit" : filledForm ? "Finish the form, then press Submit" : byEmail ? (to.includes("@") ? "Send your complaint by email" : "Send your complaint") : "Run the crew again"}</h2>
          <p className="text-[13px] leading-5 text-muted">
            {sent
              ? `Next, ${body} replies. If their final answer does not put things right, the independent review is step 2.`
              : sample
                ? "This is a recorded run: nothing was filled in or sent. In a real run the form waits in the browser for you."
                : filledForm
                  ? `Kit filled in ${body}'s form and stopped. Read it, change anything you like, and press Submit yourself.${run.form.unfilled.length ? ` It still needs: ${run.form.unfilled.join(", ")}.` : ""}`
                  : byEmail
                    ? `${body} has no online form. Elliot wrote your message${to ? ` and Robin found where it goes: ${to}` : ""}. Read it, change anything you like, and send it yourself.`
                    : "The form could not be filled this time."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sent ? (
            <Button onClick={onContinue}>Continue to step 2</Button>
          ) : filledForm && !sample ? (
            <>
              <Button variant="secondary" onClick={() => window.dispatchEvent(new CustomEvent("live-focus", { detail: "Kit" }))}>
                Open the form
              </Button>
              <Button
                onClick={() => {
                  void closeAgentBrowser();
                  setProgress({ nhsSent: true });
                }}
              >
                I&apos;ve pressed Submit
              </Button>
            </>
          ) : byEmail && !sample ? (
            <>
              <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(letter)}>
                Copy message
              </Button>
              {to.includes("@") && (
                <a className="inline-flex" href={`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(letter)}`}>
                  <Button>Open in your email</Button>
                </a>
              )}
              <Button variant="secondary" onClick={() => setProgress({ nhsSent: true })}>
                I&apos;ve sent it
              </Button>
            </>
          ) : sample ? (
            <Button onClick={onSkip}>Continue to step 2</Button>
          ) : (
            <Button onClick={onAgain}>Run again</Button>
          )}
        </div>
      </section>

      <div className="divide-y divide-line rounded-card border border-line bg-white">
        <Row crew="robin" topic="How it works" title={run.process ? `${body} answers in ${run.process.steps.length} steps` : skipped("robin") || !reached("robin") ? "Not checked this time" : "Could not read their pages"}>
          {run.process ? (
            <div className="space-y-3">
              <p className="text-[15px] leading-6 text-ink">{run.process.summary}</p>
              <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-6 text-ink">
                {run.process.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {hasSupport(run.process.support) && (
                <Said label="Free help">
                  {run.process.support}
                </Said>
              )}
              <a className="inline-block text-[13px] text-brand hover:underline" href={run.process.url || NHS_PAGE} target="_blank" rel="noreferrer">
                {body}&apos;s page ↗
              </a>
            </div>
          ) : (
            <p className="text-[15px] leading-6 text-ink">Robin did not read {body}&apos;s process this time.</p>
          )}
        </Row>

        <Row crew="robin" topic="Time limit" title={run.timeLimit ? (run.timeLimit.status === "within" ? "You are in time" : run.timeLimit.status === "close" ? "You are close to the limit" : run.timeLimit.status === "outside" ? "This may be too late" : "We could not tell") : "Time limit not checked"}>
          {run.timeLimit && limit ? (
            <div className="space-y-3">
              <span className={cx("inline-block rounded-[4px] px-2 py-0.5 text-[12px] font-medium", limit.cls)}>{limit.label}</span>
              <p className="text-[15px] leading-6 text-ink">{run.timeLimit.explanation}</p>
              <Quote source={(() => { try { return new URL(run.timeLimit.url).hostname.replace(/^www\./, ""); } catch { return "the source"; } })()} href={run.timeLimit.url} inline>
                {run.timeLimit.limit}
              </Quote>
            </div>
          ) : (
            <p className="text-[15px] leading-6 text-ink">Robin did not check the time limit this time. The body's own complaints page says how long you have.</p>
          )}
        </Row>

        <Row crew="iona" topic="Medical evidence" title={gap ? "One question worth asking" : point ? "What the guidance says" : "Evidence not checked"}>
          {gap && point ? (
            <div className="space-y-4">
              <Said label="What doctors are advised to do">
                <Quote source={`NICE guideline ${ev.guideline!.name.match(/NG\d+/)?.[0] ?? ""}, ${point.id}`.replace(" ,", ",")} href={ev.guideline!.url} inline>
                  {point.text}
                </Quote>
              </Said>
              <Said label="What you told us">{gap.timeline}</Said>
              <Said label="The question">{gap.question}</Said>
              <p className="text-[13px] leading-5 text-muted">{ev.caveat ?? "Only your medical records show what was actually done."} Your complaint asks this politely; it does not say anyone was at fault.</p>
            </div>
          ) : point ? (
            <Quote source={`NICE guideline, ${point.id}`} href={ev.guideline!.url} inline>
              {point.text}
            </Quote>
          ) : (
            <p className="text-[15px] leading-6 text-ink">{skipped("iona") || !reached("iona") ? "Iona did not read the clinical guideline this time." : "The guideline says nothing about this."}</p>
          )}
        </Row>

        {ev.investigation && (
          <Row crew="iona" topic="Supporting evidence" title={ev.investigation.items.length ? "Official material you can cite" : "Nothing official found to cite"}>
            <InvestigationList inv={ev.investigation} />
          </Row>
        )}

        <Row crew="elliot" topic="Your complaint" title={run.draft ? "Written from your story" : "Not written yet"}>
          {run.draft ? (
            <div className="space-y-4">
              <Said label="What happened">
                <p className="whitespace-pre-line font-serif text-[16px] leading-7">{run.draft.details}</p>
              </Said>
              <Said label="Where">{run.draft.location}</Said>
              {run.draft.outcome && <Said label="What you would like">{run.draft.outcome}</Said>}
              <p className="text-[13px] leading-5 text-muted">Facts from your timeline only. You can still change every word in {body}&apos;s form before you submit.</p>
            </div>
          ) : (
            <p className="text-[15px] leading-6 text-ink">Elliot did not get to write the complaint before the run ended.</p>
          )}
        </Row>

        <Row crew="kit" topic={byEmail ? "Your message" : `${body}'s form`} title={ready ? "Filled in, not sent" : filledForm ? "Filled in as far as possible" : byEmail ? "Ready to send, not sent" : "Not filled in"}>
          {filledForm ? (
            <div className="space-y-3">
              <ul className="divide-y divide-line-soft text-[14px]">
                {run.form.filled.map((f) => (
                  <li key={`${f.label}-${f.value}`} className="flex gap-4 py-1.5">
                    <span className="w-44 shrink-0 text-muted">{f.label}</span>
                    <span className="min-w-0 whitespace-pre-line break-words text-ink">{f.value}</span>
                  </li>
                ))}
              </ul>
              {run.form.handedOff && <p className="text-[13px] font-medium text-amber">You signed in here.</p>}
              {run.form.unfilled.length > 0 && <p className="text-[14px] leading-6 text-amber">Still needs: {run.form.unfilled.join(", ")}.</p>}
              <a className="inline-block text-[13px] text-brand hover:underline" href={run.form.url} target="_blank" rel="noreferrer">
                {body}&apos;s online form ↗
              </a>
            </div>
          ) : (
            byEmail ? (
              <div className="space-y-2">
                {to && <p className="text-[14px] text-muted">To: <span className="text-ink">{to}</span></p>}
                <p className="max-h-80 overflow-y-auto whitespace-pre-line rounded-[6px] border border-line-soft bg-subtle px-4 py-3 font-serif text-[15px] leading-7 text-ink">{letter}</p>
              </div>
            ) : (
              <p className="text-[15px] leading-6 text-ink">{skipped("kit") || !reached("kit") ? "Kit did not fill in the form this time." : run.form.note}</p>
            )
          )}
        </Row>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[13px]">
        <button className="text-brand hover:underline" onClick={onAgain}>
          Run the crew again
        </button>
        {!sent && (
          <button className="text-muted hover:text-brand hover:underline" onClick={onSkip} title={`Demo: nothing is sent to ${body}. Opens step 2 as if they had replied.`}>
            Skip and continue to step 2 (demo)
          </button>
        )}
      </div>
    </div>
  );
}
