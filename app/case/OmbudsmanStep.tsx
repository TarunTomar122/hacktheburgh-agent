"use client";

import { useState } from "react";
import { SAMPLE_SPSO } from "../../lib/agent/sample";
import { DOC_OPTION, SPSO_YES_NO, spsoComplete, spsoProblems, wordCount, type DocRoute, type SpsoAnswers } from "../../lib/agent/spsoAnswers";
import { setOmbudsman, setProgress as markProgress, type Profile } from "../../lib/profile";
import { ActionCard, Button, Callout, Card, cx, Console, control, Eyebrow, Field, LockIcon, PageTitle, SectionTitle, selectControl } from "../ui";
import { streamAgent, type DoneEvent } from "./streamAgent";

// Same rule as the onboarding skip button (D24): a developer shortcut, never part of the real journey.
const DEMO = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_SKIP === "1";

const DOCS: { key: keyof SpsoAnswers["documents"]; label: string }[] = [
  { key: "finalResponse", label: "NHS Lothian's final reply (it should mention the ombudsman)" },
  { key: "stage1Response", label: "An earlier (stage 1) reply, if there was one" },
  { key: "ownComplaint", label: "A copy of your own written complaint" },
  { key: "other", label: "Any other letters or emails about the complaint" },
];

export default function OmbudsmanStep({ profile, goToStepOne }: { profile: Profile; goToStepOne: () => void }) {
  const unlocked = profile.ombudsman?.unlocked === true;
  return unlocked ? <Unlocked profile={profile} /> : <Locked profile={profile} goToStepOne={goToStepOne} />;
}

/** Where the user is on the path to this step. */
const JOURNEY: { title: string; text: string; state: "now" | "wait" | "later" }[] = [
  { title: "You complain to NHS Lothian", text: "Step 1. We prepare the complaint and fill in their form. This is where you are.", state: "now" },
  { title: "NHS Lothian investigates and writes back", text: "Their final written reply. The ombudsman needs a copy, so keep the letter.", state: "wait" },
  { title: "This step opens", text: "We fill in the ombudsman's complaint form from your profile. You check it and press Send yourself.", state: "later" },
];

