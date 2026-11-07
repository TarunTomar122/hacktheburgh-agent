"use client";

import type { ReactNode } from "react";
import type { CheckRowData } from "../../lib/agent/complaintChecks";
import { fmtDate, fmtEvent, type Clock, type ClockState } from "../../lib/agent/complaintClock";
import type { AgentTile, TraceStep } from "../../lib/agent/legalAidTypes";
import { cx, Eyebrow } from "../ui";
import { AgentsPanel } from "./LegalAidStep";
import { Badge } from "./scoreParts";

/** Pieces for the ombudsman step. Same look as the step 3 pages: cards with a serif title, plain evidence under each claim. */

/** A card with a serif title (a statement, never a question: docs/DESIGN.md) and an optional aside on the right. */
export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("overflow-hidden rounded-card border border-line bg-white", className)}>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line-soft px-6 py-4">
        <h2 className="display text-[22px] text-ink">{title}</h2>
        {aside}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

/* ---------- chips ---------- */

export type ChipTone = "ok" | "warn" | "bad" | "info" | "quiet";
const CHIP: Record<ChipTone, string> = {
  ok: "bg-teal-soft text-teal",
  warn: "bg-amber-soft text-amber",
  bad: "bg-danger-soft text-danger",
  info: "bg-brand-soft text-brand",
  quiet: "bg-subtle text-muted",
};
export const Chip = ({ tone = "quiet", children }: { tone?: ChipTone; children: ReactNode }) => <Badge cls={CHIP[tone]}>{children}</Badge>;

/** How a time limit reads as a chip. "warn" is kept for callers that want it. */
export const clockTone = (s: ClockState): ChipTone => (s === "inside" ? "ok" : s === "outside" ? "bad" : "quiet");

/* ---------- checklist ---------- */

const BOX: Record<CheckRowData["status"], { cls: string; mark: ReactNode; word: string }> = {
  yes: {
    cls: "border-teal bg-teal text-white",
    word: "yes",
    mark: (
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
      </svg>
    ),
  },
  no: {
    cls: "border-danger/50 bg-danger-soft text-danger",
    word: "no",
    mark: (
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
    ),
  },
  unknown: { cls: "border-faint bg-white text-muted", word: "not clear", mark: <span className="text-[11px] font-semibold leading-none">?</span> },
};

/** Claims we checked in code, each with a box (yes / no / not clear) and the evidence underneath, always visible. */
export function CheckList({ rows }: { rows: CheckRowData[] }) {
  return (
    <ul className="divide-y divide-line-soft">
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <span aria-hidden className={cx("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border", BOX[r.status].cls)}>
            {BOX[r.status].mark}
          </span>
          <div className="min-w-0">
            <div className={cx("text-[14px] leading-5", r.status === "yes" ? "text-ink" : "text-ink-2")}>
              {r.label}
              <span className="sr-only">: {BOX[r.status].word}</span>
            </div>
            <div className="text-xs leading-5 text-muted">{r.evidence}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- time limit ---------- */

const FILL: Record<ClockState, string> = { inside: "bg-teal", outside: "bg-danger", unknown: "bg-fade" };

/** A time limit drawn as a bar from the start date to the end of the limit, with today marked. Estimate, with its reasoning and source. */
export function ClockCard({ clock }: { clock: Clock }) {
  const { from, marks, today } = clock;
  const start = from?.date.getTime() ?? 0;
  const end = marks.length ? marks[marks.length - 1].at.getTime() : start;
  const span = Math.max(end - start, 1);
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - start) / span) * 100));
  const todayPct = pct(today.getTime());
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[15px] font-medium leading-6 text-ink">{clock.headline}</div>
        <p className="mt-1 max-w-[64ch] text-[13px] leading-5 text-ink-2">{clock.detail}</p>
      </div>
      {from && marks.length > 0 && (
        <div aria-hidden className="relative h-[68px] select-none">
          <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-ink" style={{ left: `clamp(32px, ${todayPct}%, calc(100% - 32px))` }}>
            Today
          </span>
          <span className="absolute left-0 right-0 top-6 h-2 rounded-full bg-line-soft">
            <span className={cx("block h-full rounded-full", FILL[clock.state])} style={{ width: `${todayPct}%` }} />
            {marks.slice(0, -1).map((m) => (
              <span key={m.label} className="absolute -top-1 h-4 w-px bg-faint" style={{ left: `${pct(m.at.getTime())}%` }} />
            ))}
            <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink" style={{ left: `${todayPct}%` }} />
          </span>
          <span className="absolute left-0 top-[44px] text-[11px] leading-4 text-muted">
            Earliest event
            <br />
            <span className="text-ink-2">{fmtEvent(from)}</span>
          </span>
          {marks.map((m, i) => {
            const last = i === marks.length - 1;
            return (
              <span
                key={m.label}
                className={cx("absolute top-[44px] text-[11px] leading-4 text-muted", last ? "right-0 text-right" : "-translate-x-1/2 text-center")}
                style={last ? undefined : { left: `${pct(m.at.getTime())}%` }}
              >
                {m.label}
                <br />
                <span className="text-ink-2">{fmtDate(m.at)}</span>
              </span>
            );
          })}
        </div>
      )}
      <p className="text-xs leading-5 text-muted">
        An estimate, not legal advice. Source:{" "}
        <a className="text-brand underline underline-offset-2" href={clock.source.url} target="_blank" rel="noreferrer">
          {clock.source.label}
        </a>
        .
      </p>
    </div>
  );
}

