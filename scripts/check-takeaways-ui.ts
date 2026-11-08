// Headless check (night plan): the "what to know" route view, with a saved route, click to open a row. Nothing is run or sent.
//   npx tsx scripts/check-takeaways-ui.ts      (dev server on BASE, default http://localhost:3001; screenshots in docs/night-runs/takeaways/)
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = "docs/night-runs/takeaways";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
(async () => {
  const facts = JSON.parse(readFileSync("scripts/personas/wales.json", "utf8"));
  const route = JSON.parse(readFileSync("scripts/fixtures/route-takeaways.json", "utf8"));
  const now = new Date().toISOString();
  const profile = { facts, messages: [], draft: null, createdAt: now, updatedAt: now, route: { map: route, sample: false } };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  await page.addInitScript((p) => {
    localStorage.clear();
    localStorage.setItem("case-profile-v2", JSON.stringify(p));
  }, profile);
  await page.goto(`${BASE}/case`);
  await page.getByText("Complain to the health board first").waitFor({ timeout: 30_000 });
  check(true, "the plain headline is on the screen");
  check((await page.getByText("Not found in this research").count()) === 1, "missing parts are one quiet line");
  check((await page.getByText("You can take up to 12 months to raise").count()) === 0, "quotes hidden until opened");
  await page.screenshot({ path: `${OUT}/1-closed.png`, fullPage: true });
  await page.getByText("Complain to the health board first").click();
  await page.getByText("You can take up to 12 months to raise").waitFor({ timeout: 5000 });
  check(true, "clicking a row shows the quote and its source");
  check((await page.getByRole("link", { name: /gov\.wales/ }).count()) > 0, "the source is a link");
  await page.getByText("Legal aid probably won't pay").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/2-open.png`, fullPage: true });
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
