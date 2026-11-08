"use client";

// Patient insights (D87, proposed, branch patient-insights; docs/plans/patient-insights-plan.md).
// Everything here is counted from what Elliot's runs logged. No estimates, and no organisation is cast as at fault: the process
// involves many bodies, websites and rules, and Elliot does that legwork. Opened from the lightbulb "Insights" button in the step bar.
// Hidden unless NEXT_PUBLIC_INSIGHTS=1, so the app is unchanged without it.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { addEffort, EMPTY_EFFORT, fromTrace, hurdleCounts, type Effort, type EffortPoint, type Hurdle } from "../../lib/agent/effort";
import type { Profile } from "../../lib/profile";
import { Button, cx, Eyebrow } from "../ui";
import { STEPS } from "./steps";

export const INSIGHTS = process.env.NEXT_PUBLIC_INSIGHTS === "1";

const host = (url: string | null | undefined) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const stepTitle = (n: number) => STEPS.find((s) => s.n === n)?.title ?? `Step ${n}`;

/** Every step's effort for this case: steps 1, 2 and 6 from the saved run counts, step 3 from the crew's trace, step 4 from the firms' outcomes. */
export function caseEffort(p: Profile): { step: number; effort: Effort; demo?: boolean }[] {
  const out: { step: number; effort: Effort; demo?: boolean }[] = [];
  for (const step of [1, 2, 6]) {
    const e = p.effort?.[step];
    if (e) out.push({ step, effort: e });
  }
  // The complaint crew checks the time limit on an official page (D65): that is a hurdle cleared for step 1.
  const limit = p.complaintRun?.result.timeLimit;
  if (limit?.url) {
    const h: Hurdle = { kind: "deadline_checked", text: `Checked the complaint time limit: ${limit.limit}`, step: 1, url: limit.url };
    const i = out.findIndex((x) => x.step === 1);
    if (i >= 0) out[i] = { ...out[i], effort: { ...out[i].effort, hurdles: [...out[i].effort.hurdles, h] } };
    else out.push({ step: 1, effort: { ...EMPTY_EFFORT, sites: [host(limit.url)].filter(Boolean), pages: 1, runs: 1, hurdles: [h] } });
  }
  const trace = p.legalAid?.result?.trace;
  if (trace?.length) out.push({ step: 3, effort: fromTrace(trace, 3), demo: p.legalAid?.sample });
  const firms = p.enquiry?.outcomes ?? [];
  if (firms.length) {
    const hurdles: Hurdle[] = [];
    for (const f of firms) {
      if (f.swappedFor) hurdles.push({ kind: "no_online_form", text: `Contacted ${f.firmName} because ${f.swappedFor} had no online form`, step: 4, url: f.formUrl ?? undefined });
      if ((f.attempts ?? 1) > 1) hurdles.push({ kind: "worked_around", text: `Tried ${f.firmName}'s form again after a page did not respond`, step: 4, url: f.formUrl ?? undefined });
      if (/captcha/i.test(f.note)) hurdles.push({ kind: "handed_over", text: `${f.firmName}: a CAPTCHA was handed to you rather than got round`, step: 4, url: f.formUrl ?? undefined });
    }
    const effort: Effort = {
      ...EMPTY_EFFORT,
      sites: [...new Set(firms.map((f) => host(f.formUrl)).filter(Boolean))],
      pages: firms.filter((f) => f.formUrl).length,
      fields: firms.reduce((n, f) => n + f.filled.length, 0),
      runs: 1,
      hurdles,
    };
    out.push({ step: 4, effort, demo: p.enquiry?.sample });
  }
  return out.sort((a, b) => a.step - b.step);
}

/* ---------------------------------------------------------------- small pieces */

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[26px] font-medium leading-none tabular-nums text-ink">{value}</div>
      <div className="mt-1.5 text-[12px] leading-4 text-muted">{label}</div>
    </div>
  );
}

const seconds = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);

