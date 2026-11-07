import { z } from "zod";
import { answerQuestion } from "../../../../../lib/agent/planner";

/** POST { runId, id, answer } -> { ok }. `answer: null` skips the question; the crew carries on without it. */
export async function POST(req: Request) {
  const parsed = z.object({ runId: z.string().max(80), id: z.string().max(20), answer: z.string().max(500).nullable() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const ok = answerQuestion(parsed.data.runId, parsed.data.id, parsed.data.answer);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
