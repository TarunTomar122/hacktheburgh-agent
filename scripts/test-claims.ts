import assert from "node:assert/strict";
import { checkClaimNumbers, formatQuantity, parseQuantities, vetClaim, type EvidenceQuote } from "../lib/agent/evidence-claims";

// Deterministic: no model calls, no browser. Each case: a claim, the quotes behind it, and whether it must be accepted.
const off = (quote: string): EvidenceQuote => ({ quote, checked: true, official: true });
const unofficial = (quote: string): EvidenceQuote => ({ quote, checked: true, official: false });
const unchecked = (quote: string): EvidenceQuote => ({ quote, checked: false, official: true });

type Case = { name: string; claim: string; quotes: EvidenceQuote[]; accept: boolean; opts?: { requireSingle?: boolean } };
const cases: Case[] = [
  // the reproduced blocker: an unofficial checked quote "£500 after 12 months"
  { name: "unofficial £500 vs $500", claim: "Compensation up to $500", quotes: [unofficial("£500 after 12 months")], accept: false },
  { name: "unofficial £500 vs €500", claim: "Compensation of €500", quotes: [unofficial("£500 after 12 months")], accept: false },
  { name: "unofficial £500 vs £500 (unofficial only)", claim: "Compensation of £500", quotes: [unofficial("£500 after 12 months")], accept: false },
  { name: "official £500 vs $500", claim: "Compensation up to $500", quotes: [off("£500 after 12 months")], accept: false },
  { name: "official £500 vs €500", claim: "Compensation of €500", quotes: [off("£500 after 12 months")], accept: false },
  { name: "official £500 vs £500", claim: "Compensation of £500", quotes: [off("£500 after 12 months")], accept: true },
  { name: "official £500 and 12 months", claim: "Up to £500 within 12 months", quotes: [off("£500 after 12 months")], accept: true },
  { name: "unchecked official quote backs nothing", claim: "Compensation of £500", quotes: [unchecked("£500 after 12 months")], accept: false },
  { name: "unofficial duplicate does not rescue", claim: "Compensation of £500", quotes: [unofficial("£500 after 12 months"), off("a payment may be made")], accept: false },
  // units
  { name: "12 years vs 2 years", claim: "within 2 years", quotes: [off("within 12 years of the event")], accept: false },
  { name: "2 years vs 12 years", claim: "within 12 years", quotes: [off("within 2 years of the event")], accept: false },
  { name: "6 months vs 6 weeks", claim: "within 6 weeks", quotes: [off("within 6 months of the event")], accept: false },
  { name: "6 months vs 6 months", claim: "within 6 months", quotes: [off("within 6 months of the event")], accept: true },
  { name: "30 days vs 0 days", claim: "within 0 days", quotes: [off("you have 30 days to reply")], accept: false },
  { name: "30 days vs 30 days", claim: "reply within 30 days", quotes: [off("you have 30 days to reply")], accept: true },
  { name: "20 working days vs 20 days", claim: "a reply in 20 days", quotes: [off("a reply within 20 working days")], accept: false },
  { name: "20 working days vs 20 business days", claim: "a reply in 20 business days", quotes: [off("a reply within 20 working days")], accept: true },
  { name: "12-month hyphen", claim: "a 12 month limit", quotes: [off("a 12-month time limit applies")], accept: true },
  { name: "a year = one year", claim: "within one year", quotes: [off("claims must be made within a year")], accept: true },
  // number words
  { name: "number word six months", claim: "within 6 months", quotes: [off("you must apply within six months")], accept: true },
  { name: "number word vs wrong digit", claim: "within 7 months", quotes: [off("you must apply within six months")], accept: false },
  { name: "twenty-eight days", claim: "28 days to respond", quotes: [off("the board will respond within twenty-eight days")], accept: true },
  { name: "twenty-eight vs twenty-one", claim: "21 days to respond", quotes: [off("the board will respond within twenty-eight days")], accept: false },
  // separators
  { name: "1,000 vs 1000", claim: "a cap of £1000", quotes: [off("the cap is £1,000")], accept: true },
  { name: "1000 vs 1,000", claim: "a cap of £1,000", quotes: [off("the cap is £1000")], accept: true },
  { name: "1,000 vs 10,000", claim: "a cap of £10,000", quotes: [off("the cap is £1,000")], accept: false },
  { name: "£500k vs £500,000", claim: "up to £500,000", quotes: [off("awards of up to £500k")], accept: true },
  { name: "1.5 million vs 15 million", claim: "up to €15 million", quotes: [off("up to €1.5 million")], accept: false },
  { name: "suffix code GBP", claim: "a cap of £500", quotes: [off("a cap of 500 GBP")], accept: true },
  { name: "suffix word pounds vs dollars", claim: "a cap of $500", quotes: [off("a cap of 500 pounds")], accept: false },
  { name: "NZ$ vs generic $", claim: "a cap of $500", quotes: [off("a cap of NZ$500")], accept: true },
  { name: "NZ$ vs US$", claim: "a cap of US$500", quotes: [off("a cap of NZ$500")], accept: false },
  { name: "NZ$ claim vs £", claim: "a cap of NZ$500", quotes: [off("a cap of £500")], accept: false },
  { name: "rupees", claim: "fee of ₹500", quotes: [off("a fee of Rs. 500 applies")], accept: true },
  // ranges and percentages
  { name: "range matches range", claim: "between 6 and 12 months", quotes: [off("decided in 6 to 12 months")], accept: true },
  { name: "single vs range", claim: "within 12 months", quotes: [off("decided in 6 to 12 months")], accept: false },
  { name: "range money", claim: "£500-£1,000", quotes: [off("awards between £500 and £1000")], accept: true },
  { name: "range money wrong top", claim: "£500-£2,000", quotes: [off("awards between £500 and £1000")], accept: false },
  { name: "percent", claim: "a 25% reduction", quotes: [off("a reduction of 25 per cent")], accept: true },
  { name: "percent vs 5%", claim: "a 5% reduction", quotes: [off("a reduction of 25 per cent")], accept: false },
  { name: "percent is not days", claim: "25 days", quotes: [off("a reduction of 25%")], accept: false },
  // no numbers, and the claim wording around numbers
  { name: "no numbers", claim: "Write to the ombudsman", quotes: [], accept: true },
  { name: "bare digit needs a bare digit", claim: "3 stages", quotes: [off("the process has 3 stages")], accept: true },
  { name: "bare digit not from a year count", claim: "3 stages", quotes: [off("within 3 years")], accept: false },
  { name: "two numbers, one wrong", claim: "£500 within 2 years", quotes: [off("£500 after 12 years")], accept: false },
  // binding to one quote
  { name: "split across quotes allowed by default", claim: "£500 within 2 years", quotes: [off("a payment of £500"), off("claims within 2 years")], accept: true },
  { name: "split across quotes refused when single required", claim: "£500 within 2 years", quotes: [off("a payment of £500"), off("claims within 2 years")], accept: false, opts: { requireSingle: true } },
  { name: "single quote satisfies requireSingle", claim: "£500 within 2 years", quotes: [off("a payment of £500 if claimed within 2 years")], accept: true, opts: { requireSingle: true } },
];

