import { normText, quoteInText } from "./workers/explore";

/**
 * Evidence-honesty helpers (night plan, "Live and dynamic"; Codex round 5, blocker A and B). Nothing here knows any
 * country, body or site. A model-written claim that carries a number (a time limit, a cap, a percentage) only
 * stands if every such number is backed, as a WHOLE token with its currency / unit, by a quote that
 *   1. code found in the page it came from (`checked`), and
 *   2. came from an OFFICIAL source (the `official` flag discovery computed), and
 *   3. is not law "as enacted" (that flag is already folded into `official`).
 * `£500` does not back `$500`, `12 years` does not back `2 years`, `6 months` does not back `6 weeks`, a range backs
 * only the same range, and "1,000" equals "1000".
 *
 * HOW LATER FLOWS REUSE THIS (complaintAnywhere / escalationAnywhere / compensationAnywhere). Any limit, cap,
 * deadline or percentage the model writes on its own (a time-limit answer, a "points" list, a draft sentence) is run
 * through the route step's sources, which already carry `checked` and `official`:
 *
 *   import { vetClaim, quoteInText } from "./evidence-claims";
 *   const v = vetClaim(modelSentence, step.sources, { requireSingle: true });
 *   // v.ok       every number is backed by one checked, official quote
 *   // v.text     the sentence with unbacked numbers replaced by "[see source]" (use this, never the raw sentence)
 *   // v.support  indexes into step.sources of the quotes that back it (cite those: url + quote)
 *   // v.unbacked the numbers that no official, checked quote carries
 *   if (!v.ok) say("could not confirm") // or show v.text
 *
 * For a quote the model returns from a page you hold the text of: `quoteInText(quote, normText(pageText))`.
 */

export { quoteInText, normText };

// ---------- numbers with their currency / unit ----------

export type Quantity = {
  kind: "money" | "duration" | "percent" | "count";
  lo: number;
  hi: number; // equals lo unless the text gives a range ("6 to 12 months", "£500-£1,000")
  currency?: string; // money: ISO-like code, or "$" / "¥" when the text did not say which dollar / yen
  unit?: string; // duration: day, working day, week, month, year, hour
  text: string; // as written
  start: number;
  end: number; // span in the parsed text
};

const WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONES = "one|two|three|four|five|six|seven|eight|nine";
const TENS = "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
const NUMW = `(?:(?:${TENS})(?:[\\s-](?:${ONES}))?|zero|${ONES}|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:a|one) hundred)`;
const NUMD = String.raw`(?:\d{1,3}(?:[,  ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const NUM = `(?:${NUMD}|${NUMW})`;
const MUL = String.raw`(?:\s?(?:k|m|bn|thousand|million|billion)\b)`;
const SEP = String.raw`(?:\s*(?:-|–|—|to)\s*)`;
const NOT_DURATION_NEXT = String.raw`(?!\s?-?\s?(?:working|business|calendar)?\s?(?:days?|weeks?|months?|years?|hours?|%|per ?cent))`;

// Currency prefixes and suffixes. Dollar and yen variants stay distinct unless the text leaves them unspecified.
const CODES = "GBP|USD|EUR|NZD|AUD|CAD|INR|JPY|CNY|CHF|SEK|NOK|DKK|ZAR|SGD|HKD|RMB";
const CUR_WORDS = "pounds?(?: sterling)?|dollars?|euros?|rupees?|yen|rand|francs?";
const PRE = String.raw`(?:(?:NZ|AU|CA|US|HK|SG|A|C|S)\$|[£$€¥₹]|Rs\.?|\b(?:${CODES})\b ?)`;
const SUF = String.raw`(?:\b(?:${CODES})\b|\b(?:${CUR_WORDS})\b)`;

const CODE_OF_PREFIX: Record<string, string> = { NZ$: "NZD", AU$: "AUD", A$: "AUD", CA$: "CAD", C$: "CAD", US$: "USD", HK$: "HKD", SG$: "SGD", S$: "SGD", "£": "GBP", "€": "EUR", "₹": "INR", $: "$", "¥": "¥" };
const CODE_OF_WORD: [RegExp, string][] = [[/^pound/, "GBP"], [/^dollar/, "$"], [/^euro/, "EUR"], [/^rupee/, "INR"], [/^yen/, "¥"], [/^rand/, "ZAR"], [/^franc/, "CHF"]];
function currencyOf(raw: string): string {
  const t = raw.trim().replace(/\.$/, "");
  if (/^rs$/i.test(t)) return "INR";
  const key = t.replace(/[a-z]/g, (c) => c.toUpperCase());
  if (CODE_OF_PREFIX[key]) return CODE_OF_PREFIX[key];
  const w = CODE_OF_WORD.find(([re]) => re.test(t.toLowerCase()));
  if (w) return w[1];
  return key === "RMB" ? "CNY" : key; // an ISO code as written
}
const DOLLARS = new Set(["USD", "NZD", "AUD", "CAD", "HKD", "SGD"]);
const YENS = new Set(["JPY", "CNY"]);
const sameCurrency = (a = "", b = "") => a === b || (a === "$" && DOLLARS.has(b)) || (b === "$" && DOLLARS.has(a)) || (a === "¥" && YENS.has(b)) || (b === "¥" && YENS.has(a));

const UNIT = String.raw`(?:(?:working|business|calendar)\s+days?|days?|weeks?|months?|years?|hours?|%|per ?cent)`;
function unitOf(raw: string): { kind: "duration" | "percent"; unit?: string } {
  const u = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (u === "%" || /^per ?cent/.test(u)) return { kind: "percent" };
  if (/^(working|business) day/.test(u)) return { kind: "duration", unit: "working day" };
  return { kind: "duration", unit: u.replace(/^calendar /, "").replace(/s$/, "") };
}

function valueOf(raw: string, mul = ""): number {
  const t = raw.toLowerCase().trim();
  let v: number;
  if (/^[\d]/.test(t)) v = Number(t.replace(/[,  ]/g, ""));
  else if (/hundred$/.test(t)) v = 100;
  else v = t.split(/[\s-]+/).reduce((s, w) => s + (WORDS[w] ?? 0), 0);
  const m = mul.trim().toLowerCase();
  if (m === "k" || m === "thousand") v *= 1e3;
  else if (m === "m" || m === "million") v *= 1e6;
  else if (m === "bn" || m === "billion") v *= 1e9;
  return v;
}

/** Every number in the text with its currency or unit, as whole tokens. Order of passes = priority (money, then durations ...). */
export function parseQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  const free = (s: number, e: number) => !out.some((q) => s < q.end && e > q.start);
  const add = (m: RegExpMatchArray, q: Omit<Quantity, "text" | "start" | "end">) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (!free(start, end)) return;
    if (q.hi < q.lo) q = { ...q, hi: q.lo }; // "2020-19" is not a range
    out.push({ ...q, text: m[0], start, end });
  };
  const run = (re: string, f: (m: RegExpMatchArray & { groups: Record<string, string | undefined> }) => void) => {
    for (const m of text.matchAll(new RegExp(re, "giu"))) f(m as never);
  };
  // 1. prefix money: £500, $1,000, NZ$5k, EUR 500, £500-£1,000, between £500 and £1,000, $500 NZD
  run(String.raw`(?<![\p{L}\p{N}])between\s+(?<pc>${PRE})\s?(?<a>${NUM})(?<am>${MUL})?\s+and\s+(?<pc2>${PRE})?\s?(?<b>${NUM})(?<bm>${MUL})?(?:\s?(?<sc>${SUF}))?`, (m) => {
    const g = m.groups;
    add(m, { kind: "money", lo: valueOf(g.a!, g.am), hi: valueOf(g.b!, g.bm), currency: currencyOf(g.sc ?? g.pc!) });
  });
  run(
    String.raw`(?<![\p{L}\p{N}])(?<pc>${PRE})\s?(?<a>${NUM})(?<am>${MUL})?(?:${SEP}(?<pc2>${PRE})?\s?(?<b>${NUM})(?<bm>${MUL})?${NOT_DURATION_NEXT})?(?:\s?(?<sc>${SUF}))?`,
    (m) => {
      const g = m.groups;
      const lo = valueOf(g.a!, g.am);
      const hi = g.b ? valueOf(g.b, g.bm) : lo;
      add(m, { kind: "money", lo, hi, currency: currencyOf(g.sc ?? g.pc!) });
    },
  );
  // 2. suffix money: 500 pounds, 500 GBP, 1.5 million euros, 500-1,000 USD
  run(String.raw`(?<![\p{L}\p{N}.,£$€¥₹])(?<a>${NUM})(?<am>${MUL})?(?:${SEP}(?<b>${NUM})(?<bm>${MUL})?)?\s?(?<sc>${SUF})`, (m) => {
    const g = m.groups;
    const lo = valueOf(g.a!, g.am);
    add(m, { kind: "money", lo, hi: g.b ? valueOf(g.b, g.bm) : lo, currency: currencyOf(g.sc!) });
  });
  // 3. durations and percentages: 12 months, 6 to 12 months, between 6 and 12 months, 30 days, 5%, 25 per cent, twenty-eight days
  run(String.raw`(?<![\p{L}\p{N}.,£$€¥₹])between\s+(?<a>${NUM})\s+and\s+(?<b>${NUM})\s*-?\s*(?<u>${UNIT})(?![\p{L}])`, (m) => {
    const u = unitOf(m.groups.u!);
    add(m, { kind: u.kind, lo: valueOf(m.groups.a!), hi: valueOf(m.groups.b!), unit: u.unit });
  });
  run(String.raw`(?<![\p{L}\p{N}.,£$€¥₹])(?<a>${NUM})(?:${SEP}(?<b>${NUM}))?\s*-?\s*(?<u>${UNIT})(?![\p{L}])`, (m) => {
    const g = m.groups;
    const u = unitOf(g.u!);
    const lo = valueOf(g.a!);
    add(m, { kind: u.kind, lo, hi: g.b ? valueOf(g.b) : lo, unit: u.unit });
  });
  run(String.raw`(?<![\p{L}\p{N}])(?<a>an?)\s+(?<u>${UNIT.replace("|%|per ?cent", "")})(?![\p{L}])`, (m) => {
    add(m, { kind: "duration", lo: 1, hi: 1, unit: unitOf(m.groups.u!).unit });
  });
  // 4. other numbers written with digits ("2 stages", "level 3", "1980"): number words alone are not claims
  run(String.raw`(?<![\p{L}\p{N}.,£$€¥₹])(?<a>${NUMD})(?![\p{N}])`, (m) => add(m, { kind: "count", lo: valueOf(m.groups.a!), hi: valueOf(m.groups.a!) }));
  return out.sort((x, y) => x.start - y.start);
}

const EPS = 1e-9;
/** Same kind, same value or range, same currency / unit. */
export function sameQuantity(a: Quantity, b: Quantity): boolean {
  if (a.kind !== b.kind || Math.abs(a.lo - b.lo) > EPS || Math.abs(a.hi - b.hi) > EPS) return false;
  if (a.kind === "money") return sameCurrency(a.currency, b.currency);
  if (a.kind === "duration") return a.unit === b.unit;
  return true;
}

/** "12 months", "6-12 months", "£500" as plain text for messages. */
export function formatQuantity(q: Quantity): string {
  const n = (x: number) => x.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  const v = q.lo === q.hi ? n(q.lo) : `${n(q.lo)}-${n(q.hi)}`;
  if (q.kind === "money") return /^[A-Z]{3}$/.test(q.currency ?? "") ? `${v} ${q.currency}` : `${q.currency}${v}`;
  if (q.kind === "percent") return `${v}%`;
  if (q.kind === "duration") return `${v} ${q.unit}${q.hi === 1 && q.lo === 1 ? "" : "s"}`;
  return v;
}

// ---------- binding a claim to the quotes that back it ----------

/** The least a quote must carry to back a claim: what the page said, and whether code and the official check passed. */
export type EvidenceQuote = { quote: string; checked: boolean; official: boolean };

export type ClaimCheck = {
  ok: boolean;
  numbers: Quantity[]; // every number in the claim
  unbacked: Quantity[]; // those no eligible quote carries
  support: number[]; // indexes (into the quotes passed in) of the quotes that back the claim's numbers
  single: boolean; // true when ONE quote backs them all (or the claim has no numbers)
};

/** Numbers in a claim that need backing: everything except bare number words ("one site"). Digits and unit-bearing numbers count. */
const needsBacking = (claim: string) => parseQuantities(claim);

/** Eligible = checked in the page by code AND from an official source. Unofficial or unchecked quotes back nothing. */
const eligible = (quotes: EvidenceQuote[]) => quotes.map((q, i) => ({ i, q })).filter((x) => x.q.checked && x.q.official);

export function checkClaimNumbers(claim: string, quotes: EvidenceQuote[], opts: { requireSingle?: boolean } = {}): ClaimCheck {
  const numbers = needsBacking(claim);
  if (!numbers.length) return { ok: true, numbers, unbacked: [], support: [], single: true };
  const pool = eligible(quotes).map((x) => ({ ...x, qs: parseQuantities(x.q.quote) }));
  const backs = (n: Quantity, qs: Quantity[]) => qs.some((x) => sameQuantity(n, x));
  // Prefer the one quote that carries every number of the claim.
  const one = pool.find((x) => numbers.every((n) => backs(n, x.qs)));
  if (one) return { ok: true, numbers, unbacked: [], support: [one.i], single: true };
  const support = new Set<number>();
  const unbacked: Quantity[] = [];
  for (const n of numbers) {
    const hit = pool.find((x) => backs(n, x.qs));
    if (hit) support.add(hit.i);
    else unbacked.push(n);
  }
  const ok = !unbacked.length && !opts.requireSingle;
  return { ok, numbers, unbacked: opts.requireSingle && !unbacked.length ? numbers : unbacked, support: [...support], single: false };
}

/** The claim with every unbacked number replaced by "[see source]" (nothing else is changed). */
export function scrubUnbacked(claim: string, check: ClaimCheck): string {
  const bad = [...check.unbacked].sort((a, b) => b.start - a.start);
  let out = claim;
  for (const q of bad) out = `${out.slice(0, q.start)}[see source]${out.slice(q.end)}`;
  return out;
}

export type VettedClaim = { ok: boolean; text: string; support: number[]; single: boolean; unbacked: string[] };

/** One call for later flows: is this model-written sentence's every number backed by an official, checked quote? */
export function vetClaim(claim: string, quotes: EvidenceQuote[], opts: { requireSingle?: boolean } = {}): VettedClaim {
  const c = checkClaimNumbers(claim, quotes, opts);
  return { ok: c.ok, text: c.ok ? claim : scrubUnbacked(claim, c), support: c.support, single: c.single, unbacked: c.unbacked.map(formatQuantity) };
}

/** Law as originally enacted is not today's rule (amended since): such a page must never count as official. */
export const isEnactedUrl = (url: string) => /\/(enacted|as-enacted|original)(\/|$)|\bas enacted\b/i.test(url);
