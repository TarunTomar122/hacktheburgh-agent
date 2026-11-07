import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { attachLiveView } from "./liveview";

// Some sites (e.g. SLAB) return 403 to Playwright's default user-agent.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export type Session = { browser: Browser; context: BrowserContext; page: Page };

/**
 * Launch Chromium. Set HEADLESS=1 for fast test runs.
 * Inside the web app (Next.js server) there is no separate window by default: the browser is only seen in the
 * in-app live view, with everything else as in a visible run (slow, watchable typing, kept open for review) (D32).
 * SHOW_BROWSER_WINDOW=1 brings the window back. CLI scripts keep the window unless IN_APP_BROWSER=1.
 * Every session streams to the live view unless LIVEVIEW=0.
 */
export async function openSession(): Promise<Session> {
  const fast = process.env.HEADLESS === "1";
  const inApp = process.env.SHOW_BROWSER_WINDOW !== "1" && (process.env.IN_APP_BROWSER === "1" || !!process.env.NEXT_RUNTIME);
  const headless = fast || inApp;
  const browser = await chromium.launch({ headless, slowMo: fast ? 0 : 250 });
  const context = await browser.newContext({
    locale: "en-GB",
    viewport: { width: 1300, height: 900 },
    userAgent: USER_AGENT,
  });
  // tsx/esbuild wraps named functions in a __name() helper that doesn't exist inside the page.
  await context.addInitScript("window.__name = (f) => f;");
  attachLiveView(context);
  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Dismiss a cookie banner if one appears. Prefers reject / necessary-only. Falls back to "accept" only when the
 * banner offers no way to refuse, because an unclosable banner blocks the page. Never fails if there is no banner.
 */
export async function dismissCookies(page: Page, waitMs = 6000): Promise<"rejected" | "accepted" | "none"> {
  const reject = /^\s*(reject( all| cookies)?|decline( all| cookies)?|refuse|deny|only (essential|necessary)( cookies)?|necessary( cookies)? only|i do not accept cookies|continue without accepting)\s*$/i;
  const accept = /^\s*(accept( all| all cookies| cookies| recommended settings)?|allow all( cookies)?|i agree|agree|ok|okay|got it|close)\s*$/i;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const buttons = page.locator("button, [role=button], a.button, input[type=button], input[type=submit]");
    const n = Math.min(await buttons.count(), 60);
    let fallback: ReturnType<typeof buttons.nth> | null = null;
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible().catch(() => false))) continue;
      const label = ((await b.innerText().catch(() => "")) || (await b.getAttribute("value").catch(() => "")) || "").trim();
      if (!label || label.length > 40) continue;
      const inBanner = await b
        .evaluate((el) => !!el.closest('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="ccc" i], [id*="onetrust" i], [class*="cc-" i], [aria-label*="cookie" i], [role=dialog]'))
        .catch(() => false);
      if (!inBanner) continue;
      if (reject.test(label)) {
        await b.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
        return "rejected";
      }
      if (accept.test(label)) fallback ??= b;
    }
    if (fallback) {
      await fallback.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      return "accepted";
    }
    await page.waitForTimeout(400);
  }
  return "none";
}