let failed = 0;
const rows: string[] = [];
for (const c of cases) {
  const r = checkClaimNumbers(c.claim, c.quotes, c.opts);
  const pass = r.ok === c.accept;
  if (!pass) failed++;
  rows.push(`${pass ? "ok  " : "FAIL"} ${c.accept ? "accept" : "reject"}  ${c.name.padEnd(46)} ${JSON.stringify(c.claim)}${r.ok ? ` support=[${r.support}]${r.single ? " single" : ""}` : ` unbacked=[${r.unbacked.map(formatQuantity).join(", ")}]`}`);
}
console.log(rows.join("\n"));

// the parser itself
const fmt = (t: string) => parseQuantities(t).map(formatQuantity);
assert.deepEqual(fmt("£500 after 12 months"), ["500 GBP", "12 months"]);
assert.deepEqual(fmt("NZ$5,000 or 2 per cent"), ["5,000 NZD", "2%"]);
assert.deepEqual(fmt("between 6 and 12 months"), ["6-12 months"]);
assert.deepEqual(fmt("30 days and 12 months"), ["30 days", "12 months"]);

// vetClaim scrubs only the unbacked numbers and reports which quote backs the rest
const v = vetClaim("Up to £500 within 12 years", [off("£500 after 12 months")]);
assert.equal(v.ok, false);
assert.equal(v.text, "Up to £500 within [see source]");
assert.deepEqual(v.unbacked, ["12 years"]);
assert.equal(vetClaim("Up to £500", [off("£500 after 12 months")]).ok, true);

console.log(`\n${cases.length - failed}/${cases.length} claim cases pass, parser and vetClaim checks pass`);
if (failed) process.exit(1);