/** Compact "What Elliot did" for one step (side panel of steps 1, 2 and 6). */
export function StepEffort({ profile, step }: { profile: Profile; step: number }) {
  if (!INSIGHTS) return null;
  const e = caseEffort(profile).find((x) => x.step === step)?.effort;
  if (!e) return null;
  return (
    <div>
      <Eyebrow>What Elliot did here</Eyebrow>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-2">
        Visited {e.sites.length} {e.sites.length === 1 ? "website" : "websites"}, went through {e.pages} {e.pages === 1 ? "page" : "pages"}, filled {e.fields} {e.fields === 1 ? "field" : "fields"} and cleared {e.hurdles.length} {e.hurdles.length === 1 ? "hurdle" : "hurdles"}
        {e.ms > 0 && <> in {seconds(e.ms)}</>}.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- run curve */

/**
 * "What Elliot did, as it happened": fields filled over the run (one series, one axis), with a marker at each hurdle.
 * Native hover labels on every marker; the hurdle list below is the text version.
 */
function RunCurve({ curve, hurdles }: { curve: EffortPoint[]; hurdles: Hurdle[] }) {
  if (curve.length < 2) return null;
  const W = 520, H = 120, L = 34, R = 10, T = 10, B = 22;
  const tMax = Math.max(1, curve[curve.length - 1].t);
  const yMax = Math.max(1, ...curve.map((c) => c.fields));
  const x = (t: number) => L + (Math.min(t, tMax) / tMax) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const path = curve.map((c, i) => `${i ? "L" : "M"}${x(c.t).toFixed(1)},${y(c.fields).toFixed(1)}`).join(" ");
  const fieldsAt = (t: number) => [...curve].reverse().find((c) => c.t <= t)?.fields ?? 0;
  const marks = hurdles.filter((h) => typeof h.at === "number");
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Fields filled over ${seconds(tMax)}: ${yMax} in total, with ${marks.length} hurdles marked`}>
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--color-line)" strokeWidth="1" />
        <text x={L - 6} y={y(yMax) + 4} textAnchor="end" className="fill-[var(--color-muted)] text-[10px] tabular-nums">{yMax}</text>
        <text x={L - 6} y={y(0) + 4} textAnchor="end" className="fill-[var(--color-muted)] text-[10px]">0</text>
        <text x={L} y={H - 6} className="fill-[var(--color-muted)] text-[10px]">start</text>
        <text x={W - R} y={H - 6} textAnchor="end" className="fill-[var(--color-muted)] text-[10px] tabular-nums">{seconds(tMax)}</text>
        <path d={path} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {marks.map((h, i) => (
          <g key={i}>
            <circle cx={x(h.at!)} cy={y(fieldsAt(h.at!))} r="5" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2">
              <title>{h.text}</title>
            </circle>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-[12px] text-muted">Fields filled over the last run. Each ring is a hurdle Elliot cleared (hover for what it was).</figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------- hurdles */

function HurdleList({ hurdles }: { hurdles: Hurdle[] }) {
  const rows = hurdleCounts(hurdles);
  if (rows.length === 0) return <p className="text-sm text-muted">No hurdles logged yet.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.kind}>
          <details className="group">
            <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_120px_24px] items-center gap-3">
              <span className="text-[14px] leading-5 text-ink">{r.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-line-soft" aria-hidden>
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <span className="text-right text-[14px] font-medium tabular-nums text-ink">{r.count}</span>
            </summary>
            <ul className="mt-2 space-y-1 border-l border-line pl-3">
              {r.examples.map((h, i) => (
                <li key={i} className="text-[12px] leading-5 text-ink-2">
                  <span className="text-muted">{stepTitle(h.step)}:</span> {h.text}
                  {h.url && (
                    <>
                      {" "}
                      <a className="text-brand underline underline-offset-2" href={h.url} target="_blank" rel="noreferrer">
                        page
                      </a>
                    </>
                  )}
                </li>
              ))}
              {r.count > r.examples.length && <li className="text-[12px] text-muted">and {r.count - r.examples.length} more</li>}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- case timeline */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** A date from the patient's own wording, or null. "early July 2026" and "July 2026" are approximate. Never invents a year. */
export function parseWhen(text: string): { date: Date; approx: boolean } | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { date: new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])), approx: false };
  const t = text.toLowerCase();
  const year = t.match(/\b(19|20)\d{2}\b/)?.[0];
  const m = MONTHS.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}`).test(t));
  if (!year || m < 0) return null;
  const day = t.match(/\b(\d{1,2})(st|nd|rd|th)?\s+[a-z]{3,}/)?.[1];
  if (day) return { date: new Date(Date.UTC(+year, m, +day)), approx: false };
  const part = /\bearly\b/.test(t) ? 5 : /\blate\b/.test(t) ? 25 : 15;
  return { date: new Date(Date.UTC(+year, m, part)), approx: true };
}

/** Adds a period quoted from an official page ("6 months", "12 months", "1 year") to a date. Null if the period is not clear. */
function addPeriod(from: Date, limit: string): { date: Date; period: string } | null {
  const m = limit.match(/\b(\d{1,3})\s*(month|year|week)s?\b/i);
  if (!m) return null;
  const n = +m[1];
  const d = new Date(from);
  if (/month/i.test(m[2])) d.setUTCMonth(d.getUTCMonth() + n);
  else if (/year/i.test(m[2])) d.setUTCFullYear(d.getUTCFullYear() + n);
  else d.setUTCDate(d.getUTCDate() + 7 * n);
  return { date: d, period: m[0] };
}

type Point = { date: Date; label: string; kind: "story" | "elliot" | "deadline"; approx?: boolean; url?: string };

