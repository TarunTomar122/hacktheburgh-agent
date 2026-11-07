"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { spsoChecks, tally } from "../../lib/agent/complaintChecks";
import { fmtDate, replyDates, spsoClock, type ClockState } from "../../lib/agent/complaintClock";
import { defaultAssumptions, spsoProblems, wordCount, type DocRoute, type SpsoAnswers } from "../../lib/agent/spsoAnswers";
import { setDraft, setOmbudsman, setProgress as markProgress, skipStep, type Profile } from "../../lib/profile";
import { Button, Callout, control, cx, Eyebrow, Field, LockIcon, PageTitle, Paper } from "../ui";
import type { ExtraAnswers } from "../../lib/agent/extra";
import AgentAsk from "./AgentAsk";
import AskMissing from "./AskMissing";
import { CheckList, Chip, ClockCard, clockTone, FormAgentRun, HelpCard, Section, Timeline, type TimelineItem } from "./ComplaintParts";
import { closeAgentBrowser, streamAgent, type DoneEvent } from "./streamAgent";

// Same rule as the onboarding skip button (D24): a developer shortcut, never part of the real journey.
const DEMO = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_SKIP === "1";

const CLOCK_CHIP: Record<ClockState, string> = {
  inside: "Inside 12 months",
  outside: "Past 12 months",
  unknown: "Time limit not known yet",
};

export default function OmbudsmanStep({ profile, goToStepOne }: { profile: Profile; goToStepOne: () => void }) {
  const unlocked = profile.ombudsman?.unlocked === true;
  return unlocked ? <Unlocked profile={profile} /> : <Locked profile={profile} goToStepOne={goToStepOne} />;
}

/* ------------------------------------------------------------------ before the reply */