/* ---------- what happens next ---------- */

export type TimelineItem = { title: ReactNode; when?: ReactNode; note?: ReactNode; state: "done" | "now" | "next" };

/** A vertical path: what has happened, where the user is, what comes next, each with a date where we can work one out. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol>
      {items.map((it, i) => (
        <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 && <span aria-hidden className="absolute left-[9px] top-6 h-[calc(100%-1.5rem)] w-px bg-rail" />}
          <span
            aria-hidden
            className={cx(
              "z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
              it.state === "done" && "bg-teal text-white",
              it.state === "now" && "border-2 border-brand bg-brand-soft",
              it.state === "next" && "border border-fade bg-white",
            )}
          >
            {it.state === "done" && (
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
              </svg>
            )}
            {it.state === "now" && <span className="size-1.5 rounded-full bg-brand" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className={cx("text-[15px] font-medium leading-6", it.state === "next" ? "text-ink-2" : "text-ink")}>{it.title}</span>
              {it.when && <span className="text-xs tabular-nums text-brand">{it.when}</span>}
            </div>
            {it.note && <p className="max-w-[60ch] text-[13px] leading-5 text-muted">{it.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- free help ---------- */

/** Independent, free help with an NHS complaint in Scotland. */
export function HelpCard() {
  return (
    <div className="rounded-card bg-subtle px-6 py-5">
      <Eyebrow>Free, independent help</Eyebrow>
      <p className="mt-1.5 max-w-[62ch] text-[13px] leading-5 text-ink-2">
        The Patient Advice and Support Service, run by Citizens Advice Scotland, gives free and confidential advice about NHS complaints. You can reach it through any Citizens Advice Bureau in Scotland.{" "}
        <a className="text-brand underline underline-offset-2" href="https://www.cas.org.uk/pass/about-us-0" target="_blank" rel="noreferrer">
          About the service
        </a>
        .
      </p>
    </div>
  );
}

/* ---------- agent at work ---------- */

const COLOUR = "#0060df";

/**
 * The browser agent for a complaint form, shown like the step 3 crew: one row with its state, and the latest steps under it.
 * The raw log stays one click away for anyone who wants every line.
 */
export function FormAgentRun({ label, lines, running, done, failed }: { label: string; lines: string[]; running: boolean; done: boolean; failed: boolean }) {
  const last = lines[lines.length - 1] ?? "Starting the browser agent";
  const tile: AgentTile = {
    id: label,
    label,
    color: COLOUR,
    url: "",
    state: failed ? "failed" : done ? "done" : running ? "working" : "starting",
    note: done ? "Waiting for you in the other window" : failed ? "Stopped" : last,
  };
  const recent = lines.slice(-5);
  const live: TraceStep[] = recent.map((text, k) => ({ i: lines.length - recent.length + k, t: 0, agent: label, color: COLOUR, kind: "check", text }));
  return (
    <div className="space-y-3">
      <AgentsPanel tiles={[tile]} stats={null} status={null} live={running ? live : []} />
      {lines.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted hover:text-ink">Show the full log</summary>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-card bg-night px-5 py-4 font-mono text-xs leading-5 text-night-text">
            {lines.map((l, i) => (
              <div key={i} className={i === lines.length - 1 ? "text-white" : "text-night-meta"}>
                {l}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
