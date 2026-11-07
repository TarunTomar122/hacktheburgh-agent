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
  eyebrow?: string;
  title: string;
  note: string;
  state: StepState | "done";
  active?: boolean;
  compact?: boolean;
  onClick?: () => void;
};

/** One box on the map. Solid = you can do it; dashed = waiting or not built yet; blue = the one you are looking at. */
function Node({ eyebrow, title, note, state, active, compact, onClick }: NodeProps) {
  const disabled = state === "soon";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "step" : undefined}
      className={cx(
        "relative w-full rounded-card border bg-white text-left transition-[border-color,box-shadow]",
        compact ? "max-w-[220px] px-4 py-2.5" : "max-w-[264px] px-4 py-3",
        active && "border-brand shadow-[0_0_0_4px_var(--color-brand-soft)]",
        !active && state === "done" && "border-teal/40 hover:border-teal",
        !active && state === "ready" && "border-line hover:border-brand/50",
        !active && state === "locked" && "border-dashed border-rail hover:border-brand/50",
        state === "soon" && "cursor-not-allowed border-dashed border-line bg-white/60",
      )}
    >
      {eyebrow && (
        <div className={cx("text-[10px] font-medium uppercase tracking-[0.12em]", active ? "text-brand" : state === "soon" ? "text-fade" : "text-muted")}>{eyebrow}</div>
      )}
      <div className={cx("text-[15px] font-medium leading-6", active ? "text-brand" : state === "soon" ? "text-faint" : "text-ink")}>{title}</div>
      <div className={cx("flex items-center gap-1.5 text-xs", state === "done" ? "text-teal" : state === "soon" ? "text-faint" : "text-muted")}>
        {state === "done" && <CheckIcon />}
        {state === "locked" && <LockIcon />}
        {note}
      </div>
    </button>
  );
}

/*
 * Connectors. Each lane is one column of a two-column grid with no gap, so a line drawn from a column's centre to its
 * inner edge meets the other lane's line exactly in the middle, under "Your story" and above "Your case file".
 */
const line = (on?: boolean) => (on ? "border-brand" : "border-rail");
/** Vertical line between two boxes in the same lane. */
const Down = ({ on, h = "h-6" }: { on?: boolean; h?: string }) => <span aria-hidden className={cx("mx-auto block w-0 border-l-[1.5px]", h, line(on))} />;
/** From the middle of the map out to the centre of a lane (split), or back (join). */
function Branch({ side, on, join }: { side: "left" | "right"; on?: boolean; join?: boolean }) {
  return (
    <div aria-hidden className="h-6">
      <span
        className={cx(
          "block h-full w-1/2 border-[1.5px]",
          line(on),
          join ? "border-t-0" : "border-b-0",
          side === "left" ? "border-r-0" : "border-l-0",
          side === "left" ? (join ? "rounded-bl-[10px]" : "rounded-tl-[10px]") : join ? "rounded-br-[10px]" : "rounded-tr-[10px]",
        )}
        style={side === "left" ? { marginRight: 0, marginLeft: "50%" } : { marginLeft: 0, marginRight: "50%" }}
      />
    </div>
  );
}

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
  const end = lane("end")[0];
  const activeTrack = STEPS.find((s) => s.n === active)?.track;
  const activeMilestones = ms.filter((m) => m.step === active);
  const lanes = [
    { id: "answers" as const, side: "left" as const, title: "Get answers", why: "An explanation, an apology, a fix", items: lane("answers") },
    { id: "compensation" as const, side: "right" as const, title: "Get compensation", why: "Money for what happened", items: lane("compensation") },
  ];

  return (
    <section aria-label="Your paths" className="border-b border-line bg-paper">
      <div className="mx-auto max-w-3xl px-12 pt-8 pb-8">
        {/* Progress */}
        <div className="mb-7 flex items-end gap-5">
          <div className="display text-[40px] leading-none text-ink">{pct}%</div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="mb-1.5 flex justify-between gap-4 text-xs text-muted">
              <span className="truncate">{next ? <><span className="font-medium text-ink">Next:</span> {next}</> : "Nothing waiting on you"}</span>
              <span className="shrink-0 tabular-nums">{done} of {total} milestones</span>
            </div>
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-rail/50">
              <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Start */}
        <div className="flex justify-center">
          <Node compact eyebrow="Start" title="Your story" note={storyDone ? "Done" : "Some details missing"} state={storyDone ? "done" : "ready"} onClick={onOpenProfile} />
        </div>
        <Down on={activeTrack === "answers" || activeTrack === "compensation"} h="h-4" />

        {/* Two lanes, each in its own column (no gap, so the lines meet in the middle) */}
        <div className="grid grid-cols-2">
          {lanes.map((l) => {
            const on = activeTrack === l.id;
            return (
              <div key={l.id} className="flex flex-col items-center">
                <div className="w-full">
                  <Branch side={l.side} on={on} />
                </div>
                <div className="mb-3 mt-2 text-center">
                  <div className={cx("text-[11px] font-medium uppercase tracking-[0.12em]", on ? "text-brand" : "text-ink-2")}>{l.title}</div>
                  <div className="text-xs text-muted">{l.why}</div>
                </div>
                <div className="flex w-full flex-col items-center px-3">
                  {l.items.map((it, i) => (
                    <div key={it.step.n} className="flex w-full flex-col items-center">
                      {i > 0 && <Down on={on && active >= it.step.n} />}
                      <Node eyebrow={`Step ${it.step.n}`} title={it.step.title} note={it.note} state={it.state} active={active === it.step.n} onClick={() => onSelect(it.step.n)} />
                    </div>
                  ))}
                </div>
                <Down h="h-4" on={activeTrack === "end"} />
                <div className="w-full">
                  <Branch side={l.side} join on={activeTrack === "end"} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Join */}
        <Down on={activeTrack === "end"} h="h-4" />
        {end && (
          <div className="flex justify-center">
            <Node compact eyebrow="Together" title={end.step.title} note={end.note} state={end.state} active={active === end.step.n} onClick={() => onSelect(end.step.n)} />
          </div>
        )}

        {/* The step you are on: its checklist */}
        {activeMilestones.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-rail/60 pt-4">
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
