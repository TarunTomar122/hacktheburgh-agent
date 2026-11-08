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

// ---- Other time limits on the patient's paths (step 2 ombudsman, steps 3-4 compensation). Same reading of dates as above. ----

export type LimitKind = "nhs" | "spso" | "claim";

/** One time limit: its rule in a sentence, its source, and how its count reads. Sources checked 2026-11-08. */
export const LIMITS: Record<LimitKind, { rule: string; source: { name: string; url: string } }> = {
  nhs: {
    rule: "Complaints to the NHS in Scotland should normally be made within 6 months, and no later than 12 months after what happened.",
    source: { name: "Citizens Advice Scotland", url: TIME_LIMIT_SOURCE },
  },
  spso: {
    rule: "The ombudsman normally only looks at complaints made within 12 months of when you first knew about the problem. The clock does not wait for NHS Lothian's reply.",
    source: { name: "Scottish Public Services Ombudsman", url: "https://spso.org.uk/time-limit-for-making-complaints-to-spso" },
  },
  claim: {
    rule: "In Scotland, a compensation claim must usually be started in court within 3 years of the harm, or of when you knew (or should have known) about it. For a child, the 3 years start at their 16th birthday; if someone has died, they run from the date of death.",
    source: { name: "MDDUS claims guide (Scotland)", url: "https://www.mddus.com/-/media/files/medical-advisory-guides/claims-guide---scotland.pdf" },
  },
};

/** Where the patient stands against the ombudsman's or the court's limit. `today` is for tests. */
export function countLimit(kind: LimitKind, eventDates: string[], today: Date = new Date()): TimeLimitCount {
  if (kind === "nhs") return countTimeLimit(eventDates, today);
  const parsed = eventDates.map(parseEventDate).filter((d): d is Date => d !== null);
  if (parsed.length === 0) {
    return { status: "unclear", explanation: "None of the dates you gave says at least the month and year, so this limit could not be counted." };
  }
  const from = new Date(Math.min(...parsed.map((d) => d.getTime())));
  const now = utc(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())!;
  const counted = `Counted from ${fmt(from)}, the earliest date in your timeline.`;
  if (from.getTime() > now.getTime()) return { status: "unclear", explanation: `${counted} That date is after today, so please check it.` };
  const months = kind === "spso" ? 12 : 36;
  const closeDays = kind === "spso" ? CLOSE_DAYS : 183; // a claim needs months of work by a solicitor before it can be raised
  const deadline = addMonths(from, months);
  const left = Math.round((deadline.getTime() - now.getTime()) / DAY);
  const base = { from: from.toISOString().slice(0, 10), deadline: deadline.toISOString().slice(0, 10) };
  const span = kind === "spso" ? "12 months" : "3 years";
  if (left >= 0) {
    const status: TimeLimitStatus = left > closeDays ? "within" : "close";
    const far = left > 120 ? `about ${Math.round(left / 30.44)} months from today` : days(left); // "966 days" is hard to read
    const when = `${fmt(deadline)}, ${left === 0 ? "that is today" : status === "close" ? `only ${far}` : far}`;
    const hurry = kind === "claim" ? (status === "close" ? " Contact a solicitor now: preparing a claim takes months." : " Solicitors need time to investigate, so it is worth contacting them early.") : status === "close" ? " Send it soon." : "";
    return { ...base, status, explanation: `${counted} ${span} from then is ${when}.${hurry}` };
  }
  const late =
    kind === "spso"
      ? `The usual 12-month limit ended on ${fmt(deadline)}. The ombudsman can still take it in special circumstances; you would need to explain why it is late.`
      : `The usual 3-year limit ended on ${fmt(deadline)}. It runs from later if you only found out about the harm later; otherwise courts allow late claims only rarely. A solicitor can tell you which applies.`;
  return { ...base, status: "outside", explanation: `${counted} ${late}` };
}

// ---- Relative dates ("yesterday", "3 weeks ago") turned into calendar dates, in code (2026-11-08). ----

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, "a couple of": 2, couple: 2 };
const NUM = "(\\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple of)";

/**
 * A relative date as a calendar date, counted from `reference` (the moment the person said it). Day-level phrases become
 * "YYYY-MM-DD"; month-level ones become "Month YYYY" (the same shapes the timeline uses). "Last week" becomes the Monday of the
 * week before, its earliest day, so a deadline is never shown later than it is. Vaguer wording ("a few days ago", "a while back")
 * and anything that already names a date is left as it is (null).
 */
export function resolveRelativeDate(input: string, reference: Date): string | null {
  const s = input.trim().toLowerCase();
  if (!s || parseEventDate(s)) return null;
  const y = reference.getFullYear(), m = reference.getMonth(), d = reference.getDate(); // the server's own day (it runs on the presenter's machine)
  const day = (back: number) => {
    const t = new Date(y, m, d - back);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  const month = (back: number) => {
    const t = new Date(y, m - back, 1);
    return `${MONTH_NAMES[t.getMonth()]} ${t.getFullYear()}`;
  };
  const n = (w: string) => (/^\d+$/.test(w) ? Number(w) : WORD_NUM[w]);
  if (/\bday before yesterday\b/.test(s)) return day(2);
  if (/\b(yesterday|last night)\b/.test(s)) return day(1);
  if (/^(today|this (morning|afternoon|evening)|tonight|earlier today)\b/.test(s)) return day(0);
  let r = s.match(new RegExp(`\\b${NUM}\\s+days?\\s+ago\\b`));
  if (r) return day(n(r[1]));
  r = s.match(new RegExp(`\\b${NUM}\\s+weeks?\\s+ago\\b`));
  if (r) return day(7 * n(r[1]));
  if (/\blast week\b/.test(s)) return day(((reference.getDay() + 6) % 7) + 7); // Monday of the week before
  r = s.match(new RegExp(`\\b${NUM}\\s+months?\\s+ago\\b`));
  if (r) return month(n(r[1]));
  if (/\blast month\b/.test(s)) return month(1);
  if (/^this month\b/.test(s)) return month(0);
  return null;
}

/** The timeline with every relative date it can read turned into a calendar date. Returns the same array when nothing changed. */
export function resolveRelativeDates<E extends { date: string }>(events: E[], reference: Date): E[] {
  let changed = false;
  const out = events.map((e) => {
    const r = resolveRelativeDate(e.date, reference);
    if (!r) return e;
    changed = true;
    return { ...e, date: r };
  });
  return changed ? out : events;
}