function timelinePoints(p: Profile): Point[] {
  const pts: Point[] = [];
  for (const e of p.facts.events) {
    const w = parseWhen(e.date);
    if (w) pts.push({ date: w.date, label: e.what, kind: "story", approx: w.approx });
  }
  pts.push({ date: new Date(p.createdAt), label: "You told Elliot your story", kind: "elliot" });
  const at = p.progress?.at ?? {};
  const named: [keyof typeof at, string][] = [
    ["nhsFilled", "Elliot filled NHS Lothian's form"],
    ["nhsSent", "Complaint sent to NHS Lothian"],
    ["spsoFilled", "Elliot filled the ombudsman's form"],
    ["spsoSent", "Complaint sent to the ombudsman"],
    ["ycFilled", "Elliot filled the Yellow Card report"],
    ["ycSent", "Yellow Card report sent"],
  ];
  for (const [k, label] of named) if (at[k]) pts.push({ date: new Date(at[k]!), label, kind: "elliot" });
  // The complaint time limit, only when the crew read it on an official page and the period and the start date are both clear.
  const limit = p.complaintRun?.result.timeLimit;
  const first = p.facts.events.map((e) => parseWhen(e.date)).find(Boolean);
  if (limit?.url && first) {
    const due = addPeriod(first.date, limit.limit);
    if (due) pts.push({ date: due.date, label: `Complaint time limit (${due.period}, from your first date)`, kind: "deadline", approx: first.approx, url: limit.url });
  }
  return pts.sort((a, b) => a.date.getTime() - b.date.getTime());
}

