// Headless check of the demo's "Use the recorded run": a live step (research or the case) is stopped and the recorded
// run for the same place plays instead, fast, with its browsers (tabs and screenshots) and its result.
//   npx tsx scripts/check-recorded-switch.ts [discovery|case]   (dev server on BASE, default http://localhost:3001)
// The live run is a real one for a few seconds; switching cancels it.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { devLogin, seedAccount } from "./devLogin";

const BASE = process.env.BASE ?? "http://localhost:3001";
const which = process.argv[2] === "discovery" ? "discovery" : "case";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
(async () => {
  const facts = JSON.parse(readFileSync("scripts/personas/scotland.json", "utf8"));
  let map: unknown = null;
  for (const l of readFileSync(".runs/discovery-2026-11-08T05-21-20-403Z/events.ndjson", "utf8").split("\n")) {
    try {
      const e = JSON.parse(l).e;
      if (e?.type === "discovery_result") map = e.result.route;
    } catch {}
  }
  const now = new Date().toISOString();
  const profile = which === "case" ? { facts, messages: [], draft: null, createdAt: now, updatedAt: now, route: { map, sample: false }, track: { chosen: "compensation" } } : { facts, messages: [], draft: null, createdAt: now, updatedAt: now };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await devLogin(page, BASE);
  await seedAccount(page, BASE, profile);
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p);
      sessionStorage.setItem("seeded", "1");
    }
  }, JSON.stringify(profile));
  await page.goto(`${BASE}/case?step=${which === "case" ? 3 : 1}`);
  const button = page.getByRole("button", { name: "Use the recorded run" });
  const shown = await button.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  check(shown, "a live run shows 'Use the recorded run'");
  if (!shown) {
    await page.screenshot({ path: `docs/night-runs/recorded-switch-${which}-fail.png` });
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(3000);
  const t0 = Date.now();
  await button.click();
  // The recorded browsers: tiles whose pictures are the run's screenshots.
  const tiles = page.locator('img[src*="/api/agent/step3/shot"]');
  const pics = await tiles.first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `docs/night-runs/recorded-switch-${which}-mid.png` });
  check(pics, `the recorded browsers show their screenshots (${await tiles.count()} pictures on screen)`);
  const done = which === "case" ? page.getByText(/Check and send \d+ enquir/).first() : page.getByText(/Your route|What to do next|Continue/).first();
  const finished = await done.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  const secs = Math.round((Date.now() - t0) / 1000);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/night-runs/recorded-switch-${which}-end.png` });
  check(finished, `the recorded run finishes on its result (${secs} s after the switch)`);
  check(secs <= 40, "and it takes 40 seconds or less");
  // Research moves on to "Choose a path" when it is done (as a live run does); the case screen keeps its browsers.
  if (which === "case") check((await tiles.count()) > 0, `the browsers stay on screen afterwards (${await tiles.count()} pictures)`);
  if (which === "case") {
    const pdf = page.getByRole("button", { name: "Download PDF" });
    check(await pdf.isVisible().catch(() => false), "'Download PDF' shows at the top of the finished case");
    const dl = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
    await pdf.click().catch(() => {});
    const file = await dl;
    check(!!file && /\.pdf$/.test(file.suggestedFilename()), `and it downloads the case bundle (${file?.suggestedFilename() ?? "no download"})`);
    // No failed browser ("Took too long") is shown among the tiles.
    check((await page.getByText("Took too long").count()) === 0, "no failed browser tiles are shown");
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
