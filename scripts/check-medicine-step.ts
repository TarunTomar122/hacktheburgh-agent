// Headless check: the optional "Report a medicine problem" step shows for a story with a medicine, and not without one.
//   npx tsx scripts/check-medicine-step.ts   (dev server on BASE; no crew run is started)
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { devLogin, seedAccount } from "./devLogin";

const BASE = process.env.BASE ?? "http://localhost:3001";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
const route = JSON.parse(readFileSync(".runs/discovery-2026-11-08T08-19-55-240Z-b0sc/route.json", "utf8"));
async function visit(facts: unknown, shot?: string) {
  const created = new Date(Date.now() - 60 * 60_000).toISOString();
  const profile = { facts, messages: [], draft: null, createdAt: created, updatedAt: created, route: { map: route, sample: false }, track: { chosen: "compensation" } };
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await devLogin(page, BASE);
  await seedAccount(page, BASE, profile);
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p);
      sessionStorage.setItem("seeded", "1");
    }
  }, JSON.stringify(profile));
  await page.goto(`${BASE}/case?step=3`);
  await page.getByText("Prepare your case").first().waitFor({ timeout: 30000 }).catch(() => {});
  const tab = await page.getByRole("button", { name: /Report a medicine problem/ }).count();
  let intro = false;
  if (tab) {
    await page.getByRole("button", { name: /Report a medicine problem/ }).click();
    intro = await page.getByRole("button", { name: "Prepare the report" }).waitFor({ timeout: 15000 }).then(() => true, () => false);
    if (shot) await page.screenshot({ path: shot });
  }
  await b.close();
  return { tab, intro };
}
(async () => {
  const withMed = JSON.parse(readFileSync("scripts/personas/scotland.json", "utf8"));
  const a = await visit({ ...withMed, country: "United Kingdom", region: "Scotland" }, "docs/night-runs/medicine-step.png");
  check(a.tab > 0, "a story with a medicine shows the 'Report a medicine problem' step");
  check(a.intro, "it opens the step with its own crew and a 'Prepare the report' button");
  const noMed = JSON.parse(readFileSync("scripts/personas/england.json", "utf8"));
  const b = await visit({ ...noMed, country: "United Kingdom", region: "England" });
  check(b.tab === 0, "a story without a medicine does not show it");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
