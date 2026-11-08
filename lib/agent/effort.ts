// Patient insights (proposed, branch patient-insights): what Elliot did on a case, counted only from what the runs logged.
// Client-safe: no Node imports. See docs/plans/patient-insights-plan.md.
//
// Rules: counts, never estimates ("hours saved"); every hurdle comes from a logged event; no organisation is cast as at fault.

import type { AgentEvent } from "./events";
import type { TraceStep } from "./legalAidTypes";

/** Kinds of hurdle, as the patient reads them. Each needed handling before the case could move on. */
export type HurdleKind =
  | "hidden_form" // found a form that was not linked from the main page (popup, embedded frame, contact page)
  | "page_wait" // waited for a page that was still loading, or for a site's own browser check
  | "hidden_box" // ticked a box the page had hidden or drawn itself (only when the user agreed)
  | "cookie_wall" // got past a cookie banner that covered the page
  | "asked_you" // asked the user instead of guessing
  | "no_online_form" // a firm had no online form, so another was contacted
  | "handed_over" // a CAPTCHA or login was handed to the user rather than got round
  | "long_form" // completed a long multi-page form
  | "matched_entry" // matched what the user said to the right entry in a site's own list
  | "worked_around" // tried another way when a page did not respond as expected
  | "deadline_checked"; // checked a time limit on an official page

export type Hurdle = { kind: HurdleKind; text: string; step: number; at?: number; url?: string };

/** One point of the "as it happened" curve: ms since the run started, and running totals. */
export type EffortPoint = { t: number; pages: number; fields: number };

export type Effort = {
  sites: string[]; // different websites (hostnames), so totals across runs count each site once
  pages: number; // pages read or moved through
  fields: number; // fields filled, options picked, boxes ticked
  clicks: number;
  questionsForYou: number;
  ms: number;
  runs: number;
  hurdles: Hurdle[];
  curve: EffortPoint[];
};

export const EMPTY_EFFORT: Effort = { sites: [], pages: 0, fields: 0, clicks: 0, questionsForYou: 0, ms: 0, runs: 0, hurdles: [], curve: [] };

/** Plain labels for the hurdle list. */
export const HURDLE_LABEL: Record<HurdleKind, string> = {
  hidden_form: "Found a form that was not linked from the main page",
  page_wait: "Waited for a page that was still loading",
  hidden_box: "Ticked a box the page had hidden (you had agreed to it)",
  cookie_wall: "Got past a cookie banner covering the page",
  asked_you: "Asked you instead of guessing",
  no_online_form: "Contacted another firm when one had no online form",
  handed_over: "Handed you a CAPTCHA rather than getting round it",
  long_form: "Completed a long multi-page form",
  matched_entry: "Matched your answer to the right entry in a site's own list",
  worked_around: "Tried another way when a page did not respond as expected",
  deadline_checked: "Checked a time limit on an official page",
};

const host = (url: string | undefined) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const page = (url: string) => url.split("#")[0];
const FIELD_TOOLS = new Set(["fill", "select", "check"]);
const ADVANCE = /^(next|continue|start report)/i;

/** Cases are saved to the account (D75), so a run's curve is kept small: at most this many points, always keeping the last. */
const MAX_POINTS = 60;
function thin(curve: EffortPoint[]): EffortPoint[] {
  if (curve.length <= MAX_POINTS) return curve;
  const step = curve.length / (MAX_POINTS - 1);
  return [...Array.from({ length: MAX_POINTS - 1 }, (_, i) => curve[Math.floor(i * step)]), curve[curve.length - 1]];
}

/** A logged event with its time (ms since epoch). makeLogger keeps these for the run that is ending. */
export type TimedEvent = { t: number; e: AgentEvent };

