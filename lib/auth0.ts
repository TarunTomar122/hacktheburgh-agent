import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { cookies } from "next/headers";

/**
 * Sign-up and log-in with Auth0 (D74). Auth is ON when all four Auth0 settings are present and AUTH_DISABLED is not 1.
 * With none of them set the app runs open, exactly as before, so a missing key or a dead Wi-Fi cannot stop a demo.
 * Settings: AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET (see .env.example). APP_BASE_URL is optional:
 * without it the SDK uses the address the request came to.
 */
export function authEnabled(): boolean {
  if (process.env.AUTH_DISABLED === "1") return false;
  return ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_SECRET"].every((k) => !!process.env[k]?.trim());
}

let client: Auth0Client | null = null;

/** The SDK client, made on first use. Only call it when authEnabled() is true: it refuses to start without its settings. */
export function getAuth0(): Auth0Client {
  // In dev, next.config.ts sets DEV_BOOT_ID afresh on every start, so the old session cookie no longer decrypts after a restart and the
  // app opens on the login page (D77). Without it (production, or AUTH0_KEEP_SESSIONS=1) the key is just AUTH0_SECRET.
  const boot = process.env.DEV_BOOT_ID;
  client ??= new Auth0Client(boot && process.env.AUTH0_SECRET ? { secret: `${process.env.AUTH0_SECRET}:${boot}` } : undefined);
  return client;
}

/**
 * Test-only login bypass (D78): a "Dev: skip login" link on /welcome signs you in as a fixed fake user (sub "dev|local") without Auth0.
 * Off unless DEV_LOGIN=1 is set (in .env.local), and never in a production build. The cookie is only valid for the dev server that set it,
 * so restarting `npm run dev` signs you out like a real session (D77). Do not set DEV_LOGIN=1 on anything reachable from the internet.
 */
export const DEV_COOKIE = "dev-login";
export const devLoginOn = () => process.env.DEV_LOGIN === "1" && process.env.NODE_ENV !== "production";
export const devCookieValue = () => process.env.DEV_BOOT_ID ?? "dev";
export const devCookieOk = (value: string | undefined) => devLoginOn() && value === devCookieValue();

export type SessionUser = { sub: string; name: string | null; email: string | null };

/** The signed-in user (a real Auth0 session, or the dev bypass), or null. Reads cookies, so call it inside <Suspense> or a route. */
export async function sessionUser(): Promise<SessionUser | null> {
  if (!authEnabled()) return null;
  if (devCookieOk((await cookies()).get(DEV_COOKIE)?.value)) return { sub: "dev|local", name: "Dev tester", email: process.env.DEV_LOGIN_EMAIL?.trim() || "dev@example.invalid" };
  const user = (await getAuth0().getSession())?.user;
  if (!user?.sub) return null;
  return { sub: user.sub, name: user.name ?? user.email ?? null, email: typeof user.email === "string" ? user.email : null };
}

/** Who is signed in, as the pages need it. `enabled: false` means the app is running without accounts. */
export type Account = { enabled: boolean; sub: string | null; name: string | null; email: string | null };

export async function currentAccount(): Promise<Account> {
  if (!authEnabled()) return { enabled: false, sub: null, name: null, email: null };
  const user = await sessionUser();
  return { enabled: true, sub: user?.sub ?? null, name: user?.name ?? null, email: user?.email ?? null };
}
