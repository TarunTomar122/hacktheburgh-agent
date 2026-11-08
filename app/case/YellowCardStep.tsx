"use client";

import { useRef, useState } from "react";
import type { ExtraAnswers } from "../../lib/agent/extra";
import { goalsFrom } from "../../lib/agent/track";
import { KIND_CHOICES, SEVERITY_CHOICES, YELLOW_CARD_SITE, yellowCardProblems, type YellowCardAnswers } from "../../lib/agent/yellowCardAnswers";
import { setProgress, setYellowCard, skipStep, type Profile } from "../../lib/profile";
import { Button, Callout, control, cx, Eyebrow, Field, PageTitle } from "../ui";
import AgentAsk from "./AgentAsk";
import AskMissing from "./AskMissing";
import { closeAgentBrowser, streamAgent, type DoneEvent } from "./streamAgent";

/**
 * Step 6 (proposed, feature/yellow-card): report a side effect, or a faulty or fake medicine or device, to the MHRA's
 * Yellow Card scheme. Same shape as the ombudsman step: ask only what is missing, the agent fills the real form in the
 * live browser and stops before it is sent; the user checks it there and sends it themselves.
 */
export default function YellowCardStep({ profile }: { profile: Profile }) {
  const goals = goalsFrom(profile.facts.desiredOutcome);
  const saved = profile.yellowCard ?? {};
  // Defaults from onboarding: the box they ticked, and their own story as the description (they can edit both).
  const a: Partial<YellowCardAnswers> = {
    kind: saved.kind ?? (goals.faultyProduct && !goals.sideEffect ? "defective" : "side_effect"),
    product: saved.product ?? "",
    reaction: saved.reaction ?? profile.facts.incidentSummary ?? "",
    privacyAgreed: saved.privacyAgreed ?? false,
    severity: saved.severity ?? [],
  };
  const problems = yellowCardProblems(a);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Every answer the user has given to the form's questions in this visit. Each run starts the form again from its first page, so a run
  // sent only the newest answer forgot the earlier ones and asked for them again, forever. Newest answer per question wins.
  const answered = useRef<ExtraAnswers>([]);

  /** `product` replaces the saved name when the site did not list it and the user typed the exact name. */
  async function run(extra?: ExtraAnswers, product?: string, resume = false) {
    if (problems.length > 0 || running) return;
    const answers = product ? { ...a, product } : a;
    const known = new Map(answered.current.map((x) => [x.label, x]));
    for (const x of extra ?? []) known.set(x.label, x);
    answered.current = [...known.values()].slice(-20); // the API accepts at most 20
    setRunning(true);
    setProgress({ ycFilled: false, ycSent: false }); // a new report has not been sent yet, whatever an earlier one did
    window.dispatchEvent(new Event("live-open")); // show the agent's browser beside the page
    setError(null);
    setResult(null);
    try {
      const done = await streamAgent("/api/agent/yellowcard", { facts: profile.facts, answers, extra: answered.current, resume }, () => {}); // no log on the page: the live panel shows the browser, like the NHS and ombudsman steps
      setResult(done);
      if (done.status === "ready_to_submit") setProgress({ ycFilled: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageTitle
        eyebrow="Yellow Card · step 1"
        title="Report it to the Yellow Card scheme"
        lede="Anyone can report a side effect, or a faulty or fake medicine or medical device, to the UK medicines regulator (MHRA). Elliot fills in their Yellow Card form with what you have told him; you check it there and send it yourself."
      />

      <AskMissing profile={profile} why="The Yellow Card form needs this, and it did not come up before." />

      <section className="space-y-6 rounded-card border border-line bg-white p-6">
        <div>
          <Eyebrow>What are you reporting?</Eyebrow>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {KIND_CHOICES.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setYellowCard({ kind: k.value })}
                aria-pressed={a.kind === k.value}
                className={cx("rounded-ctl border p-3 text-left transition-colors", a.kind === k.value ? "border-brand bg-brand-soft" : "border-line hover:bg-subtle")}
              >
                <div className={cx("text-[14px] font-medium", a.kind === k.value ? "text-brand" : "text-ink")}>{k.label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted">{k.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <Field label="Medicine, vaccine or device" hint="As it is written on the box or label, e.g. “Amoxicillin 500mg capsules”. Elliot picks the matching product from the Yellow Card list.">
          <input className={control} value={a.product} onChange={(e) => setYellowCard({ product: e.target.value })} placeholder="Name on the box or label" />
        </Field>

        <Field label="What happened" hint="In your own words. Elliot started it from what you told him; change anything you like.">
          <textarea rows={4} className={control} value={a.reaction} onChange={(e) => setYellowCard({ reaction: e.target.value })} />
        </Field>

        {a.kind === "side_effect" && (
          <fieldset>
            <Eyebrow>How serious was it?</Eyebrow>
            <p className="mt-1 max-w-[62ch] text-xs leading-5 text-muted">
              The form labels these optional but will not go on until one is ticked. Tick all that apply. If you tick none, the demo ticks &ldquo;Significant enough to lead you to seek advice from a healthcare professional&rdquo; so it can carry on.
            </p>
            <div className="mt-3 space-y-2">
              {SEVERITY_CHOICES.map((label) => {
                const on = !!a.severity?.includes(label);
                return (
                  <label key={label} className="flex gap-3 text-[14px] leading-5 text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-brand"
                      checked={on}
                      onChange={(e) => setYellowCard({ severity: e.target.checked ? [...(a.severity ?? []), label] : (a.severity ?? []).filter((x) => x !== label) })}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <label className="flex gap-3 text-[14px] leading-5 text-ink">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={!!a.privacyAgreed} onChange={(e) => setYellowCard({ privacyAgreed: e.target.checked })} />
          <span>
            I agree that the MHRA handles my report in line with its privacy policy. The Yellow Card form asks you to tick this; we only tick it there if you tick it here.{" "}
            <a className="text-brand underline underline-offset-2" href={YELLOW_CARD_SITE} target="_blank" rel="noreferrer">
              Yellow Card site
            </a>
          </span>
        </label>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => run()} disabled={problems.length > 0 || running}>
            {running ? "Filling the form…" : "Fill in the Yellow Card form"}
          </Button>
          {/* Demo: nothing is sent to the MHRA, so the demo can carry on as if the report had been sent. */}
          {profile.progress?.skipped?.includes(6) ? (
            <span className="text-sm font-medium text-teal">Skipped for the demo. Nothing was sent to the MHRA.</span>
          ) : (
            <Button
              variant="secondary"
              disabled={running}
              onClick={() => {
                void closeAgentBrowser();
                skipStep(6);
              }}
              title="Demo: nothing is sent to the MHRA. Marks this step as done."
            >
              Skip and mark as sent (demo)
            </Button>
          )}
        </div>
        {problems.length > 0 && <p className="text-xs text-muted">{problems.join(" ")}</p>}
        <p className="max-w-[60ch] text-xs leading-5 text-muted">
          Elliot never creates an account, never sets a password and never sends the report. It continues without registering.
        </p>
      </div>

      {result &&
        (result.status === "ready_to_submit" ? (
          <Callout tone="ok" title="Done. It is waiting for you in the browser panel.">
            Check each page there and change anything you like. Then send it yourself. Click &ldquo;Take control&rdquo; in the panel first: your clicks only reach the form while it is on.
            <div className="mt-3">
              {profile.progress?.ycSent ? (
                <span className="font-medium text-teal">Marked as sent. Thank you for reporting: it helps keep others safe.</span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void closeAgentBrowser();
                    setProgress({ ycSent: true });
                  }}
                >
                  I&apos;ve sent the report
                </Button>
              )}
            </div>
          </Callout>
        ) : (
          <AgentAsk
            key={result.summary + result.unfilled.join()}
            result={result}
            busy={running}
            onAnswer={(extra) => {
              // "Product" is our own question (the site did not list it), not a form field: it replaces the saved name.
              const p = extra.find((x) => x.label === "Product");
              if (p) setYellowCard({ product: p.value });
              void run(extra.filter((x) => x !== p), p?.value, !p); // a new product name starts again; any other answer carries on from the same page
            }}
          />
        ))}
    </div>
  );
}
