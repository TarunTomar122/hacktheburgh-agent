import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// Some sites (e.g. SLAB) return 403 to Playwright's default user-agent.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export type Session = { browser: Browser; context: BrowserContext; page: Page };

/** Launch a visible Chromium window. Set HEADLESS=1 for fast test runs. */
export async function openSession(): Promise<Session> {
  const headless = process.env.HEADLESS === "1";
  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 250 });
  const context = await browser.newContext({
    locale: "en-GB",
    viewport: { width: 1300, height: 900 },
    userAgent: USER_AGENT,
  });
  // tsx/esbuild wraps named functions in a __name() helper that doesn't exist inside the page.
  await context.addInitScript("window.__name = (f) => f;");
  const page = await context.newPage();
  return { browser, context, page };
}

/** Reject cookies if a known banner appears; never fail if there isn't one. */
export async function dismissCookies(page: Page, waitMs = 6000): Promise<void> {
  const selector = [
    "#ccc-reject-settings", // Civic Cookie Control (Law Society)
    'button:has-text("Reject cookies")', // GMC
  ].join(", ");
  const el = page.locator(selector).first();
  try {
    await el.waitFor({ state: "visible", timeout: waitMs });
    await el.click({ timeout: 3000 });
    await page.locator("#ccc-overlay").waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
  } catch {
    // no banner appeared
  }
}
