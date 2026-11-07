/**
 * Live test of the generic explore worker on real sites (headless only; never submits anything).
 *   npx tsx --env-file=.env.local scripts/test-explore.ts                       # the default set below
 *   npx tsx --env-file=.env.local scripts/test-explore.ts "<url>|<goal>|form"   # your own cases (want: form|page)
 *   npx tsx --env-file=.env.local scripts/test-explore.ts --readpage "<url>|<question>"   # readPage only (pages or PDFs)
 * Flags: --chrome (real Chrome, new headless, instead of Playwright's Chromium), --read (also try readPage),
 *        --hops=N, --serial.
 * Test scripts may name sites; the worker itself never does.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import type { Note } from "../lib/agent/legalAid";
import { exploreSite, readPage, type ExploreResult } from "../lib/agent/workers/explore";
import type { WorkerCtx } from "../lib/agent/workers/types";

const FORM_GOAL = "the online form to make a complaint about hospital care";
const DEFAULTS: [string, string, "form" | "page"][] = [
  ["https://www.leedsth.nhs.uk/", FORM_GOAL, "form"], // England, NHS trust
  ["https://cavuhb.nhs.wales/", FORM_GOAL, "form"], // Wales, health board
  ["https://belfasttrust.hscni.net/", FORM_GOAL, "form"], // Northern Ireland, HSC trust
  ["https://www.nhslothian.scot/", FORM_GOAL, "form"], // Scotland, health board
  ["https://www.ombudsman.org.uk/", "the online complaint form", "form"], // England, PHSO
];

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const hops = Number(args.find((a) => a.startsWith("--hops="))?.split("=")[1] ?? 10);
const cases = args.filter((a) => !a.startsWith("--")).map((a) => {
  const [url, goal, want] = a.split("|");
  return [url, goal || FORM_GOAL, want === "page" ? "page" : "form"] as [string, string, "form" | "page"];
});
const runDir = path.join("/tmp", `explore-${Date.now()}`);
mkdirSync(runDir, { recursive: true });

function fakeNote(tag: string, page: Page): Note {
  let n = 0;
  const say = (s: string) => console.log(`  [${tag}] … ${s}`);
  return Object.assign(say, {
    log: async (kind: string, text: string, extra: { detail?: string; shot?: boolean | string; confidence?: number } = {}) => {
      const conf = extra.confidence !== undefined ? ` (${Math.round(extra.confidence * 100)}%)` : "";
      console.log(`  [${tag}] ${kind.toUpperCase().padEnd(7)} ${text}${conf}`);
      if (extra.detail && process.env.VERBOSE) console.log(extra.detail.replace(/^/gm, `  [${tag}]          `));
      if (extra.shot === true && !page.isClosed()) await page.screenshot({ path: path.join(runDir, `${tag}-${String(n++).padStart(2, "0")}-${kind}.jpg`), type: "jpeg", quality: 50 }).catch(() => {});
    },
  }) as Note;
}

async function main() {
  const browser = await chromium.launch({ headless: true, ...(flag("--chrome") ? { channel: "chrome" } : {}) });
  const run = async ([url, goal, want]: [string, string, "form" | "page"]) => {
    const context = await browser.newContext({
      locale: "en-GB",
      viewport: { width: 1300, height: 900 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    });
    await context.addInitScript("window.__name = (f) => f;"); // tsx helper used inside page.evaluate
    const page = await context.newPage();
    const tag = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
    const ctx: WorkerCtx = { page, note: fakeNote(tag, page), track: { bump: () => {} } };
    const t0 = Date.now();
    if (flag("--readpage")) {
      const rp = await readPage(ctx, url, goal).catch((e: unknown) => ({ url, title: "", answer: `CRASH ${e}`, quotes: [], links: [], wall: undefined }));
      await context.close();
      const ok = !rp.wall && rp.quotes.some((q) => q.checked);
      const summary = `${rp.answer}\n${rp.quotes.map((q) => `    ${q.checked ? "✓" : "✗"} "${q.quote}"`).join("\n")}${rp.links.length ? `\n  links: ${rp.links.map((l) => l.text).join(" | ")}` : ""}`;
      return { url, goal, r: { ok, url: rp.url, path: [], summary, wall: rp.wall } as ExploreResult, secs: Math.round((Date.now() - t0) / 1000) };
    }
    let r: ExploreResult;
    try {
      r = await exploreSite(ctx, url, goal, { want, maxHops: hops });
    } catch (e) {
      r = { ok: false, url, path: [], summary: `CRASH: ${e instanceof Error ? e.stack : String(e)}` };
    }
    if (flag("--read") && r.ok) {
      const rp = await readPage(ctx, r.url, "Who can use this form, and is there a time limit for complaining?").catch((e) => ({ answer: `CRASH ${e}`, quotes: [] }));
      console.log(`  [${tag}] READ: ${rp.answer}\n${rp.quotes.map((q) => `  [${tag}]   ${q.checked ? "✓" : "✗"} "${q.quote}"`).join("\n")}`);
    }
    await context.close();
    return { url, goal, r, secs: Math.round((Date.now() - t0) / 1000) };
  };
  const results = flag("--serial") ? [] : await Promise.all((cases.length ? cases : DEFAULTS).map(run));
  if (flag("--serial")) for (const c of cases.length ? cases : DEFAULTS) results.push(await run(c));
  await browser.close();

  console.log(`\n================ RESULTS (screens in ${runDir})`);
  for (const { url, r, secs } of results) {
    console.log(`\n${r.ok ? "OK  " : "FAIL"} ${url}  (${secs}s)\n  ${r.summary}\n  final: ${r.url}`);
    for (const p of r.path) console.log(`   > ${p.via}  —  ${p.why}${p.seen ? `\n       observed: ${p.seen}` : ""}`);
    if (r.form) console.log(`  form: ${r.form.fields.length} fields, multiPage=${r.form.multiPage}, submit="${r.form.submitLabel ?? ""}"\n    ${r.form.fields.slice(0, 10).map((f) => `${f.label}[${f.kind}${f.required ? "*" : ""}]`).join("; ")}`);
    if (r.wall) console.log(`  wall: ${r.wall.kind}: ${r.wall.detail}`);
  }
  console.log(`\n${results.filter((x) => x.r.ok).length}/${results.length} succeeded`);
}

void main();
