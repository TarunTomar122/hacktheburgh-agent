import type { Page } from "playwright";

/**
 * Headless checks sign in first when accounts are on (Auth0 keys in .env.local): the test-only dev login (DEV_LOGIN=1)
 * sets a cookie for this browser. With accounts off, /dev-login answers 404 and nothing changes.
 */
export async function devLogin(page: Page, base: string) {
  const r = await page.request.get(`${base}/dev-login`, { maxRedirects: 0 }).catch(() => null);
  if (!r || r.status() === 404) return;
  const set = r.headers()["set-cookie"] ?? "";
  const m = /dev-login=([^;]+)/.exec(set);
  if (m) await page.context().addCookies([{ name: "dev-login", value: m[1], url: base }]);
}

/**
 * With accounts on, the saved case comes from the account (and a deletion there clears the browser's copy), so a check that
 * seeds a case in the browser also saves it to the account. No-op when accounts or saving are off.
 */
export async function seedAccount(page: Page, base: string, profile: { updatedAt?: string }) {
  await page.request.put(`${base}/api/profile`, { data: { profile, updatedAt: profile.updatedAt ?? new Date().toISOString() } }).catch(() => null);
}
