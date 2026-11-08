// Headless check: the finished Prepare-your-case board offers "Download the case bundle (PDF)" and the click downloads a PDF.
//   npx tsx scripts/check-case-bundle-ui.ts   (dev server on BASE, default http://localhost:3001)
// No crew run and no live web: the start request is answered from a recorded run's saved events (demo/step3-2026-11-08T08-20-36-382Z-5jza).
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { devLogin, seedAccount } from "./devLogin";
import { ailsaProfile } from "./caseBundleFixture";

const BASE = process.env.BASE ?? "http://localhost:3001";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
(async () => {
  const full = ailsaProfile();
  // The case before the run: her story and the route map only (no result yet), so the board is what shows.
  const start = { ...full, legalAid: undefined, enquiry: undefined, caseRun: undefined };
  const profile = { ...start, track: { chosen: "compensation" as const } };
  const events = readFileSync("demo/step3-2026-11-08T08-20-36-382Z-5jza/events.ndjson", "utf8")
    .split("\n")
    .flatMap((l) => {
      try {
        return [JSON.stringify(JSON.parse(l).e)];
      } catch {
        return [];
      }
    })
    .join("\n");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await devLogin(page, BASE);
  await seedAccount(page, BASE, profile);
  let bundleRequests = 0;
  await page.route("**/api/agent/plan", (r) => r.fulfill({ status: 200, contentType: "application/x-ndjson", body: events + "\n" }));
  page.on("request", (r) => {
    if (r.url().endsWith("/api/case/bundle")) bundleRequests++;
  });
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p);
      sessionStorage.setItem("seeded", "1");
    }
  }, JSON.stringify(profile));
  await page.goto(`${BASE}/case?step=3`);
  const button = page.getByRole("button", { name: "Download the case bundle (PDF)" });
  const shown = await button.waitFor({ timeout: 20000 }).then(() => true, () => false);
  check(shown, "the board shows 'Download the case bundle (PDF)' once the case is done");
  if (shown) {
    mkdirSync("docs/night-runs/case-bundle", { recursive: true });
    await page.locator('section[aria-label="Your case"]').last().screenshot({ path: "docs/night-runs/case-bundle/board-button.png" });
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), button.click()]);
    const path = await download.path();
    const bytes = readFileSync(path);
    check(download.suggestedFilename() === "case-bundle-ms-ailsa-reid.pdf", `it downloads as ${download.suggestedFilename()}`);
    check(bytes.subarray(0, 5).toString("latin1") === "%PDF-", "the downloaded file is a PDF");
    check(bundleRequests === 1, "one request to /api/case/bundle");
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
