import type { CaseFacts } from "./facts";

/**
 * The ombudsman's time limit and the expected NHS reply dates for step 2. Pure code, no model, safe to import from the UI.
 * Everything here is an estimate that the screens label as one. Sources are in each `source` field and in docs/DECISIONS.md.
 */

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_WORD = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

export type ParsedDate = { date: Date; approximate: boolean };

/**
 * A timeline date as a UTC date. "2026-07-03" is exact; "early July 2026" or "July 2026" becomes the first of the month and is marked
 * approximate (the earliest reading, so every deadline counted from it is the cautious one). A year alone, or no year, cannot be read.
 */
export function parseEventDate(text: string): ParsedDate | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? { date, approximate: false } : null;
  }
  const year = text.match(/\b(19|20)\d{2}\b/)?.[0];
  const word = text.match(MONTH_WORD)?.[1];
  if (!year || !word) return null;
  const month = MONTH_NAMES.findIndex((n) => n.startsWith(word.toLowerCase().slice(0, 3)));
  return month < 0 ? null : { date: new Date(Date.UTC(Number(year), month, 1)), approximate: true };
}

/** Add whole months, keeping the day of the month where it exists and using the last day where it does not (31 Aug + 6 months = 28 Feb). */
export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

/** The date `n` working days after `from`. Saturdays and Sundays are skipped; bank holidays are not known, so the date can be a day or two early. */
export function workingDaysAfter(from: Date, n: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Whole days from `a` to `b` (negative if b is earlier). */
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

/** "4 Nov 2026". */
export const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "July 2026" when only the month is known, else the full date. */
export const fmtEvent = (p: ParsedDate) => (p.approximate ? p.date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : fmtDate(p.date));

/** The earliest readable date on the timeline: the cautious start for every time limit. */
export function earliestEvent(facts: Pick<CaseFacts, "events">): ParsedDate | null {
  const all = facts.events.map((e) => parseEventDate(e.date)).filter((p): p is ParsedDate => p !== null);
  return all.length ? all.reduce((a, b) => (b.date < a.date ? b : a)) : null;
}

export type ClockState = "inside" | "outside" | "unknown";

export type Clock = {
  state: ClockState;
  /** Where the count starts, or null when no date on the timeline can be read. */
  from: ParsedDate | null;
  /** Points on the bar after the start, in order. The last one is the end of the bar. */
  marks: { at: Date; label: string }[];
  today: Date;
  headline: string;
  detail: string;
  source: { label: string; url: string };
};

const SPSO_SOURCE = { label: "Scottish Public Services Ombudsman Act 2002, section 10", url: "https://www.legislation.gov.uk/asp/2002/11/section/10" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Ombudsman: the Act says the ombudsman must not consider a complaint made more than 12 months after the person first had notice of
 * the matter, unless there are special circumstances. Counted from the earliest event as the cautious proxy for "first had notice".
 */
export function spsoClock(facts: Pick<CaseFacts, "events">, today: Date = new Date()): Clock {
  const from = earliestEvent(facts);
  if (!from) {
    return {
      state: "unknown",
      from: null,
      marks: [],
      today,
      headline: "We cannot work out the ombudsman's time limit yet",
      detail: "No date on your timeline could be read. Add at least a month and a year to an event in your profile.",
      source: SPSO_SOURCE,
    };
  }
  const end = addMonths(from.date, 12);
  const counted = `Counted from ${fmtEvent(from)}, the earliest date on your timeline. The Act counts from when you first knew of the problem, so your real date may be later.`;
  const marks = [{ at: end, label: "12 months" }];
  if (today <= end) {
    const left = daysBetween(today, end);
    return {
      state: "inside",
      from,
      marks,
      today,
      headline: left === 0 ? "Today is the last day of the 12 months" : `About ${plural(left, "day")} left of the 12 months`,
      detail: `The ombudsman does not normally consider a complaint made more than 12 months after you first knew of the problem. ${counted}`,
      source: SPSO_SOURCE,
    };
  }
  return {
    state: "outside",
    from,
    marks,
    today,
    headline: "More than twelve months since you first knew",
    detail: `The ombudsman can still take a late complaint if there are special circumstances. Their form asks why it is late, so have your reason ready. ${counted}`,
    source: SPSO_SOURCE,
  };
}

export type ReplyDates = { acknowledgeBy: Date; simpleBy: Date; investigationBy: Date };

/**
 * Standard NHS Scotland timings from the day the complaint is received: acknowledge in 3 working days; a simple complaint is answered
 * in 5 working days (stage 1); a complaint that needs an investigation (stage 2) is answered within 20 working days.
 * These are the national model procedure's figures. NHS Lothian's own page was not checked.
 */
export function replyDates(sent: Date): ReplyDates {
  return { acknowledgeBy: workingDaysAfter(sent, 3), simpleBy: workingDaysAfter(sent, 5), investigationBy: workingDaysAfter(sent, 20) };
}
