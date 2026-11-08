// Headless check: browser tiles stay on the crew screen after each tab closes and after the run ends.
//   npx tsx scripts/check-tiles-persist.ts   (dev server on BASE, default http://localhost:3001)
// Uses the development fixture (app/api/dev/live-fixture): three tabs on this app's own pages. No crew run, no outside site.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
(async () => {
  const RUN = ".runs/discovery-2026-11-08T05-21-20-403Z";
  const facts = JSON.parse(readFileSync("scripts/personas/scotland.json", "utf8"));
  let terminal: unknown = null;
  let runId = "";
  for (const l of readFileSync(`${RUN}/events.ndjson`, "utf8").split("\n")) {
    try {
      const e = JSON.parse(l).e;
      if (e?.type === "run") runId = e.runId;
      if (e?.type === "discovery_result") terminal = e;
    } catch {}
  }
  const result = (terminal as { result: { route: unknown } }).result;
  const created = new Date(Date.now() - 60 * 60_000).toISOString();
  const profile = { facts, messages: [], draft: null, createdAt: created, updatedAt: created, route: { map: result.route, sample: false } };
  const stored = { runId, flow: "discovery", startedAt: Date.now() - 60000, status: "done", seen: true, endedAt: Date.now(), terminal };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page.addInitScript(([p, k, s]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p as string);
      localStorage.setItem(k as string, s as string);
      sessionStorage.setItem("seeded", "1");
    }
  }, [JSON.stringify(profile), `elliot-run-v1:${created}:discovery`, JSON.stringify(stored)]);
  await page.goto(`${BASE}/case?step=research`);
  await page.locator("#live-slot").waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(2000); // the live stream connects
  await page.evaluate((b) => fetch(`${b}/api/dev/live-fixture`, { method: "POST" }), BASE);
  const tiles = () => page.locator('#live-slot [title^="Watch "][title$=" up close"]').count();
  await page.waitForTimeout(6000);
  const during = await tiles();
  check(during >= 3, `three tiles while the tabs are open (${during})`);
  await page.waitForTimeout(3500); // two tabs closed by now
  const mid = await tiles();
  check(mid >= 3, `tiles stay as each tab closes (${mid})`);
  await page.waitForTimeout(6000); // all closed and the browser gone
  const after = await tiles();
  check(after >= 3, `tiles stay after the run ends (${after})`);
  await page.locator("#live-slot").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/night-runs/tiles-persist.png", fullPage: true });
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
