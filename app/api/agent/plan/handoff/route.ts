import { z } from "zod";
import { resolveHandoff } from "../../../../../lib/agent/planner";

/** POST { runId, id, action: "continue" | "skip" } -> { ok }. The open tab carries on, or the step is left. */
export async function POST(req: Request) {
  const parsed = z.object({ runId: z.string().max(80), id: z.string().max(40), action: z.enum(["continue", "skip"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const ok = resolveHandoff(parsed.data.runId, parsed.data.id, parsed.data.action);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
