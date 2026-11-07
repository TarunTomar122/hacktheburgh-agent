"use client";

import { CREW, type CrewId, type Say } from "../../../lib/agent/plannerTypes";
import { cx } from "../../ui";
import type { CrewState } from "../usePlannerRun";
import { CrewMark, StateMark } from "./Crew";

/**
 * The four steps of "Preparing your case" (Tarun's option A, D53): who does what, left to right on a thin line.
 * Before the run it explains the work; during the run the same strip is the progress bar (waiting, working, needs you,
 * done), worked out only from what the crew actually reported.
 */

type Step = { crew: CrewId[]; title: string; line: string };
export const STEPS: Step[] = [
  { crew: ["nell"], title: "Check legal aid", line: "Nell runs SLAB's calculator" },
  { crew: ["robin", "vera"], title: "Find solicitors", line: "Robin & Vera search and check firms" },
  { crew: ["iona"], title: "Gather evidence", line: "Iona reads guidelines & past cases" },
  { crew: ["kit"], title: "Fill enquiries", line: "Kit fills each firm's form" },
];

export type StepStatus = "pending" | "working" | "waiting" | "done" | "skipped" | "failed";

/** Live status of each step from the crew's states and reports. `finished` = the whole run is over. */
export function stepStatuses(crew: Record<CrewId, CrewState>, says: Say[], finished: boolean): StepStatus[] {
  return STEPS.map((st) => {
    if (st.crew.some((id) => crew[id]?.state === "waiting")) return "waiting";
    if (st.crew.some((id) => crew[id]?.state === "working")) return "working";
    // Step 2 is done when Vera (the checker) has reported; the others when their one crew member has.
    const finisher = st.crew[st.crew.length - 1];
    const latest = new Map<string, Say>();
    for (const report of says) if (report.kind === "report" && st.crew.includes(report.from)) latest.set(`${report.from}:${report.tool ?? "report"}:${report.tab ?? ""}`, report);
    const reports = [...latest.values()];
    // Old saved runs lack ok: retain compatibility with their explicit error reports.
    if (reports.some((s) => s.ok === false || (s.ok === undefined && /^I hit a problem:|^Error:|^Could not/i.test(s.text)))) return "failed";
    if (reports.some((s) => s.from === finisher)) return "done";
    if (finished) return reports.length ? "done" : "skipped";
    return "pending";
  });
}

export default function StepStrip({ statuses, compact }: { statuses?: StepStatus[]; compact?: boolean }) {
  const size = compact ? 40 : 76;
  return (
    <ol className="relative grid grid-cols-4" aria-label="The four steps">
      {/* the thin line joining the steps, behind the avatars */}
      <span aria-hidden className="absolute left-[12.5%] right-[12.5%] h-px bg-line" style={{ top: size / 2 }} />
      {STEPS.map((st, i) => {
        const s = statuses?.[i];
        const active = s === "working" || s === "waiting";
        return (
          <li key={st.title} className="relative flex flex-col items-center px-2 text-center">
            <div className={cx("relative flex items-center justify-center bg-white px-2 transition-transform duration-300", active && "-translate-y-0.5")} style={{ height: size }}>
              <span className="flex -space-x-3">
                {st.crew.map((id) => (
                  <CrewMark key={id} id={id} size={size} className={cx("transition-[filter,opacity] duration-300", s === "pending" && "opacity-45 grayscale-[35%]", s === "skipped" && "opacity-30 grayscale")} />
                ))}
              </span>
              {s && s !== "pending" && (
                <span className="absolute -bottom-1 right-1 flex size-5 items-center justify-center rounded-[5px] border border-line bg-white">
                  {s === "failed" ? <span aria-label="needs attention" className="text-[12px] text-danger">!</span> : s === "skipped" ? <span className="text-[10px] text-faint">–</span> : <StateMark state={s === "waiting" ? "waiting" : s === "working" ? "working" : "done"} />}
                </span>
              )}
            </div>
            <div className={cx("font-medium text-ink", compact ? "mt-2 text-[13px]" : "mt-4 text-[16px]")}>
              <span className="mr-1.5 text-muted tabular-nums">{i + 1}</span>
              {st.title}
            </div>
            <div className={cx("leading-5", compact ? "text-[12px]" : "mt-1 text-[13px]", s === "failed" ? "text-danger" : s === "waiting" ? "text-amber" : "text-muted")}>
              {s === "failed" ? "Needs attention" : s === "waiting" ? `${CREW[st.crew[0]].name} needs one detail from you` : s === "skipped" ? "Not needed this time" : st.line}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
