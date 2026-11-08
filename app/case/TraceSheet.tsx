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

/** What the history shows by default: outcomes only. The agents' moment-to-moment thinking ("promising", scores) is behind "Show every step". */
const OUTCOMES: TraceStep["kind"][] = ["found", "check", "recover", "fail", "result"];

const hostOf = (s: TraceStep) => {
  try {
    return new URL(s.url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
/** The first whole sentence (never cut mid-way, never ended with "…"); the rest sits behind "Show details". */
const words = (t: string) => {
  const one = t.replace(/\s+/g, " ").trim();
  return one.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? one;
};
/** What a step is called on the timeline: five to eight words. The full text and details sit behind "Show details". */
function label(s: TraceStep): string {
  const host = hostOf(s);
  const quoted = s.text.match(/["“]([^"”]{2,30})["”]/)?.[1];
  switch (s.kind) {
    case "open":
      return host ? `Opened ${host}` : "Opened a page";
    case "read":
      return host ? `Read ${host}` : "Read a page";
    case "click":
      return quoted ? `Clicked “${quoted}”` : "Clicked a button";
    case "type":
      return "Filled in a field";
    case "pick":
      return "Chose an option";
    case "recover":
      return quoted ? `Tried “${quoted}”` : host ? `Tried another page on ${host}` : "Tried another page";
    case "fail":
      return host ? `Could not use ${host}` : "Could not do this step";
    default:
      return words(s.text.replace(/^[^:]{3,60}: (promising|dead end|unlikely)\.\s*/i, ""));
  }
}
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
  const [every, setEvery] = useState(true); // every step by default; "Show only what was found" narrows it
  const steps = useMemo(() => [...scope.steps].sort((a, b) => a.t - b.t || a.i - b.i).filter((s) => !hidden.has(s.agent) && (every || OUTCOMES.includes(s.kind))), [scope.steps, hidden, every]);

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
                  <span className={cx("rounded px-1.5 py-0.5 text-[12px] font-medium", KIND[s.kind].cls)}>{KIND[s.kind].label}</span>
                  <span className="text-[12px] font-medium" style={{ color: s.color }}>
                    {s.agent}
                  </span>
                  {every && s.confidence !== undefined && <Confidence value={s.confidence} />}
                </div>
                <p className="text-[14px] leading-5 text-ink">{label(s)}</p>
                {(s.detail || s.text.length > label(s).length + 3 || s.url) && (
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[12px] text-muted hover:text-ink">
                      <span className="group-open:hidden">Show details</span>
                      <span className="hidden group-open:inline">Hide details</span>
                    </summary>
                    <div className="mt-1.5 space-y-1.5 rounded bg-subtle px-3 py-2 text-[12px] leading-5 text-ink-2">
                      <p>{s.text}</p>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noreferrer" className="block break-all text-brand underline-offset-2 hover:underline">
                          {s.url.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      )}
                      {s.detail && <pre className="whitespace-pre-wrap font-sans">{s.detail}</pre>}
                    </div>
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
