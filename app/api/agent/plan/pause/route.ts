import { z } from "zod";
import { setPaused } from "../../../../../lib/agent/planner";

/** POST { runId, paused } -> { ok }. The crew finishes what it is doing, then waits until resumed. */
export async function POST(req: Request) {
  const parsed = z.object({ runId: z.string().max(80), paused: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const ok = setPaused(parsed.data.runId, parsed.data.paused);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
