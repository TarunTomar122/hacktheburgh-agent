import { Auth0Client } from "@auth0/nextjs-auth0/server";

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
  client ??= new Auth0Client();
  return client;
}

/** Who is signed in, as the pages need it. `enabled: false` means the app is running without accounts. */
export type Account = { enabled: boolean; sub: string | null; name: string | null; email: string | null };

export async function currentAccount(): Promise<Account> {
  if (!authEnabled()) return { enabled: false, sub: null, name: null, email: null };
  const user = (await getAuth0().getSession())?.user;
  return { enabled: true, sub: user?.sub ?? null, name: user?.name ?? user?.email ?? null, email: typeof user?.email === "string" ? user.email : null };
}