function Locked({ profile, goToStepOne }: { profile: Profile; goToStepOne: () => void }) {
  const sent = profile.progress?.nhsSent === true;
  const sentAt = profile.progress?.nhsSentAt ? new Date(profile.progress.nhsSentAt) : null;
  const dates = sentAt ? replyDates(sentAt) : null;
  const [today] = useState(() => new Date());
  const todayIso = today.toISOString().slice(0, 10);
  const [received, setReceived] = useState(todayIso);
  const [reference, setReference] = useState("");
  const [points, setPoints] = useState<"yes" | "no" | null>(null);

  const journey: TimelineItem[] = [
    {
      title: "You complain to NHS Lothian",
      state: sent ? "done" : "now",
      when: sentAt ? `Sent ${fmtDate(sentAt)}` : undefined,
      note: sent ? undefined : "This is step 1. Come back here once you have sent it.",
    },
    {
      title: "NHS Lothian writes back with its final reply",
      state: sent ? "now" : "next",
      when: dates ? `expected by ${fmtDate(dates.investigationBy)} at the latest` : undefined,
      note: "A simple complaint is aimed at 5 working days. One that needs an investigation should get a full reply within 20 working days.",
    },
    { title: "You tell us it has arrived and this step opens", state: "next", note: "We then check the ombudsman can look at your complaint and fill in their form." },
  ];

  return (
    <div className="space-y-8">
      <PageTitle
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <LockIcon /> Step 2 · Opens after NHS Lothian replies
          </span>
        }
        title="Ombudsman"
        lede="If NHS Lothian's final reply does not put things right, this is where you go next. The ombudsman only looks at a complaint once you have that reply."
      />

      <div className="flex flex-wrap gap-2">
        <Chip tone="quiet">
          <span className="inline-flex items-center gap-1.5">
            <LockIcon /> Locked
          </span>
        </Chip>
        <Chip tone={sent ? "ok" : "quiet"}>{sent ? (sentAt ? `Complaint sent ${fmtDate(sentAt)}` : "Complaint sent") : "Complaint not sent yet"}</Chip>
      </div>

      <Section title="The path to the ombudsman">
        <Timeline items={journey} />
        {!dates && (
          <p className="mt-5 text-xs leading-5 text-muted">Once you mark your complaint as sent in step 1, the dates you can expect a reply by appear here.</p>
        )}
      </Section>

      <Section title="NHS Lothian has replied">
        <div className="space-y-5">
          <p className="max-w-[62ch] text-sm leading-6 text-ink-2">
            Use this once you have NHS Lothian&apos;s final reply. If they have only answered the first, quick stage and you are not happy, you can ask them to look at it again at the investigation stage. The ombudsman is for people who have been through their whole process.
          </p>
          <div className="grid gap-4 @xl:grid-cols-2">
            <Field label="Date the final reply arrived">
              <input type="date" className={control} max={todayIso} value={received} onChange={(e) => setReceived(e.target.value)} />
            </Field>
            <Field label="NHS Lothian's reference" hint="If the letter has one. You can leave this blank.">
              <input className={control} value={reference} placeholder="For example ABC/1234" onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-ink">Does the letter point you to the ombudsman?</div>
            <p className="text-xs text-muted">Look near the end of the letter. The ombudsman&apos;s form asks this.</p>
            <Seg
              label="Does the letter point you to the ombudsman?"
              value={points}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              onChange={setPoints}
            />
          </div>
          <Button
            disabled={!received || points === null}
            onClick={() => setOmbudsman({ unlocked: true, receivedOn: received, answers: { nhsReference: reference.trim(), letterMentionsSpso: points === "yes" } })}
          >
            Open the ombudsman step
          </Button>
        </div>
      </Section>

      <HelpCard />

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" onClick={goToStepOne}>
          Back to step 1
        </Button>
        {DEMO && (
          <Button variant="ghost" size="sm" onClick={() => setOmbudsman({ unlocked: true })} title="Developer shortcut">
            Demo: pretend NHS Lothian has replied
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ after the reply */

function Unlocked({ profile }: { profile: Profile }) {
  const a: Partial<SpsoAnswers> = profile.ombudsman?.answers ?? {};
  const set = (patch: Partial<SpsoAnswers>) => setOmbudsman({ answers: patch });
  const draft = profile.draft;
  const [writing, setWriting] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [impactDraft, setImpactDraft] = useState("");
  const [today] = useState(() => new Date());
  const answers = { ...defaultAssumptions(), ...a } as SpsoAnswers;
  // Profiles saved before 2026-11-07 evening stored otherReviews as a yes/no boolean.
  if (typeof (answers.otherReviews as unknown) === "boolean") answers.otherReviews = (answers.otherReviews as unknown) ? "yes" : "no";
  const problems = draft ? spsoProblems(draft, answers) : ["Your complaint is still being written."];
  const impactMissing = a.outcome !== undefined && wordCount(a.impact ?? "") === 0;
  const sent = profile.progress?.spsoSent === true;

  // The agent prepares everything from onboarding (D33): the complaint text if step 1 never ran, then the ombudsman's two answers.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || a.outcome !== undefined) return;
    started.current = true;
    void (async () => {
      setWriting(true);
      setError(null);
      try {
        let d = draft;
        if (!d) {
          const r = await fetch("/api/agent/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: profile.facts }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? "Could not write the complaint");
          setDraft(j);
          d = j;
        }
        const res = await fetch("/api/agent/step2-draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ facts: profile.facts, draft: d, messages: profile.messages }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not prepare the ombudsman text");
        setOmbudsman({ answers: { ...defaultAssumptions(), ...a, impact: data.impact ?? "", outcome: data.outcome } });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e)); // no automatic retry: the effect runs on every render, so a failure would loop
      } finally {
        setWriting(false);
      }
    })();
  });

  async function run(extra?: ExtraAnswers) {
    if (!draft || problems.length > 0 || running) return;
    const approved = { ...answers, readConfirmed: true };
    set({ readConfirmed: true }); // the approval below includes "I have read the SPSO page"
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(["Starting the browser agent…"]);
    try {
      const done = await streamAgent("/api/agent/step2", { facts: profile.facts, draft, answers: approved, extra }, (line) => setProgress((p) => [...p.slice(-19), line]));
      setResult(done);
      if (done.status === "ready_to_submit") markProgress({ spsoFilled: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const preparing = writing || !draft || a.outcome === undefined;
  const clock = spsoClock(profile.facts, today);
  const rows = spsoChecks(profile, answers, today);
  const counts = tally(rows);
  const received = profile.ombudsman?.receivedOn ? new Date(profile.ombudsman.receivedOn) : null;
  const docOptions: { value: DocRoute; label: string }[] = [
    { value: "post", label: "I will post a copy" },
    { value: "none", label: "I do not have it" },
  ];
  const setDoc = (key: keyof SpsoAnswers["documents"], value: DocRoute) => set({ documents: { ...answers.documents, [key]: value } });

  const next: TimelineItem[] = [
    {
      title: "You check the form and press Send",
      state: sent ? "done" : "now",
      note: "We fill it in and stop on the ombudsman's review page. Their form shows an edit link for each section.",
    },
    {
      title: "The ombudsman decides whether it can look at your complaint",
      state: "next",
      note: "They check it is about an organisation they cover, that you have been through its complaints process, and that it is inside the time limit.",
    },
    {
      title: "Your complaint waits to be allocated, then is looked at",
      state: "next",
      note: "There can be a wait before someone picks it up. The ombudsman aims to finish 85% of investigations within 12 months, and says it contacts you about every eight weeks.",
    },
    { title: "You get a final decision", state: "next", note: "A decision letter or, for some cases, a public report." },
  ];

  return (
    <div className="space-y-8">
      <PageTitle
        eyebrow="Complaint · step 2"
        title="Complain to the ombudsman"
        lede="We fill in the ombudsman's form with what you have already told us. Check what we will say below, then check it on their form and press Send yourself."
      />

      <div className="flex flex-wrap gap-2">
        <Chip tone="ok">{received ? `NHS reply received ${fmtDate(received)}` : "NHS reply received"}</Chip>
        <Chip tone={counts.yes === counts.total ? "ok" : "info"}>
          {counts.yes} of {counts.total} checks passed
        </Chip>
        <Chip tone={clockTone(clock.state)}>{CLOCK_CHIP[clock.state]}</Chip>
        <Chip tone={sent ? "ok" : "quiet"}>{sent ? "Marked as sent" : "Not sent yet"}</Chip>
      </div>

      <AskMissing profile={profile} why="The ombudsman's form needs this, and it did not come up before." />

      {impactMissing && (
        <section className="overflow-hidden rounded-card border border-brand/30 bg-white">
          <div className="space-y-1 bg-brand-soft/60 px-6 py-4">
            <Eyebrow className="text-brand">One thing we still need</Eyebrow>
            <p className="text-[15px] leading-6 text-ink">How has this affected you?</p>
            <p className="text-xs text-muted">The ombudsman&apos;s form requires it, and it did not come up before. A sentence or two is enough.</p>
          </div>
          <div className="space-y-3 p-4">
            <textarea rows={3} className={control} value={impactDraft} onChange={(e) => setImpactDraft(e.target.value)} placeholder="For example: I am still in pain and I have missed work." />
            <Button size="sm" disabled={!impactDraft.trim()} onClick={() => set({ impact: impactDraft.trim() })}>
              Save
            </Button>
          </div>
        </section>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-danger">{error}</p>
          {a.outcome === undefined && !writing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                started.current = false;
                setError(null);
              }}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-8 @5xl:grid-cols-2">
        <Section title="What the ombudsman checks first">
          <CheckList rows={rows} />
        </Section>
        <Section title="The ombudsman's time limit">
          <ClockCard clock={clock} />
        </Section>
      </div>

      <Section title="What we will tell the ombudsman">
        <div className="space-y-6">
          <Paper className="space-y-5 !px-6 !py-5">
            <Field label="How this has affected you" hint={`${wordCount(a.impact ?? "")} words. The form allows up to 500.`}>
              <textarea rows={4} className={control} disabled={preparing} placeholder={preparing ? "Writing this from what you told us…" : "For example: I am still in pain and I have missed work."} value={a.impact ?? ""} onChange={(e) => set({ impact: e.target.value })} />
            </Field>
            <Field label="What you want the ombudsman to achieve" hint={`${wordCount(a.outcome ?? "")} words. The form needs at least 15 and allows up to 500.`}>
              <textarea rows={4} className={control} disabled={preparing} placeholder={preparing ? "Writing this from what you told us…" : ""} value={a.outcome ?? ""} onChange={(e) => set({ outcome: e.target.value })} />
            </Field>
            <p className="text-xs leading-5 text-muted">The account of what went wrong is the complaint you wrote in step 1. Change that one in step 1.</p>
          </Paper>

          <div>
            <Eyebrow>Answers on the form</Eyebrow>
            <p className="mb-1 mt-1 text-xs text-muted">These are the answers we will give. Change any that are wrong.</p>
            <div className="divide-y divide-line-soft">
              <AnswerRow label="NHS Lothian's reference" hint="If the letter has one.">
                <input className={cx(control, "max-w-56")} value={answers.nhsReference} onChange={(e) => set({ nhsReference: e.target.value })} placeholder="Optional" />
              </AnswerRow>
              <AnswerRow label="The final reply points you to the ombudsman">
                <YesNo label="The final reply points you to the ombudsman" value={answers.letterMentionsSpso} onChange={(v) => set({ letterMentionsSpso: v })} />
              </AnswerRow>
              <AnswerRow label="This has been considered in court, or you plan to take it there">
                <YesNo label="Considered in court or planned" value={answers.courtAction} onChange={(v) => set({ courtAction: v })} />
              </AnswerRow>
              <AnswerRow label="A child or young person under 18 was affected">
                <YesNo label="A child or young person was affected" value={answers.childAffected} onChange={(v) => set({ childAffected: v })} />
              </AnswerRow>
              <AnswerRow label="It has been reported to a regulator such as the GMC or NMC">
                <YesNo label="Reported to a regulator" value={answers.reportedToRegulator} onChange={(v) => set({ reportedToRegulator: v })} />
              </AnswerRow>
              <AnswerRow label="It has had another review, such as a significant adverse event review">
                <Seg
                  label="Another review"
                  value={answers.otherReviews}
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "dont_know", label: "Don't know" },
                  ]}
                  onChange={(v) => set({ otherReviews: v })}
                />
              </AnswerRow>
            </div>
          </div>

          <div>
            <Eyebrow>Documents</Eyebrow>
            <p className="mb-1 mt-1 text-xs text-muted">The form asks how you will give the ombudsman each one. We do not upload files for you yet, so you post a copy or say you do not have it.</p>
            <div className="divide-y divide-line-soft">
              <AnswerRow label="NHS Lothian's final reply">
                <Seg label="Final reply" value={answers.documents.finalResponse} options={docOptions} onChange={(v) => setDoc("finalResponse", v)} />
              </AnswerRow>
              <AnswerRow label="A reply from the first, quick stage">
                <Seg label="First stage reply" value={answers.documents.stage1Response} options={docOptions} onChange={(v) => setDoc("stage1Response", v)} />
              </AnswerRow>
              <AnswerRow label="Your own complaint to NHS Lothian">
                <Seg label="Your own complaint" value={answers.documents.ownComplaint} options={docOptions} onChange={(v) => setDoc("ownComplaint", v)} />
              </AnswerRow>
              <AnswerRow label="Other letters they refer to">
                <Seg label="Other letters" value={answers.documents.other} options={docOptions} onChange={(v) => setDoc("other", v)} />
              </AnswerRow>
            </div>
          </div>
        </div>
      </Section>

      <Section title="The ombudsman's online form">
        <div className="space-y-5">
          <p className="max-w-[62ch] text-sm leading-6 text-ink-2">A browser window opens on the ombudsman&apos;s own form. We go through it page by page and stop on the review page. Nothing is sent until you press Send.</p>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => run()} disabled={preparing || impactMissing || problems.length > 0 || running}>
                {running ? "Filling the form…" : preparing ? "Getting it ready…" : "Fill in the ombudsman's form"}
              </Button>
              {/* Demo (D61): nothing is sent to the ombudsman, so the demo can carry on as if the form had been sent. Always shown, on purpose. */}
              {profile.progress?.skipped?.includes(2) ? (
                <span className="text-sm font-medium text-teal">Skipped for the demo. Nothing was sent to the ombudsman.</span>
              ) : (
                <Button
                  variant="secondary"
                  disabled={running}
                  onClick={() => {
                    void closeAgentBrowser(); // the half-filled form is no use any more
                    skipStep(2);
                  }}
                  title="Demo: nothing is sent to the ombudsman. Marks this step as done."
                >
                  Skip and mark as sent (demo)
                </Button>
              )}
            </div>
            {!preparing && !running && problems.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-danger">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <p className="max-w-[60ch] text-xs leading-5 text-muted">
              By continuing you confirm you have read the ombudsman&apos;s{" "}
              <a className="text-brand underline underline-offset-2" href="https://www.spso.org.uk/making-complaint" target="_blank" rel="noreferrer">
                &ldquo;Making a complaint&rdquo; page
              </a>
              ; their form asks you to tick that.
            </p>
          </div>

          {progress.length > 0 && <FormAgentRun label="Ombudsman form agent" lines={progress} running={running} done={!running && result?.status === "ready_to_submit"} failed={!running && !!error} />}

          {result &&
            (result.status === "ready_to_submit" ? (
              <Callout tone="ok" title="Done. It is waiting for you in the other window.">
                Check each section there and use its &ldquo;edit&rdquo; link to change anything. Then press Send yourself.
                <div className="mt-3">
                  {sent ? (
                    <span className="font-medium text-teal">Marked as sent. Nice work.</span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void closeAgentBrowser();
                        markProgress({ spsoSent: true });
                      }}
                    >
                      I&apos;ve pressed Send
                    </Button>
                  )}
                </div>
              </Callout>
            ) : (
              <AgentAsk key={result.summary + result.unfilled.join()} result={result} busy={running} onAnswer={(extra) => run(extra)} />
            ))}
        </div>
      </Section>

      <Section title="What happens next">
        <Timeline items={next} />
        <p className="mt-5 text-xs leading-5 text-muted">
          Sources:{" "}
          <a className="text-brand underline underline-offset-2" href="https://www.spso.org.uk/what-to-expect-when-we-receive-complaint-about-your-organisation" target="_blank" rel="noreferrer">
            the ombudsman on what to expect
          </a>{" "}
          and{" "}
          <a className="text-brand underline underline-offset-2" href="https://spso.org.uk/detailed-information-delays" target="_blank" rel="noreferrer">
            its note on delays
          </a>
          . The current wait before allocation was not checked.
        </p>
      </Section>

      <HelpCard />
    </div>
  );
}

/* ------------------------------------------------------------------ small controls */

/** A row in the "answers on the form" list: the question on the left, the control on the right. */
function AnswerRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-0 max-w-[46ch]">
        <div className="text-[14px] leading-5 text-ink">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Pick one of a few options. Buttons, so it is quick on a phone; the chosen one is filled. */
function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx("rounded-ctl border px-3 py-1.5 text-xs font-medium transition-colors", on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-faint")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Seg
      label={label}
      value={value ? "yes" : "no"}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]}
      onChange={(v) => onChange(v === "yes")}
    />
  );
}
