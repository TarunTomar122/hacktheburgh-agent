"use client";

import { useEffect, useRef, useState } from "react";
import { defaultAssumptions, spsoProblems, wordCount, type SpsoAnswers } from "../../lib/agent/spsoAnswers";
import { setDraft, setOmbudsman, setProgress as markProgress, type Profile } from "../../lib/profile";
import { Button, Callout, control, cx, Console, Eyebrow, LockIcon, PageTitle } from "../ui";
import type { ExtraAnswers } from "../../lib/agent/extra";
import AgentAsk from "./AgentAsk";
import AskMissing from "./AskMissing";
import { closeAgentBrowser, streamAgent, type DoneEvent } from "./streamAgent";

// Same rule as the onboarding skip button (D24): a developer shortcut, never part of the real journey.
const DEMO = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_SKIP === "1";

export default function OmbudsmanStep({ profile, goToStepOne }: { profile: Profile; goToStepOne: () => void }) {
  const unlocked = profile.ombudsman?.unlocked === true;
  return unlocked ? <Unlocked profile={profile} /> : <Locked profile={profile} goToStepOne={goToStepOne} />;
}

/** Where the user is on the path to this step. */
const JOURNEY: { title: string; state: "now" | "wait" | "later" }[] = [
  { title: "You complain to NHS Lothian (you are here)", state: "now" },
  { title: "NHS Lothian writes back with a final reply", state: "wait" },
  { title: "This step opens", state: "later" },
];

function Locked({ goToStepOne }: { profile: Profile; goToStepOne: () => void }) {
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

      <ol className="relative border-l border-rail">
        {JOURNEY.map((j) => (
          <li key={j.title} className="relative py-2.5 pl-6">
            <span aria-hidden className={cx("absolute -left-px top-0 h-full w-0.5", j.state === "now" ? "bg-brand" : "bg-transparent")} />
            <div className={cx("text-[15px] font-medium leading-6", j.state === "now" ? "text-brand" : j.state === "wait" ? "text-ink" : "text-faint")}>{j.title}</div>
          </li>
        ))}
      </ol>

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
  const answers = { ...defaultAssumptions(), ...a } as SpsoAnswers;
  // Profiles saved before 2026-11-07 evening stored otherReviews as a yes/no boolean.
  if (typeof (answers.otherReviews as unknown) === "boolean") answers.otherReviews = (answers.otherReviews as unknown) ? "yes" : "no";
  const problems = draft ? spsoProblems(draft, answers) : ["Your complaint is still being written."];
  const impactMissing = a.outcome !== undefined && wordCount(a.impact ?? "") === 0;

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
        setError(e instanceof Error ? e.message : String(e));
        started.current = false;
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

  return (
    <div className="space-y-8">
      <PageTitle
        eyebrow="Complaint · step 2"
        title="Complain to the ombudsman"
        lede="We fill in the ombudsman's form with what you have already told us. You check it on their form and press Send."
      />

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

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="space-y-3">
        <Button onClick={() => run()} disabled={preparing || impactMissing || problems.length > 0 || running}>
          {running ? "Filling the form…" : preparing ? "Getting it ready…" : "Fill in the ombudsman's form"}
        </Button>
        <p className="max-w-[60ch] text-xs leading-5 text-muted">
          By continuing you confirm you have read the ombudsman&apos;s{" "}
          <a className="text-brand underline underline-offset-2" href="https://www.spso.org.uk/making-complaint" target="_blank" rel="noreferrer">
            &ldquo;Making a complaint&rdquo; page
          </a>
          ; their form asks you to tick that.
        </p>
      </div>

      {progress.length > 0 && <Console label="Browser agent progress" lines={progress} />}
      {result &&
        (result.status === "ready_to_submit" ? (
          <Callout tone="ok" title="Done. It is waiting for you in the other window.">
            Check each section there and use its &ldquo;edit&rdquo; link to change anything. Then press Send yourself.
            <div className="mt-3">
              {profile.progress?.spsoSent ? (
                <span className="font-medium text-teal">Marked as sent. Nice work.</span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => {
                    void closeAgentBrowser();
                    markProgress({ spsoSent: true });
                  }}>
                  I&apos;ve pressed Send
                </Button>
              )}
            </div>
          </Callout>
        ) : (
          <AgentAsk key={result.summary + result.unfilled.join()} result={result} busy={running} onAnswer={(extra) => run(extra)} />
        ))}
    </div>
  );
}
