/**
 * NHS complaint time limit in Scotland, worked out in code (not by the model). No imports, so it can be tested on its own.
 *
 * The rule (Scottish NHS complaints procedure, as stated by Citizens Advice Scotland and gov.scot): a complaint should normally be made
 * within 6 months of the event, or within 6 months of finding out there was a reason to complain, and no later than 12 months after
 * the event. The board may still look at a later complaint at its discretion.
 *
 * The app does not record when the patient found out, so the count runs from the EARLIEST date in their timeline (the event).
 * Vague dates ("early July 2026") are read as the earliest day they can mean, so the deadline shown is never later than the real one.
 */

/** Citizens Advice Scotland's page on NHS complaints: the source the crew reads and the step 1 note links to. */
export const TIME_LIMIT_SOURCE = "https://www.citizensadvice.org.uk/scotland/health/nhs-healthcare-s/nhs-complaints-s/";

export type TimeLimitStatus = "within" | "close" | "outside" | "unclear";
export type TimeLimitCount = { status: TimeLimitStatus; explanation: string; from?: string; deadline?: string };

const DAY = 24 * 60 * 60 * 1000;
const CLOSE_DAYS = 56; // "close" = fewer than 8 weeks left
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";

function utc(y: number, m: number, d: number): Date | null {
  const t = new Date(Date.UTC(y, m, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m && t.getUTCDate() === d ? t : null; // rejects 31 Feb and the like
}

/** The earliest calendar day a user's date can mean, or null if it does not name at least a month and a year. */
export function parseEventDate(input: string): Date | null {
  const s = input.trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return utc(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/); // UK order: day/month/year
  if (m) return utc(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return utc(+m[1], +m[2] - 1, 1);
  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH_RE},?\\s+(\\d{4})\\b`));
  if (m) return utc(+m[3], MONTHS.indexOf(m[2]), +m[1]);
  m = s.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`)); // "July 3, 2026"
  if (m) return utc(+m[3], MONTHS.indexOf(m[1]), +m[2]);
  m = s.match(new RegExp(`\\b(early|beginning of|start of|mid|middle of|late|end of)?[\\s-]*${MONTH_RE}\\s+(\\d{4})\\b`));
  if (m) {
    const part = m[1] ?? "";
    const day = /mid|middle/.test(part) ? 11 : /late|end/.test(part) ? 21 : 1;
    return utc(+m[3], MONTHS.indexOf(m[2]), day);
  }
  return null;
}

/** Same day n months later; the 31st becomes the last day of a shorter month. */
export function addMonths(d: Date, n: number): Date {
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d.getUTCDate(), last)));
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const days = (n: number) => (n === 0 ? "that is today" : `${n} day${n === 1 ? "" : "s"} from today`);

/** Where the patient stands against the usual 6-month limit, from their own timeline. `today` is for tests. */
export function countTimeLimit(eventDates: string[], today: Date = new Date()): TimeLimitCount {
  const parsed = eventDates.map(parseEventDate).filter((d): d is Date => d !== null);
  if (parsed.length === 0) {
    return { status: "unclear", explanation: "None of the dates you gave says at least the month and year, so the time limit could not be counted. The usual limit is 6 months from what happened." };
  }
  const from = new Date(Math.min(...parsed.map((d) => d.getTime())));
  const now = utc(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())!;
  const deadline = addMonths(from, 6);
  const longStop = addMonths(from, 12);
  const left = Math.round((deadline.getTime() - now.getTime()) / DAY);
  const base = { from: from.toISOString().slice(0, 10), deadline: deadline.toISOString().slice(0, 10) };
  const counted = `Counted from ${fmt(from)}, the earliest date in your timeline.`;
  if (from.getTime() > now.getTime()) {
    return { ...base, status: "unclear", explanation: `${counted} That date is after today, so please check it.` };
  }
  if (left > CLOSE_DAYS) {
    return { ...base, status: "within", explanation: `${counted} The usual limit is 6 months from then: ${fmt(deadline)}, ${days(left)}.` };
  }
  if (left >= 0) {
    return { ...base, status: "close", explanation: `${counted} The usual limit is 6 months from then: ${fmt(deadline)}, ${left === 0 ? "that is today" : `only ${days(left)}`}. Send it soon.` };
  }
  if (now.getTime() <= longStop.getTime()) {
    return {
      ...base,
      status: "outside",
      explanation: `${counted} The usual 6-month limit ended on ${fmt(deadline)}. It can still be accepted if you only found out about the problem later and complain by ${fmt(longStop)} (12 months after it), or if NHS Lothian agrees there was a good reason for the delay.`,
    };
  }
  return {
    ...base,
    status: "outside",
    explanation: `${counted} More than 12 months have passed (since ${fmt(longStop)}), so it is normally too late. NHS Lothian can still choose to look at it, so it is worth asking.`,
  };
}
