import { z } from "zod";
import { authEnabled, sessionUser } from "../../../lib/auth0";
import { dbEnabled, getSaved, putSaved } from "../../../lib/db";

/**
 * The signed-in user's saved case (D75).
 *   GET    -> { enabled, saved: { profile | null, updatedAt } | null }   enabled=false: no accounts or no database, keep it in the browser
 *   PUT    { profile, updatedAt } -> { ok }                              409 { saved } when a newer copy is already saved
 *   DELETE { updatedAt? } -> { ok }                                      records a deletion so the user's other devices clear too
 * The user is always the one in the session cookie; nothing in the request can name another user. Demo cases are never sent here.
 */

const MAX_BYTES = 3_000_000;
const DAY = 24 * 60 * 60 * 1000;

const when = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not a date");
const Put = z.object({
  profile: z.object({ facts: z.record(z.string(), z.unknown()) }).passthrough(),
  updatedAt: when,
});
const Delete = z.object({ updatedAt: when.optional() });

type Who = { kind: "off" } | { kind: "anon" } | { kind: "user"; sub: string; email: string | null };

async function who(): Promise<Who> {
  if (!authEnabled() || !dbEnabled()) return { kind: "off" };
  const user = await sessionUser();
  if (!user) return { kind: "anon" };
  return { kind: "user", sub: user.sub, email: user.email };
}

/** The answer for everyone except a signed-in user, or null for a signed-in user. */
function notUser(u: Who): Response | null {
  if (u.kind === "off") return Response.json({ enabled: false });
  if (u.kind === "anon") return Response.json({ error: "Log in to use this." }, { status: 401 });
  return null;
}

const unavailable = (e: unknown) => {
  console.error("[api/profile]", e instanceof Error ? e.message : e);
  return Response.json({ error: "Saving to your account is unavailable right now. Your case is still kept in this browser." }, { status: 503 });
};

function stamp(s: string | undefined): Date | Response {
  const t = s ? new Date(s) : new Date();
  if (t.getTime() > Date.now() + DAY) return Response.json({ error: "This device's clock looks wrong (it is more than a day ahead)." }, { status: 400 });
  return t;
}

export async function GET() {
  try {
    const u = await who();
    if (u.kind !== "user") return notUser(u)!;
    return Response.json({ enabled: true, saved: await getSaved(u.sub) });
  } catch (e) {
    return unavailable(e);
  }
}

export async function PUT(req: Request) {
  try {
    const u = await who();
    if (u.kind !== "user") return notUser(u)!;
    const text = await req.text();
    if (text.length > MAX_BYTES) return Response.json({ error: "Your case is too large to save online." }, { status: 413 });
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // falls through to the 400 below
    }
    const parsed = Put.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
    const at = stamp(parsed.data.updatedAt);
    if (at instanceof Response) return at;
    const r = await putSaved(u.sub, u.email, parsed.data.profile, at);
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: "A newer copy is already saved.", saved: r.current }, { status: 409 });
  } catch (e) {
    return unavailable(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await who();
    if (u.kind !== "user") return notUser(u)!;
    const parsed = Delete.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
    const at = stamp(parsed.data.updatedAt);
    if (at instanceof Response) return at;
    const r = await putSaved(u.sub, u.email, null, at);
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: "A newer copy is already saved.", saved: r.current }, { status: 409 });
  } catch (e) {
    return unavailable(e);
  }
}
