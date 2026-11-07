"use client";

import { missingRequired } from "../../lib/agent/facts";
import type { Profile } from "../../lib/profile";
import { cx, LockIcon } from "../ui";
import { milestones, summarise } from "./progress";
import { STEPS, type Step, type StepState } from "./steps";

/**
 * The fork map (D35). One start ("Your story"), then two paths that run side by side, joining at the case file:
 *   Get answers       -> 1 NHS complaint, 2 ombudsman (after the NHS replies)
 *   Get compensation  -> 3 legal aid, 4 lawyers
 * Replaces the straight left-hand timeline, which made two independent paths look like one queue.
 */

const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 5.2l2 2L8 3" />
  </svg>
);

function Tick({ done }: { done: boolean }) {
  return (
    <span aria-hidden className={cx("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border", done ? "border-brand bg-brand text-white" : "border-rail bg-white")}>
      {done && <CheckIcon />}
    </span>
  );
}

type NodeProps = {
  title: string;
  note: string;
  state: StepState | "done";
  active?: boolean;
  onClick?: () => void;
};

/** One box on the map. Solid = you can do it; dashed = waiting or not built yet; blue = the one you are looking at. */
function Node({ title, note, state, active, onClick }: NodeProps) {
  const disabled = state === "soon";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "step" : undefined}
      className={cx(
        "w-full max-w-[260px] rounded-card border px-4 py-3 text-left transition-colors",
        active && "border-brand bg-brand-soft ring-4 ring-brand-soft",
        !active && state === "done" && "border-teal/50 bg-white hover:border-teal",
        !active && state === "ready" && "border-line bg-white hover:border-brand/50",
        !active && state === "locked" && "border-dashed border-rail bg-white hover:border-brand/50",
        state === "soon" && "cursor-not-allowed border-dashed border-line bg-white",
      )}
    >
      <div className={cx("text-[15px] font-medium leading-6", active ? "text-brand" : state === "soon" ? "text-faint" : "text-ink")}>{title}</div>
      <div className={cx("mt-0.5 flex items-center gap-1.5 text-xs", state === "done" ? "text-teal" : state === "soon" ? "text-faint" : "text-muted")}>
        {state === "done" && <CheckIcon />}
        {state === "locked" && <LockIcon />}
        {note}
      </div>
    </button>
  );
}

/** Short vertical line between two boxes in the same lane. */
const Down = ({ on }: { on?: boolean }) => <span aria-hidden className={cx("mx-auto block h-5 w-px", on ? "bg-brand" : "bg-rail")} />;

export default function PathMap({
  profile,
  active,
  onSelect,
  onOpenProfile,
}: {
  profile: Profile;
  active: number;
  onSelect: (n: number) => void;
  onOpenProfile: () => void;
}) {
  const ms = milestones(profile);
  const { done, total, pct, next } = summarise(ms);
  const ombudsmanOpen = profile.ombudsman?.unlocked === true;
  const storyDone = missingRequired(profile.facts).length === 0;

  const view = (step: Step) => {
    const mine = ms.filter((m) => m.step === step.n);
    const mineDone = mine.filter((m) => m.done).length;
    let state: StepState | "done" = step.n === 2 && ombudsmanOpen ? "ready" : step.state;
    if (state !== "soon" && mine.length > 0 && mineDone === mine.length) state = "done";
    const note =
      state === "done" ? "Done" : state === "soon" ? "Coming soon" : state === "locked" ? step.blurb : step.n === 2 ? "Fill the ombudsman's form" : `${mineDone} of ${mine.length} done`;
    return { step, state, note };
  };
  const lane = (track: Step["track"]) => STEPS.filter((s) => s.track === track).map(view);
  const answers = lane("answers");
  const money = lane("compensation");
  const end = lane("end")[0];
  const activeTrack = STEPS.find((s) => s.n === active)?.track;
  const activeMilestones = ms.filter((m) => m.step === active);

  return (
    <section aria-label="Your paths" className="border-b border-line bg-subtle">
      <div className="mx-auto max-w-3xl px-12 pt-8 pb-7">
        {/* Progress, one line */}
        <div className="mb-6 flex items-center gap-4">
          <div className="display text-[32px] leading-none text-ink">{pct}%</div>
          <div className="min-w-0 flex-1">
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between gap-4 text-xs text-muted">
              <span className="truncate">{next ? <><span className="font-medium text-ink">Next:</span> {next}</> : "Nothing waiting on you"}</span>
              <span className="shrink-0">{done} of {total} milestones</span>
            </div>
          </div>
        </div>

        {/* Start */}
        <div className="flex justify-center">
          <Node title="Your story" note={storyDone ? "Done" : "Some details missing"} state={storyDone ? "done" : "ready"} onClick={onOpenProfile} />
        </div>

        {/* Split: a stub down from the start, then a bar that drops into each lane */}
        <div aria-hidden className="relative h-8">
          <span className="absolute left-1/2 top-0 h-3 w-px bg-rail" />
          <span className={cx("absolute left-1/4 right-1/2 top-3 h-5 rounded-tl-lg border-l border-t", activeTrack === "answers" ? "border-brand" : "border-rail")} />
          <span className={cx("absolute left-1/2 right-1/4 top-3 h-5 rounded-tr-lg border-r border-t", activeTrack === "compensation" ? "border-brand" : "border-rail")} />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {[
            { id: "answers" as const, title: "Get answers", why: "An explanation, an apology, a fix", items: answers },
            { id: "compensation" as const, title: "Get compensation", why: "Money for what happened", items: money },
          ].map((l) => (
            <div key={l.id} className="flex flex-col items-center">
              <div className="mb-3 text-center">
                <div className={cx("text-[11px] font-medium uppercase tracking-[0.1em]", activeTrack === l.id ? "text-brand" : "text-muted")}>{l.title}</div>
                <div className="text-xs text-muted">{l.why}</div>
              </div>
              {l.items.map((it, i) => (
                <div key={it.step.n} className="flex w-full flex-col items-center">
                  {i > 0 && <Down on={activeTrack === l.id && active >= it.step.n} />}
                  <Node title={it.step.title} note={it.note} state={it.state} active={active === it.step.n} onClick={() => onSelect(it.step.n)} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Join */}
        <div aria-hidden className="relative h-8">
          <span className="absolute left-1/4 right-1/2 top-0 h-5 rounded-bl-lg border-b border-l border-rail" />
          <span className="absolute left-1/2 right-1/4 top-0 h-5 rounded-br-lg border-b border-r border-rail" />
          <span className="absolute left-1/2 top-5 h-3 w-px bg-rail" />
        </div>
        {end && (
          <div className="flex justify-center">
            <Node title={end.step.title} note={end.note} state={end.state} active={active === end.step.n} onClick={() => onSelect(end.step.n)} />
          </div>
        )}

        {/* The step you are on: its checklist */}
        {activeMilestones.length > 0 && (
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4">
            {activeMilestones.map((m) => (
              <li key={m.label} className={cx("flex items-center gap-2 text-xs", m.done ? "text-ink" : "text-muted")}>
                <Tick done={m.done} />
                {m.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
