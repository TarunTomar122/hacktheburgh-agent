"use client";

import { useEffect, useMemo, useState } from "react";
import type { TraceStep } from "../../lib/agent/legalAidTypes";
import { Button, cx } from "../ui";

/**
 * Full traceability for step 3 (D39): every step an agent took, in time order, for one firm, the calculator, or the whole run.
 * Opened from a firm card, the verdict, or "Whole run". A centred modal (Tarun: modals, never side sheets); Escape or the backdrop closes it.
 */

export type TraceScope = { title: string; subtitle?: string; steps: TraceStep[]; whole?: boolean };

const KIND: Record<TraceStep["kind"], { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-subtle text-ink-2" },
  click: { label: "Click", cls: "bg-subtle text-ink-2" },
  type: { label: "Type", cls: "bg-subtle text-ink-2" },
  pick: { label: "Pick", cls: "bg-brand-soft text-brand" },
  decide: { label: "Decide", cls: "bg-brand-soft text-brand" },
  read: { label: "Read", cls: "bg-subtle text-ink-2" },
  found: { label: "Found", cls: "bg-teal-soft text-teal" },
  check: { label: "Check", cls: "bg-teal-soft text-teal" },
  recover: { label: "Recover", cls: "bg-amber-soft text-amber" },
  fail: { label: "Failed", cls: "bg-danger-soft text-danger" },
  result: { label: "Result", cls: "bg-ink text-white" },
};

/** The steps that tell the story (what was found, checked, decided), for the one-line summary at the top. */
const STORY: TraceStep["kind"][] = ["found", "check", "decide", "recover", "fail", "result"];
/** What the history shows by default: outcomes only. The agents' moment-to-moment thinking ("promising", scores) is behind "Show every step". */
const OUTCOMES: TraceStep["kind"][] = ["found", "check", "recover", "fail", "result"];
const oneLine = (t: string, n = 110) => {
  const x = t.replace(/\s+/g, " ").replace(/^[^:]{3,60}: (promising|dead end|unlikely)\.\s*/i, "").trim();
  return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x;
};

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const shotUrl = (runId: string | undefined, file: string) => `/api/agent/step3/shot?run=${encodeURIComponent(runId ?? "")}&file=${encodeURIComponent(file)}`;

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-muted" title={`The model's confidence: ${pct}%`}>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-line">
        <span className={cx("block h-full rounded-full", value >= 0.8 ? "bg-teal" : value >= 0.6 ? "bg-brand" : "bg-amber")} style={{ width: `${pct}%` }} />
      </span>
      {value.toFixed(2)}
    </span>
  );
}

export default function TraceSheet({ scope, runId, onClose }: { scope: TraceScope; runId?: string; onClose: () => void }) {
  const [big, setBig] = useState<string | null>(null);
  const agents = useMemo(() => [...new Map(scope.steps.map((s) => [s.agent, s.color])).entries()], [scope.steps]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [every, setEvery] = useState(false);
  const steps = useMemo(() => [...scope.steps].sort((a, b) => a.t - b.t || a.i - b.i).filter((s) => !hidden.has(s.agent) && (every || OUTCOMES.includes(s.kind))), [scope.steps, hidden, every]);
  const story = scope.steps.filter((s) => OUTCOMES.includes(s.kind)).sort((a, b) => a.t - b.t);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (big) setBig(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-10" role="dialog" aria-modal="true" aria-label={scope.title}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-card bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <header className="space-y-4 border-b border-line px-8 pt-7 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="display text-[28px] text-ink">{scope.title}</h2>
              {scope.subtitle && <p className="mt-1 text-sm text-ink-2">{scope.subtitle}</p>}
            </div>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          {!scope.whole && story.length > 0 && (
            <ol aria-label="Summary" className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px]">
              {story.map((s, k) => (
                <li key={s.i} className="flex items-center gap-1.5">
                  {k > 0 && <span aria-hidden className="text-faint">→</span>}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-ink">
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: s.color }} />
                    {oneLine(s.text, 70)}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {scope.whole && agents.length > 1 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Show or hide an agent">
              {agents.map(([name, color]) => {
                const off = hidden.has(name);
                return (
                  <button
                    key={name}
                    onClick={() => setHidden((h) => {
                      const n = new Set(h);
                      if (off) n.delete(name);
                      else n.add(name);
                      return n;
                    })}
                    className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors", off ? "border-line text-faint" : "border-line bg-white text-ink")}
                  >
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: off ? "var(--color-fade)" : color }} />
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        <ol className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
          {steps.length === 0 && <li className="text-sm text-muted">No steps recorded for this.</li>}
          {scope.steps.length > 0 && (
            <li className="pb-4">
              <button onClick={() => setEvery((v) => !v)} className="text-[12px] text-muted hover:text-brand hover:underline">
                {every ? "Show only what was found" : `Show every step (${scope.steps.length})`}
              </button>
            </li>
          )}
          {steps.map((s) => (
            <li key={s.i} className="relative flex gap-4 pb-5 last:pb-0">
              <div className="w-12 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted">+{secs(s.t)}</div>
              <div className="relative flex shrink-0 flex-col items-center">
                <span aria-hidden className="mt-1 h-3 w-1 rounded-full" style={{ background: s.color }} />
                <span aria-hidden className="mt-1 w-px flex-1 bg-line" />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]", KIND[s.kind].cls)}>{KIND[s.kind].label}</span>
                  <span className="text-[12px] font-medium" style={{ color: s.color }}>
                    {s.agent}
                  </span>
                  {every && s.confidence !== undefined && <Confidence value={s.confidence} />}
                </div>
                <p className="text-[14px] leading-5 text-ink">{every ? s.text : oneLine(s.text, 160)}</p>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="block break-all text-[12px] text-brand underline-offset-2 hover:underline">
                    {s.url.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                )}
                {s.detail && (
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[12px] text-muted hover:text-ink">
                      <span className="group-open:hidden">Show details</span>
                      <span className="hidden group-open:inline">Hide details</span>
                    </summary>
                    <pre className="mt-1.5 whitespace-pre-wrap rounded bg-subtle px-3 py-2 font-sans text-[12px] leading-5 text-ink-2">{s.detail}</pre>
                  </details>
                )}
                {s.shot && (
                  <button onClick={() => setBig(shotUrl(runId, s.shot!))} className="block overflow-hidden rounded border border-line" title="Enlarge">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the step 3 route, not a static asset */}
                    <img src={shotUrl(runId, s.shot)} alt={`Screenshot: ${s.text}`} className="h-24 w-auto object-cover object-top" loading="lazy" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {big && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-8" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the step 3 route */}
          <img src={big} alt="Screenshot, enlarged" className="max-h-full max-w-full rounded-card bg-white shadow-2xl" />
        </div>
      )}
    </div>
  );
}
