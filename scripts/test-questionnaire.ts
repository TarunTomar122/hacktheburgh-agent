/**
 * Live test of the generic run_questionnaire worker against real legal aid checkers (URLs allowed in tests only).
 * A fake `ask` plays a FICTIONAL person (below) and logs every question the worker asks. Headless; the checkers
 * work out an estimate on the page and send nothing; the worker stops before any page asking for personal details.
 *
 *   npx tsx --env-file=.env.local scripts/test-questionnaire.ts
 *   SITES=slab npx tsx --env-file=.env.local scripts/test-questionnaire.ts
 */
import { chromium, type Browser, type Page } from "playwright";
import { z } from "zod";
import { structured, MODELS } from "../lib/agent/llm";
import { runQuestionnaire } from "../lib/agent/workers/questionnaire";
import type { Ask, Value, WorkerCtx } from "../lib/agent/workers/types";

/** A fictional person. Not a real individual. */
const PROFILE = `Fictional test persona "Rhys Morgan" (not a real person).
- Lives in Cardiff, Wales (for the Scottish checker, pretend the same facts apply in Scotland). Age 34. Single, no partner, no children, no dependants.
- Problem: medical (clinical) negligence. A hospital A&E missed a broken wrist bone (scaphoid fracture) in 2025; it was found months later. He wants compensation. He is an adult; it is not about a baby or a child's birth injury.
- Not in prison, not under 18, not domestic abuse, no court case started yet, not facing losing his home.
- Works full time as a warehouse supervisor. Gross pay £2,150 a month; take-home (net, after tax and NI) £1,700 a month = £20,400 a year.
- Benefits: none (no Universal Credit, Income Support, JSA, ESA, Pension Credit).
- Rent £650 a month (£7,800 a year). Council tax £120 a month. Other essential outgoings about £600 a month (food, bills, travel). Total annual outgoings about £16,440.
- Savings £1,200 in a bank account. No investments, no property owned, no valuable items over £500 apart from a car worth £3,000 used to get to work.
- No childcare costs, no maintenance paid or received.`;

type Case = { id: string; name: string; url: string; goal: string; known: Value[] };
const CASES: Case[] = [
  {
    id: "govuk",
    name: "GOV.UK: Check if you can get legal aid (England and Wales)",
    url: "https://www.gov.uk/check-legal-aid",
    goal: "Find out whether this person could get legal aid for a clinical negligence claim, using the official checker, and read its result.",
    known: [
      { key: "problem_area", description: "What the legal problem is about (area of law)", value: "Clinical negligence (medical negligence by a hospital, adult patient)" },
      { key: "on_benefits", description: "Whether the person receives Universal Credit, Income Support, income-based JSA, income-related ESA or Pension Credit", value: "No" },
      { key: "has_partner", description: "Whether the person has a partner", value: "No" },
      { key: "aged_60_or_over", description: "Whether the person is aged 60 or over", value: "No" },
    ],
  },
  {
    id: "slab",
    name: "SLAB: civil legal aid estimator (Scotland)",
    url: "https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/",
    goal: "Estimate whether this person is likely to qualify financially for civil legal aid, and read the estimate.",
    known: [
      { key: "on_benefits", description: "Whether the person receives Income Support, income-based JSA, income-related ESA or Universal Credit", value: "No" },
      { key: "has_partner", description: "Whether the person has a partner or spouse", value: "No" },
      { key: "dependants", description: "Number of dependants living with the person", value: "0" },
    ],
  },
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

async function launch(): Promise<Browser> {
  if (process.env.CHROME_CHANNEL !== "0") {
    try {
      return await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      /* not installed */
    }
  }
  return chromium.launch({ headless: true });
}

/** The fake user: answers each question from the fictional profile, as a person would, and logs it. */
function fakeAsk(tag: string, asked: string[]): Ask {
  return async (spec) => {
    const r = await structured({
      model: MODELS.browser,
      effort: "low",
      name: "test_fake_user",
      data: [],
      schema: z.object({ answer: z.string() }),
      instructions:
        "You play the fictional person in PROFILE answering one question from an online checker. Answer briefly as that person would. If OPTIONS are given, answer with one option copied exactly (or several, comma-separated, if the question says all that apply). For money give the amount for the period the question asks. If the profile truly does not say, give the most natural answer for this person.",
      input: `PROFILE:\n${PROFILE}\n\nQUESTION (${spec.kind}): ${spec.question}\nWHY ASKED: ${spec.why}${spec.options?.length ? `\nOPTIONS:\n${spec.options.map((o) => `- ${o}`).join("\n")}` : ""}`,
    });
    asked.push(`${spec.question} [${spec.kind}${spec.options?.length ? `: ${spec.options.join(" | ").slice(0, 160)}` : ""}] -> ${r.answer}`);
    console.log(`[${tag}] ASKED   ${spec.question} (${spec.kind}) -> "${r.answer}"`);
    return r.answer;
  };
}

function makeCtx(page: Page, tag: string, ask: Ask): WorkerCtx {
  const note = Object.assign((s: string) => void s, {
    log: async (kind: string, text: string, extra: { detail?: string } = {}) => {
      console.log(`[${tag}] ${kind.padEnd(7)} ${text}`);
      if (extra.detail && process.env.VERBOSE) console.log(extra.detail.split("\n").map((l) => `[${tag}]          ${l}`).join("\n"));
    },
  });
  return { page, note, track: { bump: () => {} }, ask };
}

async function main() {
  const only = (process.env.SITES ?? "").split(",").filter(Boolean);
  const cases = CASES.filter((c) => !only.length || only.includes(c.id));
  const browser = await launch();
  console.log(`Browser: ${browser.version()} (headless)`);
  const context = await browser.newContext({ locale: "en-GB", viewport: { width: 1300, height: 900 }, userAgent: UA });
  await context.addInitScript("window.__name = (f) => f;");
  const rows = await Promise.all(
    cases.map(async (c) => {
      const asked: string[] = [];
      const page = await context.newPage();
      const t0 = Date.now();
      try {
        const r = await runQuestionnaire(makeCtx(page, c.id, fakeAsk(c.id, asked)), { url: c.url, goal: c.goal, known: c.known, maxPages: 15 });
        return { c, r, asked, s: Math.round((Date.now() - t0) / 1000) };
      } catch (e) {
        return { c, r: null, asked, s: Math.round((Date.now() - t0) / 1000), err: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  await browser.close();

  console.log("\n================ RESULTS");
  let failed = 0;
  for (const row of rows) {
    const { c, r } = row;
    const pass = !!r?.ok && !!r.resultQuote?.checked;
    if (!pass) failed++;
    console.log(`\n${pass ? "PASS" : "FAIL"}  ${c.name}  (${row.s}s)`);
    if (!r) {
      console.log(`  error: ${"err" in row ? row.err : "?"}`);
      continue;
    }
    console.log(`  ${r.summary}`);
    if (r.resultQuote) console.log(`  quote (${r.resultQuote.checked ? "checked" : "NOT checked"}): "${r.resultQuote.quote}"`);
    for (const q of r.caveats) console.log(`  caveat: "${q.quote}"`);
    if (r.wall) console.log(`  wall: ${r.wall.kind}: ${r.wall.detail}`);
    console.log("  answers:");
    for (const a of r.answers) console.log(`   - [${a.source}] ${a.question} -> ${a.answer}`);
    console.log(`  questions asked of the user (${row.asked.length}):`);
    for (const q of row.asked) console.log(`   ? ${q}`);
  }
  console.log(`\n${rows.length - failed}/${rows.length} checkers passed`);
  process.exit(failed ? 1 : 0);
}

void main();
