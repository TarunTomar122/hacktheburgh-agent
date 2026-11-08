"use client";

import { involvesMedicine, MEDICINE_STEP } from "../../lib/agent/medicine";
import { useEffect, useRef, useState } from "react";
import { TRACKS } from "../../lib/agent/track";
import type { Profile } from "../../lib/profile";
import { cx, LockIcon } from "../ui";
import { milestones, summarise } from "./progress";
import { stepsFor } from "./steps";
import type { Stage } from "./stage";

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
 * The journey as one slim sticky bar, always there: Research, Choose a path, then the chosen path's steps. Done stages can be
 * reopened; stages that are not open yet say why. `stage` is null while the profile is open, so no tab looks selected.
 * Switching tracks lives in the profile, not here (Tarun).
 */
export default function TrackBar({ profile, stage, onSelect }: { profile: Profile; stage: Stage | null; onSelect: (s: Stage) => void }) {
  const STEPS_ = stepsFor(profile.route && "map" in profile.route ? profile.route.map : undefined);
  const hasRoute = !!profile.route;
  const chosen = profile.track?.chosen ?? null;
  const t = chosen ? TRACKS[chosen] : null;
  const fit = chosen ? profile.track?.rec?.tracks[chosen].fit : undefined;
  const ms = t ? milestones(profile).filter((m) => t.steps.includes(m.step)) : [];
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

  const tab = (isActive: boolean, disabled: boolean) =>
    cx("flex items-center gap-2 rounded-ctl px-3 py-1.5 text-[13px] transition-colors", isActive ? "bg-brand-soft text-brand" : disabled ? "cursor-not-allowed text-faint" : "text-ink-2 hover:bg-subtle hover:text-ink");
  const box = (isActive: boolean, complete: boolean) => cx("flex size-5 items-center justify-center rounded-[4px] text-[11px] font-medium tabular-nums", isActive ? "bg-brand text-white" : complete ? "bg-teal-soft text-teal" : "bg-subtle text-muted");

  return (
    <section aria-label="Your case" className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-8 py-2.5">
        {t && (
          <div className="flex items-baseline gap-2.5">
            <span className="text-[15px] font-medium text-ink">{t.title}</span>
            {fit !== undefined && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-brand">{fit}% fit</span>}
          </div>
        )}

        <nav aria-label="Stages" className="flex flex-wrap items-center gap-1">
          <button onClick={() => onSelect("research")} aria-current={stage === "research" ? "step" : undefined} className={tab(stage === "research", false)}>
            <span className={box(stage === "research", hasRoute)}>{hasRoute ? <Check /> : "•"}</span>
            <span className="font-medium">Research</span>
          </button>
          <button
            disabled={!hasRoute}
            onClick={() => onSelect("path")}
            aria-current={stage === "path" ? "step" : undefined}
            title={hasRoute ? undefined : "Opens when the research has finished"}
            className={tab(stage === "path", !hasRoute)}
          >
            <span className={box(stage === "path", !!chosen)}>{chosen ? <Check /> : "•"}</span>
            <span className="font-medium">Choose a path</span>
            {!hasRoute && (
              <>
                <LockIcon />
                <span className="text-[11px] font-normal">after the research</span>
              </>
            )}
          </button>
          {t && <span aria-hidden className="mx-1 h-5 w-px bg-line" />}
          {t &&
            STEPS_.filter((s) => t.steps.includes(s.n)).map((s, i) => {
              const state = s.n === 2 && ombudsmanOpen ? "ready" : s.state;
              // Step 4 needs firms picked in step 3; until then it is disabled and says why (Tarun).
              const needsPick = s.n === 4 && !(profile.legalAid?.selected?.length);
              const mine = ms.filter((m) => m.step === s.n);
              const complete = mine.length > 0 && mine.every((m) => m.done);
              const isActive = stage === s.n;
              const disabled = state === "soon" || needsPick;
              return (
                <button
                  key={s.n}
                  disabled={disabled}
                  onClick={() => onSelect(s.n)}
                  aria-current={isActive ? "step" : undefined}
                  title={needsPick ? "Pick up to 3 solicitors in the previous step first" : state === "locked" ? s.blurb : undefined}
                  className={tab(isActive, disabled)}
                >
                  <span className={box(isActive, complete)}>{complete ? <Check /> : i + 1}</span>
                  <span className="font-medium">{s.title}</span>
                  {(state === "locked" || needsPick) && <LockIcon />}
                  {needsPick && <span className="text-[11px] font-normal">pick solicitors first</span>}
                  {state === "soon" && <span className="text-[11px]">soon</span>}
                </button>
              );
            })}
          {/* The optional extra step: only when the story involves a medicine, in whichever path was chosen. */}
          {t && hasRoute && involvesMedicine(profile.facts) && (
            <button onClick={() => onSelect(MEDICINE_STEP)} aria-current={stage === MEDICINE_STEP ? "step" : undefined} title="Optional: report the side effect to the medicines regulator" className={tab(stage === MEDICINE_STEP, false)}>
              <span className={box(stage === MEDICINE_STEP, false)}>+</span>
              <span className="font-medium">Report a medicine problem</span>
              <span className="text-[11px] font-normal text-muted">optional</span>
            </button>
          )}
        </nav>

        {t && (
        <div ref={pop} className="relative ml-auto">
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
              {t && STEPS_.filter((s) => t.steps.includes(s.n)).map((s) => (
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
        )}
      </div>
    </section>
  );
}
