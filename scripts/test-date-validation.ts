import assert from "node:assert/strict";
import { parseFundingNumber, validatePatch } from "../lib/agent/inputs";
const check = (date: string) => validatePatch({ events: [{ date, what: "Test event" }] });
for (const date of ["2024-02-30", "2025-02-29", "2024-04-31", "2024-13-01"]) assert.ok(check(date), date);
for (const date of ["2024-02-29", "2025-02-28", "2024-04-30", "early July 2024", "July 2024"]) assert.equal(check(date), null, date);
console.log("PASS: impossible dates rejected; leap days and approximate dates preserved");

for (const [input, expected] of [["2.5k", 2500], ["0.5K", 500], ["20k", 20000], ["£2,500.50", 2500.5], ["0", 0], ["", null], ["   ", null], ["-1", null], ["unknown", null], [null, null]] as const) assert.equal(parseFundingNumber(input), expected, String(input));
console.log("PASS: decimal thousands, currency, zero, and missing/invalid money answers");
