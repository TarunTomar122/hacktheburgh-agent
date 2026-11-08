// Screenshot the judges' dashboard: npx tsx scripts/shoot-insights.ts (dev server on BASE, default :3001)
import { chromium } from "playwright";
import { devLogin } from "./devLogin";
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const base = process.env.BASE ?? "http://localhost:3001";
  await devLogin(p, base);
  await p.goto(`${base}/insights`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await p.getByText("How the crew did it").first().waitFor({ timeout: 90_000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "docs/night-runs/insights/dashboard.png", fullPage: true });
  for (const [i, y] of [0, 1000, 2000, 3000].entries()) {
    await p.evaluate((top) => window.scrollTo(0, top), y);
    await p.screenshot({ path: `docs/night-runs/insights/part-${i + 1}.png` });
  }
  await b.close();
})();