function Locked({ profile, goToStepOne }: { profile: Profile; goToStepOne: () => void }) {
  const events = profile.facts.events.filter((e) => e.date.trim() || e.what.trim());
  return (
    <div className="space-y-12">
      <PageTitle
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <LockIcon /> Step 2 · Locked until NHS Lothian replies
          </span>
        }
        title="Ombudsman"
        lede="The Scottish Public Services Ombudsman (SPSO) is who you go to if NHS Lothian does not put things right."
      />

      <Callout tone="warn" title="You can only do this after NHS Lothian has finished with your complaint.">
        The ombudsman will only look at a complaint once you have the organisation&apos;s <b>final written response</b>. Their own checker stops you if you
        answer &ldquo;no&rdquo; to having one, so opening it early would just be turned away.
      </Callout>

      <section className="space-y-5">
        <SectionTitle>How you get here</SectionTitle>
        <ol className="relative border-l border-rail">
          {JOURNEY.map((j) => (
            <li key={j.title} className="relative py-3 pl-6">
              <span aria-hidden className={cx("absolute -left-px top-0 h-full w-0.5", j.state === "now" ? "bg-brand" : "bg-transparent")} />
              <div className={cx("text-[17px] font-medium leading-6", j.state === "now" ? "text-brand" : j.state === "wait" ? "text-ink" : "text-faint")}>{j.title}</div>
              <p className={cx("mt-0.5 max-w-[60ch] text-sm leading-5", j.state === "later" ? "text-faint" : "text-ink-2")}>{j.text}</p>
            </li>
          ))}
        </ol>
        <Button variant="secondary" size="sm" onClick={goToStepOne}>
          Back to step 1
        </Button>
      </section>

      <section className="space-y-5">
        <SectionTitle>Your timeline so far</SectionTitle>
        <p className="max-w-[60ch] text-sm leading-5 text-ink-2">
          There is a time limit: the ombudsman&apos;s checker asks whether it has been more or less than a year since you first knew about the problem.
          That is why we keep these dates, and why the wait for the NHS reply is worth keeping an eye on.
        </p>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No events yet. Add them in your profile.</p>
        ) : (
          <ol className="relative border-l border-rail">
            {events.map((e, i) => (
              <li key={i} className="py-3 pl-6">
                <Eyebrow>{e.date || "Date not given"}</Eyebrow>
                <p className="mt-0.5 max-w-[60ch] text-[15px] leading-6 text-ink">{e.what}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {DEMO && (
        <Card className="border-dashed">
          <Eyebrow>Developer shortcut</Eyebrow>
          <p className="mt-1 text-sm text-ink-2">Skip the wait and open this step with a demo reply.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOmbudsman({ unlocked: true, answers: SAMPLE_SPSO })}>
            Demo: pretend NHS Lothian has replied
          </Button>
        </Card>
      )}
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <select className={selectControl + " !w-32"} value={value === undefined ? "" : value ? "yes" : "no"} onChange={(e) => e.target.value && onChange(e.target.value === "yes")}>
      <option value="">Choose…</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

function Unlocked({ profile }: { profile: Profile }) {
  const a: Partial<SpsoAnswers> = profile.ombudsman?.answers ?? {};
  const set = (patch: Partial<SpsoAnswers>) => setOmbudsman({ answers: patch });
  const draft = profile.draft;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const problems = draft ? spsoProblems(draft, a) : [];
  const ready = spsoComplete(draft, a);
  const docs = a.documents ?? ({} as Partial<SpsoAnswers["documents"]>);

  async function run() {
    if (!draft || !spsoComplete(draft, a) || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(["Starting the browser agent…"]);
    try {
      const done = await streamAgent("/api/agent/step2", { facts: profile.facts, draft, answers: a }, (line) => setProgress((p) => [...p.slice(-19), line]));
      setResult(done);
      if (done.status === "ready_to_submit") markProgress({ spsoFilled: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-10">
      <PageTitle
        eyebrow="Step 2"
        title="Complain to the ombudsman"
        lede="We fill in the SPSO complaint form for you. It stops at the last page. You check it and press Send yourself."
      />

      {!draft && <Callout tone="warn" title="Write your NHS complaint first">We reuse the complaint you wrote in step 1.</Callout>}

      <section className="space-y-4">
        <SectionTitle>A few things only you know</SectionTitle>
        <p className="text-sm text-ink-2">Have NHS Lothian&apos;s final letter to hand. We do not guess any of these.</p>
        <Card className="divide-y divide-line-soft !p-0">
          {SPSO_YES_NO.map((q) => (
            <div key={q.key} className="flex items-center justify-between gap-6 px-6 py-4 text-sm">
              <span className="flex-1 text-ink">{q.label}</span>
              <YesNo value={a[q.key]} onChange={(v) => set({ [q.key]: v })} />
            </div>
          ))}
        </Card>
        <div className="grid grid-cols-2 gap-5">
          <Field label="Date of NHS Lothian's final reply">
            <input className={control} value={a.finalReplyDate ?? ""} onChange={(e) => set({ finalReplyDate: e.target.value })} placeholder="e.g. 2026-10-20" />
          </Field>
          <Field label="NHS Lothian's reference number" hint="If the letter has one">
            <input className={control} value={a.nhsReference ?? ""} onChange={(e) => set({ nhsReference: e.target.value })} />
          </Field>
        </div>
        <Field label="How has this affected you?">
          <textarea rows={4} className={control} value={a.impact ?? ""} onChange={(e) => set({ impact: e.target.value })} />
        </Field>
        <Field label="What would you like the ombudsman to achieve?" hint={`At least 15 words · ${wordCount(a.outcome ?? "")} so far`}>
          <textarea rows={3} className={control} value={a.outcome ?? profile.facts.desiredOutcome ?? ""} onChange={(e) => set({ outcome: e.target.value })} />
        </Field>
      </section>

      <section className="space-y-4">
        <SectionTitle>Your documents</SectionTitle>
        <p className="text-sm text-ink-2">
          The form asks how you will give them the letters. Uploading from here is not built yet, so choose post, or &ldquo;don&apos;t have it&rdquo;.
        </p>
        <Card className="divide-y divide-line-soft !p-0">
          {DOCS.map((d) => (
            <div key={d.key} className="flex items-center justify-between gap-6 px-6 py-4 text-sm">
              <span className="flex-1 text-ink">{d.label}</span>
              <select
                className={selectControl + " !w-60"}
                value={docs[d.key] ?? ""}
                onChange={(e) => e.target.value && set({ documents: { ...docs, [d.key]: e.target.value as DocRoute } as SpsoAnswers["documents"] })}
              >
                <option value="">Choose…</option>
                <option value="post">{DOC_OPTION.post}</option>
                <option value="none">{DOC_OPTION.none}</option>
              </select>
            </div>
          ))}
        </Card>
      </section>

      <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-subtle p-4 text-sm text-ink-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={a.readConfirmed === true} onChange={(e) => set({ readConfirmed: e.target.checked })} />
        <span>
          The SPSO form asks you to confirm you have read its{" "}
          <a className="font-medium text-brand underline underline-offset-2" href="https://www.spso.org.uk/making-complaint" target="_blank" rel="noreferrer">
            &ldquo;Making a complaint&rdquo; page
          </a>
          . I have read it.
        </span>
      </label>

      {problems.length > 0 && a.outcome !== undefined && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <ActionCard
        title="Ready?"
        action={
          <Button onClick={run} disabled={!ready || running}>
            {running ? "Filling…" : "Fill in the SPSO form"}
          </Button>
        }
      >
        The agent opens the SPSO form in a separate browser window and fills it in. Nothing is sent.
      </ActionCard>

      {error && <p className="text-sm text-danger">{error}</p>}
      {progress.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>Browser activity</Eyebrow>
          <Console label="Browser agent progress" lines={progress} />
        </section>
      )}
      {result &&
        (result.status === "ready_to_submit" ? (
          <Callout tone="ok" title="The form is filled in up to “Review and send”.">
            Check every answer in the browser window, tick the confirmation box once your documents are on their way, and press Send yourself. We never send it for you.
            <div className="mt-3">
              {profile.progress?.spsoSent ? (
                <span className="font-medium text-teal">Marked as sent. Nice work.</span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => markProgress({ spsoSent: true })}>
                  I&apos;ve pressed Send
                </Button>
              )}
            </div>
          </Callout>
        ) : (
          <Callout tone="warn" title="The agent stopped before the end.">
            {result.question ?? result.summary}
          </Callout>
        ))}
    </div>
  );
}
