// Headless browser check (night plan): a run survives going to the Profile tab and back, and a page reload.
//   npx tsx scripts/check-run-persistence-ui.ts      (dev server on BASE, default http://localhost:3001; screenshots in docs/night-runs/persistence-check/)
// Seeds a fictional profile, starts the discovery run from the screen, goes to Profile and back, reloads, and checks that
// the crew's run screen is showing each time (not the start screen). Stops the run at the end. Nothing is sent.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = "docs/night-runs/persistence-check";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};

(async () => {
  const facts = JSON.parse(readFileSync("scripts/personas/wales.json", "utf8"));
  const now = new Date().toISOString();
  const profile = { facts, messages: [], draft: null, createdAt: now, updatedAt: now };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", JSON.stringify(p));
      sessionStorage.setItem("seeded", "1");
    }
  }, profile);
  const onRunScreen = async () => (await page.getByText("Plan and history").count()) > 0;
  const onStartScreen = async () => (await page.getByRole("button", { name: "Work it out" }).count()) > 0;

  await page.goto(`${BASE}/case`);
  await page.getByRole("button", { name: "Work it out" }).click();
  await page.getByText("Plan and history").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(25_000); // let the crew get going
  await page.screenshot({ path: `${OUT}/1-running.png` });
  const says1 = await page.locator("main").innerText();
  check(await onRunScreen(), "run screen is showing after starting");

  await page.locator('button[title="Profile"]').click();
  await page.waitForTimeout(500);
  check(!(await onRunScreen()), "Profile tab is showing (run screen gone)");
  await page.screenshot({ path: `${OUT}/2-profile-tab.png` });
  await page.waitForTimeout(15_000); // the crew works on without the screen
  await page.locator('button[title="Profile"]').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/3-back-from-profile.png` });
  check(await onRunScreen(), "back from Profile: the running crew is showing");
  check(!(await onStartScreen()), "back from Profile: not the start screen");
  const says2 = await page.locator("main").innerText();
  check(says2.length >= says1.length * 0.8, "back from Profile: the crew's work so far is there (not reset)");

  await page.reload();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/4-after-reload.png` });
  check(await onRunScreen(), "after a page reload: the running crew is showing");
  check(!(await onStartScreen()), "after a page reload: not the start screen");
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("elliot-run"))));
  console.log("stored run pointer:", JSON.stringify(stored).slice(0, 300));

  // Stop the run (explicit cancel), like a restart would.
  const runId = (Object.values(stored)[0] ? JSON.parse(Object.values(stored)[0] as string).runId : "") as string;
  const c = await fetch(`${BASE}/api/agent/plan/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) });
  check(c.ok, `run ${runId} cancelled`);
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
