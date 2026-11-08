// Headless check: the research starts by itself right after onboarding (a fresh case), and never for an older case.
//   npx tsx scripts/check-research-autostart.ts   (dev server on BASE, default http://localhost:3001)
// The start request is intercepted and answered with nothing: no crew run happens.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { devLogin, seedAccount } from "./devLogin";

const BASE = process.env.BASE ?? "http://localhost:3001";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
async function visit(createdAt: string) {
  const facts = JSON.parse(readFileSync("scripts/personas/scotland.json", "utf8"));
  const profile = { facts: { ...facts, country: "United Kingdom", region: "Scotland" }, messages: [], draft: null, createdAt, updatedAt: createdAt };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await devLogin(page, BASE);
  await seedAccount(page, BASE, profile);
  const starts: string[] = [];
  await page.route("**/api/agent/plan", async (r) => {
    starts.push(JSON.parse(r.request().postData() ?? "{}").flow);
    await r.fulfill({ status: 200, contentType: "application/x-ndjson", body: "" });
  });
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p);
      sessionStorage.setItem("seeded", "1");
    }
  }, JSON.stringify(profile));
  await page.goto(`${BASE}/case`);
  const loader = await page.getByText("Starting the research").first().waitFor({ timeout: 3000 }).then(() => true, () => false);
  if (loader) await page.screenshot({ path: "docs/night-runs/research-autostart.png" });
  await page.waitForTimeout(4000);
  const first = starts.length;
  await page.reload();
  await page.waitForTimeout(3000);
  await browser.close();
  return { first, total: starts.length, flows: starts, loader };
}
(async () => {
  const fresh = await visit(new Date().toISOString());
  check(fresh.first === 1 && fresh.flows[0] === "discovery", `a fresh case starts the research by itself (${fresh.flows.join(", ") || "nothing started"})`);
  check(fresh.total === 1, "a reload does not start it again");
  check(fresh.loader, "a short 'Starting the research' screen shows first");
  const old = await visit(new Date(Date.now() - 60 * 60_000).toISOString());
  check(old.total === 0, "an older case waits for the button");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