const fmt = (d: Date, approx?: boolean) => `${approx ? "about " : ""}${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;

function CaseTimeline({ profile }: { profile: Profile }) {
  const pts = timelinePoints(profile);
  if (pts.length < 2) return null;
  const today = new Date();
  const t0 = Math.min(pts[0].date.getTime(), today.getTime());
  const t1 = Math.max(pts[pts.length - 1].date.getTime(), today.getTime());
  const span = Math.max(1, t1 - t0);
  const W = 640, H = 70, L = 12, R = 12, Y = 34;
  const x = (d: Date) => L + ((d.getTime() - t0) / span) * (W - L - R);
  const fill = (k: Point["kind"]) => (k === "deadline" ? "var(--color-danger)" : k === "elliot" ? "var(--color-brand)" : "var(--color-ink-2)");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Your case from ${fmt(new Date(t0))} to ${fmt(new Date(t1))}, ${pts.length} moments; the list below has every date`}>
        <line x1={L} x2={W - R} y1={Y} y2={Y} stroke="var(--color-line)" strokeWidth="2" strokeLinecap="round" />
        <line x1={x(today)} x2={x(today)} y1={8} y2={H - 14} stroke="var(--color-muted)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={x(today)} y={H - 2} textAnchor="middle" className="fill-[var(--color-muted)] text-[10px]">today</text>
        {pts.map((pt, i) => (
          <g key={i}>
            {pt.kind === "deadline" ? (
              <path d={`M${x(pt.date)},${Y - 7} L${x(pt.date) + 7},${Y} L${x(pt.date)},${Y + 7} L${x(pt.date) - 7},${Y} Z`} fill={fill(pt.kind)} stroke="var(--color-paper)" strokeWidth="2">
                <title>{`${fmt(pt.date, pt.approx)}: ${pt.label}`}</title>
              </path>
            ) : (
              <circle cx={x(pt.date)} cy={Y} r="5" fill={fill(pt.kind)} stroke="var(--color-paper)" strokeWidth="2">
                <title>{`${fmt(pt.date, pt.approx)}: ${pt.label}`}</title>
              </circle>
            )}
          </g>
        ))}
      </svg>
      {/* The key lists only the kinds of point that are on the chart. */}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        {pts.some((p) => p.kind === "story") && <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ink-2" aria-hidden /> What happened</span>}
        {pts.some((p) => p.kind === "elliot") && <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand" aria-hidden /> Elliot and you</span>}
        {pts.some((p) => p.kind === "deadline") && <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rotate-45 bg-danger" aria-hidden /> Time limit</span>}
      </div>
      <ol className="mt-4 space-y-1.5">
        {pts.map((pt, i) => (
          <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-[13px] leading-5">
            <span className="tabular-nums text-muted">{fmt(pt.date, pt.approx)}</span>
            <span className={cx(pt.kind === "deadline" ? "font-medium text-ink" : "text-ink-2")}>
              {pt.label}
              {pt.url && (
                <>
                  {" "}
                  <a className="text-brand underline underline-offset-2" href={pt.url} target="_blank" rel="noreferrer">
                    source
                  </a>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
      {!profile.complaintRun?.result.timeLimit && <p className="mt-3 text-[12px] text-muted">Time limits: not checked yet. Elliot only shows a limit it has read on an official page.</p>}
    </figure>
  );
}

/* ---------------------------------------------------------------- the insights pop-up */

const LightbulbIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 12.5h4M6.5 14.5h3" />
    <path d="M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.2v.6h4v-.6c0-.5.2-.9.6-1.2A4.5 4.5 0 0 0 8 1.5Z" />
  </svg>
);

/** The insights themselves: the case in numbers, the hurdles Elliot cleared, step by step, the last run and the case timeline. */
function InsightsBody({ profile }: { profile: Profile }) {
  const steps = caseEffort(profile);
  const total = steps.reduce((acc, s) => addEffort(acc, s.effort), EMPTY_EFFORT);
  const latest = [...steps].reverse().find((s) => s.effort.curve.length > 1);
  return (
    <div className="space-y-10">
      {steps.length === 0 ? (
        <p className="rounded-card bg-subtle p-5 text-sm text-ink-2">
          Nothing to count yet. When Elliot fills in a form or works on your case, every website, page, field and hurdle shows here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 rounded-card bg-subtle p-6 sm:grid-cols-5">
            <Stat value={total.hurdles.length} label={total.hurdles.length === 1 ? "hurdle cleared" : "hurdles cleared"} />
            <Stat value={total.sites.length} label={total.sites.length === 1 ? "website" : "websites"} />
            <Stat value={total.pages} label="pages gone through" />
            <Stat value={total.fields} label="fields filled" />
            <Stat value={total.questionsForYou} label={total.questionsForYou === 1 ? "question Elliot asked you" : "questions Elliot asked you"} />
          </div>

          <div className="space-y-4">
            <Eyebrow>Hurdles Elliot cleared for you</Eyebrow>
            <HurdleList hurdles={total.hurdles} />
          </div>

          <div className="space-y-4">
            <Eyebrow>Step by step</Eyebrow>
            <table className="w-full text-left text-[13px]">
              <thead className="text-muted">
                <tr>
                  <th className="py-1.5 font-normal">Step</th>
                  <th className="py-1.5 text-right font-normal">Websites</th>
                  <th className="py-1.5 text-right font-normal">Pages</th>
                  <th className="py-1.5 text-right font-normal">Fields</th>
                  <th className="py-1.5 text-right font-normal">Hurdles</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-ink">
                {steps.map((s) => (
                  <tr key={s.step} className="border-t border-line-soft">
                    <td className="py-2 pr-2">
                      {stepTitle(s.step)}
                      {s.demo && <span className="ml-1.5 text-[11px] text-muted">(recorded demo run)</span>}
                    </td>
                    <td className="py-2 text-right">{s.effort.sites.length}</td>
                    <td className="py-2 text-right">{s.effort.pages}</td>
                    <td className="py-2 text-right">{s.effort.fields}</td>
                    <td className="py-2 text-right">{s.effort.hurdles.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {latest && (
            <div className="space-y-2">
              <Eyebrow>As it happened: {stepTitle(latest.step)}</Eyebrow>
              <RunCurve curve={latest.effort.curve} hurdles={latest.effort.hurdles} />
            </div>
          )}
        </>
      )}

      <div className="space-y-4">
        <Eyebrow>Your case over time</Eyebrow>
        <CaseTimeline profile={profile} />
      </div>
    </div>
  );
}

/** The centred pop-up (same style as the trace view: modals, never side sheets). Escape or the backdrop closes it. */
function InsightsModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-10" role="dialog" aria-modal="true" aria-label="Insights">
      <button aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-card bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 pt-6 pb-4 sm:px-8 sm:pt-7 sm:pb-5">
          <div>
            <h2 className="display text-[28px] text-ink">Insights</h2>
            <p className="mt-1 max-w-[60ch] text-sm text-ink-2">
              What Elliot has done on your case so far, counted from what it actually did. Each hurdle needed handling before your case could move on.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <InsightsBody profile={profile} />
        </div>
      </div>
    </div>
  );
}

/** The lightbulb button that opens the insights (in the sticky step bar, on every path). Shows the hurdle count once there is one. */
export function InsightsButton({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  if (!INSIGHTS) return null;
  const hurdles = caseEffort(profile).reduce((n, s) => n + s.effort.hurdles.length, 0);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="See what Elliot has done on your case"
        className="flex items-center gap-2 rounded-ctl px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
      >
        <span className="text-brand">
          <LightbulbIcon />
        </span>
        Insights
        {hurdles > 0 && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-brand" aria-label={`${hurdles} hurdles cleared`}>
            {hurdles}
          </span>
        )}
      </button>
      {/* Rendered on <body>: the step bar's backdrop blur would otherwise trap a fixed pop-up inside the bar. */}
      {open && createPortal(<InsightsModal profile={profile} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
