// Headless check: every onboarding question has a "Demo fill" button that fills it (nothing is skipped or sent for us), then OK moves on.
// Walks /start to the "All done" screen. The interview model is called for real (a few cheap calls).
//   npx tsx --env-file=.env.local scripts/check-demo-fill.ts      (dev server on BASE, default http://localhost:3001; screenshots in docs/night-runs/demo-fill/)
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = "docs/night-runs/demo-fill";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};

// Which question is open: the heading, the "2 of 6" counter and the field's label (buttons and filled-in controls are left out on purpose).
const screen = async (page: Page) => (await page.locator("main h1, main .eyebrow, main p.font-serif, main label.block").allInnerTexts()).join(" | ").replace(/\s+/g, " ");

/** What the open question holds right now, as a short description, or "" if nothing is filled. */
async function filled(page: Page): Promise<string> {
  const values = await page.locator("main input:not([type=checkbox]), main textarea, main select").evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value).filter((v) => v.trim() !== ""),
  );
  const ticked = await page.locator("main input[type=checkbox]:checked").count();
  const pressed = await page.locator("main [aria-pressed=true]").evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ""));
  // The three date-mode buttons are always one pressed; only count pressed choices that are not those.
  const choices = pressed.filter((t) => !["I know the date", "Month and year", "In my own words"].includes(t));
  return [...values, ticked ? `${ticked} ticked` : "", ...choices].filter(Boolean).join(" | ");
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${BASE}/start`);
  await page.locator("#name-field").waitFor();

  for (let step = 1; step <= 14; step++) {
    if (await page.getByText("All done", { exact: true }).isVisible()) break;
    const demo = page.getByRole("button", { name: "Demo fill" });
    await demo.waitFor({ timeout: 90_000 });
    const label = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ").slice(0, 60);
    const before = await screen(page);
    const empty = await filled(page);
    await page.waitForTimeout(700); // the question fades in
    await page.screenshot({ path: `${OUT}/${String(step).padStart(2, "0")}-a-before.png` });
    await demo.click();
    const after = await filled(page);
    check(after !== "" && after !== empty, `step ${step} (${label}) demo fill put in: ${after.replace(/\n/g, " ")}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${String(step).padStart(2, "0")}-b-filled.png` });
    // A demo fill must not have gone on by itself.
    await page.waitForTimeout(400);
    check((await screen(page)) === before, `step ${step} stayed on the same question until OK`);
    await page.getByRole("button", { name: /^OK$/ }).click();
    // Wait for the next question (or the summary): the screen changes and nothing is busy any more.
    await page.waitForFunction(
      (b) => {
        const t = [...document.querySelectorAll("main h1, main .eyebrow, main p.font-serif, main label.block")].map((e) => (e as HTMLElement).innerText).join(" | ").replace(/\s+/g, " ");
        return t !== b && !document.body.innerText.includes("One moment");
      },
      before,
      { timeout: 90_000 },
    );
  }

  await page.getByText("All done", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Working out where your care was"), null, { timeout: 30_000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/99-all-done.png`, fullPage: true });
  const summary = await page.locator("main").innerText();
  for (const label of ["Name", "Where it happened", "What happened", "Timeline", "What you'd like", "Contact"]) {
    check(summary.toLowerCase().includes(label.toLowerCase()), `All done shows "${label}"`);
  }
  console.log("---- summary ----\n" + summary);
  await browser.close();
  if (failed) process.exit(1);
})();
