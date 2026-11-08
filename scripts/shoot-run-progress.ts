// Headless screenshots of the run header's progress (percentage + bar) during recorded-run playback. Never runs a real agent.
// Usage: TEST_APP_URL=http://localhost:3001 npx tsx scripts/shoot-run-progress.ts [discovery|complaint|compensation]...
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";
import { SAMPLE_FACTS, SAMPLE_DRAFT } from "../lib/agent/sample";
import { EMPTY_FUNDING } from "../lib/agent/legalAidTypes";

const BASE = process.env.TEST_APP_URL ?? "http://localhost:3001";
const OUT = "docs/night-runs/progress-ui";
const flows = process.argv.slice(2).length ? process.argv.slice(2) : ["compensation", "complaint", "discovery"];

/** The route map of the recorded Scotland discovery, so the complaint screen has one to work from. */
function recordedRoute() {
  const dir = readdirSync("demo").filter((d) => d.startsWith("discovery-")).sort().at(-1)!;
  const last = readFileSync(`demo/${dir}/events.ndjson`, "utf8").trim().split("\n").at(-1)!;
  return JSON.parse(last).e.result.route;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  for (const flow of flows) {
    for (const reduced of flow === "complaint" ? [false, true] : [false]) {
      const page = await browser.newPage({ viewport: { width: 1300, height: 760 }, reducedMotion: reduced ? "reduce" : "no-preference" });
      await page.addInitScript("window.__name = (f) => f;");
      const now = new Date().toISOString();
      const base = { facts: SAMPLE_FACTS, draft: SAMPLE_DRAFT, messages: [], createdAt: now, updatedAt: now };
      const profile =
        flow === "discovery" ? base
        : flow === "complaint" ? { ...base, route: { map: recordedRoute(), sample: true }, track: { chosen: "complaint" } }
        : { ...base, route: { skipped: true }, track: { chosen: "compensation" }, legalAid: { funding: EMPTY_FUNDING } };
      await page.addInitScript((p) => localStorage.setItem("case-profile-v2", JSON.stringify(p)), profile);
      await page.goto(`${BASE}/case`);
      await page.getByRole("button", { name: "Play a recorded run, fast" }).click({ timeout: 30000 });
      const bar = page.getByRole("progressbar");
      await bar.waitFor();
      const header = page.locator("section").filter({ has: bar });
      const tag = `${flow}${reduced ? "-reduced-motion" : ""}`;
      const targets = [3, 20, 40, 60, 80];
      let t = 0;
      const series: string[] = [];
      const t0 = Date.now();
      let last = -1;
      for (;;) {
        // The header is replaced by the finished screen once the result arrives: that is the 100% moment.
        const v = (await bar.count()) ? Number(await bar.getAttribute("aria-valuenow", { timeout: 2000 }).catch(() => "100")) : 100;
        if (v !== last) {
          series.push(`${((Date.now() - t0) / 1000).toFixed(1)}s:${v}`);
          if (v < last) throw new Error(`progress went backwards ${last} -> ${v}`);
          last = v;
        }
        if (t < targets.length && v >= targets[t]) {
          const shot = async () => {
            await header.screenshot({ path: `${OUT}/${tag}-${String(v).padStart(3, "0")}.png`, timeout: 3000 });
            if (t === 2) await page.screenshot({ path: `${OUT}/${tag}-${String(v).padStart(3, "0")}-page.png` });
          };
          await shot().catch(() => {}); // the run may have just finished
          while (t < targets.length && v >= targets[t]) t++;
        }
        if (v >= 100 || Date.now() - t0 > 400_000) break;
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${tag}-final.png` });
      console.log(`${tag}: ${series.length} changes in ${((Date.now() - t0) / 1000).toFixed(0)}s, ends ${last}\n  ${series.join(" ")}`);
      await page.close();
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
