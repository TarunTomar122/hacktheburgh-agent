import { NextResponse } from "next/server";
import { authEnabled, DEV_COOKIE, devCookieValue, devLoginOn } from "../../lib/auth0";

/** Test-only login bypass (D78). Answers 404 unless DEV_LOGIN=1 and this is not a production build. See lib/auth0.ts. */
export function GET(request: Request) {
  if (!devLoginOn() || !authEnabled()) return new Response("Not found", { status: 404 });
  const res = NextResponse.redirect(new URL("/", request.url)); // the home page, like after a real sign-in
  res.cookies.set(DEV_COOKIE, devCookieValue(), { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
