import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { announceSubmitted, attachLiveView } from "./liveview";
import { installCursor } from "./agentCursor";
import { registerBrowser } from "./agent/runControl";

// Some sites (e.g. SLAB) return 403 to Playwright's default user-agent.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export type Session = { browser: Browser; context: BrowserContext; page: Page };

/**
 * Launch Chromium. Set HEADLESS=1 for fast test runs.
 * Inside the web app (Next.js server) there is no separate window by default: the browser is only seen in the
 * in-app live view, with everything else as in a visible run (slow, watchable typing, kept open for review).
 * SHOW_BROWSER_WINDOW=1 brings the window back. CLI scripts keep the window unless IN_APP_BROWSER=1.
 * Every session streams to the live view unless LIVEVIEW=0.
 */
export async function openSession(): Promise<Session> {
  const fast = process.env.HEADLESS === "1";
  const inApp = process.env.SHOW_BROWSER_WINDOW !== "1" && (process.env.IN_APP_BROWSER === "1" || !!process.env.NEXT_RUNTIME);
  const headless = fast || inApp;
  // BROWSER_CHANNEL=chrome: the installed Google Chrome instead of Playwright's Chromium. Some health sites refuse
  // headless Chromium with a 403 but serve real Chrome (Guy's and St Thomas', for one).
  const channel = process.env.BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch({ headless, slowMo: fast ? 0 : 250, channel });
  registerBrowser(browser); // a run the user stops closes its browsers
  const context = await browser.newContext({
    locale: "en-GB",
    viewport: { width: 1300, height: 900 },
    userAgent: USER_AGENT, // also for real Chrome: its headless mode says "HeadlessChrome", which search engines wall
    // RECORD_VIDEO=<dir>: a video of every tab, for recordings.
    ...(process.env.RECORD_VIDEO ? { recordVideo: { dir: process.env.RECORD_VIDEO, size: { width: 1300, height: 900 } } } : {}),
  });
  // tsx/esbuild wraps named functions in a __name() helper that doesn't exist inside the page.
  await context.addInitScript("window.__name = (f) => f;");
  await installCursor(context);
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
  const accept = /^\s*(accept( all| all cookies| cookies| recommended settings)?|allow( all)?( cookies)?|i agree|agree|ok|okay|got it|close)\s*$/i;
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

/** Words a site shows once a form has gone in. Checked only after the page has made a POST (see closeWhenSubmitted). */
const SUBMITTED_TEXT = /thank you for (your (complaint|feedback|enquiry|submission|report)|submitting|contacting|reporting)|(has|have) been (submitted|sent|received)|we have received|submission (is )?(complete|received)|(complaint|enquiry|feedback) (received|submitted)|submitted successfully|successfully (submitted|sent)|form (was |has been )?submitted/i;

/**
 * A filled form is left open so the user can check it and press Submit themselves. Close the browser once that
 * has happened: the page made a POST and now shows a confirmation that it did not show before. Also closes it when
 * the user closes the tab, or after maxMs, so a forgotten window never lingers. The agent never presses Submit.
 */
export function closeWhenSubmitted(page: Page, browser: Browser, opts: { maxMs?: number; lingerMs?: number; flow?: string } = {}) {
  const lingerMs = opts.lingerMs ?? 5000;
  let posted = false;
  let finished = false;
  let baseline: { url: string; match: string | null; ninja: string } | null = null;
  const done = (wait: number) => {
    if (finished) return;
    finished = true;
    clearInterval(poll);
    clearTimeout(limit);
    setTimeout(() => void browser.close().catch(() => {}), wait);
  };
  const read = async () => (await page.locator("body").innerText({ timeout: 2000 }).catch(() => "")) || "";
  // Ninja Forms (the NHS Lothian feedback form, WordPress) posts by AJAX and puts its success message in .nf-response-msg, worded by whoever built
  // the form ("Form submitted successfully." by default), so the wording cannot be matched. Seen 2026-11-08: the phrase list alone never fired there.
  const ninja = async () => (await page.evaluate(() => (document.querySelector(".nf-response-msg") as HTMLElement | null)?.innerText.trim() ?? "").catch(() => "")) || "";
  void Promise.all([read(), ninja()]).then(([t, n]) => (baseline = { url: page.url(), match: t.match(SUBMITTED_TEXT)?.[0] ?? null, ninja: n }));
  // Diagnostics: say the watch has started, and echo every button click and form submit that actually reaches the page, so
  // "no lines at all" can be told apart from "the click never arrived" (live-panel clicks are only forwarded in Take control mode).
  if (opts.flow) {
    const flow = opts.flow;
    console.log(`[submit-watch] ${flow}: watching for Submit on ${new URL(page.url()).host}`);
    page.on("console", (m) => {
      const t = m.text();
      if (t.startsWith("[submit-watch]")) console.log(t.replace("[submit-watch]", `[submit-watch] ${flow}:`));
    });
    const hook = `(() => {
      if (window.__submitWatch) return; window.__submitWatch = true;
      document.addEventListener("click", (e) => {
        const b = e.target && e.target.closest ? e.target.closest("button, input[type=submit], input[type=button], [role=button]") : null;
        if (b) console.log("[submit-watch] click reached the page: " + String(b.innerText || b.value || b.id || b.tagName).trim().slice(0, 40));
      }, true);
      document.addEventListener("submit", () => console.log("[submit-watch] form submit event"), true);
    })()`;
    void page.evaluate(hook).catch(() => {});
    void page.context().addInitScript(hook).catch(() => {}); // also after a reload or a new page in this tab
  }
  // Diagnostics: every POST is logged, with separate caps so a stream of analytics or captcha POSTs cannot use up the lines
  // before the user presses Submit (seen 2026-11-08: the NHS check needs the form's own POST, and the captcha one if any).
  let logged = 0;
  let loggedIgnored = 0;
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    // A POST to a captcha provider or an analytics service is not the form going in.
    const ignored = /recaptcha|gstatic|hcaptcha|turnstile|google-analytics|doubleclick|googletagmanager/i.test(r.url());
    if (opts.flow && (ignored ? loggedIgnored++ < 4 : logged++ < 10)) {
      const u = new URL(r.url());
      console.log(`[submit-watch] ${opts.flow}: POST ${u.host}${u.pathname}${ignored ? " (captcha/analytics, ignored)" : ""}`);
    }
    if (posted || ignored) return;
    posted = true;
    if (opts.flow) console.log(`[submit-watch] ${opts.flow}: the page made a POST, waiting for a confirmation`);
  });
  // Diagnostics: what the form says after the user presses Submit (errors included), printed whenever it changes.
  let lastNote = "";
  const note = async () => {
    const text = await page.evaluate(() => Array.from(document.querySelectorAll(".nf-response-msg, .nf-form-errors, .nf-error-msg, .nf-error-wrap .nf-error, [role=alert]")).map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean).join(" | ").slice(0, 200)).catch(() => "");
    if (opts.flow && text && text !== lastNote) console.log(`[submit-watch] ${opts.flow}: page shows "${text}"`);
    lastNote = text;
  };
  page.on("close", () => done(0));
  const poll = setInterval(async () => {
    if (finished || !baseline || page.isClosed()) return;
    await note();
    const hit = posted ? ((await read()).match(SUBMITTED_TEXT)?.[0] ?? null) : null;
    const message = await ninja();
    // A new, non-error message in the form's own response area is proof enough, even if the POST was not seen (it may have come from a frame).
    const ninjaDone = message !== "" && message !== baseline.ninja && !/error|fail|could not|unable|invalid|try again|please (correct|complete|fill)|required/i.test(message);
    if ((hit && (hit !== baseline.match || page.url() !== baseline.url)) || ninjaDone) {
      if (opts.flow && !finished) {
        console.log(`[submit-watch] ${opts.flow}: submitted (${ninjaDone ? `form message "${message.slice(0, 60)}"` : `page says "${hit}"`})`);
        announceSubmitted(opts.flow); // the app marks the step as sent and moves on, as if "I've pressed Submit" had been pressed
      }
      done(lingerMs);
    }
  }, 1500);
  const limit = setTimeout(() => done(0), opts.maxMs ?? 10 * 60 * 1000);
}

/**
 * Close every tab of this browser except the ones in `keep`, and close the browser itself as soon as the last tab
 * goes (or after maxMs). Used when only filled forms awaiting the user's approval should stay on screen.
 */
export async function keepOnlyTabs(context: BrowserContext, keep: Page[], maxMs = 15 * 60 * 1000) {
  const browser = context.browser();
  const closeIfEmpty = () => {
    if (context.pages().length === 0) void browser?.close().catch(() => {});
  };
  for (const p of context.pages()) p.on("close", () => setTimeout(closeIfEmpty, 0));
  for (const p of context.pages()) if (!keep.includes(p)) await p.close().catch(() => {});
  const t = setTimeout(() => void browser?.close().catch(() => {}), maxMs);
  t.unref?.();
  context.on("close", () => clearTimeout(t));
}
