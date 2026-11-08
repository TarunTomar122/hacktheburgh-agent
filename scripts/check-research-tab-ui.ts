// Headless check: the Research tab keeps the crew's view (history + result) after the research is done, also after a reload.
//   npx tsx scripts/check-research-tab-ui.ts   (dev server on BASE, default http://localhost:3001; screenshot in docs/night-runs/takeaways/)
// Seeds a saved route and the finished run's stored result from a real run's events file. Nothing is run or sent.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
const RUN = process.env.RUN ?? ".runs/discovery-2026-11-08T05-21-20-403Z";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
(async () => {
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
  const now = new Date().toISOString();
  const profile = { facts, messages: [], draft: null, createdAt: now, updatedAt: now, route: { map: result.route, sample: false } };
  const stored = { runId, flow: "discovery", startedAt: Date.now() - 60000, status: "done", seen: true, endedAt: Date.now(), terminal };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.addInitScript(([p, k, s]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p as string);
      localStorage.setItem(k as string, s as string);
      sessionStorage.setItem("seeded", "1");
    }
  }, [JSON.stringify(profile), `elliot-run-v1:${now}:discovery`, JSON.stringify(stored)]);
  await page.goto(`${BASE}/case?step=research`);
  await page.getByText("Plan and history").first().waitFor({ timeout: 30_000 });
  check(true, "the crew's history is on the Research tab after the research");
  check((await page.getByText("How it works where you live").count()) > 0, "and the result is beside it");
  await page.screenshot({ path: "docs/night-runs/takeaways/3-research-tab.png", fullPage: true });
  await page.reload();
  await page.getByText("Plan and history").first().waitFor({ timeout: 30_000 });
  check(true, "still there after a reload");
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