/** Effort of one form run (NHS, ombudsman, Yellow Card) from its event log. */
export function fromEvents(events: TimedEvent[], step: number): Effort {
  const t0 = events[0]?.t ?? 0;
  const sites = new Set<string>();
  const urls = new Set<string>();
  const hurdles: Hurdle[] = [];
  const curve: EffortPoint[] = [];
  let fields = 0;
  let clicks = 0;
  let advances = 0;
  let questions = 0;
  let lastUrl: string | undefined;
  let lastWait = -Infinity;
  let suggestions = 0;

  const push = (kind: HurdleKind, text: string, at: number, url = lastUrl) => hurdles.push({ kind, text, step, at, url });
  const point = (t: number) => curve.push({ t: t - t0, pages: Math.max(urls.size, advances + (urls.size ? 1 : 0)), fields });

  for (const { t, e } of events) {
    if (e.type === "observe") {
      lastUrl = e.url;
      if (host(e.url)) sites.add(host(e.url));
      urls.add(page(e.url));
      point(t);
    } else if (e.type === "action") {
      const ok = e.result === "ok" || e.result.startsWith("ok");
      const label = String((e.args as { label?: unknown } | null)?.label ?? "");
      if (ok && FIELD_TOOLS.has(e.tool)) fields++;
      if (ok && e.tool === "click") {
        clicks++;
        if (ADVANCE.test(label.trim())) advances++;
      }
      if (ok && e.tool === "select" && label === "Product" && suggestions > 1) push("matched_entry", `Matched your product to the right entry among ${suggestions} the site suggested`, t - t0);
      point(t);
    } else if (e.type === "status") {
      const m = e.message;
      const suggested = m.match(/suggested (\d+) products?/i);
      if (suggested) suggestions = Number(suggested[1]);
      if (/looking again|did not respond|still loading/i.test(m)) {
        // One hurdle per wait, not per message: messages within 5 s belong to the same wait.
        if (t - lastWait > 5000) push("page_wait", "Waited for a page that was still loading, then carried on", t - t0);
        lastWait = t;
      } else if (/cookie banner/i.test(m)) push("cookie_wall", m, t - t0);
      else if (/ticked a box the page had hidden/i.test(m)) push("hidden_box", m, t - t0);
    } else if (e.type === "done") {
      if (e.status === "needs_input") {
        questions += Math.max(1, e.unfilled.length);
        push("asked_you", e.unfilled.length ? `Asked you about: ${e.unfilled.join("; ")}` : "Asked you how to carry on", t - t0);
      }
    }
  }
  const pages = Math.max(urls.size, advances + (urls.size ? 1 : 0));
  if (advances >= 4) push("long_form", `Completed ${advances + 1} pages of a multi-page form`, curve.at(-1)?.t ?? 0);
  return { sites: [...sites], pages, fields, clicks, questionsForYou: questions, ms: events.length ? events[events.length - 1].t - t0 : 0, runs: 1, hurdles, curve: thin(curve) };
}

/** Effort of a crew run (step 3, step 4) from its trace (D39). */
export function fromTrace(trace: TraceStep[], step: number): Effort {
  const sites = new Set<string>();
  const urls = new Set<string>();
  const hurdles: Hurdle[] = [];
  const curve: EffortPoint[] = [];
  let fields = 0;
  let clicks = 0;
  for (const s of trace) {
    if (s.url) {
      if (host(s.url)) sites.add(host(s.url));
      if (s.kind === "open" || s.kind === "read") urls.add(page(s.url));
    }
    if (s.kind === "type" || s.kind === "pick") fields++;
    if (s.kind === "click") clicks++;
    if (s.kind === "recover" || s.kind === "fail") {
      const k: HurdleKind | null = /captcha/i.test(s.text) ? "handed_over"
        : /no online (enquiry )?form/i.test(s.text) ? "no_online_form"
        : /embedded frame|popup|contact (page|link)/i.test(s.text) ? "hidden_form"
        : /browser check|still loading|waiting for it/i.test(s.text) ? "page_wait"
        : s.kind === "recover" ? "worked_around"
        : null; // a plain failure is not a hurdle cleared
      if (k) hurdles.push({ kind: k, text: s.text, step, at: s.t, url: s.url });
    }
    curve.push({ t: s.t, pages: urls.size, fields });
  }
  const ms = trace.length ? trace[trace.length - 1].t : 0;
  return { sites: [...sites], pages: urls.size, fields, clicks, questionsForYou: 0, ms, runs: trace.length ? 1 : 0, hurdles, curve: thin(curve) };
}

/** Add two efforts (several runs of one step, or all steps of a case). The curve keeps the latest run's. */
export function addEffort(a: Effort, b: Effort): Effort {
  return {
    sites: [...new Set([...a.sites, ...b.sites])],
    pages: a.pages + b.pages,
    fields: a.fields + b.fields,
    clicks: a.clicks + b.clicks,
    questionsForYou: a.questionsForYou + b.questionsForYou,
    ms: a.ms + b.ms,
    runs: a.runs + b.runs,
    hurdles: [...a.hurdles, ...b.hurdles],
    curve: b.curve.length ? b.curve : a.curve,
  };
}

/** Hurdles grouped by kind, most frequent first: the "Hurdles Elliot cleared" list. */
export function hurdleCounts(hurdles: Hurdle[]): { kind: HurdleKind; label: string; count: number; examples: Hurdle[] }[] {
  const by = new Map<HurdleKind, Hurdle[]>();
  for (const h of hurdles) by.set(h.kind, [...(by.get(h.kind) ?? []), h]);
  return [...by.entries()].map(([kind, list]) => ({ kind, label: HURDLE_LABEL[kind], count: list.length, examples: list.slice(0, 3) })).sort((x, y) => y.count - x.count);
}
