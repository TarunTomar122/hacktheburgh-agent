// Screenshots of Ailsa's demo screens from her recorded runs (demo playback: no crew run, nothing sent).
//   npx tsx scripts/shoot-ailsa.ts   (dev server on BASE; screenshots in docs/night-runs/ailsa-screens/)
import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { devLogin, seedAccount } from "./devLogin";

const BASE = process.env.BASE ?? "http://localhost:3001";
const shot = (p: Page, name: string) => p.screenshot({ path: `docs/night-runs/ailsa-screens/${name}.png`, fullPage: true });
(async () => {
  const facts = JSON.parse(readFileSync("scripts/personas/scotland.json", "utf8"));
  const created = new Date(Date.now() - 60 * 60_000).toISOString(); // an older case: nothing starts by itself
  const profile = { facts: { ...facts, country: "United Kingdom", region: "Scotland" }, messages: [], draft: null, createdAt: created, updatedAt: created };
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await devLogin(page, BASE);
  await seedAccount(page, BASE, profile);
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p);
      sessionStorage.setItem("seeded", "1");
    }
  }, JSON.stringify(profile));
  await page.goto(`${BASE}/case?step=research`);
  await page.getByText("Play a recorded run, fast").waitFor({ timeout: 30000 });
  await shot(page, "1-research-start");
  await page.getByText("Play a recorded run, fast").click();
  await page.waitForTimeout(6000);
  await shot(page, "2-research-running");
  await page.getByText("Plan and history").first().waitFor({ timeout: 120000 });
  await page.waitForFunction(() => document.body.innerText.includes("The crew has finished"), null, { timeout: 180000 }).catch(() => {});
  await shot(page, "3-research-done");
  await page.goto(`${BASE}/case?step=path`);
  await page.waitForTimeout(4000);
  await shot(page, "4-path");
  await page.goto(`${BASE}/case?step=3`);
  await page.waitForTimeout(3000);
  await shot(page, "5-case-start");
  const play = page.getByText("Play a recorded run, fast");
  if (await play.count()) {
    await play.click();
    await page.waitForTimeout(8000);
    await shot(page, "6-case-running");
    await page.waitForFunction(() => document.body.innerText.includes("Ready for you to check"), null, { timeout: 240000 }).catch(() => {});
    await shot(page, "7-case-done");
  }
  await b.close();
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
