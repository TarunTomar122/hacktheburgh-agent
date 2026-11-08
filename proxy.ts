import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, DEV_COOKIE, devCookieOk, getAuth0 } from "./lib/auth0";

/**
 * Auth0 (D74). Mounts the SDK's routes (/auth/login, /auth/logout, /auth/callback, /auth/profile) and keeps the session fresh.
 * Everything else needs a signed-in user, except the /welcome page and static files:
 *  - a page sends a signed-out visitor to /welcome (which offers Sign up and Log in);
 *  - an API route answers 401 with a JSON error, so nobody can spend the OpenAI key or drive the agent's browser without an account.
 * With auth off (see lib/auth0.ts) it does nothing.
 */
export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const auth0 = getAuth0();
  const response = await auth0.middleware(request);
  const path = request.nextUrl.pathname;

  // Test-only login bypass (D78): Log out drops the dev cookie instead of going to Auth0.
  const dev = devCookieOk(request.cookies.get(DEV_COOKIE)?.value);
  if (dev && path === "/auth/logout") {
    const out = NextResponse.redirect(new URL("/welcome", request.url));
    out.cookies.delete(DEV_COOKIE);
    return out;
  }
  if (path === "/dev-login") return response; // the route answers 404 unless DEV_LOGIN=1

  if (path.startsWith("/auth/") || path === "/welcome") return response;
  const isApi = path.startsWith("/api/");
  if (!isApi && /\.[a-z0-9]+$/i.test(path)) return response; // logo, fonts, crew pictures

  if (dev || (await auth0.getSession(request))) return response;

  if (isApi) return NextResponse.json({ error: "Log in to use this." }, { status: 401 });
  const to = new URL("/welcome", request.url);
  if (path !== "/") to.searchParams.set("returnTo", path + request.nextUrl.search);
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
