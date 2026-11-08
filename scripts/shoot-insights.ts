// Screenshot the judges' dashboard: npx tsx scripts/shoot-insights.ts (dev server on BASE, default :3001)
import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await p.goto(`${process.env.BASE ?? "http://localhost:3001"}/insights`);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "docs/night-runs/insights/dashboard.png", fullPage: true });
  for (const [i, y] of [0, 1000, 2000, 3000].entries()) {
    await p.evaluate((top) => window.scrollTo(0, top), y);
    await p.screenshot({ path: `docs/night-runs/insights/part-${i + 1}.png` });
  }
  await b.close();
})();
