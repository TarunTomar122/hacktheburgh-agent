"use client";

import { CREW, type CrewId } from "../../../lib/agent/plannerTypes";
import { cx } from "../../ui";

/**
 * The crew's visual identity (D52). Square tiles (5px corners) with a simple geometric mark in the crew colour on a
 * soft tint. No faces. Status is carried by its own mark and words, never by colour alone.
 *  Elliot  three joined bars      (leads)
 *  Nell    stacked rectangles     (funding)
 *  Robin   an open corner         (finds solicitors)
 *  Vera    nested squares         (checks firms)
 *  Iona    three offset pages     (clinical evidence)
 *  Kit     a folded sheet         (enquiries)
 */

const MARKS: Record<CrewId, React.ReactNode> = {
  elliot: (
    <>
      <rect x="4" y="5" width="12" height="2.2" rx="0.6" />
      <rect x="4" y="9" width="12" height="2.2" rx="0.6" />
      <rect x="4" y="13" width="12" height="2.2" rx="0.6" />
      <rect x="4" y="5" width="2.2" height="10.2" rx="0.6" />
    </>
  ),
  nell: (
    <>
      <rect x="4" y="12.5" width="12" height="3" rx="0.7" />
      <rect x="5.5" y="8.5" width="9" height="3" rx="0.7" opacity="0.75" />
      <rect x="7" y="4.5" width="6" height="3" rx="0.7" opacity="0.5" />
    </>
  ),
  robin: <path d="M5 15V5h10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />,
  vera: (
    <>
      <rect x="4" y="4" width="12" height="12" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="7.5" y="7.5" width="5" height="5" rx="0.6" />
    </>
  ),
  iona: (
    <>
      <rect x="7" y="3.5" width="8.5" height="10.5" rx="0.8" opacity="0.4" />
      <rect x="5.5" y="5" width="8.5" height="10.5" rx="0.8" opacity="0.7" />
      <rect x="4" y="6.5" width="8.5" height="10.5" rx="0.8" />
    </>
  ),
  kit: (
    <>
      <path d="M5 4h7l3 3v9H5z" opacity="0.85" />
      <path d="M12 4v3h3" fill="none" stroke="#fff" strokeWidth="1.2" />
    </>
  ),
};

/** One crew member's tile. `size` in px; the mark scales with it. */
export function CrewMark({ id, size = 24, className }: { id: CrewId; size?: number; className?: string }) {
  const c = CREW[id];
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-[5px]", className)}
      style={{ width: size, height: size, background: `color-mix(in srgb, ${c.color} 12%, white)`, color: c.color }}
    >
      <svg viewBox="0 0 20 20" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} fill="currentColor">
        {MARKS[id]}
      </svg>
    </span>
  );
}

/** Status without relying on colour: two bars taking turns (working), a pause sign (waiting for you), a tick (done). */
export function StateMark({ state }: { state: "idle" | "working" | "waiting" | "done" }) {
  if (state === "working")
    return (
      <span className="bars inline-flex h-3 items-end gap-[2px]" aria-label="working">
        <span className="block h-3 w-[3px] origin-bottom rounded-[1px] bg-brand" />
        <span className="block h-3 w-[3px] origin-bottom rounded-[1px] bg-brand" />
      </span>
    );
  if (state === "waiting")
    return (
      <span className="inline-flex h-3 items-center gap-[2px]" aria-label="waiting for you">
        <span className="block h-2.5 w-[3px] rounded-[1px] bg-amber" />
        <span className="block h-2.5 w-[3px] rounded-[1px] bg-amber" />
      </span>
    );
  if (state === "done")
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-label="done" className="text-teal">
        <path d="M2.5 6.2l2.3 2.3L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return <span className="inline-block size-1.5 rounded-[1px] bg-fade" aria-label="idle" />;
}

export const CREW_ORDER: CrewId[] = ["elliot", "nell", "robin", "vera", "iona", "kit"];
