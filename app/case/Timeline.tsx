"use client";

import type { Profile } from "../../lib/profile";
import { cx, Eyebrow, LockIcon } from "../ui";
import { milestones, summarise } from "./progress";
import { STEPS, type StepState } from "./steps";

const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 5.2l2 2L8 3" />
  </svg>
);

/** A small square tick (no circles): filled when done. */
function Tick({ done }: { done: boolean }) {
  return (
    <span aria-hidden className={cx("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border", done ? "border-brand bg-brand text-white" : "border-rail bg-white")}>
      {done && <CheckIcon />}
    </span>
  );
}

/** The left rail: how far along you are, then the path from "something went wrong" to "a solicitor has the case". */
export default function Timeline({ profile, active, onSelect }: { profile: Profile; active: number; onSelect: (n: number) => void }) {
  const ms = milestones(profile);
  const { done, total, pct, next } = summarise(ms);
  const ombudsmanOpen = profile.ombudsman?.unlocked === true;

  return (
    <nav aria-label="Your path" className="w-80 shrink-0 overflow-y-auto border-r border-line px-8 py-10">
      <section aria-label="Progress" className="mb-10">
        <Eyebrow>Your progress</Eyebrow>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="display text-[44px] text-ink">{pct}%</div>
          <div className="text-xs text-muted">
            {done} of {total} milestones
          </div>
        </div>
        <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-soft">
          <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
        {next && (
          <p className="mt-3 text-xs leading-5 text-ink-2">
            <span className="font-medium text-ink">Next:</span> {next}
          </p>
        )}
      </section>

      <Eyebrow className="mb-6">Your path</Eyebrow>
      <ol className="relative space-y-1 border-l border-rail">
        {STEPS.map((step) => {
          const state: StepState = step.n === 2 && ombudsmanOpen ? "ready" : step.state;
          const mine = ms.filter((m) => m.step === step.n);
          const mineDone = mine.filter((m) => m.done).length;
          const complete = mine.length > 0 && mineDone === mine.length;
          const blurb = step.n === 2 && ombudsmanOpen ? "Fill the ombudsman's form" : step.blurb;
          const isActive = active === step.n;
          return (
            <li key={step.n} className="relative">
              <span aria-hidden className={cx("absolute -left-px top-0 h-full w-0.5 transition-colors", isActive ? "bg-brand" : "bg-transparent")} />
              <button
                disabled={state === "soon"}
                onClick={() => onSelect(step.n)}
                aria-current={isActive ? "step" : undefined}
                className={cx("block w-full py-3 pl-6 pr-2 text-left transition-colors", state === "soon" ? "cursor-not-allowed" : "hover:bg-subtle", isActive && "bg-brand-soft/60")}
              >
                <div className="flex items-center justify-between">
                  <div className={cx("text-[11px] font-medium uppercase tracking-[0.1em]", isActive ? "text-brand" : state === "soon" ? "text-fade" : "text-muted")}>Step {step.n}</div>
                  {state !== "soon" && (
                    <div className={cx("text-[11px] font-medium", complete ? "text-teal" : "text-muted")}>{complete ? "Done" : `${mineDone}/${mine.length}`}</div>
                  )}
                </div>
                <div className={cx("mt-0.5 text-[17px] font-medium leading-6", isActive ? "text-brand" : state === "soon" ? "text-fade" : "text-ink")}>{step.title}</div>
                <div className={cx("mt-0.5 flex items-center gap-1.5 text-xs", state === "soon" ? "text-fade" : "text-muted")}>
                  {state === "locked" && <LockIcon />}
                  {blurb}
                </div>
                {isActive && state !== "soon" && (
                  <ul className="mt-3 space-y-1.5">
                    {mine.map((m) => (
                      <li key={m.label} className={cx("flex items-center gap-2 text-xs", m.done ? "text-ink" : "text-muted")}>
                        <Tick done={m.done} />
                        {m.label}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
