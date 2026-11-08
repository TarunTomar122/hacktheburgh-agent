"use client";

import { useEffect, useRef, useState } from "react";
import { TRACKS } from "../../lib/agent/track";
import type { Profile } from "../../lib/profile";
import { cx, LockIcon } from "../ui";
import { milestones, summarise } from "./progress";
import { STEPS } from "./steps";
import { InsightsButton } from "./insights";

const Check = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 5.2l2 2L8 3" />
  </svg>
);

/** Square tick for a milestone (no circles). */
export function Tick({ done }: { done: boolean }) {
  return (
    <span aria-hidden className={cx("mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border", done ? "border-brand bg-brand text-white" : "border-rail bg-white")}>
      {done && <Check />}
    </span>
  );
}

/**
 * The chosen track (D42) as one slim sticky bar, in the manner of Linear/Stripe: the track and its fit on the left, the steps as
 * tabs, and a small progress meter on the right whose milestones open on click (progressive disclosure). Switching tracks lives
 * in the profile, not here (Tarun).
 */
export default function TrackBar({ profile, active, onSelect }: { profile: Profile; active: number; onSelect: (n: number) => void }) {
  const chosen = profile.track!.chosen!;
  const t = TRACKS[chosen];
  const fit = profile.track?.rec?.tracks[chosen]?.fit; // optional: older saved recommendations have no Yellow Card score
  const ms = milestones(profile).filter((m) => t.steps.includes(m.step));
  const { done, total, pct, next } = summarise(ms);
  const ombudsmanOpen = profile.ombudsman?.unlocked === true;
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (pop.current && !pop.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <section aria-label="Your path" className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-8 py-2.5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[15px] font-medium text-ink">{t.title}</span>
          {fit !== undefined && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-brand">{fit}% fit</span>}
        </div>

        <nav aria-label="Steps" className="flex flex-wrap items-center gap-1">
          {STEPS.filter((s) => t.steps.includes(s.n)).map((s, i) => {
            const state = s.n === 2 && ombudsmanOpen ? "ready" : s.state;
            // Step 4 needs firms picked in step 3; until then it is disabled and says why (Tarun).
            const needsPick = s.n === 4 && !(profile.legalAid?.selected?.length);
            const mine = ms.filter((m) => m.step === s.n);
            const complete = mine.length > 0 && mine.every((m) => m.done);
            const isActive = active === s.n;
            return (
              <button
                key={s.n}
                disabled={state === "soon" || needsPick}
                onClick={() => onSelect(s.n)}
                aria-current={isActive ? "step" : undefined}
                title={needsPick ? "Pick up to 3 solicitors in the previous step first" : state === "locked" ? s.blurb : undefined}
                className={cx(
                  "flex items-center gap-2 rounded-ctl px-3 py-1.5 text-[13px] transition-colors",
                  isActive ? "bg-brand-soft text-brand" : state === "soon" || needsPick ? "cursor-not-allowed text-faint" : "text-ink-2 hover:bg-subtle hover:text-ink",
                )}
              >
                <span className={cx("flex size-5 items-center justify-center rounded-[4px] text-[11px] font-medium tabular-nums", isActive ? "bg-brand text-white" : complete ? "bg-teal-soft text-teal" : "bg-subtle text-muted")}>
                  {complete ? <Check /> : i + 1}
                </span>
                <span className="font-medium">{s.title}</span>
                {(state === "locked" || needsPick) && <LockIcon />}
                {state === "soon" && <span className="text-[11px]">soon</span>}
              </button>
            );
          })}
        </nav>

        {/* Patient insights (D84): the lightbulb button opens them in a pop-up. Renders nothing unless NEXT_PUBLIC_INSIGHTS=1. */}
        <div className="ml-auto">
          <InsightsButton profile={profile} />
        </div>

        <div ref={pop} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-3 rounded-ctl px-2 py-1.5 text-[12px] text-muted hover:bg-subtle hover:text-ink"
          >
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line-soft">
              <span className="block h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </span>
            <span className="tabular-nums">
              {done} of {total} done
            </span>
            <span aria-hidden className={cx("transition-transform", open && "rotate-180")}>
              ▾
            </span>
          </button>
          {open && (
            <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-card border border-line bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
              {next && (
                <p className="mb-3 text-[13px] text-ink-2">
                  <span className="font-medium text-ink">Next:</span> {next}
                </p>
              )}
              {STEPS.filter((s) => t.steps.includes(s.n)).map((s) => (
                <div key={s.n} className="mb-3 last:mb-0">
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{s.title}</div>
                  <ul className="space-y-1.5">
                    {ms
                      .filter((m) => m.step === s.n)
                      .map((m) => (
                        <li key={m.label} className={cx("flex gap-2 text-[13px] leading-5", m.done ? "text-ink" : "text-muted")}>
                          <Tick done={m.done} />
                          {m.label}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
