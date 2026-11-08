// Headless check: when a crew member asks something, their browser window opens with the question, and the top of the
// window (name, Close, the question) is on screen even in a short window. Uses the dev-only local fixture tabs: no crew run.
//   npx tsx scripts/check-ask-window.ts
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
  const created = new Date(Date.now() - 60 * 60_000).toISOString();
  const profile = { facts, messages: [], draft: null, createdAt: created, updatedAt: created, route: { map: (terminal as { result: { route: unknown } }).result.route, sample: false } };
  const stored = { runId, flow: "discovery", startedAt: Date.now() - 60000, status: "done", seen: true, endedAt: Date.now(), terminal };
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ viewport: { width: 1280, height: 700 } });
  await devLogin(page, BASE);
  await seedAccount(page, BASE, profile);
  await page.addInitScript(([p, k, s]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p as string);
      localStorage.setItem(k as string, s as string);
      sessionStorage.setItem("seeded", "1");
    }
  }, [JSON.stringify(profile), `elliot-run-v1:${created}:discovery`, JSON.stringify(stored)]);
  await page.goto(`${BASE}/case?step=research`);
  await page.locator("#live-slot").waitFor({ state: "attached", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate((base) => fetch(`${base}/api/dev/live-fixture`, { method: "POST" }), BASE);
  await page.waitForTimeout(4500); // the fixture tabs are open
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("live-ask", { detail: { id: "t1", crew: "kit", question: "Yellow Card asks you to agree to this before the report goes on: \"The information provided in your report will be handled in line with our Privacy Policy. Please confirm that you understand this policy.\"", why: "Only you can agree to this.", kind: "yes_no", options: [] } })));
  const q = page.getByTestId("browser-question");
  const shown = await q.waitFor({ timeout: 8000 }).then(() => true, () => false);
  check(shown, "the question opens with Kit's browser");
  if (shown) {
    const box = await q.boundingBox();
    const close = await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().boundingBox();
    check(!!box && box.y >= 0 && box.y < 700, `the question is on screen (top at ${Math.round(box?.y ?? -1)} px)`);
    check(!!close && close.y >= 0, `the window's top (Close) is on screen (at ${Math.round(close?.y ?? -1)} px)`);
    await page.screenshot({ path: "docs/night-runs/ask-window.png" });
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
