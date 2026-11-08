// Checks the NHS complaint time-limit count (lib/agent/timeLimit.ts): date parsing and within / close / outside / unclear. Run: npx tsx scripts/test-time-limit.ts
import { countLimit, countTimeLimit, parseEventDate, resolveRelativeDate } from "../lib/agent/timeLimit";
const t = new Date("2026-11-08T05:40:00Z");
const p = (s: string) => parseEventDate(s)?.toISOString().slice(0, 10) ?? null;
const cases: [string, string | null][] = [["2026-07-03", "2026-07-03"], ["early July 2026", "2026-07-01"], ["mid-July 2026", "2026-07-11"], ["late July 2026", "2026-07-21"], ["3rd of July 2026", "2026-07-03"], ["July 3, 2026", "2026-07-03"], ["03/07/2026", "2026-07-03"], ["2026-07", "2026-07-01"], ["2026-02-31", null], ["summer 2026", null], ["2025", null], ["Sept 2026", "2026-09-01"]];
let bad = 0;
for (const [i, want] of cases) { const got = p(i); if (got !== want) { bad++; console.log("PARSE FAIL", i, got, want); } }
const s = (d: string[]) => countTimeLimit(d, t);
const checks: [string[], string][] = [[["2026-09-01"], "within"], [["2026-05-20"], "close"], [["2026-05-08"], "close"], [["2026-05-07"], "outside"], [["2025-11-09"], "outside"], [["2025-10-01"], "outside"], [["summer 2026"], "unclear"], [["2026-12-01"], "unclear"], [["late May 2026", "2026-10-01"], "close"]];
for (const [d, want] of checks) { const r = s(d); if (r.status !== want) { bad++; console.log("STATUS FAIL", d, r.status, want); } else console.log("ok", d.join(","), "->", r.status, "|", r.explanation); }
console.log(bad ? `${bad} FAILED` : "all passed");
if (bad) process.exit(1);

// Ombudsman (12 months, close under 8 weeks) and court claim (3 years, close under 6 months)
const more: [Parameters<typeof countLimit>[0], string[], string][] = [
  ["spso", ["early July 2026"], "within"], ["spso", ["2025-12-20"], "close"], ["spso", ["2025-11-01"], "outside"], ["spso", ["summer"], "unclear"],
  ["claim", ["early July 2026"], "within"], ["claim", ["2024-01-15"], "close"], ["claim", ["2023-10-01"], "outside"],
];
let bad2 = 0;
for (const [k, d, want] of more) { const r = countLimit(k, d, t); if (r.status !== want) { bad2++; console.log("LIMIT FAIL", k, d, r.status, want); } else console.log("ok", k, d.join(","), "->", r.status, "|", r.explanation); }
console.log(bad2 ? `${bad2} FAILED (other limits)` : "other limits passed");
if (bad2) process.exit(1);

// Relative dates, counted from Sunday 8 November 2026
const ref = new Date(2026, 10, 8, 6, 30);
const rel: [string, string | null][] = [["yesterday", "2026-11-07"], ["Yesterday evening", "2026-11-07"], ["last night", "2026-11-07"], ["the day before yesterday", "2026-11-06"], ["today", "2026-11-08"], ["3 days ago", "2026-11-05"], ["two weeks ago", "2026-10-25"], ["a week ago", "2026-11-01"], ["last week", "2026-10-26"], ["last month", "October 2026"], ["6 months ago", "May 2026"], ["a few days ago", null], ["a while back", null], ["early July 2026", null], ["2026-07-03", null]];
let bad3 = 0;
for (const [i, want] of rel) { const got = resolveRelativeDate(i, ref); if (got !== want) { bad3++; console.log("RELATIVE FAIL", i, got, want); } }
console.log(bad3 ? `${bad3} FAILED (relative dates)` : "relative dates passed");
if (bad3) process.exit(1);
