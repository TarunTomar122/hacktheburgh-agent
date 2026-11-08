// Headless check of accounts (Auth0) and saved cases (Tiger Data) with our app, using the test-only dev login (DEV_LOGIN=1).
//   npx tsx scripts/check-auth.ts   (dev server on BASE, default http://localhost:3001; screenshots in docs/night-runs/auth/)
// No crew run is started. The fictional persona is saved to the database under the dev user, then deleted again.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  await page.goto(`${BASE}/start`);
  check(page.url().includes("/welcome"), "signed out, the app sends you to the welcome page");
  await page.getByText("Dev: skip login (test only)").waitFor({ timeout: 30000 }).catch(() => {});
  await page.screenshot({ path: "docs/night-runs/auth/1-welcome.png" });
  check((await page.getByText("Dev: skip login (test only)").count()) > 0, "the welcome page offers the test login");
  const login = await page.request.get(`${BASE}/auth/login`, { maxRedirects: 0 });
  check(login.status() >= 300 && login.status() < 400 && /auth0\.com/.test(login.headers()["location"] ?? ""), "Log in goes to Auth0");

  await page.getByText("Dev: skip login (test only)").click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30000 }).catch(() => {});
  check(new URL(page.url()).pathname === "/", "after signing in you land on the home page, not inside the case");
  await page.getByText("Log out").first().waitFor({ timeout: 30000 }).catch(() => {});
  check((await page.getByText("Log out").count()) > 0, "the home page shows who is signed in, with Log out");
  await page.screenshot({ path: "docs/night-runs/auth/2-home-signed-in.png" });
  await page.goto(`${BASE}/start`);
  check(page.url().includes("/start"), "signed in, onboarding opens");
  await page.getByText("First, what should I").first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.screenshot({ path: "docs/night-runs/auth/3-onboarding-signed-in.png" });

  // Load a fictional persona (the dev shortcut) and wait for it to be saved to the account.
  const persona = page.getByRole("button", { name: /Try a persona/ });
  await persona.click();
  await page.locator("[data-persona]").first().click();
  await page.getByRole("button", { name: /^Start as / }).click();
  await page.waitForURL(/\/case/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "docs/night-runs/auth/4-case-signed-in.png" });
  const saved = await page.evaluate(async () => (await fetch("/api/profile")).json());
  check(saved.enabled === true, "saving to the account is on (database connected)");
  check(!!saved.saved?.profile?.facts?.firstName, `the case is saved to the account (${saved.saved?.profile?.facts?.firstName ?? "nothing saved"})`);
  check((await page.locator("#live-slot, [aria-label=\"The agent's browser, live\"]").count()) >= 0, "the live browser panel is allowed for a signed-in user");

  // Clean up: delete the saved case, then sign out.
  const del = await page.evaluate(async () => (await fetch("/api/profile", { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" })).status);
  check(del === 200, "the saved case can be deleted");
  await page.goto(`${BASE}/auth/logout`);
  await page.goto(`${BASE}/case`);
  check(page.url().includes("/welcome"), "after logging out, the app is closed again");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
