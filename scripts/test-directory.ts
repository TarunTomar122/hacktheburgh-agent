/**
 * Live test of the generic search_directory worker against real lawyer registers (URLs are allowed in tests only;
 * the worker itself gets nothing but the URL, a goal in words and the criteria). Headless; nothing is submitted:
 * only the criteria below are ever typed.
 *
 *   npx tsx --env-file=.env.local scripts/test-directory.ts            # all sites, in parallel tabs
 *   SITES=scot,ni npx tsx --env-file=.env.local scripts/test-directory.ts
 */
import { chromium, type Browser, type Page } from "playwright";
import { searchDirectory } from "../lib/agent/workers/searchDirectory";
import type { WorkerCtx } from "../lib/agent/workers/types";

type Case = { id: string; name: string; url: string; goal: string; criteria: { label: string; value: string }[]; mayWall?: boolean };

const CASES: Case[] = [
  {
    id: "ew",
    name: "Law Society of England and Wales: Find a Solicitor",
    url: "https://solicitors.lawsociety.org.uk/",
    goal: "Find solicitor firms that handle clinical (medical) negligence claims for patients, near Cardiff.",
    criteria: [
      { label: "area of law", value: "clinical negligence / medical negligence / personal injury" },
      { label: "location", value: "Cardiff / CF10" },
    ],
    mayWall: true, // its results sit behind a bot check for automated browsers (found 2026-11-07); a reported wall is a pass
  },
  {
    id: "avma",
    name: "AvMA accredited clinical negligence solicitors (England and Wales)",
    url: "https://my.avma.org.uk/find-a-solicitor/",
    goal: "Find specialist clinical negligence solicitors for a patient in Wales, near Cardiff.",
    criteria: [
      { label: "area of law", value: "clinical negligence / medical negligence" },
      { label: "location", value: "Cardiff / Wales / CF10" },
    ],
  },
  {
    id: "scot",
    name: "Law Society of Scotland: Find a Solicitor",
    url: "https://www.lawscot.org.uk/find-a-solicitor/",
    goal: "Find law firms that handle medical negligence claims for patients, near Edinburgh.",
    criteria: [
      { label: "area of law", value: "medical negligence / clinical negligence / accident and injury" },
      { label: "location", value: "Edinburgh / EH1" },
    ],
  },
  {
    id: "ni",
    name: "Law Society of Northern Ireland: Find a Solicitor",
    url: "https://www.lawsoc-ni.org/solicitors",
    goal: "Find solicitor firms that handle medical (clinical) negligence or personal injury claims, in Belfast.",
    criteria: [
      { label: "area of law", value: "clinical negligence / medical negligence / personal injuries" },
      { label: "location", value: "Belfast / BT1" },
    ],
  },
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** Real Chrome in new headless mode when installed (gets past more bot checks), else Playwright's Chromium. Always headless. */
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

function makeCtx(page: Page, tag: string): WorkerCtx & { stats: { actions: number } } {
  const stats = { actions: 0 };
  const note = Object.assign((s: string) => void s, {
    log: async (kind: string, text: string, extra: { detail?: string } = {}) => {
      console.log(`[${tag}] ${kind.padEnd(7)} ${text}`);
      if (extra.detail && process.env.VERBOSE) console.log(extra.detail.split("\n").map((l) => `[${tag}]          ${l}`).join("\n"));
    },
  });
  return { page, note, track: { bump: (k: "action" | "page") => void (k === "action" && stats.actions++) }, stats };
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
      const page = await context.newPage();
      const ctx = makeCtx(page, c.id);
      const t0 = Date.now();
      try {
        const r = await searchDirectory(ctx, { url: c.url, goal: c.goal, criteria: c.criteria, maxResults: 12, maxPages: 2 });
        const s = Math.round((Date.now() - t0) / 1000);
        const pass = r.ok ? r.results.length >= 3 : !!c.mayWall && r.outcome === "wall";
        return { c, r, s, pass, actions: ctx.stats.actions };
      } catch (e) {
        return { c, r: null, s: Math.round((Date.now() - t0) / 1000), pass: false, actions: ctx.stats.actions, err: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  await browser.close();

  console.log("\n================ RESULTS");
  for (const row of rows) {
    const { c, r } = row;
    console.log(`\n${row.pass ? "PASS" : "FAIL"}  ${c.name}  (${row.s}s, ${row.actions} actions)`);
    if (!r) {
      console.log(`  error: ${"err" in row ? row.err : "?"}`);
      continue;
    }
    console.log(`  outcome: ${r.outcome}; ${r.summary}`);
    console.log(`  searched with: ${r.searchedWith.map((u) => `${u.label}="${u.value}"`).join(", ") || "-"}`);
    if (r.wall) console.log(`  wall: ${r.wall.kind}: ${r.wall.detail}`);
    for (const x of r.results.slice(0, 12)) console.log(`  - ${x.name} | ${x.detail}${x.url ? ` | ${x.url}` : ""}${x.fields.registration ? ` | ${x.fields.registration}` : ""}`);
  }
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${rows.length - failed}/${rows.length} sites passed`);
  process.exit(failed ? 1 : 0);
}

void main();
