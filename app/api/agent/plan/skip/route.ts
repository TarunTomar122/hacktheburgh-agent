import { z } from "zod";
import { skipCrew } from "../../../../../lib/agent/planner";

/** POST { runId, crew } -> { ok }. Demo control (D63): from the next step on, skip that crew member's jobs ("all": wrap up now). */
export async function POST(req: Request) {
  const parsed = z.object({ runId: z.string().max(80), crew: z.enum(["nell", "robin", "iona", "kit", "all"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const ok = skipCrew(parsed.data.runId, parsed.data.crew);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
