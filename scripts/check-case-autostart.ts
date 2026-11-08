// Headless check: "Prepare your case" starts by itself the first time (after choosing the path), once per case.
//   npx tsx scripts/check-case-autostart.ts   (dev server on BASE, default http://localhost:3001)
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
  const profile = { facts, messages: [], draft: null, createdAt: now, updatedAt: now, route: { map, sample: false }, track: { chosen: "compensation" } };
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
  await page.goto(`${BASE}/case?step=3`);
  const loader = await page.getByText("Preparing your case").first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (loader) await page.screenshot({ path: "docs/night-runs/case-autostart.png" });
  await page.waitForTimeout(4000);
  check(loader, "a short 'Preparing your case' screen shows first");
  check(starts.length === 1 && starts[0] === "compensation_anywhere", `then the case starts by itself (${starts.join(", ") || "nothing started"})`);
  await page.reload();
  await page.waitForTimeout(4000);
  check(starts.length === 1, "a reload does not start it again");
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
