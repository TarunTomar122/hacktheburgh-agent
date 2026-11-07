"use client";

import { useState, type ReactNode } from "react";
import type { ScoreItem, Stats } from "../../lib/agent/legalAidTypes";
import { cx } from "../ui";

/** Small pieces shared by the track choice, the profile and the step 3 results: fit ring, score rows, badges, stats line. */

export const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function Badge({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}

/** "How well this firm fits what you need" (D39). A fit, never a chance of winning. */
export function FitRing({ fit, size = 60, title = "How well this firm fits what you need, from the checks below. Not a chance of winning." }: { fit: number; size?: number; title?: string }) {
  // Everything is drawn in one 56x56 SVG coordinate space, so the number and "FIT" are centred on the ring and scale with it at any size.
  const r = 22;
  const c = 2 * Math.PI * r;
  const n = Math.max(0, Math.min(100, Math.round(fit)));
  const showLabel = size >= 48;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" className="shrink-0" role="img" aria-label={`${n}% fit`}>
      <title>{title}</title>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-line-soft)" strokeWidth="4.5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="4.5" strokeLinecap="round" strokeDasharray={`${(n / 100) * c} ${c}`} transform="rotate(-90 28 28)" />
      <text
        x="28"
        y={showLabel ? 26 : 28}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={n === 100 ? 11 : 12.5}
        fontWeight={600}
        fill="var(--color-ink)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {n}%
      </text>
      {showLabel && (
        <text x="28" y="36.5" textAnchor="middle" dominantBaseline="central" fontSize="5" letterSpacing="0.6" fill="var(--color-muted)">
          FIT
        </text>
      )}
    </svg>
  );
}

const BAR: Record<ScoreItem["status"], string> = { yes: "bg-teal", no: "bg-danger/60", unknown: "bg-fade" };
const MARK: Record<ScoreItem["status"], { t: string; cls: string }> = {
  yes: { t: "✓", cls: "text-teal" },
  no: { t: "✕", cls: "text-danger" },
  unknown: { t: "?", cls: "text-muted" },
};

/** One criterion: label, a small bar (points out of max, coloured by what we found), and the evidence when opened. */
export function ScoreRow({ row }: { row: Pick<ScoreItem, "label" | "points" | "max" | "status" | "evidence"> }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button onClick={() => setOpen((o) => !o)} title={row.evidence} aria-expanded={open} className="grid w-full grid-cols-[14px_1fr_auto] items-baseline gap-x-2 gap-y-1 rounded py-1.5 text-left text-[13px] hover:bg-subtle">
        <span aria-hidden className={cx("text-center text-[12px]", MARK[row.status].cls)}>{MARK[row.status].t}</span>
        <span className="leading-5 text-ink-2">{row.label}</span>
        <span className="text-right text-[11px] tabular-nums text-muted">
          {row.points}/{row.max}
        </span>
        <span aria-hidden />
        <span className="col-span-2 h-1 overflow-hidden rounded-full bg-line-soft">
          <span className={cx("block h-full rounded-full", BAR[row.status])} style={{ width: `${row.max ? (row.points / row.max) * 100 : 0}%` }} />
        </span>
      </button>
      {open && <p className="mb-1.5 ml-[22px] rounded bg-subtle px-3 py-2 text-[12px] leading-5 text-ink-2">{row.evidence}</p>}
    </li>
  );
}

/**
 * One reason for the suggested track as a plain tick box (D51): ticked if it fits what they told us, empty if not.
 * No points and no bar: the numbers only fed the fit % and read as more exact than they are. A reason we could not
 * judge ("unknown") is an empty box with a short note. The full sentence is in the tooltip.
 */
export function CheckRow({ row }: { row: Pick<ScoreItem, "label" | "status" | "evidence"> }) {
  const on = row.status === "yes";
  return (
    <li title={row.evidence} className="flex items-start gap-3 py-2 text-[14px] leading-5">
      <span aria-hidden className={cx("mt-px flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border", on ? "border-teal bg-teal text-white" : "border-faint bg-white")}>
        {on && (
          <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
          </svg>
        )}
      </span>
      <span className={on ? "text-ink" : "text-ink-2"}>
        {row.label}
        <span className="sr-only">{on ? ": yes" : row.status === "unknown" ? ": not clear" : ": no"}</span>
        {row.status === "unknown" && <span className="block text-xs text-muted">Not clear from your story.</span>}
      </span>
    </li>
  );
}

export function StatsLine({ stats, inline }: { stats: Stats; inline?: boolean }) {
  const text = `${stats.agents} agents · ${stats.sites} sites · ${stats.pages} pages · ${stats.actions} actions`;
  return inline ? <span className="tabular-nums text-muted">{text}</span> : <div className="text-xs tabular-nums text-muted">{text}</div>;
}
