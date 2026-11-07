"use client";

import { TRACKS, type TrackId } from "../../lib/agent/track";
import { setTrack, type Profile } from "../../lib/profile";
import { cx, LockIcon } from "../ui";
import { milestones, summarise } from "./progress";
import { STEPS } from "./steps";

const Check = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 5.2l2 2L8 3" />
  </svg>
);

/**
 * The chosen track only (D42): its name and fit, progress for its milestones, its steps as tabs, and a quiet
 * link to switch to the other track. Replaces the fork map (D35).
 */
export default function TrackBar({ profile, active, onSelect }: { profile: Profile; active: number; onSelect: (n: number) => void }) {
  const chosen = profile.track!.chosen!;
  const other: TrackId = chosen === "complaint" ? "compensation" : "complaint";
  const t = TRACKS[chosen];
  const fit = profile.track?.rec?.tracks[chosen].fit;
  const ms = milestones(profile).filter((m) => t.steps.includes(m.step));
  const { done, total, pct, next } = summarise(ms);
  const ombudsmanOpen = profile.ombudsman?.unlocked === true;

  return (
    <section aria-label="Your path" className="border-b border-line bg-subtle">
      <div className="mx-auto max-w-3xl px-12 pt-8 pb-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Your path</div>
            <div className="mt-1 flex items-baseline gap-3">
              <h2 className="display text-[28px] text-ink">{t.title}</h2>
              {fit !== undefined && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">{fit}% fit</span>}
            </div>
          </div>
          <button
            onClick={() => {
              setTrack({ chosen: other });
              onSelect(TRACKS[other].steps[0]);
            }}
            className="shrink-0 text-[13px] text-brand hover:underline"
          >
            Switch to {TRACKS[other].title.toLowerCase()}
          </button>
        </div>

        <div className="mt-5 flex items-center gap-4">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs text-muted">
            {done} of {total} done
          </span>
        </div>
        {next && (
          <p className="mt-1.5 text-xs text-ink-2">
            <span className="font-medium text-ink">Next:</span> {next}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          {STEPS.filter((s) => t.steps.includes(s.n)).map((s, i) => {
            const state = s.n === 2 && ombudsmanOpen ? "ready" : s.state;
            const mine = ms.filter((m) => m.step === s.n);
            const complete = mine.length > 0 && mine.every((m) => m.done);
            const isActive = active === s.n;
            return (
              <button
                key={s.n}
                disabled={state === "soon"}
                onClick={() => onSelect(s.n)}
                aria-current={isActive ? "step" : undefined}
                className={cx(
                  "rounded-card border bg-white px-4 py-3 text-left transition-colors",
                  isActive ? "border-brand ring-4 ring-brand-soft" : state === "soon" ? "cursor-not-allowed border-dashed border-line" : "border-line hover:border-brand/50",
                )}
              >
                <div className={cx("text-[11px] font-medium uppercase tracking-[0.1em]", isActive ? "text-brand" : "text-muted")}>Step {i + 1}</div>
                <div className={cx("mt-0.5 text-[15px] font-medium leading-6", state === "soon" ? "text-faint" : isActive ? "text-brand" : "text-ink")}>{s.title}</div>
                <div className={cx("mt-0.5 flex items-center gap-1.5 text-xs", complete ? "text-teal" : "text-muted")}>
                  {complete && <Check />}
                  {state === "locked" && <LockIcon />}
                  {state === "soon" ? "Coming soon" : complete ? "Done" : state === "locked" ? s.blurb : `${mine.filter((m) => m.done).length} of ${mine.length} done`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
