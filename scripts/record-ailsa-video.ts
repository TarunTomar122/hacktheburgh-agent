// A video of Ailsa's demo, from her recorded runs (no crew run, nothing sent): home, research, path, the case, the judges' page.
//   npx tsx scripts/record-ailsa-video.ts   (dev server on BASE; writes docs/night-runs/video/ailsa-demo.mp4)
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { devLogin, seedAccount } from "./devLogin";

const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = "docs/night-runs/video";
const pause = (p: Page, ms: number) => p.waitForTimeout(ms);
async function glide(p: Page, to: number, ms = 2500) {
  const steps = 25;
  const from = await p.evaluate(() => (document.querySelector("main") as HTMLElement | null)?.scrollTop ?? window.scrollY);
  for (let i = 1; i <= steps; i++) {
    const y = from + ((to - from) * i) / steps;
    await p.evaluate((v) => {
      const m = document.querySelector("main") as HTMLElement | null;
      if (m && m.scrollHeight > m.clientHeight) m.scrollTop = v;
      else window.scrollTo(0, v);
    }, y);
    await p.waitForTimeout(ms / steps);
  }
}
(async () => {
  const facts = JSON.parse(readFileSync("scripts/personas/scotland.json", "utf8"));
  const created = new Date(Date.now() - 60 * 60_000).toISOString();
  const profile = { facts: { ...facts, country: "United Kingdom", region: "Scotland" }, messages: [], draft: null, createdAt: created, updatedAt: created };
  rmSync(`${OUT}/raw`, { recursive: true, force: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: `${OUT}/raw`, size: { width: 1440, height: 900 } } });
  const page = await context.newPage();
  await devLogin(page, BASE);
  await seedAccount(page, BASE, profile);
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("case-profile-v2", p);
      sessionStorage.setItem("seeded", "1");
    }
  }, JSON.stringify(profile));

  // Home
  await page.goto(`${BASE}/`);
  await pause(page, 3500);
  await glide(page, 900, 3000);
  await pause(page, 1500);

  // Research, played back from her recorded run
  await page.goto(`${BASE}/case?step=research`);
  await page.getByText("Play a recorded run, fast").waitFor({ timeout: 60000 });
  await pause(page, 1500);
  await page.getByText("Play a recorded run, fast").click();
  await page.waitForURL(/step=path/, { timeout: 240000 }).catch(() => {});
  await pause(page, 2500);
  await glide(page, 700, 3000);

  // Choose the compensation path
  const cont = page.getByRole("button", { name: /Continue: claim compensation/i });
  if (await cont.count()) await cont.click();
  else await page.getByRole("button", { name: /Choose this instead/ }).click().catch(() => {});
  await pause(page, 3000);

  // Prepare your case, played back
  if (!/step=3/.test(page.url())) await page.goto(`${BASE}/case?step=3`);
  const play = page.getByText("Play a recorded run, fast");
  await play.waitFor({ timeout: 60000 }).catch(() => {});
  if (await play.count()) {
    await play.click();
    await page.waitForFunction(() => document.body.innerText.includes("Ready for you to check"), null, { timeout: 300000 }).catch(() => {});
    await pause(page, 2500);
    await page.getByRole("button", { name: /Enquiries/ }).first().click().catch(() => {});
    await pause(page, 2500);
    await glide(page, 1400, 3500);
    await pause(page, 2000);
  }

  // The judges' page
  await page.goto(`${BASE}/insights`);
  await page.getByText("Four models, one crew").first().waitFor({ timeout: 90000 }).catch(() => {});
  await pause(page, 2000);
  for (const y of [900, 1800, 2700, 3600]) {
    await glide(page, y, 2500);
    await pause(page, 1200);
  }
  await context.close();
  await browser.close();
  const raw = readdirSync(`${OUT}/raw`).find((f) => f.endsWith(".webm"))!;
  renameSync(`${OUT}/raw/${raw}`, `${OUT}/ailsa-demo.webm`);
  rmSync(`${OUT}/raw`, { recursive: true, force: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${OUT}/ailsa-demo.webm`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "26", `${OUT}/ailsa-demo.mp4`]);
  console.log(`${OUT}/ailsa-demo.mp4`);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
