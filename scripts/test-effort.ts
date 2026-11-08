// Patient insights: the effort and hurdle counts come only from logged events (docs/plans/patient-insights-plan.md).
// Run: npx tsx scripts/test-effort.ts
import assert from "node:assert/strict";
import type { AgentEvent } from "../lib/agent/events";
import { addEffort, fromEvents, fromTrace, hurdleCounts, type TimedEvent } from "../lib/agent/effort";
import type { TraceStep } from "../lib/agent/legalAidTypes";

const at = (s: number, e: AgentEvent): TimedEvent => ({ t: 1_000_000 + s * 1000, e });
const act = (tool: string, label: string, result = "ok"): AgentEvent => ({ type: "action", step: 1, tool, args: { label }, result });

// A fictional Yellow Card-like run: product matched among 19, a cookie banner, two waits close together, a 5-page form, a question at the end.
const run: TimedEvent[] = [
  at(0, { type: "status", message: "Opening the Yellow Card reporting site" }),
  at(1, { type: "status", message: "Cleared a cookie banner covering the page" }),
  at(2, { type: "status", message: "The Yellow Card site suggested 19 products for \"amoxicillin\"" }),
  at(3, act("select", "Product")),
  at(4, { type: "observe", step: 1, url: "https://yellowcard.mhra.gov.uk/report-guide?x=1", fields: 3 }),
  at(5, act("select", "Are you a member of the public")),
  at(6, act("click", "Next step")),
  at(7, { type: "observe", step: 2, url: "https://yellowcard.mhra.gov.uk/about-you", fields: 20 }),
  at(8, act("fill", "First Name")),
  at(9, act("fill", "Email", "error: locator.fill: Timeout")),
  at(10, { type: "status", message: "A field did not respond (the page may still be loading). Looking again before moving on." }),
  at(12, { type: "status", message: "Not sure yet what this page needs. Looking again once it has loaded." }), // same wait (within 5 s)
  at(13, act("fill", "Email")),
  at(14, { type: "status", message: "Ticked a box the page had hidden or drawn itself (you had agreed to it)" }),
  at(15, act("click", "Continue without registering")),
  at(16, { type: "observe", step: 3, url: "https://yellowcard.mhra.gov.uk/new-report?r=1", fields: 17 }),
  at(17, act("click", "Next step")),
  at(18, act("click", "Next step")),
  at(30, { type: "status", message: "Looking again once it has loaded." }), // a second, separate wait
  at(31, act("click", "Next step")),
  at(32, { type: "done", status: "needs_input", summary: "", unfilled: ["Has the supplier been contacted?", "Is a sample available?"] }),
];

const e = fromEvents(run, 6);
assert.deepEqual(e.sites, ["yellowcard.mhra.gov.uk"]);
assert.equal(e.fields, 4, "fills, selects and ticks that worked; the failed fill does not count");
assert.equal(e.clicks, 5);
assert.equal(e.pages, 6, "5 'next'-style clicks (4 Next step + Continue) means 6 pages, more than the 3 distinct URLs");
assert.equal(e.questionsForYou, 2);
assert.equal(e.ms, 32_000);
const kinds = hurdleCounts(e.hurdles).map((h) => `${h.kind}:${h.count}`).sort();
assert.deepEqual(kinds, ["asked_you:1", "cookie_wall:1", "hidden_box:1", "long_form:1", "matched_entry:1", "page_wait:2"].sort());
assert.ok(e.curve.length > 0 && e.curve.at(-1)!.fields === 4, "the curve ends at the totals");

// A crew trace (step 4-like): a hidden form, a firm with no online form, a CAPTCHA, a plain failure that is NOT a hurdle cleared.
const tr = (i: number, kind: TraceStep["kind"], text: string, url?: string): TraceStep => ({ i, t: i * 1000, agent: "Firm", color: "", kind, text, url });
const trace: TraceStep[] = [
  tr(0, "open", "Opened the firm's site", "https://firm-a.example/"),
  tr(1, "recover", "The form is inside an embedded frame; opening it directly", "https://forms.firm-a.example/"),
  tr(2, "type", "Typed your name"),
  tr(3, "pick", "Picked 'Medical negligence'"),
  tr(4, "open", "Opened the firm's site", "https://firm-b.example/"),
  tr(5, "recover", "No online enquiry form on their site, even after a harder look"),
  tr(6, "fail", "A CAPTCHA appeared after Send. Elliot does not try to get past it"),
  tr(7, "fail", "Stopped: network error"),
];
const t = fromTrace(trace, 4);
assert.equal(t.fields, 2);
assert.equal(t.pages, 2);
assert.deepEqual(t.sites.sort(), ["firm-a.example", "firm-b.example", "forms.firm-a.example"]);
assert.deepEqual(t.hurdles.map((h) => h.kind), ["hidden_form", "no_online_form", "handed_over"]);

// Totals across a case: websites counted once, everything else added.
const both = addEffort(addEffort(e, e), t);
assert.equal(both.sites.length, 4);
assert.equal(both.fields, 10);
assert.equal(both.runs, 3);

console.log("effort: all checks passed");
