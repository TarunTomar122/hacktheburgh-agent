import assert from "node:assert/strict";
import { addMonths, daysBetween, earliestEvent, parseEventDate, replyDates, spsoClock, workingDaysAfter } from "../lib/agent/complaintClock";
import { spsoChecks, tally } from "../lib/agent/complaintChecks";
import { emptyFacts } from "../lib/agent/facts";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const facts = (...dates: string[]) => ({ ...emptyFacts(), events: dates.map((date) => ({ date, what: "Something happened" })) });

// Reading timeline dates: exact, month only (first of the month, approximate) and unreadable.
assert.deepEqual(parseEventDate("2026-07-03"), { date: day("2026-07-03"), approximate: false });
assert.deepEqual(parseEventDate("early July 2026"), { date: day("2026-07-01"), approximate: true });
assert.deepEqual(parseEventDate("Sept 2025"), { date: day("2025-09-01"), approximate: true });
for (const bad of ["2026-02-30", "2026", "a few days after Christmas", "Market day 2026", ""]) assert.equal(parseEventDate(bad), null, bad);
assert.equal(iso(earliestEvent(facts("2026-09-01", "July 2026", "nonsense"))!.date), "2026-07-01");
assert.equal(earliestEvent(facts("nonsense")), null);
console.log("PASS: timeline dates read in code, vague ones become the first of the month");

// Month arithmetic and working days (7 Nov 2026 is a Saturday, so 6 Nov is a Friday).
assert.equal(iso(addMonths(day("2026-08-31"), 6)), "2027-02-28");
assert.equal(iso(addMonths(day("2026-07-03"), 12)), "2027-07-03");
assert.equal(daysBetween(day("2026-11-07"), day("2027-01-03")), 57);
assert.equal(iso(workingDaysAfter(day("2026-11-06"), 3)), "2026-11-11");
assert.equal(iso(workingDaysAfter(day("2026-11-06"), 20)), "2026-12-04");
const dates = replyDates(day("2026-11-06"));
assert.deepEqual([iso(dates.acknowledgeBy), iso(dates.simpleBy), iso(dates.investigationBy)], ["2026-11-11", "2026-11-13", "2026-12-04"]);
console.log("PASS: month and working-day arithmetic, expected NHS reply dates");

// Ombudsman clock: 12 months from first knowing, counted from the earliest event.
const today = day("2026-11-07");
const inside = spsoClock(facts("2026-07-03"), today);
assert.equal(inside.state, "inside");
assert.match(inside.headline, /238 days/);
assert.equal(spsoClock(facts("2025-11-07"), today).state, "inside", "exactly twelve months is still inside");
assert.equal(spsoClock(facts("2025-11-06"), today).state, "outside");
assert.equal(spsoClock(facts(), today).state, "unknown");
console.log("PASS: ombudsman clock states");

// Eligibility rows on step 2.
const f = facts("2026-07-03");
const base = { facts: f, progress: { nhsSent: true }, ombudsman: { unlocked: true, answers: {}, receivedOn: "2026-11-02" } };
const good = spsoChecks(base, { courtAction: false, letterMentionsSpso: true }, today);
assert.deepEqual(good.map((r) => r.status), ["yes", "yes", "yes", "yes", "yes"]);
assert.match(good[0].evidence, /2 Nov 2026/);
assert.deepEqual(tally(good), { yes: 5, total: 5 });
const bad = spsoChecks({ ...base, progress: {}, ombudsman: { unlocked: false, answers: {} } }, { courtAction: true, letterMentionsSpso: false }, today);
assert.deepEqual(bad.map((r) => r.status), ["unknown", "unknown", "yes", "no", "unknown"]);
const skipped = spsoChecks({ ...base, progress: { skipped: [1] } }, { courtAction: false, letterMentionsSpso: true }, today);
assert.equal(skipped[1].status, "yes");
const late = spsoChecks({ ...base, facts: facts("2025-01-01") }, { courtAction: false, letterMentionsSpso: true }, today);
assert.equal(late[2].status, "no");
console.log("PASS: step 2 eligibility rows");
